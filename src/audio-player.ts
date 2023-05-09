import { AudioDecoder } from "./audio-decoder.js";
import {
  AudioRenderer,
  AudioRendererProgress,
  AudioRendererState,
  AudioRendererType,
} from "./audio-renderer.js";
import { AudioDecoderProgress } from "./workers/audio-decoder-worker.js";

export type AudioPlayerOptions = {
  sampleRate?: number | null;
  recycle?: {
    decoder?: boolean | null;
    // renderer?: boolean | null;
  };
};

export type AudioPlayerState =
  | "initial"
  | "playing"
  | "paused"
  | "aborted"
  | "stopped"
  | "disposed";

export type AudioPlayerProgress = {
  decoder: AudioDecoderProgress;
  renderer: AudioRendererProgress;
};

const emptyProgress = {
  decoder: {
    decodeFrames: 0,
    decodeSpeed: 0,
    isDecoding: false,
  },
  renderer: {
    currentFrame: 0,
    currentTime: 0,
    bufferedFrames: 0,
    bufferedTime: 0,
    isFulFilled: false,
  },
};

interface AudioPlayerEventDetailTypeMap {
  progress: AudioPlayerProgress;
  statechange: AudioPlayerState;
  decodermessage: any;
}

export class AudioPlayer {
  constructor(args: {
    rendererType: AudioRendererType;
    decoderWorkerUrl?: URL | string | null;
    decoderWorkerFactory?: (() => Worker) | null;
    recycleDecoder?: boolean | null;
    rendererWorkletUrl?: URL | string | null;
    rendererWorkletName?: string | null;
    addRendererWorklet?: ((context: BaseAudioContext) => void) | null;
    numberOfChannels: number;
  }) {
    this._rendererType = args.rendererType;
    this._decoderWorkerUrl = args.decoderWorkerUrl;
    this._decoderWorkerFactory = args.decoderWorkerFactory;
    this._rendererWorkletUrl = args.rendererWorkletUrl;
    this._rendererWorkletName = args.rendererWorkletName;
    this._addRendererWorklet = args.addRendererWorklet;
    this._recycleDecoder = args.recycleDecoder ?? false;
    this._numberOfChannels = args.numberOfChannels;
  }

  private _decoderWorkerFactory?: (() => Worker) | null = null;
  private _addRendererWorklet?: ((context: BaseAudioContext) => void) | null = null;
  private _decoderWorkerUrl?: URL | string | null;
  private _decoder: AudioDecoder | null = null;
  private _recycleDecoder: boolean;
  private _rendererType: AudioRendererType;
  private _numberOfChannels: number;

  private _eventDispatcher = new EventTarget();

  get numberOfChannels() {
    return this._numberOfChannels;
  }

  async changeRendererType(type: AudioRendererType) {
    if (this._rendererType != type) {
      await this.dispose();
      this._rendererType = type;
    }
  }

  private _rendererWorkletUrl?: URL | string | null;
  private _rendererWorkletName?: string | null;
  private _renderer: AudioRenderer | null = null;

  private _audioContext: BaseAudioContext | null = null;
  get audioContext() {
    return this._audioContext;
  }

  get outputLatency(): number {
    if (this._audioContext instanceof AudioContext) {
      return this._audioContext.outputLatency ?? 0.0;
    }
    return 0.0;
  }

  private _destination: AudioNode | null = null;

  private _state: AudioPlayerState = "initial";
  get state() {
    return this._state;
  }

  private _progress: AudioPlayerProgress = emptyProgress;

  get progress(): AudioPlayerProgress {
    return this._progress;
  }

  // onstatechange: ((state: AudioPlayerState) => void) | null = null;
  // onprogress: ((ev: AudioPlayerProgress) => void) | null = null;
  // ondecodermessage: ((ev: MessageEvent) => void) | null = null;

  connect(destination: AudioNode): void {
    if (!(destination.context instanceof AudioContext)) {
      throw new Error("destination is not attached to an AudioContext.");
    }
    this._destination = destination;
  }

  disconnect(): Promise<void> {
    this._destination = null;
    return this.dispose();
  }

  addEventListener<T extends keyof AudioPlayerEventDetailTypeMap>(
    type: T,
    callback: (ev: CustomEvent<AudioPlayerEventDetailTypeMap[T]>) => void | null,
    options?: boolean | AddEventListenerOptions
  ) {
    this._eventDispatcher.addEventListener(type, callback as any, options);
  }

  dispatchEvent(ev: Event): boolean {
    return this._eventDispatcher.dispatchEvent(ev);
  }

  removeEventListener<T extends keyof AudioPlayerEventDetailTypeMap>(
    type: T,
    callback: (ev: CustomEvent<AudioPlayerEventDetailTypeMap[T]>) => void | null,
    options?: boolean | EventListenerOptions
  ) {
    this._eventDispatcher.removeEventListener(type, callback as any, options);
  }

  _createCustomEvent<T extends keyof AudioPlayerEventDetailTypeMap>(type: T, eventInitDict?: CustomEventInit<AudioPlayerEventDetailTypeMap[T]>) {
    return new CustomEvent(type, eventInitDict);
  }

