import { AudioDecoder } from './audio-decoder.js';
import { AudioRenderer, AudioRendererProgress, AudioRendererType } from './audio-renderer.js';
import { AudioDecoderProgress } from './workers/audio-decoder-worker';

export type AudioPlayerOptions = {
  sampleRate?: number | null;
  recycle?: {
    decoder?: boolean | null;
    // renderer?: boolean | null;
  };
};

export type AudioPlayerState = 'initial' | 'playing' | 'paused' | 'aborted' | 'stopped' | 'disposed';

export type AudioPlayerProgress = {
  decoder?: AudioDecoderProgress | null;
  renderer?: AudioRendererProgress | null;
};

export class AudioPlayer {

  constructor(args: {
    rendererType: AudioRendererType;
    decoderWorkerUrl: URL;
    recycleDecoder?: boolean | null;
    rendererWorkletUrl?: URL | null;
    rendererWorkletName?: string | null;
    numberOfChannels: number;
  }) {
    this._rendererType = args.rendererType;
    this._decoderUrl = args.decoderWorkerUrl;
    this._rendererWorkletUrl = args.rendererWorkletUrl;
    this._rendererWorkletName = args.rendererWorkletName;
    this._recycleDecoder = args.recycleDecoder ?? false;
    this._numberOfChannels = args.numberOfChannels;
  }

  private _decoderUrl: URL;
  private _decoder: AudioDecoder | null = null;
  private _recycleDecoder: boolean;
  private _rendererType: AudioRendererType;
  private _numberOfChannels: number;

  get numberOfChannels() { return this._numberOfChannels; }

  async changeRendererType(type: AudioRendererType) {
    if (this._rendererType != type) {
      await this.dispose();
      this._rendererType = type;
    }
  }

  private _rendererWorkletUrl?: URL | null;
  private _rendererWorkletName?: string | null;
  private _renderer: AudioRenderer | null = null;

  private _audioContext: BaseAudioContext | null = null;
  private _destination: AudioNode | null = null;

  private _state: AudioPlayerState = 'initial';
  get state() { return this._state; }

  private _progress: AudioPlayerProgress = {};

  get progress(): AudioPlayerProgress | null { return this._progress; }

  onstatechange: ((state: AudioPlayerState) => void) | null = null;
  onprogress: ((ev: AudioPlayerProgress) => void) | null = null;

  connect(destination: AudioNode): void {
    if (!(destination.context instanceof AudioContext)) {
      throw new Error('destination is not attached to an AudioContext.');
    }
    this._destination = destination;
  }

  disconnect(): Promise<void> {
    this._destination = null;
    return this.dispose();
  }

  async _attachContext(context: BaseAudioContext): Promise<void> {
    if (this._audioContext != context) {
      if (this._audioContext != null) {
        await this.dispose();
      }
      this._audioContext = context;
      if (this._rendererType == 'worklet') {
        await this._audioContext.audioWorklet.addModule(this._rendererWorkletUrl!);
      }
    }
  }

  async play(args: any): Promise<void> {

    this._progress = {};

    const mch = new MessageChannel();

    await this._attachContext(this._destination!.context);

    if (this._audioContext?.state == 'suspended') {
      throw new Error('AudioContext is suspended. `await AudioContext.resume()` in advance within the call stack of a UI event handler.');
    }

    if (this._decoder == null) {
      this._decoder = new AudioDecoder(new Worker(this._decoderUrl));
      await this._decoder.init(this._audioContext!.sampleRate, this._numberOfChannels);
    } else {
      await this._decoder.abort();
    }
    await this._decoder.start(mch.port2, args);

    this._renderer ??= AudioRenderer.create(this._rendererType, this._audioContext!, this._numberOfChannels, this._rendererWorkletName);
    this._renderer.connect(this._destination!);
    this._renderer.onstatechange = (ev) => {
      this._state = ev;
      if (this.onstatechange != null) {
        this.onstatechange(ev);
      }
    }

    this._decoder.onprogress = (data) => {
      this._progress.decoder = data;
      if (this.onprogress != null) {
        this.onprogress(this._progress);
      }
    }

    this._renderer.onprogress = (data) => {
      this._progress.renderer = data;
      if (this.onprogress != null) {
        this.onprogress(this._progress);
      }
    }

    await this._renderer.play(mch.port1);
  }

  async seekInFrame(frame: number, relative: boolean = false): Promise<void> {
    if (this._state != 'initial' && this._state != 'aborted') {
      await this._renderer?.seek(frame, relative);
    }
  }

  async seekInTime(time: number, relative: boolean = false): Promise<void> {
    if (this._state != 'initial' && this._state != 'aborted') {
      const pos = Math.floor(this._audioContext!.sampleRate / 1000 * time);
      await this._renderer?.seek(pos, relative);
    }
  }

  async togglePause(): Promise<void> {
    if (this._state == 'playing') {
      return this.pause();
    }
    if (this._state == 'paused') {
      return this.resume();
    }
  }

  async pause(): Promise<void> {
    await this._renderer?.pause();
  }

  async resume(): Promise<void> {
    await this._renderer?.resume();
  }

  async abort(): Promise<void> {
    if (this._decoder != null) {
      await this._decoder.abort();
      this._decoder.onprogress = null;
      if (!this._recycleDecoder) {
        this._decoder.terminate();
        this._decoder = null;
      }
    }
    if (this._renderer != null) {
      this._renderer.disconnect();
      this._renderer.onprogress = null;
      await this._renderer.abort();
    }
  }

  async dispose(): Promise<void> {
    if (this._decoder != null) {
      await this._decoder?.abort();
      this._decoder.onprogress = null;
      this._decoder.terminate();
      this._decoder = null;
    }
    if (this._renderer != null) {
      this._renderer.disconnect();
      this._renderer.onprogress = null;
      this._renderer.onstatechange = null;
      await this._renderer.dispose();
      this._renderer = null;
    }
    this._audioContext = null;
  }

}
