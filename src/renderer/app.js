(async function(){
  const deviceSelect = document.getElementById('deviceSelect');
  const startBtn = document.getElementById('start');
  const themeSelect = document.getElementById('themeSelect');
  const autoStartEl = document.getElementById('autoStart');
  const lufsEl = document.getElementById('lufs');
  const wasmStatusEl = document.getElementById('wasmStatus');
  const rmsEl = document.getElementById('rms');
  const peakEl = document.getElementById('peak');
  const canvas = document.getElementById('wave');
  const ctx = canvas.getContext('2d');
  const vsCanvas = document.getElementById('vectorscope');
  const vsCtx = vsCanvas.getContext('2d');
  const corrValEl = document.getElementById('corrVal');
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
  const goniCanvas = document.getElementById('goniometer');
  const goniCtx = goniCanvas.getContext('2d');

  // Meter engine (loaded from meter-engine.js script tag)
  let meterEngine = null;

  let audioCtx, analyser, dataArray, source, stream;
  let splitter, analyserL, analyserR, leftArray, rightArray;
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
    const w = canvas.width; const h = canvas.height;
    ctx.fillStyle = 'rgba(8,2,32,0.45)';
    ctx.fillRect(0,0,w,h);

    // gradient stroke
    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,'#ff6ec7');
    grad.addColorStop(1,'#00e5ff');
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
    ctx.fillStyle = 'rgba(255,110,199,0.04)';
    for(let gx=0;gx<w;gx+=8){
      for(let gy=0;gy<h;gy+=8){
        if(Math.random() > 0.985) ctx.fillRect(gx,gy,6,6);
      }
    }
  }

  async function start(){
    const deviceId = deviceSelect.value || undefined;
    try{
      // If user selected 'default', call getUserMedia without deviceId to use system default
      const constraints = deviceId && deviceId !== 'default' ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }catch(e){
      // try fallback: attempt default device if a specific device failed
      console.warn('getUserMedia failed for selected device:', e);
      try{
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

    // channel split for vectorscope
    splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser(); analyserL.fftSize = 1024;
    analyserR = audioCtx.createAnalyser(); analyserR.fftSize = 1024;
    leftArray = new Float32Array(analyserL.fftSize);
    rightArray = new Float32Array(analyserR.fftSize);

    // BYPASS K-WEIGHT FOR TESTING: connect source directly to analyser
    source.connect(analyser);
    analyser.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    kWeightNodeHead = analyser; // point to analyser instead of shelf

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

    function tick(){
      analyser.getFloatTimeDomainData(dataArray);
      analyser.getByteFrequencyData(freqData);
      // draw oscilloscope
      try{ drawOsc(dataArray); }catch(e){}
      // draw spectrogram and spectrograph
      try{ drawSpectrogram(freqData); drawSpecGraph(freqData); }catch(e){}
      // get channel data for vectorscope
      try{
        analyserL.getFloatTimeDomainData(leftArray);
        analyserR.getFloatTimeDomainData(rightArray);
        drawVectorscope(leftArray, rightArray);
        const corr = computeCorrelation(leftArray, rightArray);
        corrValEl.textContent = corr.toFixed(2);
        // draw goniometer
        try{ drawGoniometer(leftArray, rightArray); }catch(e){}
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
          // Debug: Check input signal levels
          const maxL = Math.max(...leftArray.map(Math.abs));
          const maxR = Math.max(...rightArray.map(Math.abs));
          
          meterEngine.processStereoBuffer(leftArray, rightArray, audioCtx.currentTime || (Date.now()/1000));
          const m = meterEngine.getMetrics();
          
          // Debug: Log signal and block info every 2 seconds
          if(!window.lastDebugLog || (Date.now() - window.lastDebugLog) > 2000){
            console.log(`[MeterEngine] INPUT: L=${maxL.toFixed(4)} R=${maxR.toFixed(4)} bufLen=${leftArray.length} | METERS: peak=${m.peakLinear.toFixed(4)} rms=${m.rmsLinear.toFixed(4)} | LUFS: blocks=${m.blockCount} M=${m.lufsMomentary.toFixed(1)} I=${m.lufsIntegrated.toFixed(1)}`);
            if(maxL === 0 && maxR === 0){
              console.warn('⚠️ NO AUDIO INPUT DETECTED - Check that your input device is sending audio (play music, speak into mic, etc.)');
            }
            window.lastDebugLog = Date.now();
          }
          
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
        
        // Debug: Check if main analyser is receiving audio
        if(!window.lastMainAnalyserCheck || (Date.now() - window.lastMainAnalyserCheck) > 5000){
          const maxMain = Math.max(...dataArray.map(Math.abs));
          console.log(`[Audio] Main analyser max: ${maxMain.toFixed(6)} (${dataArray.length} samples)`);
          if(maxMain === 0){
            console.warn('⚠️ Main analyser also shows zero - audio device may not be sending signal');
          }
          window.lastMainAnalyserCheck = Date.now();
        }
      }

      lufsEl.textContent = stats.lufs.toFixed(1) + ' LUFS';
      document.getElementById('lufsM').textContent = stats.momentaryLufs.toFixed(1) + ' LUFS';
      document.getElementById('lufsS').textContent = stats.peakLufs.toFixed(1) + ' LUFS';
      rmsEl.textContent = stats.db.toFixed(1) + ' dBFS';
      peakEl.textContent = stats.peakDb.toFixed(1) + ' dBFS';

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

      drawWave(dataArray);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function drawVectorscope(L, R){
    const w = vsCanvas.width, h = vsCanvas.height;
    // fade the accumulation buffer slightly to create trails
    vsBufCtx.fillStyle = 'rgba(2,0,8,0.06)';
    vsBufCtx.fillRect(0,0,w,h);

    // draw Lissajous lines onto buffer for persistence
    const len = Math.min(L.length, R.length);
    // choose step to draw many points but not too many
    const step = 2;
    vsBufCtx.lineCap = 'round';
    for(let i=0;i<len-step;i+=step){
      const lx = L[i]; const rx = R[i];
      const lx2 = L[i+step]; const rx2 = R[i+step];
      // map -1..1 to canvas coordinates (swap axes for conventional vectorscope: X=R, Y=L)
      const x1 = (0.5 + rx*0.48) * w; const y1 = (0.5 - lx*0.48) * h;
      const x2 = (0.5 + rx2*0.48) * w; const y2 = (0.5 - lx2*0.48) * h;

      // color based on angle and intensity for detail
      const ang = Math.atan2(y1 - h/2, x1 - w/2);
      const hue = (ang / (Math.PI*2) + 0.5) * 360;
      const intensity = Math.min(1, Math.hypot(lx, rx));
      vsBufCtx.strokeStyle = `hsla(${hue.toFixed(0)},85%,60%,${0.08 + intensity*0.18})`;
      vsBufCtx.lineWidth = 1 + intensity*1.5;
      vsBufCtx.beginPath();
      vsBufCtx.moveTo(x1,y1);
      vsBufCtx.lineTo(x2,y2);
      vsBufCtx.stroke();
    }

    // draw reference grid on visible canvas
    vsCtx.clearRect(0,0,w,h);
    // subtle outer vignette
    vsCtx.fillStyle = 'rgba(0,0,0,0)';
    vsCtx.fillRect(0,0,w,h);
    // concentric circles
    vsCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    vsCtx.lineWidth = 1;
    for(let r=0.2;r<=0.48;r+=0.12){
      vsCtx.beginPath();
      vsCtx.arc(w/2,h/2,w*r,0,Math.PI*2);
      vsCtx.stroke();
    }
    // crosshair
    vsCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    vsCtx.beginPath();
    vsCtx.moveTo(w/2,0); vsCtx.lineTo(w/2,h);
    vsCtx.moveTo(0,h/2); vsCtx.lineTo(w,h/2);
    vsCtx.stroke();

    // draw accumulated buffer onto visible canvas with additive blending for glow
    vsCtx.globalCompositeOperation = 'lighter';
    vsCtx.drawImage(vsBuffer, 0, 0);
    vsCtx.globalCompositeOperation = 'source-over';
  }

  function drawOsc(buf){
    const w = oscCanvas.width, h = oscCanvas.height;
    oscCtx.fillStyle = 'rgba(4,2,12,0.35)';
    oscCtx.fillRect(0,0,w,h);
    // gradient
    const grad = oscCtx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,'#ff6ec7'); grad.addColorStop(1,'#00e5ff');
    oscCtx.strokeStyle = grad; oscCtx.lineWidth = 1.6;
    oscCtx.beginPath();
    const step = Math.max(1, Math.floor(buf.length / w));
    for(let x=0,i=0;i<w && (i*step)<buf.length;i++,x++){
      const v = buf[i*step];
      const y = (0.5 - v*0.5) * h;
      if(i===0) oscCtx.moveTo(x,y); else oscCtx.lineTo(x,y);
    }
    oscCtx.stroke();
  }

  function drawSpectrogram(freq){
    const w = specCanvas.width, h = specCanvas.height;
    // shift left by 1 pixel
    specBufCtx.drawImage(specBuf, -1, 0);
    // draw new column at right based on freq data
    const binCount = freq.length;
    for(let y=0;y<h;y++){
      const bin = Math.floor((1 - y/h) * binCount);
      const v = freq[bin]/255;
      const col = colorForValue(v);
      specBufCtx.fillStyle = col; specBufCtx.fillRect(w-1, y, 1, 1);
    }
    // copy buffer to visible canvas
    specCtx.drawImage(specBuf, 0, 0, w, h);
  }

  function drawSpecGraph(freq){
    const w = specGraphCanvas.width, h = specGraphCanvas.height;
    specGraphCtx.fillStyle = 'rgba(4,2,12,0.3)'; specGraphCtx.fillRect(0,0,w,h);
    const bins = freq.length; const step = Math.max(1, Math.floor(bins / 100));
    const barW = w / (bins/step);
    for(let i=0,bi=0;i<bins;i+=step,bi++){
      const v = freq[i]/255; const bw = barW-1; const bh = v*h;
      const x = bi*barW; const y = h - bh;
      specGraphCtx.fillStyle = colorForValue(v);
      specGraphCtx.fillRect(x, y, bw, bh);
    }
  }

  function colorForValue(v){
    const hue = Math.round((1 - v) * 240); // blue->red
    const sat = 85; const light = Math.round(30 + v*40);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function drawGoniometer(L, R){
    const w = goniCanvas.width, h = goniCanvas.height; const cx = w/2, cy = h/2;
    goniCtx.fillStyle = 'rgba(2,0,8,0.2)'; goniCtx.fillRect(0,0,w,h);
    // compute angle histogram
    const hist = new Array(36).fill(0);
    const len = Math.min(L.length, R.length);
    for(let i=0;i<len;i+=4){
      const a = L[i], b = R[i];
      const ang = Math.atan2(b, a); // -PI..PI
      const idx = Math.floor(((ang + Math.PI) / (2*Math.PI)) * hist.length) % hist.length;
      hist[idx] += Math.hypot(a,b);
    }
    // normalize
    const max = Math.max(...hist) || 1;
    // draw polar bars
    for(let i=0;i<hist.length;i++){
      const ratio = hist[i]/max; const ang = (i / hist.length) * Math.PI*2;
      const r0 = 30; const r1 = 30 + ratio * (Math.min(cx,cy)-40);
      const x0 = cx + Math.cos(ang) * r0; const y0 = cy + Math.sin(ang) * r0;
      const x1 = cx + Math.cos(ang) * r1; const y1 = cy + Math.sin(ang) * r1;
      goniCtx.strokeStyle = `rgba(0,229,255,${0.15 + ratio*0.7})`;
      goniCtx.lineWidth = 2;
      goniCtx.beginPath(); goniCtx.moveTo(x0,y0); goniCtx.lineTo(x1,y1); goniCtx.stroke();
    }
    // draw center marker
    goniCtx.fillStyle = 'rgba(255,255,255,0.06)'; goniCtx.beginPath(); goniCtx.arc(cx,cy,3,0,Math.PI*2); goniCtx.fill();
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

  function applyTheme(name){
    document.documentElement.classList.remove('theme-ps2','theme-neon');
    if(name === 'neon') document.documentElement.classList.add('theme-neon');
    else document.documentElement.classList.add('theme-ps2');
  }

  // wire preference UI
  const initialSettings = loadSettings();
  themeSelect.value = initialSettings.theme || 'ps2';
  autoStartEl.checked = !!initialSettings.autoStart;
  applyTheme(themeSelect.value);

  themeSelect.addEventListener('change', ()=>{
    saveSettings({theme: themeSelect.value});
    applyTheme(themeSelect.value);
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
