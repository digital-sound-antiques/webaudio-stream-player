# webaudio-stream-player

A framework for creating an audio stream player using WebAudio. 

- Both AudioWorkletNote and ScriptProcessorNode are supported. 
- No SharedArrayBuffer is used so that [cross-origin isolation](https://web.dev/i18n/en/cross-origin-isolation-guide/) is not required.

## How to Use
Example is [here](./example).

### Implement Decoder Worker
Create `my-decoder-worker.ts` like following. Implement your desired audio decoding procedure in `process` function.

```typescript
class MyDecoderWorker extends AudioDecoderWorker {
  constructor(worker) {
    super(worker);
  }

  override async init(args) {
    /* initialize if needed */
  }

  override async start(args) {
    /* This is called each time Audio.play(args) calls. */
  }

  override async process(): Promise<Array<Uint8Array|Int16Array|Int32Array|Float32Array> | null> {
    /**
     * Generare wave data here.
     * This method is called periodically until it returns null.
     * 
     * The amount of waveform data generated at one time is arbitrary, however, 
     * do not lock for long time here since `abort()` requests of AudioDecoderWorker 
     * will not be received while this method is processing.
     * 
     * It is recommended to return this method after an appropriate size of wave is generated. 
     */
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

  override async dispose() {
    /* dispose resources here */
  }
}

const decoder = new MyDecoderWorker(self);
```

### Implement Renderer Worklet Processor

Save the following code as `my-renderer-worklet.ts`. No modification is required.

```typescript
import { runAudioWorklet, AudioRendererWorkletProcessor } from "webaudio-stream-player/dist/workers/audio-renderer-worklet-processor.js";

runAudioWorklet('renderer', AudioRendererWorkletProcessor);
```

### Create Player
#### with Vite

```typescript
import { AudioPlayer } from "webaudio-stream-player";

// `?worker` is a workaround to transpile .ts to .js
// See [this issue](https://github.com/vitejs/vite/issues/6979#issuecomment-1320394505)
import workletUrl from "./my-renderer-worklet.ts?worker&url";

export class MyPlayer extends AudioPlayer {
  constructor(rendererType) {
    super({
      rendererType: rendererType ?? "worklet",
      decoderWorkerFactory: () => {
        return new Worker(new URL("./my-decoder-worker.ts", import.meta.url), { type: "module" });
      },
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: "renderer",
      numberOfChannels: 2,
    });
  }
}
```

#### with Webpack

This library assumes the use of Webpack with [WorkerUrl](https://github.com/popelenkow/worker-url) plugin.
A typical Webpack configuration is [./example/webpack.config.js](./example/webpack.config.js).

```typescript
import { WorkerUrl } from "worker-url";
import { AudioPlayer } from "webaudio-stream-player";

// The `name` option of WorkerUrl is a marker to determine the webpack's chunkname (i.e. output filename).
// DO NOT USE A VARIABLE TO SPECIFY EITHER WORKER OR WORKLET NAME.
const decoderUrl = new WorkerUrl(new URL("./my-decoder-worker.js", import.meta.url), { name: "decorder" });
const workletUrl = new WorkerUrl(new URL("./my-renderer-worklet.js", import.meta.url), { name: "renderer" });

export class MyPlayer extends AudioPlayer {
  constructor(rendererType) {
    super({
      rendererType: rendererType ?? "worklet",
      decoderWorkerUrl: decoderUrl,
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: "renderer",
      numberOfChannels: 2,
    });
  }
}
```

## Play

```typescript
const player = new Player();
const audioContext = new AudioContext();
player.connect(audioContext.destination);

document.getElementById('some-element').addEventListener('click', async () => {
  if (audioContext.state != 'running') {
    await audioContext.resume();
  }
  player.play();
});
```

## Note
This library uses AudioWorklet that is only available in a [secure context](https://w3c.github.io/webappsec-secure-contexts/). 
Thus, if "worklet" renderer type is given to AudioPlayer, a page using the player must be served over HTTPS, 
or http://localhost.
