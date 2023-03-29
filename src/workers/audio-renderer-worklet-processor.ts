// Avoid using @types/audioworklet here because it has at least two problems.
// 1. It conflicts type definitions in DOM library. 
// 2. Missing options argument of AudioWorkletProcessor.new

import { WaveBuffer } from "../wave-buffer.js";

// https://github.com/microsoft/TypeScript/issues/28308
type AudioWorkletProcessorType = {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters?: Record<string, Float32Array>): boolean;
};

declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessorType;
  new(options?: AudioWorkletNodeOptions): AudioWorkletProcessorType;
};

type ProcessorCtor = (new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessorType);
declare function registerProcessor(name: string, ctor: ProcessorCtor): void;

export type AudioRendererWorkletState = 'initial' | 'playing' | 'paused' | 'aborted' | 'stopped' | 'disposed';

export type AudioRendererWorkletRequestType = 'play' | 'seek' | 'pause' | 'resume' | 'abort' | 'dispose';

export type AudioRendererWorkletRequest = {
  type: AudioRendererWorkletRequestType;
  inputPort?: MessagePort | null;
  seekPos?: number | null;
  relative?: boolean | null;
};

export type AudioRendererWorkletRequestWithSeq = { seq: number; } & AudioRendererWorkletRequest;

export type AudioRendererWorkletResponse = {
  seq: number;
  type: AudioRendererWorkletRequestType;
  data?: any;
  error?: any;
};

// AudioWorkletGlobalScope
declare const sampleRate: number;

export class AudioRendererWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options: any) {
    super(options);
    this.port.onmessage = async (ev) => {
      let res: AudioRendererWorkletResponse;
      const req = ev.data as AudioRendererWorkletRequestWithSeq;
      try {
        const data = await this._onCommand(req);
        res = { seq: req.seq, type: req.type, data: data };
      } catch (e) {
        res = { seq: req.seq, type: req.type, error: e };
      }
      this.port.postMessage(res);
    }
    this._buffer = new WaveBuffer(sampleRate, options.outputChannelCount);
  }

  private _inputPort: MessagePort | null = null;
  private _buffer: WaveBuffer;

  _reset() {
    this._buffer?.clear();
    if (this._inputPort != null) {
      this._inputPort.onmessage = null;
      this._inputPort.close();
      this._inputPort = null;
    }
  }

  private _state: AudioRendererWorkletState = 'initial';

  _setState(state: AudioRendererWorkletState) {
    this._state = state;
    this.port.postMessage({ type: 'state', state });
  }

  async _onCommand(cmd: AudioRendererWorkletRequest): Promise<any> {
    switch (cmd.type) {
      case 'play':
        if (this._state != 'disposed') {
          this._reset();
          this._inputPort = cmd.inputPort!;
          this._inputPort!.onmessage = (ev) => this._buffer.write(ev.data);
          this._setState('playing');
        } else {
          console.error('This object has already been disposed.');
        }
        return;
      case 'pause':
        if (this._state == 'playing') {
          this._setState('paused');
        }
        return;
      case 'seek':
        this._buffer.seekTo(cmd.seekPos!, cmd.relative);
        if (this._state == 'stopped') {
          this._setState('playing');
        }
        return;
      case 'resume':
        if (this._state == 'paused') {
          this._setState('playing');
        }
        return;
      case 'abort':
        this._reset();
        this._setState('aborted');
        return;
      case 'dispose':
        this._reset();
        this.port.onmessage = null;
        this._setState('disposed');
        return;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this._state == 'disposed') {
      return false;
    }
    if (this._state == 'playing') {
      const res = this._buffer.onAudioWorkletProcess(inputs, outputs);
      this.port.postMessage({
        type: 'progress',
        stat: this._buffer.stat,
      });
      if (!res) {
        this._setState('stopped');
      }
    }
    return true;
  }
}

export function runAudioWorklet(name: string, ctor: ProcessorCtor) {
  registerProcessor(name, ctor);
}