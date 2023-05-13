import { isChrome } from "./utils.js";
import { WaveBuffer } from "./wave-buffer.js";
import {
  AudioRendererWorkletRequest,
  AudioRendererWorkletResponse,
} from "./workers/audio-renderer-worklet-processor.js";

export interface AudioRendererDelegate {
  readonly state: AudioRendererState;
  readonly numberOfChannels: number;
  onprogress: ((ev: AudioRendererProgress) => void) | null;
  onstatechange: ((ev: AudioRendererState) => void) | null;
  connect(destination: AudioNode): void;
  disconnect(): void;
  play(input: MessagePort): Promise<void>;
  seek(pos: number, relative: boolean): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

export type AudioRendererState =
  | "initial"
  | "playing"
  | "paused"
  | "aborted"
  | "stopped"
  | "disposed";

export type AudioRendererProgress = {
  currentFrame: number;
  currentTime: number;
  bufferedFrames: number;
  bufferedTime: number;
  isFulFilled: boolean;
};

export type AudioRendererType = "script" | "worklet";

export class AudioRenderer extends EventTarget {
  constructor(delegate: AudioRendererDelegate) {
    super();
    this._delegate = delegate;
    this._delegate.onprogress = (ev) => {
      this.dispatchEvent(new CustomEvent<AudioRendererProgress>("progress", { detail: ev }));
    };
    this._delegate.onstatechange = (ev) => {
      this.dispatchEvent(new CustomEvent<AudioRendererState>("statechange", { detail: ev }));
    };
  }

  static create(
    type: AudioRendererType,
    context: BaseAudioContext,
    numberOfChannels: number,
    workletName?: string | null
  ): AudioRenderer {
    if (type == "worklet") {
      if (workletName == null) {
        throw new Error(`workletName must be specified.`);
      }
      return new AudioRenderer(new WorkletRenderer(context, numberOfChannels, workletName));
    } else if (type == "script") {
      return new AudioRenderer(new ScriptRenderer(context, numberOfChannels));
    } else {
      throw new Error(`Unspported renderer type: ${type}`);
    }
  }

  _delegate: AudioRendererDelegate;

  get state() {
    return this._delegate.state;
  }

  connect(destination: AudioNode): void {
    return this._delegate.connect(destination);
  }
  disconnect(): void {
    return this._delegate.disconnect();
  }
  play(input: MessagePort): Promise<void> {
    return this._delegate.play(input);
  }
  seek(pos: number, relative = false): Promise<void> {
    return this._delegate.seek(pos, relative);
  }
  pause(): Promise<void> {
    return this._delegate.pause();
  }
  resume(): Promise<void> {
    return this._delegate.resume();
  }
  abort(): Promise<void> {
    return this._delegate.abort();
  }
  dispose(): Promise<void> {
    return this._delegate.dispose();
  }
}

class WorkletRenderer implements AudioRendererDelegate {
  private _node: AudioWorkletNode;

  _state: AudioRendererState = "initial";

  constructor(audioContext: BaseAudioContext, numberOfChannels: number, workletName: string) {
    this._node = new AudioWorkletNode(audioContext, workletName, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [numberOfChannels],
      // parameterData: null,
      // processorOptions: null,
    });
    this._numberOfChannels = numberOfChannels;
    this._node.port.onmessage = (ev) => this._handleMessage(ev);
  }

  private _numberOfChannels: number;
  get numberOfChannels() {
    return this._numberOfChannels;
  }

  private _seq = 0;

  private _completerMap: { [key: number]: (res: AudioRendererWorkletResponse) => void } = {};

  onprogress: ((ev: AudioRendererProgress) => void) | null = null;
  onstatechange: ((ev: AudioRendererState) => void) | null = null;

  setState(newState: AudioRendererState) {
    if (this._state != newState) {
      this._state = newState;
      if (this.onstatechange) {
        this.onstatechange(this._state);
      }
    }
  }

  get state() {
    return this._state;
  }

  _handleMessage(ev: MessageEvent): void {
    switch (ev.data?.type) {
      case "progress":
        if (this.onprogress != null) {
          this.onprogress({ ...ev.data.stat });
        }
        break;
      case "state":
        this.setState(ev.data?.state);
        break;
    }

    const seq = ev.data?.seq as number;
    if (seq != null) {
      const completer = this._completerMap[seq];
      delete this._completerMap[seq];
      completer(ev.data);
    }
  }

