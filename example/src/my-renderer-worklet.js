// Note: audio-renderer-worklet-processor.js must be imported by path.
import { runAudioWorklet, AudioRendererWorkletProcessor } from "audio-stream-player/dist/workers/audio-renderer-worklet-processor.js";

runAudioWorklet('renderer', AudioRendererWorkletProcessor);