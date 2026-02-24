```markdown
Build libebur128 to WebAssembly and wire it into the renderer

This repo includes a minimal C wrapper at `src/wasm/wrapper.c` that exposes a tiny API the renderer can call from JS:

- `int eb_init(int channels, int samplerate)`
- `int eb_add_samples(float *buf, int frames)`  // interleaved float32 frames
- `double eb_get_i_loudness()`  // returns integrated LUFS
- `void eb_reset()`

Quick build steps (macOS) — requires Emscripten (emsdk)

1) Install emsdk per https://emscripten.org/docs/getting_started/downloads.html and enable `emcc` in your shell.

2) Clone and build libebur128 (example using the upstream repo):

```bash
git clone https://github.com/ebu/libebur128.git
cd libebur128
emconfigure ./configure
emmake make
cd ..
```

3) From the project root, build the wrapper and produce JS+WASM output. Adjust include/lib paths if you placed `libebur128` elsewhere:

```bash
emcc src/wasm/wrapper.c \
  -I libebur128/include \
  -L libebur128/.libs -lebur128 \
  -O3 \
  -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap"]' \
  -s EXPORTED_FUNCTIONS='["_eb_init","_eb_add_samples","_eb_get_i_loudness","_eb_reset"]' \
  -o src/wasm/ebur128.js
```

This will generate `src/wasm/ebur128.js` and `src/wasm/ebur128.wasm`.

4) Restart the Electron app. Two integration patterns are supported:

- Use the generated Emscripten glue (`ebur128.js`) — it exposes `Module.cwrap` so from renderer code you can do:

```js
// after loading ebur128.js into the renderer context
const eb_init = Module.cwrap('eb_init','number',['number','number']);
const eb_add = Module.cwrap('eb_add_samples','number',['number','number']);
const eb_get = Module.cwrap('eb_get_i_loudness','number',[]);
// allocate with Module._malloc and pass pointer for float data, or use Module.HEAPF32
```

- Or, if you prefer a direct `WebAssembly.instantiate` (no Emscripten glue), build a WASM module that exports the same symbols and adapt `wasmLoader.js` to call them directly. The repo's `src/renderer/wasmLoader.js` currently attempts a plain `fetch`+instantiate flow; if you use the Emscripten glue, prefer loading `ebur128.js` instead.

Notes
- Exported function names from Emscripten may have leading underscores in raw exports; using `Module.cwrap` is the simplest call-side approach.
- If you want, I can also update `wasmLoader.js` to prefer the Emscripten-generated glue when found and fall back to direct instantiate. Tell me if you'd like that change.

Once the built files are in `src/wasm/`, the renderer can call into the WASM wrapper to compute BS.1770 LUFS accurately.
```
