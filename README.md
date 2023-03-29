# webaudio-stream-player

A framework for creating an audio stream player using WebAudio. 

- Both AudioWorkletNote and ScriptProcessorNode are supported. 
- No SharedArrayBuffer is used so that [cross-origin isolation](https://web.dev/i18n/en/cross-origin-isolation-guide/) is not required.

## How to Use
TBD. Example is [here](./example).

This library assumes the use of Webpack with [WorkerUrl](https://github.com/popelenkow/worker-url) plugin.
A typical Webpack configuration is [./example/webpack.config.js](./example/webpack.config.js).

## Note
This library uses AudioWorklet that is only available in a [secure context](https://w3c.github.io/webappsec-secure-contexts/). 
Thus, if "worklet" renderer type is given to AudioPlayer, a page using the player must be served over HTTPS, 
or http://localhost.
