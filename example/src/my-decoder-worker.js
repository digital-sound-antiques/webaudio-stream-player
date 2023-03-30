import { AudioDecoderWorker } from "webaudio-stream-player";

class MyDecoderWorker extends AudioDecoderWorker {
  constructor(worker) {
    super(worker);
  }

  async init(args) {
    /* initialize if needed */
  }

  async start(args) {
    this.leftFreq = args.leftFreq || 440.0;
    this.rightFreq = args.rightFreq || 441.0;
    this.phase = 0;
    this.aborted = false;
  }

  async process() {
    const channels = [];
    for (let c = 0; c < this.numberOfChannels; c++) {
      channels.push(new Float32Array(this.sampleRate));
    }
    for (let i = 0; i < this.sampleRate; i++) {
      for (let c = 0; c < channels.length; c++) {
        const freq = c == 0 ? this.leftFreq : this.rightFreq;
        channels[c][i] = Math.sin((2 * Math.PI * freq * this.phase) / this.sampleRate);
      }
      this.phase++;
    }
    return channels;
  }

  async abort() {
    /* something to do when aborted */
  }
  async dispose() {
    /* dispose resources here */
  }
}

const decoder = new MyDecoderWorker(self);
