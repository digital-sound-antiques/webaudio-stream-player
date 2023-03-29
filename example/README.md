# webAudio-stream-player example

## Build
```
npm install
npm run build
```

## Run
```
npm run server
```

Then open http://localhost:8080 with a browser.

## Note
This library uses AudioWorklet that is only available in a [secure context](https://w3c.github.io/webappsec-secure-contexts/). 
Thus, if "worklet" renderer type is given to AudioPlayer, a page using the player must be served over HTTPS, 
or http://localhost.
