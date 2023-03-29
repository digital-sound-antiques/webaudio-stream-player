/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ var __webpack_modules__ = ({

/***/ "../dist/wave-buffer.js":
/*!******************************!*\
  !*** ../dist/wave-buffer.js ***!
  \******************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"WaveBuffer\": () => (/* binding */ WaveBuffer)\n/* harmony export */ });\nfunction createSameTypeBuffer(prot, length) {\n    if (prot instanceof Float32Array) {\n        return new Float32Array(length);\n    }\n    else if (prot instanceof Int32Array) {\n        return new Int32Array(length);\n    }\n    else if (prot instanceof Int16Array) {\n        return new Int16Array(length);\n    }\n    else if (prot instanceof Int8Array) {\n        return new Int8Array(length);\n    }\n    else if (prot instanceof Uint8Array) {\n        return new Uint8Array(length);\n    }\n    else {\n        throw new Error(`Unsupported array type ${typeof prot}`);\n    }\n}\nclass MonoWaveBuffer {\n    constructor(initialLength) {\n        this._wave = null;\n        this.rp = 0;\n        this.wp = 0;\n        this._initialLength = initialLength;\n    }\n    get byteLength() {\n        if (this._wave != null) {\n            return this.wp * this._wave.BYTES_PER_ELEMENT;\n        }\n        return 0;\n    }\n    seekTo(frame, relative) {\n        if (relative) {\n            this.rp += frame;\n        }\n        else {\n            this.rp = frame;\n        }\n        this.rp = Math.min(Math.max(0, this.rp), this.wp);\n    }\n    clear() {\n        this._wave = null;\n        this.wp = 0;\n        this.rp = 0;\n    }\n    write(data) {\n        if (this._wave == null) {\n            this._wave = createSameTypeBuffer(data, this._initialLength);\n        }\n        if (typeof data != typeof this._wave) {\n            throw new Error(`The type of wave sample has changed during playing from ${typeof this._wave} to ${typeof data}.`);\n        }\n        if (this.wp + data.length > this._wave.length) {\n            const newWave = createSameTypeBuffer(this._wave, this._wave.length * 2);\n            newWave.set(this._wave);\n            this._wave = newWave;\n        }\n        this._wave.set(data, this.wp);\n        this.wp += data.length;\n    }\n    process(output) {\n        if (this._wave instanceof Float32Array) {\n            for (let i = 0; i < output.length; i++) {\n                if (this.rp < this.wp) {\n                    output[i] = this._wave[this.rp++];\n                }\n            }\n        }\n        else if (this._wave instanceof Int32Array) {\n            for (let i = 0; i < output.length; i++) {\n                if (this.rp < this.wp) {\n                    output[i] = this._wave[this.rp++] / (1 << 31);\n                }\n            }\n        }\n        else if (this._wave instanceof Int16Array) {\n            for (let i = 0; i < output.length; i++) {\n                if (this.rp < this.wp) {\n                    output[i] = this._wave[this.rp++] / (1 << 15);\n                }\n            }\n        }\n        else if (this._wave instanceof Int8Array) {\n            for (let i = 0; i < output.length; i++) {\n                if (this.rp < this.wp) {\n                    output[i] = this._wave[this.rp++] / (1 << 7);\n                }\n            }\n        }\n        else if (this._wave instanceof Uint8Array) {\n            for (let i = 0; i < output.length; i++) {\n                if (this.rp < this.wp) {\n                    output[i] = (this._wave[this.rp++] - 128) / (1 << 7);\n                }\n            }\n        }\n        else {\n            // do nothing\n        }\n    }\n}\nclass WaveBuffer {\n    constructor(sampleRate, numberOfChannels) {\n        this.isFulFilled = false;\n        this._sampleRate = sampleRate;\n        this._waves = Array();\n        for (let i = 0; i < numberOfChannels; i++) {\n            this._waves.push(new MonoWaveBuffer(sampleRate * 60));\n        }\n    }\n    seekTo(frame, relative) {\n        for (const wave of this._waves) {\n            wave.seekTo(frame, relative);\n        }\n    }\n    clear() {\n        for (const wave of this._waves) {\n            wave.clear();\n        }\n    }\n    get stat() {\n        const currentFrame = this._waves[0].rp;\n        const bufferedFrames = this._waves[0].wp;\n        return {\n            currentFrame,\n            currentTime: Math.floor(currentFrame / this._sampleRate * 1000),\n            bufferedFrames,\n            bufferedTime: Math.floor(bufferedFrames / this._sampleRate * 1000),\n            isFulFilled: this.isFulFilled,\n        };\n    }\n    write(inputs) {\n        if (inputs == null || inputs.length == 0 || inputs[0] == null) {\n            this.isFulFilled = true;\n            console.log(`buffered: ${(this._waves[0].byteLength / 1024 / 1024).toFixed(2)}MB`);\n        }\n        else {\n            const k = Math.min(inputs.length, this._waves.length);\n            for (let i = 0; i < k; i++) {\n                this._waves[i].write(inputs[i]);\n            }\n        }\n    }\n    _processImpl(channels) {\n        const k = Math.min(channels.length, this._waves.length);\n        for (let i = 0; i < k; i++) {\n            this._waves[i].process(channels[i]);\n        }\n        if (this.isFulFilled && this._waves[0].rp == this._waves[0].wp) {\n            return false;\n        }\n        return true;\n    }\n    onAudioProcess(ev) {\n        const channels = [];\n        for (let i = 0; i < ev.outputBuffer.numberOfChannels; i++) {\n            channels.push(ev.outputBuffer.getChannelData(i));\n        }\n        return this._processImpl(channels);\n    }\n    onAudioWorkletProcess(inputs, outputs) {\n        const channels = outputs[0];\n        return this._processImpl(channels);\n    }\n}\n\n\n//# sourceURL=webpack://webaudio-stream-player-example/../dist/wave-buffer.js?");

/***/ }),

/***/ "../dist/workers/audio-renderer-worklet-processor.js":
/*!***********************************************************!*\
  !*** ../dist/workers/audio-renderer-worklet-processor.js ***!
  \***********************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"AudioRendererWorkletProcessor\": () => (/* binding */ AudioRendererWorkletProcessor),\n/* harmony export */   \"runAudioWorklet\": () => (/* binding */ runAudioWorklet)\n/* harmony export */ });\n/* harmony import */ var _wave_buffer_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../wave-buffer.js */ \"../dist/wave-buffer.js\");\n// Avoid using @types/audioworklet here because it has at least two problems.\n// 1. It conflicts type definitions in DOM library. \n// 2. Missing options argument of AudioWorkletProcessor.new\nvar __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {\n    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }\n    return new (P || (P = Promise))(function (resolve, reject) {\n        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }\n        function rejected(value) { try { step(generator[\"throw\"](value)); } catch (e) { reject(e); } }\n        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }\n        step((generator = generator.apply(thisArg, _arguments || [])).next());\n    });\n};\n\nclass AudioRendererWorkletProcessor extends AudioWorkletProcessor {\n    static get parameterDescriptors() {\n        return [];\n    }\n    constructor(options) {\n        super(options);\n        this._inputPort = null;\n        this._state = 'initial';\n        this.port.onmessage = (ev) => __awaiter(this, void 0, void 0, function* () {\n            let res;\n            const req = ev.data;\n            try {\n                const data = yield this._onCommand(req);\n                res = { seq: req.seq, type: req.type, data: data };\n            }\n            catch (e) {\n                res = { seq: req.seq, type: req.type, error: e };\n            }\n            this.port.postMessage(res);\n        });\n        this._buffer = new _wave_buffer_js__WEBPACK_IMPORTED_MODULE_0__.WaveBuffer(sampleRate, options.outputChannelCount);\n    }\n    _reset() {\n        var _a;\n        (_a = this._buffer) === null || _a === void 0 ? void 0 : _a.clear();\n        if (this._inputPort != null) {\n            this._inputPort.onmessage = null;\n            this._inputPort.close();\n            this._inputPort = null;\n        }\n    }\n    _setState(state) {\n        this._state = state;\n        this.port.postMessage({ type: 'state', state });\n    }\n    _onCommand(cmd) {\n        return __awaiter(this, void 0, void 0, function* () {\n            switch (cmd.type) {\n                case 'play':\n                    if (this._state != 'disposed') {\n                        this._reset();\n                        this._inputPort = cmd.inputPort;\n                        this._inputPort.onmessage = (ev) => this._buffer.write(ev.data);\n                        this._setState('playing');\n                    }\n                    else {\n                        console.error('This object has already been disposed.');\n                    }\n                    return;\n                case 'pause':\n                    if (this._state == 'playing') {\n                        this._setState('paused');\n                    }\n                    return;\n                case 'seek':\n                    this._buffer.seekTo(cmd.seekPos, cmd.relative);\n                    if (this._state == 'stopped') {\n                        this._setState('playing');\n                    }\n                    return;\n                case 'resume':\n                    if (this._state == 'paused') {\n                        this._setState('playing');\n                    }\n                    return;\n                case 'abort':\n                    this._reset();\n                    this._setState('aborted');\n                    return;\n                case 'dispose':\n                    this._reset();\n                    this.port.onmessage = null;\n                    this._setState('disposed');\n                    return;\n            }\n        });\n    }\n    process(inputs, outputs) {\n        if (this._state == 'disposed') {\n            return false;\n        }\n        if (this._state == 'playing') {\n            const res = this._buffer.onAudioWorkletProcess(inputs, outputs);\n            this.port.postMessage({\n                type: 'progress',\n                stat: this._buffer.stat,\n            });\n            if (!res) {\n                this._setState('stopped');\n            }\n        }\n        return true;\n    }\n}\nfunction runAudioWorklet(name, ctor) {\n    registerProcessor(name, ctor);\n}\n\n\n//# sourceURL=webpack://webaudio-stream-player-example/../dist/workers/audio-renderer-worklet-processor.js?");

