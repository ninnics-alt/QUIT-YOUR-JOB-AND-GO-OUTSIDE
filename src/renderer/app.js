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

      const stats = computeStatsAndLUFS(dataArray);

      lufsEl.textContent = stats.lufs.toFixed(1) + ' LUFS';
      document.getElementById('lufsM').textContent = stats.momentaryLufs.toFixed(1) + ' LUFS';
      document.getElementById('lufsS').textContent = stats.peakLufs.toFixed(1) + ' LUFS';
      rmsEl.textContent = stats.db.toFixed(1) + ' dBFS';
      peakEl.textContent = stats.peakDb.toFixed(1) + ' dBFS';

      // Debug info
      document.getElementById('sampleRms').textContent = stats.db.toFixed(1) + ' dBFS (' + stats.rmsLinear.toFixed(4) + ' lin)';
      document.getElementById('bufWriteDebug').textContent = bufWrite;
      document.getElementById('bufLenDebug').textContent = bufLen;
      document.getElementById('rawPeakDebug').textContent = stats.peak.toFixed(4) + ' | Instant LUFS: ' + (10 * Math.log10(stats.rmsLinear * stats.rmsLinear)).toFixed(1);
      document.getElementById('meanSqDebug').textContent = (stats.rmsLinear * stats.rmsLinear).toFixed(6) + ' | Block meanPower: ' + (window._debugLUFS?.meanPower || 0).toFixed(9);
      document.getElementById('momBlocksDebug').textContent = momentaryBlocks.length + ' | Preliminary: ' + (window._debugLUFS?.preliminaryLUFS || 0).toFixed(1);

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
      document.querySelector('#rmsBar .fill').style.width = (rmsPct*100)+'%';
      document.querySelector('#peakBar .fill').style.width = (peakPct*100)+'%';

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

  openLayoutBtn.addEventListener('click', ()=>{ layoutPanel.classList.remove('hidden'); createLayoutEditor(); });
  closeLayoutBtn.addEventListener('click', ()=>{ layoutPanel.classList.add('hidden'); });

  // apply saved layout on start
  applyLayout(loadLayout());

  // auto-log devices on each enumeration to main process
  const originalListDevices = listDevices;
  listDevices = async function(){
    await originalListDevices();
    try{
      const devices = await navigator.mediaDevices.enumerateDevices();
      if(window.electron && window.electron.logDevices) window.electron.logDevices(devices);
    }catch(e){ console.warn('Could not enumerate devices for logging', e); }
  };

  // compute statistics and a closer approximation to LUFS using block gating
  function computeStatsAndLUFS(floatData){
    // instant stats
    let sum = 0; let peak = 0;
    for(let i=0;i<floatData.length;i++){
      const v = floatData[i]; sum += v*v; if(Math.abs(v) > peak) peak = Math.abs(v);
    }
    const meanSquare = sum/floatData.length || 1e-12;
    const rms = Math.sqrt(meanSquare);
    const db = 20 * Math.log10(rms + 1e-12);
    const peakDb = 20 * Math.log10(peak + 1e-12);

    // build 400ms block list from circular buffer for integrated loudness
    const blockSize = Math.floor(sampleRate * 0.4);
    const totalBlocks = Math.floor(bufLen / blockSize) || 1;
    const powers = [];
    // read oldest to newest
    let readIdx = (bufWrite + 1) % bufLen; // approximate oldest sample
    for(let b=0;b<totalBlocks;b++){
      let s = 0;
      // Use main mono buffer (which now has all samples from dataArray)
      for(let i=0;i<blockSize;i++){
        const x = buffer[readIdx] || 0;
        s += x*x;
        readIdx = (readIdx + 1) % bufLen;
      }
      s = s / blockSize;
      powers.push(s + 1e-18);
    }

    // If EBUR128 WASM is available and initialized, prefer its integrated LUFS
    try{
      if(window.EBUR128 && ebInited && typeof window.EBUR128.getIntegrated === 'function'){
        const wasmLufs = window.EBUR128.getIntegrated();
        return {rms, db, peak, peakDb, lufs: wasmLufs, momentaryLufs, peakLufs, rmsLinear: rms, peak};
      }
    }catch(e){ console.warn('EBUR128 getIntegrated failed', e); }

    // preliminary integrated (ungated)
    const meanPower = powers.reduce((a,c)=>a+c,0)/powers.length;
    const preliminaryLUFS = 10 * Math.log10(meanPower + 1e-18);

    // Store for debug
    window._debugLUFS = {meanPower, preliminaryLUFS, numBlocks: powers.length, blockSize, firstPower: powers[0]};

    // gating per ITU idea (approx): absolute gate = -70 LUFS, relative gate = preliminary -10 dB
    const absoluteGateLinear = Math.pow(10, -70.0/10.0); // -70 LUFS absolute gate
    const relativeGateLinear = Math.pow(10, (preliminaryLUFS - 10.0)/10.0);
    const gateThreshold = Math.max(absoluteGateLinear, relativeGateLinear);

    const gated = powers.filter(p=>p >= gateThreshold);
    const used = gated.length ? gated : powers; // if gate excludes all, fall back
    const finalMean = used.reduce((a,c)=>a+c,0)/used.length;
    const lufs = 10 * Math.log10(finalMean + 1e-18);

    // momentary LUFS: last 3 seconds (~8 blocks, no gating per ITU-R BS.1770-4)
    momentaryBlocks.push(...powers);
    if(momentaryBlocks.length > momentaryBlockCount){
      momentaryBlocks = momentaryBlocks.slice(-momentaryBlockCount);
    }
    if(momentaryBlocks.length > 0){
      const momentaryMean = momentaryBlocks.reduce((a,c)=>a+c,0)/momentaryBlocks.length;
      momentaryLufs = 10 * Math.log10(momentaryMean + 1e-18);
    }

    // peak LUFS: track maximum LUFS value
    if(lufs > peakLufs){
      peakLufs = lufs;
    }

    return {rms, db, peak, peakDb, lufs, momentaryLufs, peakLufs, rmsLinear: rms, peak};
  }

  await listDevices();
  navigator.mediaDevices.ondevicechange = listDevices;

  startBtn.addEventListener('click', ()=>{
    if(!audioCtx) start();
  });

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