  private _request(
    req: AudioRendererWorkletRequest,
    transfer: Transferable[] = []
  ): Promise<unknown> {
    const seq = this._seq++;
    this._node.port.postMessage({ seq, ...req }, transfer);
    // const start = Date.now();
    return new Promise((resolve, reject) => {
      this._completerMap[seq] = (e) => {
        // const elapsed = Date.now() - start;
        // console.log(`WorkletController[${e.seq}]:${e.type} ${elapsed}ms`);
        if (e.error == null) {
          resolve(e.data);
        } else {
          reject(e.error);
        }
      };
    });
  }

  connect(destination: AudioNode) {
    this._node.connect(destination);
  }
  disconnect() {
    this._node.disconnect();
  }

  async play(input: MessagePort) {
    if (this._state == "playing" || this._state == "paused") {
      await this._request({ type: "abort" });
    }
    await this._request({ type: "play", inputPort: input }, [input]);
    this.setState("playing");
  }

  async seek(pos: number, relative: boolean): Promise<any> {
    return this._request({ type: "seek", seekPos: pos, relative });
  }

  async pause() {
    if (this._state == "playing") {
      await this._request({ type: "pause" });
      this.setState("paused");
    }
  }

  async resume() {
    if (this._state == "paused") {
      await this._request({ type: "resume" });
      this.setState("playing");
    }
  }

  async abort() {
    if (this._state != "stopped" && this._state != "aborted") {
      await this._request({ type: "abort" });
      this.setState("aborted");
    }
  }

  async dispose(): Promise<void> {
    await this._request({ type: "dispose" });
    this.setState("disposed");
    if (isChrome) {
      console.warn(
        `StreamerWorkletController.dispose: This operation may cause memory-leak on Chrome since Chrome will not release the AudioWorklet after the tied AudioContext is closed. See: https://bugs.chromium.org/p/chromium/issues/detail?id=1298955`
      );
    }
  }
}

class ScriptRenderer implements AudioRendererDelegate {
  constructor(audioContext: BaseAudioContext, numberOfChannels: number) {
    this._node = audioContext.createScriptProcessor(1024, 0, numberOfChannels);
    this._node.onaudioprocess = (ev) => this._onAudioProcess(ev);
    this._buffer = new WaveBuffer(audioContext.sampleRate, numberOfChannels);
    this._numberOfChannels = numberOfChannels;
  }

  private _node: ScriptProcessorNode;
  private _buffer: WaveBuffer;
  private _inputPort: MessagePort | null = null;

  private _numberOfChannels: number;
  get numberOfChannels() {
    return this._numberOfChannels;
  }

  private _state: AudioRendererState = "initial";

  get state() {
    return this._state;
  }

  setState(newState: AudioRendererState): void {
    if (this._state != newState) {
      this._state = newState;
      if (this.onstatechange != null) {
        this.onstatechange(this._state);
      }
    }
  }

  onprogress: ((ev: AudioRendererProgress) => void) | null = null;
  onstatechange: ((ev: AudioRendererState) => void) | null = null;

  connect(destination: AudioNode) {
    this._node.connect(destination);
  }
  disconnect() {
    this._node.disconnect();
  }

  async play(input: MessagePort) {
    if (this._inputPort != null) {
      this._inputPort.onmessage = null;
      this._inputPort.close();
    }
    this._inputPort = input;
    this._inputPort.onmessage = (ev) => this._buffer.write(ev.data);
    this._buffer.clear();
    this.setState("playing");
  }

  async seek(pos: number, relative: boolean) {
    this._buffer.seekTo(pos, relative);
  }

  async pause() {
    if (this._state == "playing") {
      this.setState("paused");
    }
  }

  async resume() {
    if (this._state == "paused") {
      this.setState("playing");
    }
  }

  async abort() {
    if (this._state == "playing" || this._state == "paused") {
      this._buffer.clear();
      this.setState("aborted");
    }
  }

  _onAudioProcess(ev: AudioProcessingEvent) {
    if (this._state == "playing" || this._state == "stopped") {
      const res = this._buffer.onAudioProcess(ev);
      if (this.onprogress != null) {
        this.onprogress(this._buffer.stat);
      }
      if (!res) {
        this.setState("stopped");
      }
    }
  }
  async dispose() {
    this._buffer.clear();
    if (this._inputPort != null) {
      this._inputPort.onmessage = null;
      this._inputPort.close();
      this._inputPort = null;
    }
    this._node.onaudioprocess = null;
    this.setState("disposed");
  }
}