/***/ }),

/***/ "./src/my-renderer-worklet.js":
/*!************************************!*\
  !*** ./src/my-renderer-worklet.js ***!
  \************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var audio_stream_player_dist_workers_audio_renderer_worklet_processor_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! audio-stream-player/dist/workers/audio-renderer-worklet-processor.js */ \"../dist/workers/audio-renderer-worklet-processor.js\");\n// Note: audio-renderer-worklet-processor.js must be imported by path.\n\n\n(0,audio_stream_player_dist_workers_audio_renderer_worklet_processor_js__WEBPACK_IMPORTED_MODULE_0__.runAudioWorklet)('renderer', audio_stream_player_dist_workers_audio_renderer_worklet_processor_js__WEBPACK_IMPORTED_MODULE_0__.AudioRendererWorkletProcessor);\n\n//# sourceURL=webpack://webaudio-stream-player-example/./src/my-renderer-worklet.js?");

/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __webpack_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/make namespace object */
/******/ (() => {
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = (exports) => {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ })();
/******/ 
/************************************************************************/
/******/ 
/******/ // startup
/******/ // Load entry module and return exports
/******/ // This entry module can't be inlined because the eval devtool is used.
/******/ var __webpack_exports__ = __webpack_require__("./src/my-renderer-worklet.js");
/******/ 
