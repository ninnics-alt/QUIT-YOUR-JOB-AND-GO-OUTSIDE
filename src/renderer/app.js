(async function(){
  const deviceSelect = document.getElementById('deviceSelect');
  const startBtn = document.getElementById('start');
  const themeSelect = document.getElementById('themeSelect');
  const autoStartEl = document.getElementById('autoStart');
  const lufsEl = document.getElementById('lufs');
  const wasmStatusEl = document.getElementById('wasmStatus');
  const rmsEl = document.getElementById('rms');
  const peakEl = document.getElementById('peak');
  const peakHoldEl = document.getElementById('peakHold');
  const canvas = document.getElementById('wave');
  const ctx = canvas.getContext('2d');
  const vsCanvas = document.getElementById('vectorscope');
  const vsCtx = vsCanvas.getContext('2d');
  const corrValEl = document.getElementById('corrVal');
  const vsStyleEl = document.getElementById('vsStyle');
  const vsRotateEl = document.getElementById('vsRotate');
  const vsNormalizeEl = document.getElementById('vsNormalize');
  // offscreen accumulation buffer for nicer trails
  const vsBuffer = document.createElement('canvas');
  vsBuffer.width = vsCanvas.width;
  vsBuffer.height = vsCanvas.height;
  const vsBufCtx = vsBuffer.getContext('2d');
  // new visual canvases
  const oscCanvas = document.getElementById('osc');
  const oscCtx = oscCanvas.getContext('2d');
  const specCanvas = document.getElementById('specgram');
  const specCtx = specCanvas.getContext('2d');
  const specBuf = document.createElement('canvas');
  specBuf.width = specCanvas.width; specBuf.height = specCanvas.height;
  const specBufCtx = specBuf.getContext('2d');
  const specGraphCanvas = document.getElementById('specgraph');
  const specGraphCtx = specGraphCanvas.getContext('2d');
  
  // Goniometer panel (upgraded with persistence, heatmap, multiple modes)
  const goniCanvas = document.getElementById('goniometer');
  let goniometerPanel = null;
  if(goniCanvas && window.GoniometerPanel){
    goniometerPanel = new window.GoniometerPanel(goniCanvas);
    console.log('[Goniometer] Panel initialized:', goniometerPanel);
  } else {
    console.warn('[Goniometer] Init failed - canvas:', !!goniCanvas, 'class available:', !!window.GoniometerPanel);
  }

  // Vectorscope state (no per-frame allocations)
  let vsStyle = 'phosphor';
  let vsNormalize = true;
  let vsRotateRad = 0;
  const vsDotSize = 1.5;
  const vsMaxPoints = 2048;
  const vsPointsX = new Float32Array(vsMaxPoints);
  const vsPointsY = new Float32Array(vsMaxPoints);
  const vsIdx = new Int32Array(vsMaxPoints);
  const vsHull = new Int32Array(vsMaxPoints * 2);
  const vsStackL = new Int32Array(vsMaxPoints);
  const vsStackR = new Int32Array(vsMaxPoints);
  let vsPointCount = 0;
  let vsLastCorr = 0;
  let vsLastWidth = 0;
  let vsLastBalance = 0;

  if(vsStyleEl) vsStyleEl.addEventListener('change', (e) => { vsStyle = e.target.value; });
  if(vsNormalizeEl) vsNormalizeEl.addEventListener('change', (e) => { vsNormalize = e.target.checked; });
  if(vsRotateEl) vsRotateEl.addEventListener('change', (e) => {
    const deg = parseFloat(e.target.value) || 0;
    vsRotateRad = (deg * Math.PI) / 180;
  });
  
  // Wire up Goniometer mode and mapping controls
  if(goniometerPanel){
    const goniModeSelect = document.getElementById('goniModeSelect');
    const goniMappingSelect = document.getElementById('goniMappingSelect');
    
    if(goniModeSelect){
      goniModeSelect.addEventListener('change', (e) => {
        goniometerPanel.setMode(e.target.value);
      });
    }
    
    if(goniMappingSelect){
      goniMappingSelect.addEventListener('change', (e) => {
        goniometerPanel.setMapping(e.target.value);
      });
    }
  }
  
  // NEW: Meter display canvas
  const metersCanvas = document.getElementById('metersCanvas');
  const metersCtx = metersCanvas.getContext('2d');

  // Meter engine (loaded from meter-engine.js script tag)
  let meterEngine = null;

  // Bass Car Panel (replaces waveform)
  let bassCarPanel = null;

  // Glitter underlay effect (only for GLITTER_APOCALYPSE theme)
  const glitterCanvas = document.getElementById('glitterCanvas');
  let glitterLayer = null;
  if(glitterCanvas && window.GlitterLayer){
    console.log('[Glitter] Canvas element:', glitterCanvas);
    console.log('[Glitter] Canvas parent:', glitterCanvas.parentElement.tagName);
    console.log('[Glitter] Canvas classList before:', glitterCanvas.className);
    glitterLayer = new window.GlitterLayer(glitterCanvas);
    console.log('[Glitter] Layer initialized:', glitterLayer);
    
    // Start independent animation loop for glitter (runs even without audio)
    let lastGlitterTime = performance.now();
    function glitterTick() {
      if(glitterLayer && glitterLayer.isActive){
        const now = performance.now();
        const dt = (now - lastGlitterTime) / 1000; // convert to seconds
        lastGlitterTime = now;
        glitterLayer.tick(dt);
        glitterLayer.draw();
      }
      requestAnimationFrame(glitterTick);
    }
    requestAnimationFrame(glitterTick);
  } else {
    console.warn('[Glitter] Not initialized - canvas:', !!glitterCanvas, 'GlitterLayer:', !!window.GlitterLayer);
  }

  // Setup automatic canvas resizing with ResizeObserver
  function setupCanvasResizeObserver(canvas, onResizeCallback) {
    if(!canvas || !window.ResizeObserver) return;
    
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      
      // Set canvas pixel resolution
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      
      // Set CSS size
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      // Scale context for high DPI - use setTransform to avoid cumulative scaling
      const ctx = canvas.getContext('2d');
      if(ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Notify callback if provided
      if(onResizeCallback) onResizeCallback(width, height);
    });
    
    ro.observe(canvas);
    return ro;
  }
  
  // Register ResizeObservers for all canvases
  const waveResizeObserver = setupCanvasResizeObserver(canvas, (w, h) => {
    if(bassCarPanel && bassCarPanel.onResize) {
      bassCarPanel.onResize(w, h);
    }
  });
  const specGraphResizeObserver = setupCanvasResizeObserver(specGraphCanvas);
  const goniResizeObserver = setupCanvasResizeObserver(goniCanvas);
  
  // Special handling for vectorscope - resize offscreen buffer
  const vsResizeObserver = setupCanvasResizeObserver(vsCanvas, (w, h) => {
    const dpr = window.devicePixelRatio || 1;
    vsBuffer.width = Math.round(w * dpr);
    vsBuffer.height = Math.round(h * dpr);
  });
  
  // Special handling for spectrogram - resize offscreen buffer
  const specResizeObserver = setupCanvasResizeObserver(specCanvas, (w, h) => {
    const dpr = window.devicePixelRatio || 1;
    specBuf.width = Math.round(w * dpr);
    specBuf.height = Math.round(h * dpr);
  });
  
  // Special handling for metersCanvas - notify MeterDisplay on resize
  const metersResizeObserver = setupCanvasResizeObserver(metersCanvas, (w, h) => {
    if(meterDisplay && meterDisplay.onResize) {
      meterDisplay.onResize(w, h);
    }
  });
  
  // Listen for theme changes and clear all offscreen buffers
  window.addEventListener('themeChanged', () => {
    // Clear vectorscope buffer
    if (vsBuffer && vsBufCtx) {
      vsBufCtx.clearRect(0, 0, vsBuffer.width, vsBuffer.height);
    }
    
    // Clear spectrogram buffer
    if (specBuf && specBufCtx) {
      specBufCtx.clearRect(0, 0, specBuf.width, specBuf.height);
    }
    
    // Clear oscilloscope persistence buffer if it exists
    if (oscPanel && oscPanel.persistBuffer) {
      const ctx = oscPanel.persistBuffer.getContext('2d');
      ctx && ctx.clearRect(0, 0, oscPanel.persistBuffer.width, oscPanel.persistBuffer.height);
    }

    // Enable/disable glitter effect based on theme
    if(glitterLayer){
      const isGlitterTheme = (THEME.currentPalette === 'glitter');
      console.log('[Glitter] Theme changed - palette:', THEME.currentPalette, 'isGlitter:', isGlitterTheme);
      if(isGlitterTheme){
        glitterLayer.start();
        console.log('[Glitter] Started, isActive:', glitterLayer.isActive);
      }else{
        glitterLayer.stop();
        console.log('[Glitter] Stopped');
      }
    }
    
    // Force a full redraw on next tick
    requestAnimationFrame(() => {
      // All panels will redraw with new colors in the next animation frame
    });
  });
  
  // Special handling for oscilloscope - notify OscilloscopePanel on resize
  const oscResizeObserver = setupCanvasResizeObserver(oscCanvas, (w, h) => {
    if(oscPanel && oscPanel.onResize) {
      oscPanel.onResize(w, h);
    }
  });

  // Setup glitter canvas with ResizeObserver
  const glitterResizeObserver = setupCanvasResizeObserver(glitterCanvas, (w, h) => {
    // Only resize if canvas is actually visible (has active class)
    if(glitterCanvas && glitterCanvas.classList.contains('active')){
      console.log('[Glitter] Canvas resized to', w, 'x', h, 'logical pixels');
      if(glitterLayer && glitterLayer.resize) {
        glitterLayer.resize(w, h);
      }
    }
  });

  // Force initial size for glitter canvas (in case ResizeObserver doesn't fire immediately)
  if(glitterCanvas){
    const dpr = window.devicePixelRatio || 1;
    // Canvas is now a sibling of content, sized to match remaining content area below header
    const headerEl = document.querySelector('header');
    const appEl = document.getElementById('app');
    const appRect = appEl.getBoundingClientRect();
    const headerRect = headerEl.getBoundingClientRect();
    
    // Canvas dimensions: #app width x (remaining height below header)
    const w = appRect.width;
    const h = appRect.height - headerRect.height;
    
    glitterCanvas.width = Math.round(w * dpr);
    glitterCanvas.height = Math.round(h * dpr);
    // Also set CSS size and position
    glitterCanvas.style.width = w + 'px';
    glitterCanvas.style.height = h + 'px';
    glitterCanvas.style.position = 'absolute';
    glitterCanvas.style.top = headerRect.height + 'px';
    glitterCanvas.style.left = '0';
    glitterCanvas.style.pointerEvents = 'none';
    glitterCanvas.style.zIndex = '0';
    
    console.log('[Glitter] Initial canvas size set to', glitterCanvas.width, 'x', glitterCanvas.height, 'physical pixels');
    console.log('[Glitter] CSS size set to', w, 'x', h, 'logical pixels, top offset:', headerRect.height);
    console.log('[Glitter] Canvas in DOM:', document.contains(glitterCanvas), 'display:', window.getComputedStyle(glitterCanvas).display);
  }

  let audioCtx, analyser, dataArray, source, stream;
  let splitter, analyserL, analyserR, leftArray, rightArray;
  let freqDataL, freqDataR; // Frequency data for Bass Car Panel
  let integratedPower = 1e-12;
  let kWeightNodeHead; // chain head after source for K-weighting
  let sampleRate = 48000;
  let ebInited = false;
  let ebChannels = 1;
  // smoothing state for meters
  let smoothRms = -120; // dB
  let smoothPeak = -120; // dB
  const attackTime = 0.02; // seconds
  const releaseTime = 0.25; // seconds
  
  // NEW: Detail level state
  let detailLevel = 'med'; // 'low', 'med', 'high'
  const detailToggle = document.getElementById('detailToggle');

  // NEW: Initialize MeterDisplay immediately (before audio starts)
  let meterDisplay = null;
  try {
    if (window.MeterDisplay) {
      meterDisplay = new window.MeterDisplay('metersCanvas');
      meterDisplay.setDetailLevel(detailLevel);
      console.log('[MeterDisplay] Initialized on page load');
    } else {
      console.warn('[MeterDisplay] Class not available on window');
    }
  } catch (e) {
    console.error('[MeterDisplay] Init error:', e);
  }

  // OscilloscopePanel - will be initialized after class definition
  let oscPanel = null;

  // circular buffer for LUFS block processing
  let buffer = null;
  let bufferL = null;
  let bufferR = null;
  let bufWrite = 0;
  let bufLen = 0;

  // momentary LUFS: keep last 3 seconds (~8 blocks at 0.4s per block)
  let momentaryLufs = -100;
  let momentaryBlocks = [];
  const momentaryBlockCount = 8;

  // peak LUFS: track maximum LUFS
  let peakLufs = -100;

  // ===== ITU-R BS.1770-4 LUFS STATE (NEW) =====
  let lufsBlockBuffer, lufsBlockIdx, blockSamples, hopSamples;
  let lufsBlocks = [];
  let samplePeakInstant = 0;
  let samplePeakHold = -Infinity;

  // ============ K-WEIGHTING FILTER (ITU-R BS.1770-4) ============
  // Biquad filter coefficients for 48kHz sample rate
  const kWeightCoeffs = {
    hp: {
      b0: 0.9996564871583742, b1: -1.9993129743167484, b2: 0.9996564871583742,
      a1: -1.9993129743167484, a2: 0.9993138313246673
    },
    shelf: {
      b0: 1.040678792313195, b1: -2.0611545669340947, b2: 1.0203649589279294,
      a1: -2.0626373184776533, a2: 1.0630254919031936
    }
  };

  class BiquadFilter {
    constructor(coeffs) {
      this.b0 = coeffs.b0; this.b1 = coeffs.b1; this.b2 = coeffs.b2;
      this.a1 = coeffs.a1; this.a2 = coeffs.a2;
      this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    }
    process(x) {
      const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2 - this.a1*this.y1 - this.a2*this.y2;
      this.x2 = this.x1; this.x1 = x;
      this.y2 = this.y1; this.y1 = y;
      return y;
    }
  }

  // K-weighting filter chain instances (per channel)
  let kWeightL, kWeightL2, kWeightR, kWeightR2;

  function applyKWeight(sample, isRight = false) {
    const filt1 = isRight ? kWeightR : kWeightL;
    const filt2 = isRight ? kWeightR2 : kWeightL2;
    return filt2.process(filt1.process(sample));
  }

  async function listDevices(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    deviceSelect.innerHTML = '';
    // always offer system default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = 'Default Input Device';
    deviceSelect.appendChild(defaultOpt);
    devices.filter(d=>d.kind==='audioinput').forEach(d=>{
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || ('Input ' + d.deviceId);
      deviceSelect.appendChild(opt);
    });
    // populate device modal panel list
    const devListPanel = document.getElementById('deviceListPanel');
    if(devListPanel){
      devListPanel.innerHTML = '';
      devices.filter(d=>d.kind==='audioinput').forEach(d=>{
        const div = document.createElement('div');
        div.className = 'deviceItem';
        div.innerHTML = `<div class="label">${d.label || '(no label - permission not granted)'}</div><div class="id">id: ${d.deviceId}</div>`;
        devListPanel.appendChild(div);
      });
    }
    // restore saved device if available
    const settings = loadSettings();
    if(settings && settings.deviceId){
      const found = Array.from(deviceSelect.options).some(o=>o.value===settings.deviceId);
      if(found) deviceSelect.value = settings.deviceId;
    }
  }

  function computeStats(floatData){
    let sum = 0;
    let peak = 0;
    for(let i=0;i<floatData.length;i++){
      const v = floatData[i];
      sum += v*v;
      if(Math.abs(v) > peak) peak = Math.abs(v);
    }
    const meanSquare = sum/floatData.length || 1e-12;
    const rms = Math.sqrt(meanSquare);
    const db = 20 * Math.log10(rms + 1e-12);
    const peakDb = 20 * Math.log10(peak + 1e-12);

    // approximate integrated LUFS: simple EMA on linear power (NOT BS.1770 exact)
    integratedPower = integratedPower * 0.999 + meanSquare * 0.001;
    const approxLUFS = 10 * Math.log10(integratedPower + 1e-12);

    return {rms, db, peak, peakDb, approxLUFS};
  }

  function drawWave(floatData){
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    const colors = THEME.colors;
    ctx.fillStyle = colors.bgInset;
    ctx.fillRect(0,0,w,h);

    // gradient stroke
    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0, colors.accentA);
    grad.addColorStop(1, colors.accentB);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<floatData.length;i++){
      const x = (i/floatData.length) * w;
      const y = (0.5 + floatData[i]*0.5) * h;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    // low-res pixel overlay
    const [r, g, b] = UIHelpers._parseRGB(colors.accentA);
    ctx.fillStyle = `rgba(${r},${g},${b},0.04)`;
    for(let gx=0;gx<w;gx+=8){
      for(let gy=0;gy<h;gy+=8){
        if(Math.random() > 0.985) ctx.fillRect(gx,gy,6,6);
      }
    }
  }

  async function start(){
    const deviceId = deviceSelect.value || undefined;
    try{
      // Request stereo audio with optimal constraints
      let constraints;
      if (deviceId && deviceId !== 'default') {
        constraints = {
          audio: {
            deviceId: { exact: deviceId },
            channelCount: { ideal: 2 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        };
      } else {
        constraints = {
          audio: {
            channelCount: { ideal: 2 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        };
      }
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const settings = audioTracks[0].getSettings?.();
        console.log('[Audio] Stream acquired with settings:', {
          channelCount: settings?.channelCount,
          sampleRate: settings?.sampleRate,
          trackLabel: audioTracks[0].label
        });
      }
    }catch(e){
      // try fallback: attempt default device if a specific device failed
      console.warn('getUserMedia failed for selected device:', e);
      try{
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 2 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const settings = audioTracks[0].getSettings?.();
          console.log('[Audio] Stream acquired (fallback) with settings:', {
            channelCount: settings?.channelCount,
            sampleRate: settings?.sampleRate
          });
        }
      }catch(err){
        alert('Could not open audio device: ' + err.message);
        return;
      }
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioCtx.sampleRate || 48000;
    source = audioCtx.createMediaStreamSource(stream);

    // Debug: Log stream info
    console.log('[Audio] Stream active:', stream.active);
    console.log('[Audio] Tracks:', stream.getTracks().map(t => ({
      kind: t.kind,
      label: t.label,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState
    })));

    // instantiate MeterEngine with the actual sample rate
    try{
      if(window.MeterEngine){
        meterEngine = new window.MeterEngine(sampleRate);
        console.log('[MeterEngine] Initialized with sample rate:', sampleRate);
      }else{
        console.warn('[MeterEngine] Class not available on window');
      }
    }catch(e){ console.warn('Could not create MeterEngine', e); }

    // K-weighting approximation: HPF + highshelf to approximate ITU pre-filter
    // TEMPORARILY DISABLED FOR TESTING - seems to be causing 7-10 dB drop
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 60; // 60 Hz highpass (approx)
    hp.Q.value = 0.7071;

    const shelf = audioCtx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 1000; // shelf at 1kHz
    shelf.gain.value = 4.0; // gentle boost to approximate K-weighting

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    dataArray = new Float32Array(bufferLength);
    const freqBinCount = analyser.frequencyBinCount;
    const freqData = new Uint8Array(freqBinCount);

    // channel split for vectorscope and goniometer
    splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser(); analyserL.fftSize = 1024;
    analyserR = audioCtx.createAnalyser(); analyserR.fftSize = 1024;
    leftArray = new Float32Array(analyserL.fftSize);
    rightArray = new Float32Array(analyserR.fftSize);
    freqDataL = new Float32Array(analyserL.frequencyBinCount);
    freqDataR = new Float32Array(analyserR.frequencyBinCount);
    
    // Create a stereo merger for fallback (mono to stereo conversion)
    const merger = audioCtx.createChannelMerger(2);
    let isMono = false;
    
    // Try to detect if source is mono
    const sourceChannels = source.maxChannelCount || 1;
    console.log('[Audio] Source max channels:', sourceChannels);

    // Initialize Bass Car Panel (replaces waveform)
    if(window.BassCarPanel && canvas){
      bassCarPanel = new window.BassCarPanel(canvas, analyserL, analyserR, sampleRate);
      // Set initial size
      const rect = canvas.getBoundingClientRect();
      bassCarPanel.onResize(rect.width, rect.height);
      console.log('[BassCarPanel] Initialized');
    }

    // BYPASS K-WEIGHT FOR TESTING: connect source directly to analyser
    source.connect(analyser);
    analyser.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    kWeightNodeHead = analyser; // point to analyser instead of shelf
    
    // If the input is mono, we can optionally add stereo processing here
    // For now, we'll connect in a way that works with mono input
    // (splitter will duplicate the mono channel to both left/right analysers)

    // LUFS buffer: store 10s of audio to allow gating and integrated calc
    bufLen = sampleRate * 10 | 0;
    buffer = new Float32Array(bufLen);
    bufferL = new Float32Array(bufLen);
    bufferR = new Float32Array(bufLen);
    bufWrite = 0;

    // Initialize ITU-R BS.1770-4 LUFS state
    blockSamples = Math.floor(sampleRate * 0.4); // 400 ms blocks
    hopSamples = Math.floor(sampleRate * 0.1);   // 100 ms hop
    lufsBlockBuffer = new Float32Array(blockSamples);
    lufsBlockIdx = 0;
    lufsBlocks = [];
    samplePeakHold = -Infinity;

    // Initialize K-weighting filters
    kWeightL = new BiquadFilter(kWeightCoeffs.hp);
    kWeightL2 = new BiquadFilter(kWeightCoeffs.shelf);
    kWeightR = new BiquadFilter(kWeightCoeffs.hp);
    kWeightR2 = new BiquadFilter(kWeightCoeffs.shelf);

    // Initialize EBUR128 WASM if available
    try{
      if(window.EBUR128){
        // prefer stereo when we have channel split
        ebChannels = (analyserL && analyserR) ? 2 : 1;
        const ok = window.EBUR128.init(sampleRate, ebChannels);
        ebInited = !!ok;
        console.info('EBUR128 init:', ebInited, 'channels=', ebChannels);
        if(wasmStatusEl){ wasmStatusEl.textContent = ebInited ? ('WASM: '+(window.EBUR128._mode||'wasm')) : 'WASM: none'; wasmStatusEl.classList.toggle('active', !!ebInited); }
      }
    }catch(e){ console.warn('EBUR128 init failed', e); }

    // DOOM FX: Initialize transient detection state
    let doomLastLowBandEnergy = 0;
    let doomHitDebounce = 0;

    function tick(){
      const tickStartTime = performance.now();
      analyser.getFloatTimeDomainData(dataArray);
      analyser.getByteFrequencyData(freqData);
      // draw spectrogram and spectrograph
      try{ drawSpectrogram(freqData); drawSpecGraph(freqData); }catch(e){}
      // get channel data for vectorscope and oscilloscope
      try{
        analyserL.getFloatTimeDomainData(leftArray);
        analyserR.getFloatTimeDomainData(rightArray);
        
        // Draw oscilloscope with stereo data
        if(oscPanel) {
          oscPanel.render(leftArray, rightArray);
        }
        
        drawVectorscope(leftArray, rightArray);
        const corr = computeCorrelation(leftArray, rightArray);
        if(corrValEl) corrValEl.textContent = corr.toFixed(2);
        
        // Render goniometer with new panel
        if(goniometerPanel){
          try{ 
            goniometerPanel.render(leftArray, rightArray);
          }catch(e){
            console.error('[Goniometer] Render error:', e);
          }
        }
      }catch(e){ /* ignore if channels not available */ }
      // push data into circular buffer for block LUFS processing
      // Use main dataArray (2048 samples) for loudness calc, regardless of channel split
      for(let i=0;i<dataArray.length;i++){
        buffer[bufWrite] = dataArray[i];
        // also accumulate stereo if available (for channel-aware LUFS later)
        if(leftArray && rightArray){
          const idx = i % Math.min(leftArray.length, rightArray.length);
          bufferL[bufWrite] = leftArray[idx] || 0;
          bufferR[bufWrite] = rightArray[idx] || 0;
        }
        bufWrite = (bufWrite + 1) % bufLen;
      }

      // Feed WASM loudness meter if available (prefer stereo interleaved if possible)
      if(ebInited && window.EBUR128){
        try{
          if(ebChannels === 2 && leftArray && rightArray){
            const n = Math.min(leftArray.length, rightArray.length);
            const inter = new Float32Array(n * 2);
            for(let i=0;i<n;i++){ inter[i*2] = leftArray[i]; inter[i*2 + 1] = rightArray[i]; }
            window.EBUR128.addSamples(inter);
          }else{
            // mono: use analyser's dataArray as single-channel frames
            const inter = new Float32Array(dataArray.length);
            inter.set(dataArray);
            window.EBUR128.addSamples(inter);
          }
        }catch(e){ console.warn('Error feeding EBUR128', e); }
      }

      // Prefer new MeterEngine if available; fall back to existing computeStatsAndLUFS
      let stats;
      if(meterEngine && leftArray && rightArray){
        try{
          meterEngine.processStereoBuffer(leftArray, rightArray, audioCtx.currentTime || (Date.now()/1000));
          const m = meterEngine.getMetrics();
          
          stats = {
            lufs: m.lufsIntegrated,
            momentaryLufs: m.lufsMomentary,
            peakLufs: m.lufsPeak,
            db: m.rmsDbfs,
            peak: m.peakLinear,
            peakDb: m.peakDbfs,
            holdDb: m.peakHoldDbfs,
            rmsLinear: m.rmsLinear
          };
        }catch(e){
          console.warn('MeterEngine processing error, falling back', e);
          stats = computeStatsAndLUFS(dataArray);
        }
      }else{
        if(meterEngine && (!leftArray || !rightArray)){
          console.warn('[MeterEngine] No input: leftArray=', !!leftArray, 'rightArray=', !!rightArray);
        }
        stats = computeStatsAndLUFS(dataArray);
      }

      if(lufsEl) lufsEl.textContent = stats.lufs.toFixed(1) + ' LUFS';
      const lufsMEl = document.getElementById('lufsM');
      if(lufsMEl) lufsMEl.textContent = stats.momentaryLufs.toFixed(1) + ' LUFS';
      const lufsSEl = document.getElementById('lufsS');
      if(lufsSEl) lufsSEl.textContent = stats.peakLufs.toFixed(1) + ' LUFS';
      if(rmsEl) rmsEl.textContent = stats.db.toFixed(1) + ' dBFS';
      if(peakEl) peakEl.textContent = stats.peakDb.toFixed(1) + ' dBFS';
      if(peakHoldEl) peakHoldEl.textContent = stats.holdDb.toFixed(1) + ' dBFS';

      // Debug info with new metering data (optional elements)
      const sampleRmsEl = document.getElementById('sampleRms');
      if(sampleRmsEl) sampleRmsEl.textContent = stats.db.toFixed(1) + ' dBFS (' + stats.rmsLinear.toFixed(4) + ' lin)';
      const bufWriteEl = document.getElementById('bufWriteDebug');
      if(bufWriteEl) bufWriteEl.textContent = bufWrite;
      const bufLenEl = document.getElementById('bufLenDebug');
      if(bufLenEl) bufLenEl.textContent = bufLen;
      const rawPeakEl = document.getElementById('rawPeakDebug');
      if(rawPeakEl) rawPeakEl.textContent = 'Peak: ' + stats.peakDb.toFixed(1) + ' | Hold: ' + stats.holdDb.toFixed(1);
      const meanSqEl = document.getElementById('meanSqDebug');
      if(meanSqEl) meanSqEl.textContent = 'Raw Peak Linear: ' + stats.peak.toFixed(6) + ' | Hold Linear: ' + (Math.pow(10, stats.holdDb/20)).toFixed(6);
      const blockCountText = meterEngine ? (' | Blocks: ' + meterEngine.getMetrics().blockCount) : '';
      const momBlocksEl = document.getElementById('momBlocksDebug');
      if(momBlocksEl) momBlocksEl.textContent = 'LUFS I: ' + stats.lufs.toFixed(1) + ' | LUFS M: ' + stats.momentaryLufs.toFixed(1) + ' | LUFS Peak: ' + stats.peakLufs.toFixed(1) + blockCountText;

      // update minimeter fills with smoothing and dB mapping (-60 dB -> 0, 0 dB -> 1)
      const now = audioCtx.currentTime || (Date.now()/1000);
      const atkCoef = Math.exp(-1.0/(Math.max(0.0001, attackTime) * sampleRate));
      const relCoef = Math.exp(-1.0/(Math.max(0.0001, releaseTime) * sampleRate));

      // instantaneous in dB
      const instRmsDb = stats.db; // already in dBFS
      const instPeakDb = stats.peakDb;

      // smoothing: attack if rising, release if falling
      if(instRmsDb > smoothRms) smoothRms = instRmsDb * (1-atkCoef) + smoothRms * atkCoef; else smoothRms = instRmsDb * (1-relCoef) + smoothRms * relCoef;
      if(instPeakDb > smoothPeak) smoothPeak = instPeakDb * (1-atkCoef) + smoothPeak * atkCoef; else smoothPeak = instPeakDb * (1-relCoef) + smoothPeak * relCoef;

      const mapDbToPct = (db)=>{
        const minDb = -60; const maxDb = 0;
        const v = (db - minDb) / (maxDb - minDb);
        return Math.max(0, Math.min(1, v));
      };

      const rmsPct = mapDbToPct(smoothRms);
      const peakPct = mapDbToPct(smoothPeak);
      const rmsBarFill = document.querySelector('#rmsBar .fill');
      if(rmsBarFill) rmsBarFill.style.width = (rmsPct*100)+'%';
      const peakBarFill = document.querySelector('#peakBar .fill');
      if(peakBarFill) peakBarFill.style.width = (peakPct*100)+'%';

      // DOOM FX: Update reactive effects (only when DOOM theme active)
      if(window.DOOM_FX && window.THEME && window.THEME.currentPalette === 'doom'){
        const dt = (performance.now() - tickStartTime) / 1000;
        
        // Update heat distortion from low-band energy
        analyserL.getFloatFrequencyData(freqDataL);
        analyserR.getFloatFrequencyData(freqDataR);
        window.DOOM_FX.updateHeatFromFreq(freqDataL, sampleRate);
        
        // Transient detection: compare low-band energy delta
        const currentLowBandEnergy = window.DOOM_FX.prevLowBandEnergy;
        const delta = Math.max(0, currentLowBandEnergy - doomLastLowBandEnergy);
        const hitStrength = Math.min(1, delta / window.DOOM_FX.HIT_THRESHOLD || 0);
        
        if(delta > window.DOOM_FX.HIT_THRESHOLD && doomHitDebounce <= 0 && stats.peakDb > -12){
          window.DOOM_FX.trigger(hitStrength);
          doomHitDebounce = 0.1; // 100ms debounce
        }
        doomHitDebounce -= dt;
        doomLastLowBandEnergy = currentLowBandEnergy;
        
        // Update decay for shockT, flareT, heatT
        window.DOOM_FX.updateReactive(dt);
        
        // Debug output if enabled
        if(window.DEBUG_DOOMFX && window.DOOM_FX){
          // Optional: console.log would go here for debugging
        }
      }

      // Render Bass Car Panel (with frequency data for bass detection)
      if(bassCarPanel && freqDataL && freqDataR){
        // Get frequency data for bass detection (reuse preallocated buffers)
        analyserL.getFloatFrequencyData(freqDataL);
        analyserR.getFloatFrequencyData(freqDataR);
        bassCarPanel.render(freqDataL, freqDataR);
      } else {
        // Fallback to old waveform if panel not initialized
        drawWave(dataArray);
      }
      
      // NEW: Update and render MeterDisplay with live metrics
      if(meterDisplay){
        try{
          // Only update meters if meterEngine is ready; otherwise show zeros
          if(meterEngine){
            const m = meterEngine.getMetrics();
            meterDisplay.updateMeters(
              m.lufsIntegrated,
              m.lufsMomentary,
              m.lufsPeak,
              m.rmsDbfs,
              m.peakLinear,
              m.peakHoldLinear
            );
          }else{
            // Show placeholder values while waiting for audio
            meterDisplay.updateMeters(-120, -120, -120, -120, 0, 0);
          }
          meterDisplay.render();
        }catch(e){ console.warn('MeterDisplay render error:', e); }
      }
      
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function vsCross(a, b, c){
    const ax = vsPointsX[a], ay = vsPointsY[a];
    const bx = vsPointsX[b], by = vsPointsY[b];
    const cx = vsPointsX[c], cy = vsPointsY[c];
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function vsSortIndices(count){
    for(let i = 0; i < count; i++) vsIdx[i] = i;
    let top = 0;
    vsStackL[top] = 0;
    vsStackR[top] = count - 1;
    while(top >= 0){
      let l = vsStackL[top];
      let r = vsStackR[top];
      top--;
      while(l < r){
        let i = l;
        let j = r;
        const p = vsIdx[(l + r) >> 1];
        const px = vsPointsX[p];
        const py = vsPointsY[p];
        while(i <= j){
          while(vsPointsX[vsIdx[i]] < px || (vsPointsX[vsIdx[i]] === px && vsPointsY[vsIdx[i]] < py)) i++;
          while(vsPointsX[vsIdx[j]] > px || (vsPointsX[vsIdx[j]] === px && vsPointsY[vsIdx[j]] > py)) j--;
          if(i <= j){
            const tmp = vsIdx[i];
            vsIdx[i] = vsIdx[j];
            vsIdx[j] = tmp;
            i++;
            j--;
          }
        }
        if(j - l < r - i){
          if(i < r){
            top++;
            vsStackL[top] = i;
            vsStackR[top] = r;
          }
          r = j;
        }else{
          if(l < j){
            top++;
            vsStackL[top] = l;
            vsStackR[top] = j;
          }
          l = i;
        }
      }
    }
  }

  function vsBuildHull(count){
    if(count < 3) return count;
    vsSortIndices(count);
    let m = 0;
    for(let i = 0; i < count; i++){
      const idx = vsIdx[i];
      while(m >= 2 && vsCross(vsHull[m - 2], vsHull[m - 1], idx) <= 0) m--;
      vsHull[m++] = idx;
    }
    const lower = m;
    for(let i = count - 2; i >= 0; i--){
      const idx = vsIdx[i];
      while(m > lower && vsCross(vsHull[m - 2], vsHull[m - 1], idx) <= 0) m--;
      vsHull[m++] = idx;
    }
    m--;
    return m;
  }

  function drawVectorscope(L, R){
    const w = vsCanvas.clientWidth, h = vsCanvas.clientHeight;
    if(w <= 2 || h <= 2) return;
    const dpr = window.devicePixelRatio || 1;
    const theme = window.THEME || { colors: {}, spacing: {}, fonts: {} };
    const colors = theme.colors || {};
    const spacing = theme.spacing || { sm: 8, md: 12, lg: 16 };

    const pad = spacing.md || 12;
    const topPad = spacing.sm || 8;
    const readoutH = 56;
    const drawX = pad;
    const drawY = topPad;
    const drawW = Math.max(1, w - pad * 2);
    const drawH = Math.max(1, h - topPad - readoutH - pad);
    const centerX = drawX + drawW * 0.5;
    const centerY = drawY + drawH * 0.5;
    const radius = Math.max(1, Math.min(drawW, drawH) * 0.5 - pad);

    // Background
    vsCtx.fillStyle = colors.bgSecondary || colors.bgPanel;
    vsCtx.fillRect(0, 0, w, h);

    // Reference grid
    const ringAlpha = detailLevel === 'high' ? 0.18 : (detailLevel === 'med' ? 0.12 : 0.07);
    vsCtx.save();
    vsCtx.globalAlpha = ringAlpha;
    vsCtx.strokeStyle = colors.gridLight || colors.border;
    vsCtx.lineWidth = 1;
    for(let r = 0.25; r <= 1.0; r += 0.25){
      vsCtx.beginPath();
      vsCtx.arc(centerX, centerY, radius * r, 0, Math.PI * 2);
      vsCtx.stroke();
    }
    vsCtx.restore();

    // Axes and guides
    vsCtx.strokeStyle = colors.accentBlue || colors.accentA;
    vsCtx.lineWidth = 1.2;
    vsCtx.globalAlpha = 0.22;
    vsCtx.beginPath();
    vsCtx.moveTo(centerX - radius, centerY);
    vsCtx.lineTo(centerX + radius, centerY);
    vsCtx.stroke();

    vsCtx.globalAlpha = 0.16;
    vsCtx.beginPath();
    vsCtx.moveTo(centerX, centerY - radius);
    vsCtx.lineTo(centerX, centerY + radius);
    vsCtx.stroke();

    vsCtx.globalAlpha = 0.12;
    vsCtx.beginPath();
    vsCtx.moveTo(centerX - radius, centerY - radius);
    vsCtx.lineTo(centerX + radius, centerY + radius);
    vsCtx.moveTo(centerX - radius, centerY + radius);
    vsCtx.lineTo(centerX + radius, centerY - radius);
    vsCtx.stroke();
    vsCtx.globalAlpha = 1;

    // Stats + normalization
    const len = Math.min(L.length, R.length);
    const step = 2;
    let maxMag = 0;
    let sumL = 0, sumR = 0, sumCross = 0, count = 0;
    for(let i = 0; i < len; i += step){
      const l = L[i];
      const r = R[i];
      const mag = Math.hypot(l, r);
      if(mag > maxMag) maxMag = mag;
      sumL += l * l;
      sumR += r * r;
      sumCross += l * r;
      count++;
    }
    const scale = (vsNormalize && maxMag > 0.0001) ? (1 / maxMag) : 1;
    const denom = Math.sqrt(sumL * sumR);
    let corr = denom > 1e-10 ? (sumCross / denom) : 0;
    if(corr > 1) corr = 1;
    if(corr < -1) corr = -1;
    vsLastCorr = corr;
    vsLastWidth = Math.sqrt(1 - (vsLastCorr * vsLastCorr)) * 100;
    const rmsL = Math.sqrt(sumL / (count || 1));
    const rmsR = Math.sqrt(sumR / (count || 1));
    vsLastBalance = 20 * Math.log10(rmsL + 1e-12) - 20 * Math.log10(rmsR + 1e-12);

    // Build points (CSS pixels)
    const cosR = Math.cos(vsRotateRad);
    const sinR = Math.sin(vsRotateRad);
    vsPointCount = 0;
    for(let i = 0; i < len && vsPointCount < vsMaxPoints; i += step){
      let x = R[i] * scale;
      let y = L[i] * scale;
      const xr = x * cosR - y * sinR;
      const yr = x * sinR + y * cosR;
      vsPointsX[vsPointCount] = centerX + xr * radius;
      vsPointsY[vsPointCount] = centerY - yr * radius;
      vsPointCount++;
    }

    // Trace styles
    const traceColor = colors.accentGreen || '#00ff88';
    if(vsStyle === 'phosphor'){
      // Fade persistence buffer
      vsBufCtx.globalCompositeOperation = 'source-over';
      vsBufCtx.fillStyle = colors.bgInset;
      vsBufCtx.globalAlpha = 0.08;
      vsBufCtx.fillRect(0, 0, vsBuffer.width, vsBuffer.height);
      vsBufCtx.globalAlpha = 1;

      // Two-pass glow into persistence buffer (additive)
      vsBufCtx.globalCompositeOperation = 'lighter';
      const dot = Math.max(1, vsDotSize * dpr);

      vsBufCtx.globalAlpha = 0.25;
      vsBufCtx.shadowBlur = 3;
      vsBufCtx.shadowColor = traceColor;
      for(let i = 0; i < vsPointCount; i++){
        const px = vsPointsX[i] * dpr;
        const py = vsPointsY[i] * dpr;
        vsBufCtx.fillStyle = traceColor;
        vsBufCtx.fillRect(px - dot, py - dot, dot * 2, dot * 2);
      }

      vsBufCtx.globalAlpha = 0.8;
      vsBufCtx.shadowBlur = 0;
      for(let i = 0; i < vsPointCount; i++){
        const px = vsPointsX[i] * dpr;
        const py = vsPointsY[i] * dpr;
        vsBufCtx.fillStyle = traceColor;
        vsBufCtx.fillRect(px - dot * 0.5, py - dot * 0.5, dot, dot);
      }
      vsBufCtx.globalAlpha = 1;

      vsCtx.save();
      vsCtx.globalCompositeOperation = 'lighter';
      vsCtx.drawImage(vsBuffer, 0, 0, w, h);
      vsCtx.restore();
    }else{
      // Two-pass glow rendering
      if(vsStyle === 'filled' && vsPointCount >= 3){
        const hullCount = vsBuildHull(vsPointCount);
        if(hullCount >= 3){
          vsCtx.globalAlpha = 0.12;
          vsCtx.fillStyle = traceColor;
          vsCtx.beginPath();
          const start = vsHull[0];
          vsCtx.moveTo(vsPointsX[start], vsPointsY[start]);
          for(let i = 1; i < hullCount; i++){
            const idx = vsHull[i];
            vsCtx.lineTo(vsPointsX[idx], vsPointsY[idx]);
          }
          vsCtx.closePath();
          vsCtx.fill();
          vsCtx.globalAlpha = 1;
        }
      }

      if(vsPointCount > 0){
        vsCtx.save();
        vsCtx.strokeStyle = traceColor;
        vsCtx.fillStyle = traceColor;
        
        // DOOM theme: charred phosphor effect
        const isDoom = window.THEME && window.THEME.currentPalette === 'doom';
        
        if (isDoom && window.DOOM_FX) {
          // Convert point arrays to points object for charred phosphor
          const points = [];
          for (let i = 0; i < vsPointCount; i++) {
            points.push({ x: vsPointsX[i], y: vsPointsY[i] });
          }
          window.DOOM_FX.drawCharedPhosphorTrace(vsCtx, points, traceColor, 1.2, 4);
        } else {
          // Standard rendering
          vsCtx.globalAlpha = 0.25;
          vsCtx.shadowBlur = 4;
          vsCtx.shadowColor = traceColor;
          // PS2 theme: chunkier traces
          const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
          const bloomWidth = isPS2 ? 3.0 : 2.4;
          const mainWidth = isPS2 ? 1.6 : 1.1;
          if(vsStyle === 'dots'){
            const dotScale = isPS2 ? 2.5 : 2;
            for(let i = 0; i < vsPointCount; i++){
              const px = vsPointsX[i];
              const py = vsPointsY[i];
              vsCtx.fillRect(px - vsDotSize * dotScale / 2, py - vsDotSize * dotScale / 2, vsDotSize * dotScale, vsDotSize * dotScale);
            }
          }else{
            vsCtx.lineWidth = bloomWidth;
            vsCtx.beginPath();
            vsCtx.moveTo(vsPointsX[0], vsPointsY[0]);
            for(let i = 1; i < vsPointCount; i++){
              vsCtx.lineTo(vsPointsX[i], vsPointsY[i]);
            }
            vsCtx.stroke();
          }

          vsCtx.globalAlpha = 0.9;
          vsCtx.shadowBlur = 0;
          if(vsStyle === 'dots'){
            const dotScale = isPS2 ? 1.5 : 1;
            for(let i = 0; i < vsPointCount; i++){
              const px = vsPointsX[i];
              const py = vsPointsY[i];
              vsCtx.fillRect(px - vsDotSize * 0.5 * dotScale, py - vsDotSize * 0.5 * dotScale, vsDotSize * dotScale, vsDotSize * dotScale);
            }
          }else{
            vsCtx.lineWidth = mainWidth;
            vsCtx.beginPath();
            vsCtx.moveTo(vsPointsX[0], vsPointsY[0]);
            for(let i = 1; i < vsPointCount; i++){
              vsCtx.lineTo(vsPointsX[i], vsPointsY[i]);
            }
            vsCtx.stroke();
          }
        }
        vsCtx.restore();
      }
    }

    // Readout strip + correlation scale
    const readoutY = drawY + drawH + (spacing.sm || 8);
    const readoutW = drawW;
    const readoutHActual = readoutH;
    vsCtx.fillStyle = colors.bgTertiary || '#141b2e';
    vsCtx.fillRect(drawX, readoutY, readoutW, readoutHActual);
    vsCtx.strokeStyle = colors.gridLight || '#1a1f3a';
    vsCtx.strokeRect(drawX, readoutY, readoutW, readoutHActual);

    vsCtx.fillStyle = colors.textSecondary || '#a0a8c8';
    vsCtx.font = (theme.fonts && theme.fonts.monoSmall) ? theme.fonts.monoSmall : '9px monospace';
    vsCtx.textBaseline = 'top';
    vsCtx.textAlign = 'left';
    vsCtx.fillText('Corr', drawX + pad, readoutY + 6);
    vsCtx.fillText('Width', drawX + pad + 120, readoutY + 6);
    vsCtx.fillText('Balance', drawX + pad + 240, readoutY + 6);

    vsCtx.fillStyle = colors.textPrimary || '#e0e6ff';
    vsCtx.fillText(vsLastCorr.toFixed(2), drawX + pad, readoutY + 20);
    vsCtx.fillText(vsLastWidth.toFixed(0) + '%', drawX + pad + 120, readoutY + 20);
    vsCtx.fillText(vsLastBalance.toFixed(1) + ' dB', drawX + pad + 240, readoutY + 20);

    const scaleY = readoutY + readoutHActual - 14;
    vsCtx.strokeStyle = colors.gridLight || '#1a1f3a';
    vsCtx.beginPath();
    vsCtx.moveTo(drawX + pad, scaleY);
    vsCtx.lineTo(drawX + readoutW - pad, scaleY);
    vsCtx.stroke();

    // -1, 0, +1 markers
    vsCtx.fillStyle = colors.textTertiary || '#6b73a0';
    vsCtx.textBaseline = 'bottom';
    vsCtx.fillText('-1', drawX + pad, scaleY - 2);
    vsCtx.fillText('0', drawX + readoutW / 2, scaleY - 2);
    vsCtx.fillText('+1', drawX + readoutW - pad - 10, scaleY - 2);

    // Correlation marker
    const corrX = drawX + pad + ((vsLastCorr + 1) * 0.5) * (readoutW - pad * 2);
    vsCtx.fillStyle = colors.accentYellow || '#ffcc00';
    vsCtx.beginPath();
    vsCtx.moveTo(corrX, scaleY - 8);
    vsCtx.lineTo(corrX - 4, scaleY - 2);
    vsCtx.lineTo(corrX + 4, scaleY - 2);
    vsCtx.closePath();
    vsCtx.fill();
    
    // Apply theme overlays (scanlines, noise, glitter)
    if (window.CanvasOverlays) {
      const detailNum = detailLevel === 'high' ? 2 : (detailLevel === 'med' ? 1 : 0);
      const time = performance.now() / 1000;
      window.CanvasOverlays.applyThemeOverlays(vsCtx, w, h, detailNum, time);
    }
    
    // DOOM reactive effects (shockwave + border flare)
    if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
      vsCtx.save();
      vsCtx.beginPath();
      vsCtx.rect(pad, pad, w - pad * 2, h - pad * 2);
      vsCtx.clip();
      window.DOOM_FX.drawShockwave(vsCtx, w, h);
      window.DOOM_FX.drawBorderFlare(vsCtx, w, h, pad);
      vsCtx.restore();
    }
  }

  // ========== OSCILLOSCOPE PANEL ==========
  class OscilloscopePanel {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');
      this.readoutEl = document.getElementById('oscReadout');
      
      // State
      this.mode = 'time'; // 'time' | 'xy'
      this.display = 'stereo'; // 'stereo' | 'mono' | 'side'
      this.style = 'minmax'; // 'line' | 'dots' | 'minmax' | 'phosphor'
      this.triggerMode = 'rising'; // 'off' | 'rising' | 'falling'
      this.triggerLevel = 0.0;
      this.triggerHoldoff = 2; // ms
      this.persistence = true;
      this.dotSize = 1.5;
      this.timebase = 10; // ms/div (10 divs across screen)
      
      // Trigger state
      this.lastTriggerTime = 0;
      this.triggerIndex = -1;
      
      // Persistence buffer
      this.persistBuffer = null;
      this.persistCtx = null;

      // Reusable layout and data buffers (avoid per-frame allocations)
      this.drawRect = { x: 0, y: 0, w: 0, h: 0, readoutH: 56, pad: 0, topPad: 0 };
      this.bufRect = { x: 0, y: 0, w: 0, h: 0 };
      this.tmpMono = null;
      this.tmpSide = null;
      this.displayData = { isStereo: true, left: null, right: null, mono: null, side: null };
      
      // Stats (for readout)
      this.peakDbfs = -120;
      this.rmsDbfs = -120;
      this.correlation = 0;
      
      // Bind controls
      this.initControls();
      
      console.log('[OscilloscopePanel] Initialized');
    }
    
    initControls() {
      const modeEl = document.getElementById('oscMode');
      const displayEl = document.getElementById('oscDisplay');
      const styleEl = document.getElementById('oscStyle');
      const triggerEl = document.getElementById('oscTrigger');
      const persistEl = document.getElementById('oscPersistence');
      
      if(modeEl) modeEl.addEventListener('change', (e) => { this.mode = e.target.value; });
      if(displayEl) displayEl.addEventListener('change', (e) => { this.display = e.target.value; });
      if(styleEl) styleEl.addEventListener('change', (e) => { this.style = e.target.value; });
      if(triggerEl) triggerEl.addEventListener('change', (e) => { this.triggerMode = e.target.value; });
      if(persistEl) persistEl.addEventListener('change', (e) => { this.persistence = e.target.checked; });
    }
    
    onResize(w, h) {
      const dpr = window.devicePixelRatio || 1;
      // Recreate persistence buffer at new size
      if(!this.persistBuffer || this.persistBuffer.width !== w * dpr || this.persistBuffer.height !== h * dpr) {
        this.persistBuffer = document.createElement('canvas');
        this.persistBuffer.width = w * dpr;
        this.persistBuffer.height = h * dpr;
        this.persistCtx = this.persistBuffer.getContext('2d');
        console.log('[OscilloscopePanel] Persistence buffer resized:', w*dpr, 'x', h*dpr);
      }
    }

    getDrawRect(w, h) {
      const spacing = (window.THEME && window.THEME.spacing) ? window.THEME.spacing : { sm: 8, md: 12, lg: 16 };
      const pad = spacing.md || 12;
      const topPad = spacing.sm || 8;
      const readoutH = 56;
      const drawX = pad;
      const drawY = topPad;
      const drawW = Math.max(1, w - pad * 2);
      const drawH = Math.max(1, h - topPad - readoutH - pad);
      const rect = this.drawRect;
      rect.x = drawX;
      rect.y = drawY;
      rect.w = drawW;
      rect.h = drawH;
      rect.readoutH = readoutH;
      rect.pad = pad;
      rect.topPad = topPad;
      return rect;
    }
    
    render(leftData, rightData) {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const rect = this.getDrawRect(w, h);
      
      // Ensure persistence buffer exists
      if(!this.persistBuffer) this.onResize(w, h);
      
      // Prepare display data based on mode
      const displayData = this.displayData;
      if(this.display === 'stereo') {
        displayData.isStereo = true;
        displayData.left = leftData;
        displayData.right = rightData;
        displayData.mono = null;
        displayData.side = null;
      } else if(this.display === 'mono') {
        // Mono: (L+R) / 2
        if(!this.tmpMono || this.tmpMono.length !== leftData.length) {
          this.tmpMono = new Float32Array(leftData.length);
        }
        for(let i = 0; i < leftData.length; i++) {
          this.tmpMono[i] = (leftData[i] + rightData[i]) * 0.5;
        }
        displayData.isStereo = false;
        displayData.mono = this.tmpMono;
        displayData.side = null;
        displayData.left = null;
        displayData.right = null;
      } else if(this.display === 'side') {
        // Side: (L-R) / 2
        if(!this.tmpSide || this.tmpSide.length !== leftData.length) {
          this.tmpSide = new Float32Array(leftData.length);
        }
        for(let i = 0; i < leftData.length; i++) {
          this.tmpSide[i] = (leftData[i] - rightData[i]) * 0.5;
        }
        displayData.isStereo = false;
        displayData.side = this.tmpSide;
        displayData.mono = null;
        displayData.left = null;
        displayData.right = null;
      }
      
      // Calculate stats
      this.calculateStats(leftData, rightData);
      
      // Render based on mode
      if(this.mode === 'time') {
        this.renderTime(displayData, w, h, rect);
      } else if(this.mode === 'xy') {
        this.renderXY(leftData, rightData, w, h, rect);
      }
      
      // Update readout
      this.updateReadout();
    }
    
    calculateStats(leftData, rightData) {
      let sumL = 0, sumR = 0, sumCross = 0;
      let peakL = 0, peakR = 0;
      const len = Math.min(leftData.length, rightData.length);
      
      for(let i = 0; i < len; i++) {
        const l = leftData[i];
        const r = rightData[i];
        sumL += l * l;
        sumR += r * r;
        sumCross += l * r;
        peakL = Math.max(peakL, Math.abs(l));
        peakR = Math.max(peakR, Math.abs(r));
      }
      
      const rmsL = Math.sqrt(sumL / len);
      const rmsR = Math.sqrt(sumR / len);
      const peak = Math.max(peakL, peakR);
      const rms = Math.max(rmsL, rmsR);
      
      this.peakDbfs = 20 * Math.log10(peak + 1e-12);
      this.rmsDbfs = 20 * Math.log10(rms + 1e-12);
      
      // Correlation coefficient
      const denominator = Math.sqrt(sumL * sumR);
      this.correlation = denominator > 1e-10 ? (sumCross / denominator) : 0;
    }
    
    findTrigger(data, startIdx = 0) {
      if(this.triggerMode === 'off') return -1;
      
      const now = performance.now();
      if(now - this.lastTriggerTime < this.triggerHoldoff) return -1;
      
      const level = this.triggerLevel;
      const rising = this.triggerMode === 'rising';
      
      for(let i = startIdx + 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        
        if(rising && prev < level && curr >= level) {
          this.lastTriggerTime = now;
          return i;
        } else if(!rising && prev > level && curr <= level) {
          this.lastTriggerTime = now;
          return i;
        }
      }
      
      return -1; // No trigger found, fall back to roll mode
    }
    
    renderTime(displayData, w, h, rect) {
      const ctx = this.ctx;
      const persistCtx = this.persistCtx;
      const dpr = window.devicePixelRatio || 1;
      const bufRect = this.bufRect;
      bufRect.x = rect.x * dpr;
      bufRect.y = rect.y * dpr;
      bufRect.w = rect.w * dpr;
      bufRect.h = rect.h * dpr;
      
      // Fade persistence buffer
      if(this.persistence && this.style === 'phosphor') {
        const fadeAlpha = 0.08;
        const [r, g, b] = UIHelpers._parseRGB(THEME.colors.bgInset);
        persistCtx.fillStyle = `rgba(${r},${g},${b},${fadeAlpha})`;
        persistCtx.fillRect(bufRect.x, bufRect.y, bufRect.w, bufRect.h);
      } else {
        // Clear background
        ctx.fillStyle = THEME.colors.bgInset;
        ctx.fillRect(0, 0, w, h);
      }
      
      // Draw grid
      this.drawGrid(ctx, rect);
      
      // Draw waveform(s)
      if(displayData.isStereo) {
        // Draw L and R overlaid
        const triggerData = displayData.left; // Trigger on left channel
        const triggerIdx = this.findTrigger(triggerData);
        const startIdx = triggerIdx >= 0 ? triggerIdx : 0;
        
        if(this.style === 'phosphor') {
          this.drawWaveformToBuffer(displayData.left, startIdx, THEME.colors.accentA, 0.7, persistCtx, bufRect);
          this.drawWaveformToBuffer(displayData.right, startIdx, THEME.colors.accentB, 0.7, persistCtx, bufRect);
          // Composite buffer to main canvas (clip to draw rect)
          ctx.save();
          ctx.beginPath();
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
          ctx.clip();
          ctx.drawImage(this.persistBuffer, 0, 0, w, h);
          ctx.restore();
        } else {
          this.drawWaveform(displayData.left, startIdx, THEME.colors.accentA, ctx, rect);
          this.drawWaveform(displayData.right, startIdx, THEME.colors.accentB, ctx, rect);
        }
        
        // Draw trigger marker
        if(triggerIdx >= 0) this.drawTriggerMarker(ctx, rect);
      } else {
        // Draw single channel (mono or side)
        const data = displayData.mono || displayData.side;
        const triggerIdx = this.findTrigger(data);
        const startIdx = triggerIdx >= 0 ? triggerIdx : 0;
        const color = displayData.side ? THEME.colors.accentWarn : THEME.colors.accentB;
        
        if(this.style === 'phosphor') {
          this.drawWaveformToBuffer(data, startIdx, color, 1.0, persistCtx, bufRect);
          ctx.save();
          ctx.beginPath();
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
          ctx.clip();
          ctx.drawImage(this.persistBuffer, 0, 0, w, h);
          ctx.restore();
        } else {
          this.drawWaveform(data, startIdx, color, ctx, rect);
        }
        
        if(triggerIdx >= 0) this.drawTriggerMarker(ctx, rect);
      }
      
      // Apply theme overlays (scanlines, noise, glitter)
      if (window.CanvasOverlays) {
        const detailNum = this.detailLevel === 'high' ? 2 : (this.detailLevel === 'med' ? 1 : 0);
        const time = performance.now() / 1000;
        window.CanvasOverlays.applyThemeOverlays(ctx, w, h, detailNum, time);
      }
      
      // DOOM reactive effects (shockwave + border flare)
      if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        window.DOOM_FX.drawShockwave(ctx, w, h);
        window.DOOM_FX.drawBorderFlare(ctx, w, h, 1);
        ctx.restore();
      }
    }
    
    drawGrid(ctx, rect) {
      const [r, g, b] = UIHelpers._parseRGB(THEME.colors.grid);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
      ctx.lineWidth = 1;
      
      // Vertical divisions (10 divs)
      for(let i = 0; i <= 10; i++) {
        const x = rect.x + (i / 10) * rect.w;
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, rect.y + rect.h);
        ctx.stroke();
      }
      
      // Horizontal divisions (8 divs)
      for(let i = 0; i <= 8; i++) {
        const y = rect.y + (i / 8) * rect.h;
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
      }
      
      //Center lines (brighter)
      const [r2, g2, b2] = UIHelpers._parseRGB(THEME.colors.border);
      ctx.strokeStyle = `rgba(${r2},${g2},${b2},0.4)`;
      ctx.beginPath();
      ctx.moveTo(rect.x, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 2);
      ctx.moveTo(rect.x + rect.w / 2, rect.y);
      ctx.lineTo(rect.x + rect.w / 2, rect.y + rect.h);
      ctx.stroke();
    }
    
    drawWaveform(data, startIdx, color, ctx, rect) {
      const style = this.style;
      
      // DOOM theme: use charred phosphor effect for all styles
      if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
        this.drawDoomCharedPhosphor(data, startIdx, color, ctx, rect);
        return;
      }
      
      if(style === 'line') {
        this.drawLine(data, startIdx, color, ctx, rect);
      } else if(style === 'dots') {
        this.drawDots(data, startIdx, color, ctx, rect);
      } else if(style === 'minmax') {
        this.drawMinMax(data, startIdx, color, ctx, rect);
      }
    }
    
    drawDoomCharedPhosphor(data, startIdx, color, ctx, rect) {
      // Build points array from waveform data
      const points = [];
      const samplesPerPixel = Math.max(1, Math.floor(data.length / rect.w));
      
      for(let x = 0; x < rect.w; x++) {
        const idx = startIdx + x * samplesPerPixel;
        if(idx >= data.length) break;
        
        const v = data[idx];
        const y = rect.y + (0.5 - v * 0.45) * rect.h;
        const xPos = rect.x + x;
        
        points.push({ x: xPos, y: y });
      }
      
      // Draw charred phosphor: thick halo + thin bright core
      if (points.length > 0) {
        window.DOOM_FX.drawCharedPhosphorTrace(ctx, points, color, 1.5, 4);
      }
    }
    
    drawWaveformToBuffer(data, startIdx, color, alpha, ctx, rect) {
      // For phosphor mode - draw to persistence buffer
      const style = this.style;
      
      ctx.globalAlpha = alpha;
      
      if(style === 'phosphor') {
        // Two-pass rendering for glow
        // Pass 1: Thicker, blurred
        ctx.shadowBlur = 3;
        ctx.shadowColor = color;
        this.drawDots(data, startIdx, color, ctx, rect, 2);
        
        // Pass 2: Crisp on top
        ctx.shadowBlur = 0;
        this.drawDots(data, startIdx, color, ctx, rect, 1);
      }
      
      ctx.globalAlpha = 1.0;
    }
    
    drawLine(data, startIdx, color, ctx, rect) {
      ctx.strokeStyle = color;
      // PS2 theme: chunkier traces
      const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
      ctx.lineWidth = isPS2 ? 2.0 : 1.5;
      ctx.beginPath();
      
      const samplesPerPixel = Math.max(1, Math.floor(data.length / rect.w));
      
      for(let x = 0; x < rect.w; x++) {
        const idx = startIdx + x * samplesPerPixel;
        if(idx >= data.length) break;
        
        const v = data[idx];
        const y = rect.y + (0.5 - v * 0.45) * rect.h; // 45% scale for headroom
        const xPos = rect.x + x;
        
        if(x === 0) ctx.moveTo(xPos, y);
        else ctx.lineTo(xPos, y);
      }
      
      ctx.stroke();
    }
    
    drawDots(data, startIdx, color, ctx, rect, dotSize = this.dotSize) {
      ctx.fillStyle = color;
      // PS2 theme: chunkier dots
      const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
      const finalDotSize = isPS2 ? dotSize + 0.5 : dotSize;
      
      const samplesPerPixel = Math.max(1, Math.floor(data.length / rect.w));
      
      for(let x = 0; x < rect.w; x++) {
        const idx = startIdx + x * samplesPerPixel;
        if(idx >= data.length) break;
        
        const v = data[idx];
        const y = rect.y + (0.5 - v * 0.45) * rect.h;
        const xPos = rect.x + x;
        
        ctx.fillRect(xPos - finalDotSize / 2, y - finalDotSize / 2, finalDotSize, finalDotSize);
      }
    }
    
    drawMinMax(data, startIdx, color, ctx, rect) {
      ctx.strokeStyle = color;
      // PS2 theme: chunkier traces
      const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
      ctx.lineWidth = isPS2 ? 1.5 : 1;
      
      const samplesPerPixel = Math.max(1, Math.floor(data.length / rect.w));
      
      for(let x = 0; x < rect.w; x++) {
        const startSample = startIdx + x * samplesPerPixel;
        const endSample = Math.min(startSample + samplesPerPixel, data.length);
        
        let min = Infinity;
        let max = -Infinity;
        
        for(let i = startSample; i < endSample; i++) {
          const v = data[i];
          if(v < min) min = v;
          if(v > max) max = v;
        }
        
        const yMin = rect.y + (0.5 - min * 0.45) * rect.h;
        const yMax = rect.y + (0.5 - max * 0.45) * rect.h;
        const xPos = rect.x + x;
        
        ctx.beginPath();
        ctx.moveTo(xPos, yMin);
        ctx.lineTo(xPos, yMax);
        ctx.stroke();
      }
    }
    
    drawTriggerMarker(ctx, rect) {
      const y = rect.y + (0.5 - this.triggerLevel * 0.45) * rect.h;
      
      ctx.strokeStyle = THEME.colors.accentWarn;
      ctx.fillStyle = THEME.colors.accentWarn;
      ctx.lineWidth = 1;
      
      // Horizontal line at trigger level (right side)
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w - 20, y);
      ctx.lineTo(rect.x + rect.w, y);
      ctx.stroke();
      
      // Triangle marker
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w - 8, y - 4);
      ctx.lineTo(rect.x + rect.w - 8, y + 4);
      ctx.lineTo(rect.x + rect.w - 3, y);
      ctx.closePath();
      ctx.fill();
    }
    
    renderXY(leftData, rightData, w, h, rect) {
      const ctx = this.ctx;
      const persistCtx = this.persistCtx;
      const dpr = window.devicePixelRatio || 1;
      const bufRect = this.bufRect;
      bufRect.x = rect.x * dpr;
      bufRect.y = rect.y * dpr;
      bufRect.w = rect.w * dpr;
      bufRect.h = rect.h * dpr;
      
      // Fade or clear
      if(this.persistence) {
        const fadeAlpha = 0.06;
        const [r, g, b] = UIHelpers._parseRGB(THEME.colors.bgInset);
        persistCtx.fillStyle = `rgba(${r},${g},${b},${fadeAlpha})`;
        persistCtx.fillRect(bufRect.x, bufRect.y, bufRect.w, bufRect.h);
      } else {
        ctx.fillStyle = THEME.colors.bgInset;
        ctx.fillRect(0, 0, w, h);
      }
      
      // Draw XY grid
      this.drawGrid(ctx, rect);
      
      // Draw Lissajous
      const len = Math.min(leftData.length, rightData.length);
      const step = Math.max(1, Math.floor(len / (rect.w * 2))); // Sample more for smoother curve
      
      if(this.style === 'dots' || this.style === 'phosphor') {
        ctx.fillStyle = this.persistence ? THEME.colors.accentB : THEME.colors.accentA;
        const dotSize = this.style === 'phosphor' ? 2 : this.dotSize;
        
        for(let i = 0; i < len; i += step) {
          const x = rect.x + (0.5 + rightData[i] * 0.45) * rect.w;
          const y = rect.y + (0.5 - leftData[i] * 0.45) * rect.h;
          ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        }
        
        if(this.persistence) {
          persistCtx.drawImage(this.canvas, 0, 0);
        }
      } else {
        // Line or minmax
        ctx.strokeStyle = THEME.colors.accentA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for(let i = 0; i < len; i += step) {
          const x = rect.x + (0.5 + rightData[i] * 0.45) * rect.w;
          const y = rect.y + (0.5 - leftData[i] * 0.45) * rect.h;
          
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        ctx.stroke();
      }
    }
    
    updateReadout() {
      if(!this.readoutEl) return;
      
      const parts = [];
      
      if(this.mode === 'time') {
        parts.push(`Mode: <span class="value">${this.display.toUpperCase()}</span>`);
        parts.push(`${this.timebase.toFixed(1)} <span class="value">ms/div</span>`);
        
        if(this.triggerMode !== 'off') {
          parts.push(`Trig: <span class="value">${this.triggerMode.toUpperCase()} @ ${this.triggerLevel.toFixed(2)}</span>`);
        }
        
        parts.push(`Peak: <span class="value">${this.peakDbfs.toFixed(1)} dBFS</span>`);
        parts.push(`RMS: <span class="value">${this.rmsDbfs.toFixed(1)} dBFS</span>`);
        
        if(this.display === 'stereo' || this.display === 'side') {
          parts.push(`Corr: <span class="value">${this.correlation.toFixed(2)}</span>`);
        }
      } else if(this.mode === 'xy') {
        parts.push(`Mode: <span class="value">XY (Lissajous)</span>`);
        parts.push(`Corr: <span class="value">${this.correlation.toFixed(2)}</span>`);
        
        // Calculate width % (stereo width indicator)
        const width = Math.sqrt(1 - this.correlation * this.correlation) * 100;
        parts.push(`Width: <span class="value">${width.toFixed(0)}%</span>`);
        
        // L/R balance
        const balance = this.peakDbfs > -60 ? 0 : 0; // Simplified
        parts.push(`Balance: <span class="value">C</span>`);
      }
      
      this.readoutEl.innerHTML = parts.join(' <span style="color:' + THEME.colors.grid + '">|</span> ');
    }
  }
  
  // Initialize OscilloscopePanel now that class is defined
  try {
    oscPanel = new OscilloscopePanel('osc');
    console.log('[OscilloscopePanel] Initialized after class definition');
  } catch (e) {
    console.error('[OscilloscopePanel] Init error:', e);
  }
  
  function drawOsc(buf){
    // Legacy fallback - not used anymore
    console.warn('[drawOsc] Legacy function called, use oscPanel.render() instead');
  }

  function drawSpectrogram(freq){
    const w = specCanvas.clientWidth, h = specCanvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const bufW = w * dpr, bufH = h * dpr;
    
    // shift left by 1 pixel (in physical pixels)
    specBufCtx.drawImage(specBuf, -1, 0);
    // draw new column at right based on freq data (in physical pixels)
    const binCount = freq.length;
    for(let y=0;y<bufH;y++){
      const bin = Math.floor((1 - y/bufH) * binCount);
      const v = freq[bin]/255;
      const col = colorForValue(v);
      specBufCtx.fillStyle = col; specBufCtx.fillRect(bufW-1, y, 1, 1);
    }
    // copy buffer to visible canvas (CSS pixels)
    specCtx.drawImage(specBuf, 0, 0, w, h);
    
    // Apply theme overlays (scanlines, noise, glitter)
    if (window.CanvasOverlays) {
      const detailNum = detailLevel === 'high' ? 2 : (detailLevel === 'med' ? 1 : 0);
      const time = performance.now() / 1000;
      window.CanvasOverlays.applyThemeOverlays(specCtx, w, h, detailNum, time);
    }
    
    // DOOM reactive effects (shockwave + border flare)
    if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
      window.DOOM_FX.drawShockwave(specCtx, w, h);
      window.DOOM_FX.drawBorderFlare(specCtx, w, h, 0);
    }
  }

  function drawSpecGraph(freq){
    const w = specGraphCanvas.clientWidth, h = specGraphCanvas.clientHeight;
    const axisH = 18; // Reserve space for frequency axis at bottom
    const graphH = h - axisH; // Height for the actual graph
    const colors = THEME.colors;
    
    // Clear background
    specGraphCtx.fillStyle = colors.bgInset;
    specGraphCtx.fillRect(0,0,w,h);
    
    // Draw gridlines and dB markers (y-axis)
    const [gr, gg, gb] = UIHelpers._parseRGB(colors.grid);
    specGraphCtx.strokeStyle = `rgba(${gr},${gg},${gb},0.3)`;
    const [tr, tg, tb] = UIHelpers._parseRGB(colors.textMuted);
    specGraphCtx.fillStyle = `rgba(${tr},${tg},${tb},0.8)`;
    specGraphCtx.font = '11px monospace';
    specGraphCtx.textAlign = 'right';
    specGraphCtx.textBaseline = 'middle';
    
    // dB markers: -60, -40, -20, 0
    const dbMarkers = [-60, -40, -20, 0];
    for(let db of dbMarkers) {
      const yPos = graphH - ((db + 60) / 60) * graphH; // map -60..0 dB to y range
      specGraphCtx.beginPath();
      specGraphCtx.moveTo(0, yPos);
      specGraphCtx.lineTo(w, yPos);
      specGraphCtx.stroke();
      specGraphCtx.fillText(db + 'dB', w - 5, yPos);
    }
    
    // Draw frequency bins as bars
    const bins = freq.length;
    const step = Math.max(1, Math.floor(bins / 100));
    const barW = w / (bins/step);
    
    for(let i=0,bi=0;i<bins;i+=step,bi++){
      const v = freq[i]/255;
      const bw = barW-1;
      const bh = v * graphH; // Use graphH instead of h
      const x = bi*barW;
      const y = graphH - bh; // Position relative to graphH
      
      specGraphCtx.fillStyle = colorForValue(v);
      specGraphCtx.fillRect(x, y, bw, bh);
    }
    
    // Draw frequency labels on x-axis (in the reserved space at bottom)
    const [lbr, lbg, lbb] = UIHelpers._parseRGB(colors.text);
    specGraphCtx.fillStyle = `rgba(${lbr},${lbg},${lbb},0.9)`;
    specGraphCtx.font = 'bold 11px monospace';
    specGraphCtx.textAlign = 'center';
    specGraphCtx.textBaseline = 'top';
    
    // Calculate Nyquist frequency (half of sample rate)
    const nyquist = (sampleRate || 48000) / 2;
    
    // Frequency labels: show 100Hz, 1kHz, 5kHz, 10kHz, 20kHz range
    const freqLabels = [100, 500, 1000, 2000, 5000, 10000, 15000, 20000];
    for(let freq of freqLabels) {
      if(freq > nyquist) break;
      const binIdx = Math.floor((freq / nyquist) * bins);
      const xPos = (binIdx / step) * barW;
      const label = freq >= 1000 ? (freq/1000).toFixed(0) + 'k' : freq;
      specGraphCtx.fillText(label, xPos, graphH + 3); // Draw in the axis space below graph
    }
    
    // Draw title
    const [titr, titg, titb] = UIHelpers._parseRGB(colors.text);
    specGraphCtx.fillStyle = `rgba(${titr},${titg},${titb},0.9)`;
    specGraphCtx.font = 'bold 13px sans-serif';
    specGraphCtx.textAlign = 'left';
    specGraphCtx.textBaseline = 'top';
    specGraphCtx.fillText('Frequency Response (0 - ' + (nyquist/1000).toFixed(0) + 'kHz)', 5, 3);
    
    // Apply theme overlays (scanlines, noise, glitter)
    if (window.CanvasOverlays) {
      const detailNum = detailLevel === 'high' ? 2 : (detailLevel === 'med' ? 1 : 0);
      const time = performance.now() / 1000;
      window.CanvasOverlays.applyThemeOverlays(specGraphCtx, w, h, detailNum, time);
    }
    
    // DOOM reactive effects (shockwave + border flare)
    if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
      window.DOOM_FX.drawShockwave(specGraphCtx, w, h);
      window.DOOM_FX.drawBorderFlare(specGraphCtx, w, h, 0);
    }
  }

  function colorForValue(v){
    // DOOM theme: inferno-like colormap (black→red→orange→yellow→white)
    if (window.THEME && window.THEME.currentPalette === 'doom') {
      // Inferno colormap approximation: 5-point gradient
      const val = Math.max(0, Math.min(1, v)); // Clamp to 0-1
      if (val < 0.2) {
        // Black → Red (0.0 - 0.2)
        const t = val / 0.2; // 0-1 in this segment
        const r = Math.round(50 + t * 150); // 50→200
        const g = Math.round(10 + t * 20);  // 10→30
        const b = Math.round(20 + t * 30);  // 20→50
        return `rgb(${r}, ${g}, ${b})`;
      } else if (val < 0.4) {
        // Red → Orange (0.2 - 0.4)
        const t = (val - 0.2) / 0.2;
        const r = Math.round(200 + t * 55); // 200→255
        const g = Math.round(30 + t * 90);  // 30→120
        const b = Math.round(50 - t * 50);  // 50→0
        return `rgb(${r}, ${g}, ${b})`;
      } else if (val < 0.6) {
        // Orange → Yellow (0.4 - 0.6)
        const t = (val - 0.4) / 0.2;
        const r = 255;
        const g = Math.round(120 + t * 135); // 120→255
        const b = 0;
        return `rgb(${r}, ${g}, ${b})`;
      } else if (val < 0.8) {
        // Yellow → Light Yellow (0.6 - 0.8)
        const t = (val - 0.6) / 0.2;
        const r = 255;
        const g = 255;
        const b = Math.round(0 + t * 100); // 0→100
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Light Yellow → White (0.8 - 1.0)
        const t = (val - 0.8) / 0.2;
        const r = 255;
        const g = 255;
        const b = Math.round(100 + t * 155); // 100→255
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    
    // Default HSL colormap for other themes
    const hue = Math.round((1 - v) * 240); // blue->red
    const sat = 85; const light = Math.round(30 + v*40);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function computeCorrelation(L, R){
    // Pearson correlation coefficient between two arrays
    const n = Math.min(L.length, R.length);
    let sumL=0,sumR=0,sumLL=0,sumRR=0,sumLR=0;
    for(let i=0;i<n;i+=4){
      const a=L[i], b=R[i];
      sumL += a; sumR += b; sumLL += a*a; sumRR += b*b; sumLR += a*b;
    }
    const m = n/4 || 1;
    const cov = (sumLR/m) - (sumL/m)*(sumR/m);
    const stdL = Math.sqrt((sumLL/m) - (sumL/m)*(sumL/m));
    const stdR = Math.sqrt((sumRR/m) - (sumR/m)*(sumR/m));
    const corr = (stdL*stdR) ? (cov / (stdL*stdR)) : 0;
    return Math.max(-1, Math.min(1, corr));
  }

  // wire refresh button
  const refreshBtn = document.getElementById('refreshDevices');
  refreshBtn.addEventListener('click', async ()=>{
    try{
      await listDevices();
      console.log('Device list refreshed');
    }catch(e){ console.error(e); }
  });

  // wire DevTools button
  const devBtn = document.getElementById('openDevtools');
  devBtn.addEventListener('click', ()=>{
    if(window.electron && window.electron.openDevTools) window.electron.openDevTools();
  });

  // Device panel open/close
  const openDeviceBtn = document.getElementById('openDevicePanel');
  const devicePanel = document.getElementById('devicePanel');
  const closeDeviceBtn = document.getElementById('closeDevicePanel');
  openDeviceBtn.addEventListener('click', ()=>{ devicePanel.classList.remove('hidden'); listDevices(); });
  closeDeviceBtn.addEventListener('click', ()=>{ devicePanel.classList.add('hidden'); });

  // NEW: Detail level toggle button
  if(detailToggle){
    detailToggle.addEventListener('click', ()=>{
      const levels = ['low', 'med', 'high'];
      const idx = levels.indexOf(detailLevel);
      detailLevel = levels[(idx + 1) % levels.length];
      detailToggle.textContent = 'Detail: ' + (detailLevel.charAt(0).toUpperCase() + detailLevel.slice(1));
      
      // Update MeterDisplay detail level
      if(meterDisplay) meterDisplay.setDetailLevel(detailLevel);
      
      console.log('[DetailLevel] Changed to:', detailLevel);
    });
  }

  // Layout editor panel
  const openLayoutBtn = document.getElementById('openLayout');
  const layoutPanel = document.getElementById('layoutPanel');
  const closeLayoutBtn = document.getElementById('closeLayoutPanel');
  const layoutListEl = document.getElementById('layoutList');
  const resetLayoutBtn = document.getElementById('resetLayout');
  const saveLayoutBtn = document.getElementById('saveLayout');

  const moduleDefs = [
    {id:'meters', name:'Meters', selector:'.meters'},
    {id:'minimeters', name:'Mini Meters', selector:'.minimeters'},
    {id:'wave', name:'Waveform', selector:'#wave'},
    {id:'visualrow', name:'Visual Row', selector:'.visual-row'},
    {id:'morevisuals', name:'More Visuals', selector:'.more-visuals'}
  ];

  function loadLayout(){
    try{ const raw = localStorage.getItem('qyjo_layout'); return raw ? JSON.parse(raw) : null; }catch(e){return null}
  }
  function saveLayout(conf){ localStorage.setItem('qyjo_layout', JSON.stringify(conf)); }

  function applyLayout(conf){
    if(!conf) return;
    const app = document.getElementById('app');
    // apply order by appending nodes in order after header
    const header = app.querySelector('header');
    conf.order.forEach(id=>{
      const def = moduleDefs.find(m=>m.id===id);
      if(!def) return;
      const el = document.querySelector(def.selector);
      if(el) app.appendChild(el);
    });
    // apply visibility and size
    conf.items.forEach(it=>{
      const def = moduleDefs.find(m=>m.id===it.id);
      if(!def) return;
      const el = document.querySelector(def.selector);
      if(!el) return;
      el.style.display = it.visible ? '' : 'none';
      el.classList.remove('size-small','size-medium','size-large');
      el.classList.add(it.size || 'size-medium');
      // adjust canvas pixel resolution if element contains canvases
      adjustCanvasResolution(el, it.size || 'size-medium');
    });
  }

  function createLayoutEditor(){
    if(!layoutListEl || !resetLayoutBtn || !saveLayoutBtn || !layoutPanel) return;
    layoutListEl.innerHTML = '';
    const conf = loadLayout() || { order: moduleDefs.map(m=>m.id), items: moduleDefs.map(m=>({id:m.id, visible:true, size:'size-medium'})) };
    conf.order.forEach(id=>{
      const def = moduleDefs.find(m=>m.id===id);
      const it = conf.items.find(x=>x.id===id);
      const row = document.createElement('div'); row.className = 'layout-item';
      row.innerHTML = `<div>${def.name}</div>`;
      const controls = document.createElement('div'); controls.className='layout-controls';
      const vis = document.createElement('button'); vis.textContent = it.visible? 'Hide':'Show';
      vis.addEventListener('click', ()=>{ it.visible = !it.visible; vis.textContent = it.visible? 'Hide':'Show'; applyLayout(conf); });
      const up = document.createElement('button'); up.textContent='↑'; up.addEventListener('click', ()=>{ const idx = conf.order.indexOf(id); if(idx>0){ conf.order.splice(idx,1); conf.order.splice(idx-1,0,id); createLayoutEditor(); applyLayout(conf); } });
      const down = document.createElement('button'); down.textContent='↓'; down.addEventListener('click', ()=>{ const idx = conf.order.indexOf(id); if(idx < conf.order.length-1){ conf.order.splice(idx,1); conf.order.splice(idx+1,0,id); createLayoutEditor(); applyLayout(conf); } });
      const size = document.createElement('select'); ['size-small','size-medium','size-large'].forEach(sz=>{ const o = document.createElement('option'); o.value=sz; o.textContent = sz.replace('size-',''); if(it.size===sz) o.selected=true; size.appendChild(o); });
      size.addEventListener('change', ()=>{ it.size = size.value; applyLayout(conf); });
      controls.appendChild(vis); controls.appendChild(up); controls.appendChild(down); controls.appendChild(size);
      row.appendChild(controls); layoutListEl.appendChild(row);
    });
    // wire reset/save
    resetLayoutBtn.onclick = ()=>{ localStorage.removeItem('qyjo_layout'); createLayoutEditor(); applyLayout(loadLayout()); };
    saveLayoutBtn.onclick = ()=>{ saveLayout(conf); layoutPanel.classList.add('hidden'); };
  }

  // map of base canvas resolutions for known modules
  const canvasBase = {
    '#wave': {w:512,h:128},
    '#vectorscope': {w:256,h:256},
    '#osc': {w:800,h:160},
    '#specgram': {w:800,h:160},
    '#specgraph': {w:300,h:320},
    '#goniometer': {w:300,h:320}
  };

  function adjustCanvasResolution(el, sizeKey){
    const scaleMap = { 'size-small': 0.8, 'size-medium': 1.0, 'size-large': 1.25 };
    const scale = scaleMap[sizeKey] || 1.0;
    // helper to animate resize smoothly
    function animateCanvasResize(c, targetW, targetH){
      // current visual size
      const curW = c.getBoundingClientRect().width;
      const curH = c.getBoundingClientRect().height;
      // compute CSS scale factors
      const sx = targetW / curW || 1;
      const sy = targetH / curH || 1;
      const s = Math.max(sx, sy);
      // apply transform animation from 1 -> s
      c.style.transformOrigin = 'center center';
      c.style.transition = 'transform 260ms ease';
      // start from identity
      c.style.transform = 'scale(1)';
      // trigger layout
      void c.offsetWidth;
      c.style.transform = `scale(${s})`;
      const finish = ()=>{
        c.style.transition = '';
        c.style.transform = '';
        // set actual canvas pixel resolution and CSS size to match
        c.width = Math.round(targetW);
        c.height = Math.round(targetH);
        c.style.width = targetW + 'px';
        c.style.height = targetH + 'px';
        c.removeEventListener('transitionend', finish);
      };
      c.addEventListener('transitionend', finish);
      // fallback timeout
      setTimeout(finish, 300);
    }

    // if element itself is a canvas
    if(el.tagName === 'CANVAS'){
      const id = '#' + el.id;
      const base = canvasBase[id];
      if(base){
        const targetW = Math.round(base.w * scale);
        const targetH = Math.round(base.h * scale);
        animateCanvasResize(el, targetW, targetH);
      }
      return;
    }
    // update any canvases inside this element
    const canvases = el.querySelectorAll('canvas');
    canvases.forEach(c=>{
      const id = '#' + c.id;
      const base = canvasBase[id];
      if(base){
        const targetW = Math.round(base.w * scale);
        const targetH = Math.round(base.h * scale);
        animateCanvasResize(c, targetW, targetH);
      }
    });
  }

  openLayoutBtn && openLayoutBtn.addEventListener('click', ()=>{ layoutPanel.classList.remove('hidden'); createLayoutEditor(); });
  closeLayoutBtn && closeLayoutBtn.addEventListener('click', ()=>{ layoutPanel.classList.add('hidden'); });

  // apply saved layout on start (only if one exists)
  const savedLayout = loadLayout();
  if(savedLayout) applyLayout(savedLayout);

  // Initialize panel positions from data attributes
  function initializePanelPositions(){
    document.querySelectorAll('.panel-box').forEach(panel => {
      const x = panel.getAttribute('data-x');
      const y = panel.getAttribute('data-y');
      const w = panel.getAttribute('data-w');
      const h = panel.getAttribute('data-h');
      if(x !== null) panel.style.left = x + 'px';
      if(y !== null) panel.style.top = y + 'px';
      if(w !== null) panel.style.width = w + 'px';
      if(h !== null) panel.style.height = h + 'px';
    });
  }
  
  // Initialize panels on page load
  initializePanelPositions();

  // auto-log devices on each enumeration to main process
  const originalListDevices = listDevices;
  listDevices = async function(){
    await originalListDevices();
    try{
      const devices = await navigator.mediaDevices.enumerateDevices();
      if(window.electron && window.electron.logDevices) window.electron.logDevices(devices);
    }catch(e){ console.warn('Could not enumerate devices for logging', e); }
  };

  function computeStatsAndLUFS(floatData){
    // ====== PEAK (RAW, PRE-WEIGHTING) ======
    let rawPeakL = 0, rawPeakR = 0;
    // Use available channel data
    if(leftArray && leftArray.length > 0){
      for(let i=0;i<leftArray.length;i++){
        rawPeakL = Math.max(rawPeakL, Math.abs(leftArray[i]||0));
      }
    }
    if(rightArray && rightArray.length > 0){
      for(let i=0;i<rightArray.length;i++){
        rawPeakR = Math.max(rawPeakR, Math.abs(rightArray[i]||0));
      }
    }
    const rawPeak = Math.max(rawPeakL, rawPeakR);
    samplePeakInstant = rawPeak;
    if(rawPeak > samplePeakHold) samplePeakHold = rawPeak;

    const peakDb = 20 * Math.log10(Math.max(rawPeak, 1e-12));
    const holdDb = 20 * Math.log10(Math.max(samplePeakHold, 1e-12));

    // ====== RMS (RAW, PRE-WEIGHTING, STEREO ENERGY AVERAGED) ======
    let sumSqL = 0, sumSqR = 0, nL = 0, nR = 0;
    if(leftArray && leftArray.length > 0){
      for(let i=0;i<leftArray.length;i++){
        const l = leftArray[i] || 0;
        sumSqL += l * l;
        nL++;
      }
    }
    if(rightArray && rightArray.length > 0){
      for(let i=0;i<rightArray.length;i++){
        const r = rightArray[i] || 0;
        sumSqR += r * r;
        nR++;
      }
    }
    const meanSqL = nL > 0 ? sumSqL / nL : 0;
    const meanSqR = nR > 0 ? sumSqR / nR : 0;
    const meanSqCombined = (meanSqL + meanSqR) / 2.0;
    const rms = Math.sqrt(meanSqCombined);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));

    // ====== LUFS (K-WEIGHTED, BLOCK-BASED, WITH GATING) ======
    // Only process if we have valid stereo data
    if(leftArray && rightArray && leftArray.length > 0 && rightArray.length > 0){
      const minLen = Math.min(leftArray.length, rightArray.length);
      for(let i=0;i<minLen;i++){
        const l = leftArray[i] || 0;
        const r = rightArray[i] || 0;
        const kL = applyKWeight(l, false);
        const kR = applyKWeight(r, true);
        
        // Energy of single sample (sum of squares, then average channels)
        const E_i = (kL*kL + kR*kR) / 2.0;
        
        if(lufsBlockIdx < blockSamples){
          lufsBlockBuffer[lufsBlockIdx] = E_i;
          lufsBlockIdx++;
        }

        // When block is full, compute block loudness and store
        if(lufsBlockIdx >= blockSamples && blockSamples > 0){
          const blockSumEnergy = lufsBlockBuffer.reduce((a,e)=>a+e,0);
          const blockMeanEnergy = blockSumEnergy / blockSamples;
          
          // Only push valid energy values
          if(blockMeanEnergy > 0 && isFinite(blockMeanEnergy)){
            lufsBlocks.push(blockMeanEnergy);
          }
          
          lufsBlockBuffer = new Float32Array(blockSamples);
          lufsBlockIdx = 0;
        }
      }
    }

    // ====== MOMENTARY LUFS (400 ms, UNGATED) ======
    let momentaryLufs = -120;
    if(lufsBlocks.length > 0){
      const lastBlockEnergy = lufsBlocks[lufsBlocks.length - 1];
      if(lastBlockEnergy > 0 && isFinite(lastBlockEnergy)){
        momentaryLufs = -0.691 + 10 * Math.log10(lastBlockEnergy + 1e-15);
        if(!isFinite(momentaryLufs)) momentaryLufs = -120;
      }
    }

    // ====== INTEGRATED LUFS (ALL TIME, WITH GATING) ======
    let integratedLufs = -120;
    if(lufsBlocks.length > 0){
      // Preliminary integrated (ungated)
      const sumEnergy = lufsBlocks.reduce((a,e)=>a+e,0);
      const meanUnGated = sumEnergy / lufsBlocks.length;
      
      if(meanUnGated > 0 && isFinite(meanUnGated)){
        const prelim = -0.691 + 10 * Math.log10(meanUnGated + 1e-15);

        // Absolute gate: keep only blocks > -70 LUFS
        const absoluteGateThreshold = Math.pow(10, (-0.691 - 70.0) / 10.0);
        const blocksAbsGate = lufsBlocks.filter(e => e > absoluteGateThreshold);

        // Relative gate
        let finalBlocks = lufsBlocks;
        if(blocksAbsGate.length > 0){
          const sumAbsGated = blocksAbsGate.reduce((a,e)=>a+e,0);
          const meanAbsGated = sumAbsGated / blocksAbsGate.length;
          const absGatedLufs = -0.691 + 10 * Math.log10(meanAbsGated + 1e-15);
          const relativeThresholdLufs = absGatedLufs - 10.0;
          const relativeThresholdEnergy = Math.pow(10, (relativeThresholdLufs + 0.691) / 10.0);
          const gatedBlocks = lufsBlocks.filter(e => e > relativeThresholdEnergy);
          finalBlocks = gatedBlocks.length > 0 ? gatedBlocks : blocksAbsGate;
        }

        if(finalBlocks.length > 0){
          const sumFinal = finalBlocks.reduce((a,e)=>a+e,0);
          const meanFinal = sumFinal / finalBlocks.length;
          if(meanFinal > 0 && isFinite(meanFinal)){
            integratedLufs = -0.691 + 10 * Math.log10(meanFinal + 1e-15);
            if(!isFinite(integratedLufs)) integratedLufs = -120;
          }
        }
      }
    }

    // ====== PEAK LUFS (MAX BLOCK LUFS) ======
    let peakLufsValue = -120;
    if(lufsBlocks.length > 0){
      const validLufs = lufsBlocks
        .map(e => (e > 0 && isFinite(e)) ? (-0.691 + 10 * Math.log10(e + 1e-15)) : -120)
        .filter(v => isFinite(v) && v > -200);
      if(validLufs.length > 0){
        peakLufsValue = Math.max(...validLufs);
      }
    }

    return {
      rms, db: rmsDb, peak: rawPeak, peakDb,
      lufs: integratedLufs, momentaryLufs, peakLufs: peakLufsValue,
      rmsLinear: rms, holdDb
    };
  }

  await listDevices();
  navigator.mediaDevices.ondevicechange = listDevices;

  startBtn.addEventListener('click', ()=>{
    if(!audioCtx) start();
  });

  const logDebugBtn = document.getElementById('logDebugInfo');
  if(logDebugBtn) logDebugBtn.addEventListener('click', ()=>{
    console.log('=== AUDIO DEBUG INFO ===');
    console.log('Sample Rate:', sampleRate);
    console.log('Buffer Length (samples):', bufLen);
    console.log('Buffer Write Position:', bufWrite);
    if(audioCtx){
      console.log('AudioContext State:', audioCtx.state);
      console.log('AudioContext Sample Rate:', audioCtx.sampleRate);
    }
    console.log('Current LUFS values:', {
      integrated: lufsBlocks.length > 0 ? 'computed' : '—',
      momentary: 'see UI',
      peak: 'see UI'
    });
  });

  // Reset button handlers
  const resetLufsBtn = document.getElementById('resetLufs');
  if(resetLufsBtn){
    resetLufsBtn.addEventListener('click', ()=>{
      lufsBlocks = [];
      lufsBlockBuffer = new Float32Array(blockSamples);
      lufsBlockIdx = 0;
      console.log('LUFS state reset');
    });
  }

  const resetPeakBtn = document.getElementById('resetPeak');
  if(resetPeakBtn){
    resetPeakBtn.addEventListener('click', ()=>{
      samplePeakHold = -Infinity;
      console.log('Peak hold reset');
    });
  }

  // theme and prefs handling
  function loadSettings(){
    try{
      const raw = localStorage.getItem('qyjo_settings');
      return raw ? JSON.parse(raw) : {theme:'ps2', autoStart:false};
    }catch(e){ return {theme:'ps2', autoStart:false}; }
  }

  function saveSettings(s){
    const cur = Object.assign({}, loadSettings(), s);
    localStorage.setItem('qyjo_settings', JSON.stringify(cur));
  }

  // Apply theme using THEME.applyPalette
  // wire preference UI
  const initialSettings = loadSettings();
  themeSelect.value = initialSettings.theme || 'ps2';
  autoStartEl.checked = !!initialSettings.autoStart;
  THEME.applyPalette(themeSelect.value);

  // Enable glitter effect if initial theme is glitter
  if(glitterLayer && THEME.currentPalette === 'glitter'){
    console.log('[Glitter] Initial theme is glitter, starting effect');
    glitterLayer.start();
  } else if(glitterLayer) {
    console.log('[Glitter] Initial theme is', THEME.currentPalette, '- not starting glitter');
  }

  themeSelect.addEventListener('change', ()=>{
    saveSettings({theme: themeSelect.value});
    THEME.applyPalette(themeSelect.value);
  });

  autoStartEl.addEventListener('change', ()=>{
    saveSettings({autoStart: autoStartEl.checked});
  });

  // try auto-start if allowed by setting
  if(initialSettings.autoStart){
    // attempt to start; browsers may block getUserMedia without gesture
    start().catch(()=>{});
  }
})();
