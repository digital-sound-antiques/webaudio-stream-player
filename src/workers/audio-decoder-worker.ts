export type AudioDecoderRequest = {
  type: AudioDecoderRequestType;
  outputPort?: MessagePort;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: any;
};

export type AudioDecoderProgress = {
  decodeFrames: number;
  decodeSpeed: number;
  isDecoding: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  status?: any;
};

export type AudioDecoderRequestWithSeq = { seq: number } & AudioDecoderRequest;

export type AudioDecoderRequestType = "init" | "start" | "abort" | "dispose" | "unknown";

export type AudioDecoderResponse = {
  seq: number;
  type: AudioDecoderRequestType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
};

class InternalProcessor<T> {
  constructor(id: number, process: (parent: InternalProcessor<T>) => Promise<T>) {
    this.id = id;
    this._process = process;
  }

  id: number;
  aborted = false;

  _completer: Promise<T> | null = null;
  private _process: (parent: InternalProcessor<T>) => Promise<T>;

  abort(): Promise<T> | null {
    this.aborted = true;
    return this._completer;
  }

  run(): Promise<T> {
    this._completer = new Promise((resolve) => {
      const res = this._process(this);
      resolve(res);
    });
    return this._completer;
  }
}

export abstract class AudioDecoderWorker {
  constructor(worker: Worker) {
    this._worker = worker;
    this._worker.onmessage = async (e) => {
      let res: AudioDecoderResponse;
      const req = e.data as AudioDecoderRequestWithSeq;
      try {
        const data = await this._onRequest(req);
        res = { seq: req.seq, type: req.type, data: data };
      } catch (e) {
        res = { seq: req.seq, type: req.type, error: e };
      }
      this._worker.postMessage(res);
    };
  }

  private _worker: Worker;
  get worker() {
    return this._worker;
  }

  private _outputPort: MessagePort | null = null;

  private _detachPort() {
    if (this._outputPort != null) {
      this._outputPort.onmessage = null;
      this._outputPort.close();
      this._outputPort = null;
    }
  }

  private _processorId = 0;
  private _processor: InternalProcessor<void> | null = null;

  private _sampleRate = 44100;
  private _numberOfChannels = 2;

  get sampleRate() {
    return this._sampleRate;
  }
  get numberOfChannels() {
    return this._numberOfChannels;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _onRequest(req: AudioDecoderRequest): Promise<any> {
    switch (req.type) {
      case "init":
        this._sampleRate = req.args.sampleRate;
        this._numberOfChannels = req.args.numberOfChannels;
        await this.init(req.args);
        break;
      case "start":
        if (this._processor != null) {
          throw new Error(`Already started.`);
        }
        if (req.outputPort == null) {
          throw new Error("No output port specified.");
        }
        this._outputPort = req.outputPort;
        await this.start(req.args);
        this._run();
        return;
      case "abort":
        await this._abort();
        await this.abort();
        this._detachPort();
        return;
      case "dispose":
        await this._abort();
        await this.dispose();
        this._detachPort();
        return;
      default:
        throw new Error(`Uknown request type: ${req.type}`);
    }
  }

  private _dispatchProgress(
    elapsed: number,
    decodeFrames: number,
    isDecoding: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: any
  ) {
    const decodeSpeed = elapsed != 0 ? ((decodeFrames / this.sampleRate) * 1000) / elapsed : 0;
    this._worker.postMessage({
      type: "progress",
      data: {
        decodeFrames,
        decodeSpeed,
        isDecoding,
        status,
      },
    });
  }

  private async _run() {
    const start = Date.now();
    let decodeFrames = 0;
    this._processor = new InternalProcessor(this._processorId++, async (parent) => {
      while (!parent.aborted) {
        const channels = await this.process();
        if (channels != null) {
          decodeFrames += channels[0].length;
          const transfer = channels.map((e) => e.buffer);
          this._outputPort?.postMessage(channels, transfer);
        } else {
          this._outputPort?.postMessage(null);
          break;
        }
        this._dispatchProgress(Date.now() - start, decodeFrames, true, this.status());
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    await this._processor.run();
    this._dispatchProgress(Date.now() - start, decodeFrames, false, this.status());
    this._processor = null;
  }

  private async _abort() {
    if (this._processor != null) {
      await this._processor.abort();
      this._processor = null;
    }
  }

  status() {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract init(args: any): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract start(args: any): Promise<void>;
  abstract process(): Promise<Array<Float32Array | Int32Array | Int16Array> | null>;
  abstract abort(): Promise<void>;
  abstract dispose(): Promise<void>;
}
