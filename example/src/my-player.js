import { WorkerUrl } from 'worker-url';
import { AudioPlayer } from 'webaudio-stream-player';

// The `name` option of WorkerUrl is a marker to determine the webpack's chunkname (i.e. output filename).
// DO NOT USE A VARIABLE TO SPECIFY EITHER WORKER OR WORKLET NAME.
const decoderUrl = new WorkerUrl(new URL('./my-decoder-worker.js', import.meta.url), { name: 'decorder' });
const workletUrl = new WorkerUrl(new URL('./my-renderer-worklet.js', import.meta.url), { name: 'renderer' });

export class MyPlayer extends AudioPlayer {
  constructor(rendererType) {
    super({
      rendererType: rendererType ?? "worklet",
      decoderWorkerUrl: decoderUrl,
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: 'renderer',
      numberOfChannels: 2,
    });
  }
}