  async _attachContext(context: BaseAudioContext): Promise<void> {
    if (this._audioContext != context) {
      if (this._audioContext != null) {
        await this.dispose();
      }
      this._audioContext = context;
      if (this._rendererType == "worklet") {
        if (this._addRendererWorklet != null) {
          this._addRendererWorklet(this._audioContext!);
        } else if (this._rendererWorkletUrl != null) {
          await this._audioContext.audioWorklet.addModule(this._rendererWorkletUrl);
        } else {
          throw new Error("Either addRendererWorklet or rendererWorkletUrl is required.");
        }
      }
    }
  }

  private _onRendererStateChange = ((ev: CustomEvent<AudioRendererState>): void => {
    this._state = ev.detail;
    this.dispatchEvent(this._createCustomEvent("statechange", { detail: ev.detail }));
  }) as EventListener;

  private _onRendererProgress = ((ev: CustomEvent<AudioRendererProgress>): void => {
    (this._progress = { ...this._progress, renderer: ev.detail }),
      this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
  }) as EventListener;

  private _onDecoderProgress = ((ev: CustomEvent<AudioDecoderProgress>): void => {
    (this._progress = { ...this._progress, decoder: ev.detail }),
      this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
  }) as EventListener;

  private _onDecoderMessage = ((ev: CustomEvent<any>): void => {
    this.dispatchEvent(this._createCustomEvent("decodermessage", { detail: ev.detail }));
  }) as EventListener;

  async play(args: any): Promise<void> {
    this._progress = emptyProgress;

    const mch = new MessageChannel();

    await this._attachContext(this._destination!.context);

    if (this._audioContext?.state == "suspended") {
      throw new Error(
        "AudioContext is suspended. `await AudioContext.resume()` in advance within the call stack of a UI event handler."
      );
    }

    if (this._decoder == null) {
      if (this._decoderWorkerFactory != null) {
        this._decoder = new AudioDecoder(this._decoderWorkerFactory());
      } else if (this._decoderWorkerUrl != null) {
        this._decoder = new AudioDecoder(new Worker(this._decoderWorkerUrl));
      } else {
        throw new Error("Either decoderWorkerFactoty or decoderWorkerUrl is required.");
      }
      await this._decoder.init(this._audioContext!.sampleRate, this._numberOfChannels);
      this._decoder.addEventListener("decodermessage", this._onDecoderMessage);
    } else {
      await this._decoder.abort();
    }

    this._decoder.addEventListener("progress", this._onDecoderProgress);
    await this._decoder.start(mch.port2, args);

    if (this._renderer == null) {
      this._renderer = AudioRenderer.create(
        this._rendererType,
        this._audioContext!,
        this._numberOfChannels,
        this._rendererWorkletName
      );
      this._renderer.addEventListener("statechange", this._onRendererStateChange);
    }
    this._renderer.connect(this._destination!);
    this._renderer.addEventListener("progress", this._onRendererProgress);

    await this._renderer.play(mch.port1);
  }

  async seekInFrame(frame: number, relative = false): Promise<void> {
    if (this._state != "initial" && this._state != "aborted") {
      await this._renderer?.seek(frame, relative);
    }
  }

  async seekInTime(time: number, relative = false): Promise<void> {
    if (this._state != "initial" && this._state != "aborted") {
      const pos = Math.floor((this._audioContext!.sampleRate / 1000) * time);
      await this._renderer?.seek(pos, relative);
    }
  }

  async togglePause(): Promise<void> {
    if (this._state == "playing") {
      return this.pause();
    }
    if (this._state == "paused") {
      return this.resume();
    }
  }

  async pause(): Promise<void> {
    await this._renderer?.pause();
  }

  async resume(): Promise<void> {
    await this._renderer?.resume();
  }

  /// kill hung-up decoder
  async emergencyReset(): Promise<void> {
    this._decoder?.removeEventListener("message", this._onDecoderMessage);
    this._decoder?.terminate();
    this._decoder = null;
    if (this._renderer != null) {
      this._renderer.disconnect();
      this._renderer.removeEventListener("progress", this._onRendererStateChange);
      await this._renderer.abort();
    }
    this._progress = emptyProgress;
    this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
  }

  async abort(): Promise<void> {
    if (this._decoder != null) {
      await this._decoder.abort();
      this._decoder.removeEventListener("progress", this._onDecoderProgress);
      if (!this._recycleDecoder) {
        this._decoder.terminate();
        this._decoder.removeEventListener("message", this._onDecoderMessage);
        this._decoder = null;
      }
    }
    if (this._renderer != null) {
      this._renderer.disconnect();
      this._renderer.removeEventListener("progress", this._onRendererStateChange);
      await this._renderer.abort();
    }
    this._progress = emptyProgress;
    this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
  }

  async dispose(): Promise<void> {
    if (this._decoder != null) {
      await this._decoder?.abort();
      this._decoder.removeEventListener("progress", this._onDecoderProgress);
      this._decoder.removeEventListener("message", this._onDecoderMessage);
      this._decoder.terminate();
      this._decoder = null;
    }
    if (this._renderer != null) {
      this._renderer.disconnect();
      this._renderer.removeEventListener("progress", this._onRendererProgress);
      this._renderer.removeEventListener("statechange", this._onRendererStateChange);
      await this._renderer.dispose();
      this._renderer = null;
    }
    this._audioContext = null;
  }
}
