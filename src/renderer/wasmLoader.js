// WASM loader wrapper for ebur128.
// Behavior:
// 1) Try to load Emscripten-generated glue script (ebur128.js) and use `Module.cwrap`.
// 2) If not found, fall back to direct `fetch('wasm/ebur128.wasm')` + `WebAssembly.instantiate`.
// Exposes `window.EBUR128` when available. Otherwise `null`.

(async function(){
  window.EBUR128 = null;

  // Helper: attempt to load Emscripten-generated glue script (ebur128.js)
  async function tryLoadEmscriptenGlue(){
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'wasm/ebur128.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  try{
    // 1) Prefer Emscripten glue which provides Module and cwrap
    const glueLoaded = await tryLoadEmscriptenGlue();
    if(glueLoaded && window.Module && typeof window.Module.cwrap === 'function'){
      const M = window.Module;
      // Make sure Module is ready (Emscripten might initialize asynchronously)
      await new Promise((res) => { if (M.calledRun) return res(); const old = M.onRuntimeInitialized; M.onRuntimeInitialized = () => { if(old) old(); res(); }; if(M.onRuntimeInitialized===undefined) res(); });

      const eb_init = M.cwrap('eb_init','number',['number','number']);
      const eb_add = M.cwrap('eb_add_samples','number',['number','number']);
      const eb_get = M.cwrap('eb_get_i_loudness','number',[]);
      const eb_reset = M.cwrap('eb_reset','void',[]);

      window.EBUR128 = {
        _mode: 'emscripten',
        init(sampleRate, channels){
          const ok = eb_init(channels, sampleRate);
          this.sampleRate = sampleRate; this.channels = channels;
          return !!ok;
        },
        addSamples(float32Interleaved){
          if(!M._malloc) throw new Error('Module._malloc missing');
          const n = float32Interleaved.length;
          const bytes = n * 4;
          const ptr = M._malloc(bytes);
          const heap = new Float32Array(M.HEAPF32.buffer, ptr, n);
          heap.set(float32Interleaved);
          const frames = Math.floor(n / this.channels);
          const ret = eb_add(ptr, frames);
          M._free(ptr);
          return ret;
        },
        getIntegrated(){
          return eb_get();
        },
        reset(){ eb_reset(); }
      };

      console.info('EBUR128: using Emscripten glue (ebur128.js)');
      return;
    }

    // 2) Fallback: try plain wasm instantiate
    const resp = await fetch('wasm/ebur128.wasm');
    if(!resp.ok) throw new Error('no wasm');
    const bytes = await resp.arrayBuffer();
    const mod = await WebAssembly.instantiate(bytes, {});
    const exports = mod.instance.exports;
    const mem = exports.memory;

    function malloc(n){ if(exports.malloc) return exports.malloc(n); throw new Error('malloc missing in wasm'); }
    function free(p){ if(exports.free) return exports.free(p); }

    window.EBUR128 = {
      _mode: 'wasm',
      _exports: exports,
      init(sampleRate, channels){
        if(!exports.eb_init) throw new Error('eb_init not exported');
        const ok = exports.eb_init(channels, sampleRate);
        this.sampleRate = sampleRate; this.channels = channels;
        return !!ok;
      },
      addSamples(float32Interleaved){
        if(!this._ptr && exports.eb_init) throw new Error('call init first');
        const n = float32Interleaved.length;
        const bytes = n * 4;
        const p = malloc(bytes);
        const f32 = new Float32Array(mem.buffer, p, n);
        f32.set(float32Interleaved);
        if(!exports.eb_add_samples) throw new Error('eb_add_samples not exported');
        const frames = Math.floor(n / this.channels);
        exports.eb_add_samples(p, frames);
        free(p);
      },
      getIntegrated(){
        if(!exports.eb_get_i_loudness) throw new Error('eb_get_i_loudness not exported');
        return exports.eb_get_i_loudness();
      },
      reset(){ if(exports.eb_reset) exports.eb_reset(); }
    };

    console.info('EBUR128: using direct wasm instantiate (ebur128.wasm)');
  }catch(e){
    console.warn('EBUR128 WASM loader: no wasm available or failed to load', e);
    window.EBUR128 = null;
  }
})();
