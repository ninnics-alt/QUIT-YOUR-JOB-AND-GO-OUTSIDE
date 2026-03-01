(function(){
  const PANEL_IDS = [
    'panel-vectorscope',
    'panel-osc',
    'panel-specgram',
    'panel-specgraph',
    'panel-goniometer',
    'panel-wave',
    'panel-meters'
  ];

  let appEl;
  let miniContainer;
  let miniBody;
  let miniMetersWrap;
  let miniModuleSelect;
  let miniCornerSelect;
  let miniExitBtn;
  let miniCanvas;
  let miniCtx;
  let miniCanvasRO;

  let isMiniMode = false;
  let currentModuleId = 'panel-vectorscope';
  let originalParents = new Map();
  
  // Capture variables
  let mediaRecorder = null;
  let recordingStartTime = 0;
  let recordingInterval = null;
  let recordedChunks = [];
  let pendingAudioBlob = null; // Store blob for save dialog
  
  // Clip buffer variables
  let clipBufferSize = 0; // 60 seconds at 48kHz stereo = 48000 * 60 * 2 = 5,760,000 samples
  let clipBuffer = null;
  let clipBufferIndex = 0;
  let clipProcessor = null;
  let clipAudioStream = null;
  let clipIsRecording = false;
  let clipAudioContext = null; // Store reference to audio context for extraction
  
  let callbacks = {
    onModuleChange: null,
    onCornerChange: null,
    onExit: null
  };

  function resolvePanelElement(panelId) {
    return document.querySelector('[data-panel-id="' + panelId + '"]');
  }

  function captureOriginalParents() {
    PANEL_IDS.forEach((panelId) => {
      const el = resolvePanelElement(panelId);
      if (el && !originalParents.has(panelId)) {
        originalParents.set(panelId, {
          parent: el.parentElement,
          nextSibling: el.nextElementSibling
        });
      }
    });
  }

  function restoreAllPanels() {
    PANEL_IDS.forEach((panelId) => {
      const el = resolvePanelElement(panelId);
      const info = originalParents.get(panelId);
      if (!el || !info || !info.parent) return;

      // Clear ALL inline styles that may have been set during mini mode
      el.style.cssText = '';
      
      // Remove hidden attribute if present
      el.removeAttribute('hidden');
      
      const panelBody = el.querySelector('.panel-body');
      if (panelBody) {
        panelBody.style.cssText = '';
        panelBody.removeAttribute('hidden');
      }
      
      // Reset canvas inline styles but preserve width/height attributes
      const canvases = el.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        // Only clear CSS styles, not canvas dimensions
        canvas.style.cssText = '';
      });

      // Restore to original position in DOM
      if (info.nextSibling && info.nextSibling.parentElement === info.parent) {
        info.parent.insertBefore(el, info.nextSibling);
      } else {
        info.parent.appendChild(el);
      }
    });
  }

  function attachPanelToMini(panelId) {
    const el = resolvePanelElement(panelId);
    if (!el || !miniBody) return;
    el.style.display = '';  // Clear any display:none from layout settings
    el.style.gridColumn = '';  // Clear any grid positioning
    el.style.gridRow = '';
    
    // Ensure panel body is visible
    const panelBody = el.querySelector('.panel-body');
    if (panelBody) {
      panelBody.style.display = '';
      panelBody.style.visibility = '';
    }
    
    miniBody.appendChild(el);
    
    // Force canvas resize after DOM move - use multiple attempts with increasing delays
    const resizeCanvases = () => {
      const canvases = el.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (rect.width > 0 && rect.height > 0) {
          const w = Math.round(rect.width * dpr);
          const h = Math.round(rect.height * dpr);
          canvas.width = w;
          canvas.height = h;
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
          
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      });
    };
    
    // Try multiple times to catch the layout
    setTimeout(resizeCanvases, 50);
    setTimeout(resizeCanvases, 150);
    setTimeout(resizeCanvases, 300);
  }

  function setMiniCanvasSize() {
    if (!miniCanvas || !miniCtx) return;
    const rect = miniCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    miniCanvas.width = Math.round(width * dpr);
    miniCanvas.height = Math.round(height * dpr);
    miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawMiniMeters(metrics) {
    if (!miniCtx || !miniCanvas || !miniMetersWrap || miniMetersWrap.hidden || !metrics) return;

    setMiniCanvasSize();

    const width = miniCanvas.clientWidth;
    const height = miniCanvas.clientHeight;
    const theme = window.THEME || {};
    const colors = theme.colors || {};

    miniCtx.fillStyle = colors.bgSecondary || '#0f1429';
    miniCtx.fillRect(0, 0, width, height);

    miniCtx.strokeStyle = colors.gridLight || '#1a1f3a';
    miniCtx.strokeRect(0.5, 0.5, width - 1, height - 1);

    const pad = 12;
    const colGap = 10;
    const colWidth = Math.max(80, (width - pad * 2 - colGap) / 2);
    const rowHeight = Math.max(34, (height - pad * 2) / 2);

    const entries = [
      { label: 'LUFS M', value: Number.isFinite(metrics.momentaryLufs) ? metrics.momentaryLufs.toFixed(1) : '—', suffix: ' LUFS' },
      { label: 'RMS', value: Number.isFinite(metrics.rmsDbfs) ? metrics.rmsDbfs.toFixed(1) : '—', suffix: ' dBFS' },
      { label: 'PEAK', value: Number.isFinite(metrics.peakDbfs) ? metrics.peakDbfs.toFixed(1) : '—', suffix: ' dBFS' },
      { label: 'HOLD', value: Number.isFinite(metrics.holdDbfs) ? metrics.holdDbfs.toFixed(1) : '—', suffix: ' dBFS' }
    ];

    miniCtx.textBaseline = 'top';

    for (let i = 0; i < entries.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = pad + col * (colWidth + colGap);
      const y = pad + row * rowHeight;
      const entry = entries[i];

      miniCtx.fillStyle = colors.textSecondary || '#a0a8c8';
      miniCtx.font = '10px "IBM Plex Mono", monospace';
      miniCtx.fillText(entry.label, x, y);

      miniCtx.fillStyle = colors.textPrimary || '#e0e6ff';
      miniCtx.font = '700 19px "IBM Plex Mono", monospace';
      miniCtx.fillText(entry.value, x, y + 12);

      miniCtx.fillStyle = colors.textTertiary || '#6b73a0';
      miniCtx.font = '9px "IBM Plex Mono", monospace';
      miniCtx.fillText(entry.suffix.trim(), x, y + 34);
    }
  }

  function applyModule(moduleId) {
    currentModuleId = moduleId || 'panel-vectorscope';

    restoreAllPanels();

    // Handle capture module
    if (currentModuleId === 'capture') {
      miniMetersWrap.hidden = true;
      miniMetersWrap.style.display = 'none';
      const captureWrap = document.getElementById('miniCaptureWrap');
      if (captureWrap) {
        captureWrap.hidden = false;
        captureWrap.style.display = '';
      }
      return;
    }

    const captureWrap = document.getElementById('miniCaptureWrap');
    if (captureWrap) {
      captureWrap.hidden = true;
      captureWrap.style.display = 'none';
    }

    // Always explicitly set miniMetersWrap visibility
    if (currentModuleId === 'miniMeters') {
      miniMetersWrap.hidden = false;
      miniMetersWrap.style.display = '';
      return;
    }

    miniMetersWrap.hidden = true;
    miniMetersWrap.style.display = 'none';
    attachPanelToMini(currentModuleId);
  }

  function initializeClipBuffer(audioCtx, inputNode) {
    // 60 seconds at 48kHz stereo
    console.log('[Clip] initializeClipBuffer called with:', {
      audioCtx: audioCtx,
      audioCtxType: typeof audioCtx,
      audioCtxCreateAudioBuffer: typeof (audioCtx ? audioCtx.createAudioBuffer : 'N/A'),
      inputNode: inputNode
    });
    
    const sampleRate = audioCtx ? audioCtx.sampleRate : 48000;
    clipBufferSize = sampleRate * 60 * 2; // stereo
    clipBuffer = new Float32Array(clipBufferSize);
    clipBufferIndex = 0;
    
    // Store the audio context reference for later use
    clipAudioContext = audioCtx;
    console.log('[Clip] clipAudioContext stored:', {
      value: clipAudioContext,
      type: typeof clipAudioContext,
      hasCreateAudioBuffer: clipAudioContext ? typeof clipAudioContext.createAudioBuffer : 'N/A',
      sampleRate: sampleRate
    });
    
    if (!audioCtx || !inputNode) {
      console.error('[Clip] Missing audioCtx or inputNode');
      return;
    }
    
    try {
      clipProcessor = audioCtx.createScriptProcessor(4096, 2, 2);
      let processCount = 0;
      
      clipProcessor.onaudioprocess = (event) => {
        processCount++;
        if (processCount <= 5 || processCount % 100 === 0) {
          console.log(`[Clip] Processing event #${processCount}, bufferIndex: ${clipBufferIndex}`);
        }
        
        const inputL = event.inputBuffer.getChannelData(0);
        const inputR = event.inputBuffer.getChannelData(1);
        
        // Log first few samples
        if (processCount === 1) {
          console.log('[Clip] First samples - L:', inputL[0], inputR[0]);
        }
        
        // Interleave stereo samples into circular buffer
        for (let i = 0; i < inputL.length; i++) {
          clipBuffer[clipBufferIndex++ % clipBufferSize] = inputL[i];
          clipBuffer[clipBufferIndex++ % clipBufferSize] = inputR[i];
        }
      };
      
      // Connect the input node to the clip processor
      inputNode.connect(clipProcessor);
      clipProcessor.connect(audioCtx.destination);
      clipIsRecording = true;
      console.log('[Clip] Processor connected and recording started - sampleRate:', sampleRate);
    } catch (error) {
      console.error('[Clip] Error initializing clip buffer:', error);
    }
  }

  function startClipRecording() {
    if (clipIsRecording) return;
    if (!window.appAudioContext || !window.appAudioInputGain) {
      console.warn('[Clip] Audio context or input gain not available');
      return;
    }
    initializeClipBuffer(window.appAudioContext, window.appAudioInputGain);
  }

  function extractClipAudio(durationSeconds) {
    if (!clipBuffer || clipBufferSize === 0) {
      console.error('[Clip] No clip buffer available');
      return null;
    }
    
    try {
      // Get sample rate from stored context
      let sampleRate = 48000; // default
      if (window.appAudioContext && window.appAudioContext.sampleRate) {
        sampleRate = window.appAudioContext.sampleRate;
      } else if (clipAudioContext && clipAudioContext.sampleRate) {
        sampleRate = clipAudioContext.sampleRate;
      }
      
      const totalSamples = durationSeconds * sampleRate * 2; // stereo
      const numSamples = Math.min(totalSamples, clipBufferIndex);
      const numFrames = Math.floor(numSamples / 2); // stereo = 2 channels
      
      if (numFrames === 0) {
        console.warn('[Clip] No audio frames to extract');
        return null;
      }
      
      console.log(`[Clip] Extracting ${durationSeconds}s (${numFrames} frames @ ${sampleRate}Hz)`);
      
      // Create separate channel data (deinterleave from circular buffer)
      const channelL = new Float32Array(numFrames);
      const channelR = new Float32Array(numFrames);
      
      let sIdx = Math.max(0, clipBufferIndex - numSamples);
      for (let i = 0; i < numFrames; i++) {
        channelL[i] = clipBuffer[sIdx++ % clipBufferSize];
        channelR[i] = clipBuffer[sIdx++ % clipBufferSize];
      }
      
      // Create a mock AudioBuffer object with the interface needed by audioBufferToWav
      const mockAudioBuffer = {
        numberOfChannels: 2,
        sampleRate: sampleRate,
        length: numFrames,
        duration: numFrames / sampleRate,
        getChannelData: function(channel) {
          return channel === 0 ? channelL : channelR;
        }
      };
      
      console.log('[Clip] Audio buffer created successfully');
      return mockAudioBuffer;
    } catch (error) {
      console.error('[Clip] Error extracting audio:', error);
      return null;
    }
  }

  function stopClipRecording() {
    if (!clipIsRecording || !clipProcessor) return;
    clipIsRecording = false;
    try {
      clipProcessor.disconnect();
      clipProcessor = null;
    } catch (error) {
      console.error('[Clip] Error stopping clip recording:', error);
    }
  }

  function showClipDurationDialog() {
    const dialog = document.getElementById('clipDurationDialog');
    if (!dialog) return;
    
    dialog.hidden = false;
    
    const btn10 = document.getElementById('clipDuration10');
    const btn60 = document.getElementById('clipDuration60');
    const cancelBtn = document.getElementById('clipDurationCancel');
    
    const handleDuration = (seconds) => {
      dialog.hidden = true;
      cleanup();
      saveClipAudio(seconds);
    };
    
    const cleanup = () => {
      btn10.removeEventListener('click', () => handleDuration(10));
      btn60.removeEventListener('click', () => handleDuration(60));
      cancelBtn.removeEventListener('click', cleanup);
    };
    
    btn10.addEventListener('click', () => handleDuration(10));
    btn60.addEventListener('click', () => handleDuration(60));
    cancelBtn.addEventListener('click', () => {
      dialog.hidden = true;
      cleanup();
    });
  }

  async function saveClipAudio(durationSeconds) {
    try {
      console.log(`[Clip] SaveClipAudio called for ${durationSeconds}s`);
      const audioBuffer = extractClipAudio(durationSeconds);
      if (!audioBuffer) {
        console.error('[Clip] extractClipAudio returned null');
        alert('No audio data available yet. Please wait for audio to be captured.');
        return;
      }
      
      console.log('[Clip] Audio buffer extracted, converting to WAV...');
      const wavBlob = audioBufferToWav(audioBuffer);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const defaultName = `clip-${durationSeconds}s-${timestamp}`;
      
      console.log('[Clip] Opening save dialog with name:', defaultName);
      if (window.electron && window.electron.showSaveDialog) {
        try {
          const result = await window.electron.showSaveDialog(defaultName);
          
          if (result.canceled) {
            console.log('[Clip] Save cancelled');
            return;
          }
          
          console.log('[Clip] Saving to:', result.filePath);
          // Save to the selected path
          if (window.electron && window.electron.saveAudioToPath) {
            window.electron.saveAudioToPath(result.filePath, Array.from(new Uint8Array(wavBlob)))
              .then((result) => {
                console.log('[Clip] WAV file saved:', result.path);
              })
              .catch((error) => {
                console.error('[Clip] Error saving file:', error);
                alert('Error saving clip: ' + error.message);
              });
          }
        } catch (error) {
          console.error('[Clip] Error:', error);
        }
      }
    } catch (error) {
      console.error('[Clip] Error saving clip audio:', error);
      alert('Error: ' + error.message);
    }
  }

  function startCaptureRecording(audioStream) {
    if (mediaRecorder) return; // Already recording
    
    const options = { mimeType: 'audio/webm' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/mp4';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = '';
    }
    
    try {
      mediaRecorder = new MediaRecorder(audioStream, options);
      recordedChunks = [];
      recordingStartTime = Date.now();
      
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      });
      
      mediaRecorder.addEventListener('stop', () => {
        // Store the blob and show save dialog
        const blob = new Blob(recordedChunks);
        pendingAudioBlob = blob;
        
        // Generate default filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultName = `audio-capture-${timestamp}`;
        
        // Show save dialog
        showSaveAudioDialog(defaultName);
      });
      
      mediaRecorder.start();
      updateCaptureUI(true);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      const statusEl = document.getElementById('captureStatus');
      if (statusEl) statusEl.innerText = 'Error: ' + error.message;
    }
  }

  function audioBufferToWav(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const length = audioBuffer.length;
    
    // Get audio data from all channels
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }
    
    // Calculate total file size: 44 bytes header + audio data
    const dataSize = length * numberOfChannels * (bitDepth / 8);
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAV file header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // "RIFF" chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true); // file length - 8
    writeString(8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunkSize
    view.setUint16(20, format, true); // audio format (1 = PCM)
    view.setUint16(22, numberOfChannels, true); // numChannels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * numberOfChannels * (bitDepth / 8), true); // avg. bytes/sec
    view.setUint16(32, numberOfChannels * (bitDepth / 8), true); // block-size
    view.setUint16(34, bitDepth, true); // 16-bit
    
    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true); // chunkSize
    
    // Write interleaved channel data
    let index = 44;
    const volume = 0.8;
    
    if (numberOfChannels === 2) {
      // Stereo - interleave L and R
      const left = channels[0];
      const right = channels[1];
      for (let i = 0; i < length; i++) {
        // Left sample
        const s1 = Math.max(-1, Math.min(1, left[i]));
        view.setInt16(index, s1 < 0 ? s1 * 0x8000 * volume : s1 * 0x7FFF * volume, true);
        index += 2;
        
        // Right sample
        const s2 = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(index, s2 < 0 ? s2 * 0x8000 * volume : s2 * 0x7FFF * volume, true);
        index += 2;
      }
    } else {
      // Mono
      const mono = channels[0];
      for (let i = 0; i < length; i++) {
        const s = Math.max(-1, Math.min(1, mono[i]));
        view.setInt16(index, s < 0 ? s * 0x8000 * volume : s * 0x7FFF * volume, true);
        index += 2;
      }
    }
    
    return arrayBuffer;
  }

  function stopCaptureRecording() {
    if (!mediaRecorder) return;
    
    mediaRecorder.stop();
    mediaRecorder = null;
    
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    
    updateCaptureUI(false);
  }

  function updateCaptureUI(isRecording) {
    const startBtn = document.getElementById('captureStartBtn');
    const stopBtn = document.getElementById('captureStopBtn');
    const timeDisplay = document.getElementById('captureTime');
    const statusEl = document.getElementById('captureStatus');
    
    if (isRecording) {
      if (startBtn) startBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = false;
      if (statusEl) statusEl.innerText = 'Recording...';
      
      recordingInterval = setInterval(() => {
        if (timeDisplay) {
          const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          timeDisplay.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
      }, 100);
    } else {
      if (startBtn) startBtn.hidden = false;
      if (stopBtn) stopBtn.hidden = true;
      if (timeDisplay) timeDisplay.innerText = '00:00';
      if (statusEl) statusEl.innerText = 'Ready to record';
    }
  }

  function showSaveAudioDialog(defaultName) {
    const dialog = document.getElementById('saveAudioDialog');
    const nameInput = document.getElementById('saveAudioName');
    const okBtn = document.getElementById('saveAudioOkBtn');
    const cancelBtn = document.getElementById('saveAudioCancelBtn');
    
    if (!dialog || !nameInput) return;
    
    // Set default name
    nameInput.value = defaultName;
    
    // Show dialog
    dialog.hidden = false;
    nameInput.focus();
    nameInput.select();
    
    // Handle OK
    const handleOk = async () => {
      const filename = (nameInput.value || defaultName).trim();
      if (!filename) {
        nameInput.value = defaultName;
        return;
      }
      
      dialog.hidden = true;
      cleanup();
      
      // Show native macOS save dialog to choose location
      if (window.electron && window.electron.showSaveDialog) {
        try {
          const result = await window.electron.showSaveDialog(filename);
          
          if (result.canceled) {
            // User cancelled the save dialog
            pendingAudioBlob = null;
            const statusEl = document.getElementById('captureStatus');
            if (statusEl) statusEl.innerText = 'Save cancelled';
            return;
          }
          
          // Save to the selected path
          await saveAudioToPath(result.filePath);
        } catch (error) {
          const statusEl = document.getElementById('captureStatus');
          if (statusEl) statusEl.innerText = 'Error: ' + error.message;
          console.error('[Capture] Error:', error);
        }
      }
    };
    
    // Handle Cancel
    const handleCancel = () => {
      dialog.hidden = true;
      pendingAudioBlob = null;
      cleanup();
    };
    
    // Handle Enter key
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') handleOk();
      if (e.key === 'Escape') handleCancel();
    };
    
    const cleanup = () => {
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      nameInput.removeEventListener('keydown', handleKeyDown);
    };
    
    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    nameInput.addEventListener('keydown', handleKeyDown);
  }

  async function saveAudioToPath(filePath) {
    if (!pendingAudioBlob) {
      const statusEl = document.getElementById('captureStatus');
      if (statusEl) statusEl.innerText = 'Error: No audio to save';
      return;
    }
    
    try {
      const statusEl = document.getElementById('captureStatus');
      if (statusEl) statusEl.innerText = 'Converting to WAV...';
      
      // Decode and convert to WAV
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        try {
          const arrayBuffer = event.target.result;
          // Decode the audio data
          const audioContext = window.appAudioContext || new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to WAV
          const wavBlob = audioBufferToWav(audioBuffer);
          
          // Save to the specified path
          if (window.electron && window.electron.saveAudioToPath) {
            window.electron.saveAudioToPath(filePath, Array.from(new Uint8Array(wavBlob)))
              .then((result) => {
                const statusEl = document.getElementById('captureStatus');
                const filename = filePath.split('/').pop();
                if (statusEl) {
                  statusEl.innerText = `Saved: ${filename}`;
                }
                const openBtn = document.getElementById('captureOpenBtn');
                if (openBtn) {
                  openBtn.style.display = 'block';
                }
                pendingAudioBlob = null;
                console.log('[Capture] WAV file saved:', filePath);
              })
              .catch((error) => {
                const statusEl = document.getElementById('captureStatus');
                if (statusEl) statusEl.innerText = 'Error: ' + error.message;
                console.error('[Capture] Error saving file:', error);
              });
          }
        } catch (error) {
          const statusEl = document.getElementById('captureStatus');
          if (statusEl) statusEl.innerText = 'Error converting to WAV: ' + error.message;
          console.error('[Capture] Error converting audio:', error);
        }
      };
      fileReader.readAsArrayBuffer(pendingAudioBlob);
    } catch (error) {
      const statusEl = document.getElementById('captureStatus');
      if (statusEl) statusEl.innerText = 'Error: ' + error.message;
      console.error('[Capture] Error:', error);
    }
  }

  function setLayoutState(enabled) {
    if (!appEl || !miniContainer) return;
    document.body.setAttribute('data-layout', enabled ? 'mini' : 'normal');
    miniContainer.hidden = !enabled;
  }

  function enable(options) {
    isMiniMode = true;
    if (miniModuleSelect && options && options.moduleId) {
      miniModuleSelect.value = options.moduleId;
    }
    if (miniCornerSelect && options && options.corner) {
      miniCornerSelect.value = options.corner;
    }
    applyModule((options && options.moduleId) || (miniModuleSelect && miniModuleSelect.value) || 'panel-vectorscope');
    setLayoutState(true);
  }

  function disable() {
    isMiniMode = false;
    
    // Clean up capture state
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    recordedChunks = [];
    pendingAudioBlob = null;
    
    // Clean up clip buffer
    stopClipRecording();
    
    // Restore panels BEFORE changing layout to allow ResizeObservers to measure correctly
    restoreAllPanels();
    
    // Clear minimode visuals
    miniMetersWrap.hidden = false;
    miniMetersWrap.style.display = '';
    
    // Change layout state - this will trigger CSS reflow in vizGrid
    setLayoutState(false);
    
    // After layout change, trigger multiple resize events with increasing delays
    // to give layout engine time to compute grid and ResizeObservers to fire
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 600);
  }

  function init(options = {}) {
    callbacks.onModuleChange = options.onModuleChange || null;
    callbacks.onCornerChange = options.onCornerChange || null;
    callbacks.onExit = options.onExit || null;

    appEl = document.getElementById('app');
    miniContainer = document.getElementById('miniModeContainer');
    miniBody = document.getElementById('miniModeBody');
    miniMetersWrap = document.getElementById('miniMetersWrap');
    miniModuleSelect = document.getElementById('miniModuleSelect');
    miniCornerSelect = document.getElementById('miniCornerSelect');
    miniExitBtn = document.getElementById('miniExitBtn');
    miniCanvas = document.getElementById('miniMetersCanvas');
    miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null;

    captureOriginalParents();

    if (options.initialModuleId && miniModuleSelect) miniModuleSelect.value = options.initialModuleId;
    if (options.initialCorner && miniCornerSelect) miniCornerSelect.value = options.initialCorner;

    if (miniModuleSelect) {
      miniModuleSelect.addEventListener('change', () => {
        applyModule(miniModuleSelect.value);
        if (callbacks.onModuleChange) callbacks.onModuleChange(miniModuleSelect.value);
      });
    }

    // Setup CLIP button
    const clipBtn = document.getElementById('miniClipBtn');
    if (clipBtn) {
      clipBtn.addEventListener('click', showClipDurationDialog);
    }

    if (miniCornerSelect) {
      miniCornerSelect.addEventListener('change', () => {
        if (callbacks.onCornerChange) callbacks.onCornerChange(miniCornerSelect.value);
      });
    }

    if (miniExitBtn) {
      miniExitBtn.addEventListener('click', () => {
        if (callbacks.onExit) callbacks.onExit();
      });
    }

    // Setup capture buttons
    const captureStartBtn = document.getElementById('captureStartBtn');
    const captureStopBtn = document.getElementById('captureStopBtn');
    
    if (captureStartBtn) {
      captureStartBtn.addEventListener('click', () => {
        // Get audio stream from the app
        if (window.appAudioStream) {
          startCaptureRecording(window.appAudioStream);
        } else {
          const statusEl = document.getElementById('captureStatus');
          if (statusEl) statusEl.innerText = 'Error: Audio stream not available';
        }
      });
    }
    
    if (captureStopBtn) {
      captureStopBtn.addEventListener('click', () => {
        stopCaptureRecording();
      });
    }

    const captureOpenBtn = document.getElementById('captureOpenBtn');
    if (captureOpenBtn) {
      captureOpenBtn.addEventListener('click', () => {
        if (window.electron && window.electron.openCapturesFolder) {
          window.electron.openCapturesFolder()
            .then(() => {
              console.log('[Capture] Opened captures folder');
            })
            .catch((error) => {
              console.error('[Capture] Failed to open folder:', error);
            });
        }
      });
    }

    if (miniCanvas && window.ResizeObserver) {
      miniCanvasRO = new ResizeObserver(() => setMiniCanvasSize());
      miniCanvasRO.observe(miniCanvas);
    }

    setLayoutState(false);
  }

  window.MiniModeController = {
    init,
    enable,
    disable,
    drawMiniMeters,
    initializeClipBuffer,
    isMiniMode: () => isMiniMode,
    getModule: () => currentModuleId,
    getCorner: () => (miniCornerSelect ? miniCornerSelect.value : 'top-right')
  };
})();
