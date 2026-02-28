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
  let currentModuleId = 'miniMeters';
  let originalParents = new Map();
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
        console.log('[MiniMode] Canvas size check:', canvas.id, rect.width, 'x', rect.height);
        if (rect.width > 0 && rect.height > 0) {
          const w = Math.round(rect.width * dpr);
          const h = Math.round(rect.height * dpr);
          console.log('[MiniMode] Setting canvas to:', w, 'x', h, 'dpr:', dpr);
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
    currentModuleId = moduleId || 'miniMeters';

    restoreAllPanels();

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
    applyModule((options && options.moduleId) || (miniModuleSelect && miniModuleSelect.value) || 'miniMeters');
    setLayoutState(true);
  }

  function disable() {
    isMiniMode = false;
    
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
    isMiniMode: () => isMiniMode,
    getModule: () => currentModuleId,
    getCorner: () => (miniCornerSelect ? miniCornerSelect.value : 'top-right')
  };
})();
