import {
  AudioDecoderRequest,
  AudioDecoderResponse,
} from "./workers/audio-decoder-worker.js";

export class AudioDecoder extends EventTarget {
  constructor(worker: Worker) {
    super();
    this._worker = worker;
    this._worker.onmessage = (ev: MessageEvent) => this._handleMessage(ev);
  }

  get worker() {
    return this._worker;
  }

  _worker: Worker | null;
  _seq = 0;

  private _completerMap: { [key: number]: (res: AudioDecoderResponse) => void } = {};

  private _handleMessage(ev: MessageEvent) {
    if (ev.data?.type == "progress") {
      this.dispatchEvent(new CustomEvent("progress", { detail: ev.data.data }));
      return;
    }

    const seq = ev.data?.seq as number;
    if (seq != null) {
      const completer = this._completerMap[seq];
      delete this._completerMap[seq];
      completer(ev.data);
      return;
    }

    this.dispatchEvent(new CustomEvent("decodermessage", { detail: ev.data }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _request(req: AudioDecoderRequest, transfer: Transferable[] = []): Promise<any> {
    const seq = this._seq++;
    const ts = Date.now();
    this._worker?.postMessage({ seq, ts, ...req }, transfer);
    // const ts2 = Date.now();
    // console.log(`DecoderController req ${req.type}@${seq} ${ts2 - ts}ms`);
    return new Promise((resolve, reject) => {
      this._completerMap[seq] = (e) => {
        // const elapsed = Date.now() - ts2;
        // console.log(`DecoderController res ${e.type}@${e.seq} ${elapsed}ms`);
        if (e.error == null) {
          resolve(e.data);
        } else {
          reject(e.error);
        }
      };
    });
  }

  async init(sampleRate: number, numberOfChannels: number) {
    await this._request({ type: "init", args: { sampleRate, numberOfChannels } });
  }

  async start(outputPort: MessagePort, args?: unknown) {
    await this._request({ type: "start", outputPort, args }, [outputPort]);
  }

  async abort(): Promise<boolean> {
    return this._request({ type: "abort" });
  }

  terminate() {
    this._worker?.terminate();
    this._worker = null;
  }
}
