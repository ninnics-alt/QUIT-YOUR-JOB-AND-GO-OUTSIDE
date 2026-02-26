/**
 * GoniometerPanel: Hardware-grade XY stereo visualization with persistence, heatmap, and multiple rendering modes.
 * Canvas2D only, 60fps, no per-frame allocations, theme-aware.
 */
class GoniometerPanel {
  constructor(canvasElement) {
    if (!canvasElement) throw new Error('GoniometerPanel requires canvas element');
    
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    
    // Rendering modes
    this.mode = 'PHOSPHOR'; // PHOSPHOR, DOTS, RIBBON, L/R, HEATMAP
    this.mapping = 'LR'; // LR (Left/Right) or MS (Mid/Side)
    this.autoGain = true;
    this.showGrid = true;
    this.showAxes = true;
    
    // Heatmap bin dimensions (preallocated)
    this.heatmapResolution = 256; // bins per axis
    this.heatmapBins = new Uint8Array(this.heatmapResolution * this.heatmapResolution);
    this.heatmapMax = 0;
    
    // Persistence canvas (for phosphor/ribbon modes)
    this.persistenceCanvas = document.createElement('canvas');
    this.persistenceCtx = this.persistenceCanvas.getContext('2d');
    
    // Point accumulation (preallocated for each frame)
    this.maxPoints = 4096;
    this.pointsX = new Float32Array(this.maxPoints);
    this.pointsY = new Float32Array(this.maxPoints);
    this.pointCount = 0;
    
    // Precomputed metrics
    this.lastCorr = 0;
    this.lastWidth = 0; // L/R balance in %
    this.lastBalance = 0; // dB difference
    this.lastAutoGainScale = 1.0;
    this.lastDrawRect = null;
    
    // Offscreen heatmap canvas (preallocated)
    this.heatmapCanvas = document.createElement('canvas');
    this.heatmapCanvas.width = this.heatmapResolution;
    this.heatmapCanvas.height = this.heatmapResolution;
    
    // Cache for theme-dependent resources
    this.themeVersion = -1;
    this.cachedColors = null;
    
    // ResizeObserver for DPR and size changes
    this.resizeObserver = null;
    this._setupResizeObserver();
    
    // Initial setup - ensure canvas is sized on first load
    this._updateCanvasSize();
    
    // If canvas still has no size, add a small delay to let DOM layout complete
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      setTimeout(() => this._updateCanvasSize(), 100);
    }
  }
  
  _setupResizeObserver() {
    if (!window.ResizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      this._updateCanvasSize();
    });
    this.resizeObserver.observe(this.canvas);
  }
  
  _updateCanvasSize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.resetTransform?.() || this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    
    this.persistenceCanvas.width = w * dpr;
    this.persistenceCanvas.height = h * dpr;
    this.persistenceCtx.resetTransform?.() || this.persistenceCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.persistenceCtx.scale(dpr, dpr);
    
    this.dpr = dpr;
    this.lastDrawRect = null; // invalidate cache
  }
  
  _getDrawRect() {
    if (this.lastDrawRect) return this.lastDrawRect;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return (this.lastDrawRect = { w, h, cx: w / 2, cy: h / 2 });
  }
  
  _getColors() {
    if (THEME.version === this.themeVersion && this.cachedColors) {
      return this.cachedColors;
    }
    
    const colors = THEME.colors;
    const parsed = {
      accentA: UIHelpers._parseRGB(colors.accentA),
      accentB: UIHelpers._parseRGB(colors.accentB),
      text: UIHelpers._parseRGB(colors.text),
      textMuted: UIHelpers._parseRGB(colors.textMuted),
      grid: UIHelpers._parseRGB(colors.grid),
      bgInset: UIHelpers._parseRGB(colors.bgInset),
      border: colors.border,
    };
    
    this.cachedColors = parsed;
    this.themeVersion = THEME.version;
    return parsed;
  }
  
  /**
   * Main render entry point
   */
  render(leftArray, rightArray) {
    if (!leftArray || !rightArray) return;
    
    // Initialize render counter
    if (this.renderCount === undefined) this.renderCount = 0;
    this.renderCount++;
    
    // Ensure canvas is sized correctly
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      this._updateCanvasSize();
    }
    
    // Bail if still no size
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      if (!this._sizeWarned) {
        this._sizeWarned = true;
        console.warn('[Goniometer] Canvas has no size:', this.canvas.width, 'x', this.canvas.height, 'client:', this.canvas.clientWidth, 'x', this.canvas.clientHeight);
      }
      return;
    }
    
    const { w, h, cx, cy } = this._getDrawRect();
    const colors = this._getColors();
    const len = Math.min(leftArray.length, rightArray.length);
    
    // Compute metrics
    this._computeMetrics(leftArray, rightArray, len);
    
    // Map samples
    const mapped = this._mapSamples(leftArray, rightArray, len);
    
    // Auto-gain
    if (this.autoGain) {
      this._applyAutoGain(mapped);
    }
    
    // Accumulate points for this frame
    this._accumulatePoints(mapped, len, cx, cy);
    
    // Render based on mode
    switch (this.mode) {
      case 'PHOSPHOR':
        this._renderPhosphor(cx, cy, colors);
        break;
      case 'DOTS':
        this._renderDots(cx, cy, colors);
        break;
      case 'RIBBON':
        this._renderRibbon(cx, cy, colors);
        break;
      case 'L/R':
        this._renderStereo(leftArray, rightArray, len, cx, cy, colors, mapped);
        break;
      case 'HEATMAP':
        this._renderHeatmap(cx, cy, colors);
        break;
      default:
        this._renderPhosphor(cx, cy, colors);
    }
    
    // Draw overlays
    this._drawOverlays(cx, cy, colors);
    
    // DOOM theme: Glyph grid overlay (after overlays so visible)
    if (typeof DoomGlyphs !== 'undefined' && window.THEME && window.THEME.currentPalette === 'doom') {
      const dpr = this.dpr || 1;
      DoomGlyphs.drawGlyphGrid(this.ctx, 0, 0, w, h, dpr, 160, 0.25);
    }
    
    // DOOM theme: Sigil calibration rings
    if (typeof DoomSigils !== 'undefined' && window.THEME && window.THEME.currentPalette === 'doom') {
      const maxR = Math.min(w / 2, h / 2) - 20;
      const time = performance.now() / 1000;
      DoomSigils.drawCalibration(this.ctx, cx, cy, maxR, time);
    }
    
    // Draw HUD
    this._drawHUD(w, h, colors);
    
    // Apply theme overlays (scanlines, noise, glitter)
    if (window.CanvasOverlays) {
      const detailNum = window.detailLevel === 'high' ? 2 : (window.detailLevel === 'med' ? 1 : 0);
      const time = performance.now() / 1000;
      window.CanvasOverlays.applyThemeOverlays(this.ctx, w, h, detailNum, time);
    }
    
    // DOOM reactive effects (shockwave + border flare)
    if (window.THEME && window.THEME.currentPalette === 'doom' && window.DOOM_FX) {
      const pad = 10;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
      this.ctx.clip();
      window.DOOM_FX.drawShockwave(this.ctx, w, h);
      window.DOOM_FX.drawBorderFlare(this.ctx, w, h, pad);
      this.ctx.restore();
    }
  }
  
  /**
   * Map left/right to XY or mid/side
   */
  _mapSamples(L, R, len) {
    const mapping = this.mapping;
    const mapped = { x: new Float32Array(len), y: new Float32Array(len) };
    
    if (mapping === 'MS') {
      // Mid = (L+R)/2, Side = (L-R)/2
      for (let i = 0; i < len; i += 4) {
        const l = L[i], r = R[i];
        mapped.x[i] = (l + r) / 2;
        mapped.y[i] = (l - r) / 2;
      }
    } else {
      // Direct L/R mapping
      for (let i = 0; i < len; i += 4) {
        mapped.x[i] = L[i];
        mapped.y[i] = R[i];
      }
    }
    
    return mapped;
  }
  
  /**
   * Auto-gain: scale so trace uses ~80% of available radius
   */
  _applyAutoGain(mapped) {
    let maxDist = 0;
    for (let i = 0; i < mapped.x.length; i++) {
      const d = Math.hypot(mapped.x[i], mapped.y[i]);
      maxDist = Math.max(maxDist, d);
    }
    
    if (maxDist < 0.01) {
      this.lastAutoGainScale = 1.0;
      return;
    }
    
    const targetDist = 0.8; // 80% of allowed radius (1.0)
    const scale = targetDist / maxDist;
    
    for (let i = 0; i < mapped.x.length; i++) {
      mapped.x[i] *= scale;
      mapped.y[i] *= scale;
    }
    
    this.lastAutoGainScale = scale;
  }
  
  /**
   * Accumulate XY points for rendering later
   */
  _accumulatePoints(mapped, len, cx, cy) {
    this.pointCount = 0;
    const maxR = Math.min(cx, cy) - 20;
    
    for (let i = 0; i < len && this.pointCount < this.maxPoints; i += 4) {
      const x = mapped.x[i];
      const y = mapped.y[i];
      const dist = Math.hypot(x, y);
      
      if (dist > 0.01) { // Skip near-zero samples
        // Normalize to unit circle, then scale to canvas
        const norm = dist > 1.0 ? 1.0 / dist : 1.0;
        const px = cx + x * norm * maxR;
        const py = cy + y * norm * maxR;
        
        this.pointsX[this.pointCount] = px;
        this.pointsY[this.pointCount] = py;
        this.pointCount++;
      }
    }
  }
  
  /**
   * Compute correlation, width, balance
   */
  _computeMetrics(L, R, len) {
    let sumL = 0, sumR = 0, sumLL = 0, sumRR = 0, sumLR = 0;
    let sumM = 0, sumS = 0, sumMM = 0, sumSS = 0; // Mid/Side
    
    for (let i = 0; i < len; i += 4) {
      const a = L[i], b = R[i];
      sumL += a; sumR += b;
      sumLL += a * a; sumRR += b * b;
      sumLR += a * b;
      
      // Mid/Side decomposition
      const mid = (a + b) / 2;
      const side = (a - b) / 2;
      sumM += mid;
      sumS += side;
      sumMM += mid * mid;
      sumSS += side * side;
    }
    
    const m = len / 4 || 1;
    
    // Correlation
    const cov = sumLR / m - (sumL / m) * (sumR / m);
    const stdL = Math.sqrt(Math.max(0, sumLL / m - (sumL / m) ** 2));
    const stdR = Math.sqrt(Math.max(0, sumRR / m - (sumR / m) ** 2));
    this.lastCorr = stdL * stdR > 0 ? cov / (stdL * stdR) : 0;
    this.lastCorr = Math.max(-1, Math.min(1, this.lastCorr));
    
    // Width: based on side vs mid energy (LUFs-style stereo Width)
    const rmsM = Math.sqrt(sumMM / m);
    const rmsS = Math.sqrt(sumSS / m);
    const totalStereoEnergy = rmsM + rmsS;
    this.lastWidth = totalStereoEnergy > 0.001 ? (rmsS / totalStereoEnergy) * 100 : 0;
    
    // Balance: L/R level difference in dB
    const rmsL = Math.sqrt(sumLL / m);
    const rmsR = Math.sqrt(sumRR / m);
    if (rmsL > 0.001 && rmsR > 0.001) {
      const ratio = Math.max(rmsL, rmsR) / Math.min(rmsL, rmsR);
      this.lastBalance = 20 * Math.log10(ratio);
      // Make it negative if R is louder
      if (rmsR > rmsL) this.lastBalance = -this.lastBalance;
    } else {
      this.lastBalance = 0;
    }
    
  }
  
  /**
   * PHOSPHOR mode: persistence via offscreen buffer with fade
   */
  _renderPhosphor(cx, cy, colors) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    // Fade persistence buffer
    const [bgr, bgg, bgb] = colors.bgInset;
    this.persistenceCtx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.06)`;
    this.persistenceCtx.fillRect(0, 0, w, h);
    
    // Draw new samples to persistence using lighter composite
    this.persistenceCtx.globalCompositeOperation = 'lighter';
    const [acr, acg, acb] = colors.accentA;
    const traceColor = `rgb(${acr},${acg},${acb})`;
    
    // PS2 theme: chunkier traces
    const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
    const isDoom = window.THEME && window.THEME.currentPalette === 'doom';
    const traceWidth = isPS2 ? 2.0 : (isDoom ? 1.8 : 1.5);
    
    // DOOM theme: use charred phosphor effect
    if (isDoom && window.DOOM_FX && this.pointCount > 1) {
      // Convert point arrays to points object for charred phosphor
      const points = [];
      for (let i = 0; i < this.pointCount; i++) {
        points.push({ x: this.pointsX[i], y: this.pointsY[i] });
      }
      // Draw charred phosphor directly to persistence buffer
      window.DOOM_FX.drawCharedPhosphorTrace(this.persistenceCtx, points, traceColor, 1.2, 4);
    } else {
      // Standard trace rendering
      for (let i = 0; i < this.pointCount - 1; i++) {
        const x1 = this.pointsX[i], y1 = this.pointsY[i];
        const x2 = this.pointsX[i + 1], y2 = this.pointsY[i + 1];
        
        this.persistenceCtx.strokeStyle = `rgba(${acr},${acg},${acb},0.8)`;
        this.persistenceCtx.lineWidth = traceWidth;
        this.persistenceCtx.beginPath();
        this.persistenceCtx.moveTo(x1, y1);
        this.persistenceCtx.lineTo(x2, y2);
        this.persistenceCtx.stroke();
      }
    }
    
    this.persistenceCtx.globalCompositeOperation = 'source-over';
    
    // Clear main canvas and copy persistence buffer
    this.ctx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.15)`;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.drawImage(this.persistenceCanvas, 0, 0, w, h);
  }
  
  /**
   * DOTS mode: classical point cloud, no trails
   */
  _renderDots(cx, cy, colors) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    // Clear background
    const [bgr, bgg, bgb] = colors.bgInset;
    this.ctx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.3)`;
    this.ctx.fillRect(0, 0, w, h);
    
    // Draw points
    const [acr, acg, acb] = colors.accentA;
    this.ctx.fillStyle = `rgba(${acr},${acg},${acb},0.9)`;
    
    for (let i = 0; i < this.pointCount; i++) {
      const x = this.pointsX[i], y = this.pointsY[i];
      this.ctx.beginPath();
      this.ctx.arc(x, y, 1, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  /**
   * RIBBON mode: short segments with fading trails
   */
  _renderRibbon(cx, cy, colors) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    // Fade persistence
    const [bgr, bgg, bgb] = colors.bgInset;
    this.persistenceCtx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.04)`;
    this.persistenceCtx.fillRect(0, 0, w, h);
    
    // Draw short segments with varying opacity
    const [acr, acg, acb] = colors.accentA;
    const segmentLength = 8; // short segments
    // PS2 theme: chunkier traces
    const isPS2 = window.THEME && window.THEME.currentPalette === 'ps2';
    const traceWidth = isPS2 ? 1.7 : 1.2;
    
    for (let i = 0; i < this.pointCount; i++) {
      if ((i + segmentLength) >= this.pointCount) break;
      
      const x1 = this.pointsX[i], y1 = this.pointsY[i];
      const x2 = this.pointsX[i + segmentLength], y2 = this.pointsY[i + segmentLength];
      
      // Fade opacity based on segment age
      const ageRatio = i / this.pointCount;
      const opacity = 1.0 - ageRatio * 0.7; // newer segments brighter
      
      this.persistenceCtx.strokeStyle = `rgba(${acr},${acg},${acb},${opacity})`;
      this.persistenceCtx.lineWidth = traceWidth;
      this.persistenceCtx.beginPath();
      this.persistenceCtx.moveTo(x1, y1);
      this.persistenceCtx.lineTo(x2, y2);
      this.persistenceCtx.stroke();
    }
    
    // Clear and copy to main
    this.ctx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.15)`;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.drawImage(this.persistenceCanvas, 0, 0, w, h);
  }
  
  /**
   * L/R stereo separation mode: separate traces in accent colors
   */
  _renderStereo(L, R, len, cx, cy, colors, mapped) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    // Clear
    const [bgr, bgg, bgb] = colors.bgInset;
    this.ctx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.3)`;
    this.ctx.fillRect(0, 0, w, h);
    
    const maxR = Math.min(cx, cy) - 20;
    
    // Draw L channel in accentA
    const [acr, acg, acb] = colors.accentA;
    this.ctx.strokeStyle = `rgba(${acr},${acg},${acb},0.7)`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    let first = true;
    
    for (let i = 0; i < len; i += 8) {
      const val = L[i];
      const norm = Math.max(0, Math.min(1, (val + 1) / 2)); // normalize to 0-1
      const angle = norm * Math.PI * 2;
      const x = cx + Math.cos(angle) * maxR * 0.7;
      const y = cy + Math.sin(angle) * maxR * 0.7;
      if (first) {
        this.ctx.moveTo(x, y);
        first = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
    
    // Draw R channel in accentB
    const [acr2, acg2, acb2] = colors.accentB;
    this.ctx.strokeStyle = `rgba(${acr2},${acg2},${acb2},0.7)`;
    this.ctx.beginPath();
    first = true;
    
    for (let i = 0; i < len; i += 8) {
      const val = R[i];
      const norm = Math.max(0, Math.min(1, (val + 1) / 2));
      const angle = norm * Math.PI * 2 + Math.PI / 2;
      const x = cx + Math.cos(angle) * maxR * 0.7;
      const y = cy + Math.sin(angle) * maxR * 0.7;
      if (first) {
        this.ctx.moveTo(x, y);
        first = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
  }
  
  /**
   * HEATMAP mode: density-based accumulation
   */
  _renderHeatmap(cx, cy, colors) {
    // Clear background
    const [bgr, bgg, bgb] = colors.bgInset;
    this.ctx.fillStyle = `rgba(${bgr},${bgg},${bgb},0.3)`;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.fillRect(0, 0, w, h);
    
    // Fade heatmap decay
    for (let i = 0; i < this.heatmapBins.length; i++) {
      this.heatmapBins[i] = Math.max(0, this.heatmapBins[i] - 1);
    }
    
    // Accumulate points into bins
    const maxR = Math.min(cx, cy) - 20;
    for (let i = 0; i < this.pointCount; i++) {
      const px = this.pointsX[i];
      const py = this.pointsY[i];
      
      // Map to bin coordinates
      const normX = (px - (cx - maxR)) / (maxR * 2);
      const normY = (py - (cy - maxR)) / (maxR * 2);
      
      if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
        const binX = Math.floor(normX * this.heatmapResolution);
        const binY = Math.floor(normY * this.heatmapResolution);
        const idx = binY * this.heatmapResolution + binX;
        
        if (idx >= 0 && idx < this.heatmapBins.length) {
          this.heatmapBins[idx] = Math.min(255, this.heatmapBins[idx] + 8);
          this.heatmapMax = Math.max(this.heatmapMax, this.heatmapBins[idx]);
        }
      }
    }
    
    // Render heatmap as image data
    const [acr, acg, acb] = colors.accentA;
    const heatmapCtx = this.heatmapCanvas.getContext('2d');
    const imageData = heatmapCtx.createImageData(this.heatmapResolution, this.heatmapResolution);
    const data = imageData.data;
    
    for (let i = 0; i < this.heatmapBins.length; i++) {
      const intensity = this.heatmapBins[i] / Math.max(1, this.heatmapMax);
      const alpha = Math.floor(intensity * 200); // max alpha 200
      
      data[i * 4 + 0] = acr;
      data[i * 4 + 1] = acg;
      data[i * 4 + 2] = acb;
      data[i * 4 + 3] = alpha;
    }
    
    heatmapCtx.putImageData(imageData, 0, 0);
    
    // Scale and position
    const mapSize = maxR * 2;
    this.ctx.drawImage(
      this.heatmapCanvas,
      cx - maxR, cy - maxR,
      mapSize, mapSize
    );
  }
  
  /**
   * Draw overlay lines and guides
   */
  _drawOverlays(cx, cy, colors) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const maxR = Math.min(w / 2, h / 2) - 20;
    const [gridr, gridg, gridb] = colors.grid;
    
    // Mono axis (45°) - brighter
    this.ctx.strokeStyle = `rgba(${gridr},${gridg},${gridb},0.6)`;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    const monoLen = maxR * 0.9;
    this.ctx.moveTo(cx - monoLen / Math.sqrt(2), cy - monoLen / Math.sqrt(2));
    this.ctx.lineTo(cx + monoLen / Math.sqrt(2), cy + monoLen / Math.sqrt(2));
    this.ctx.stroke();
    
    // Anti-phase axis (-45°) - faint
    this.ctx.strokeStyle = `rgba(${gridr},${gridg},${gridb},0.2)`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx + monoLen / Math.sqrt(2), cy - monoLen / Math.sqrt(2));
    this.ctx.lineTo(cx - monoLen / Math.sqrt(2), cy + monoLen / Math.sqrt(2));
    this.ctx.stroke();
    
    if (this.showGrid) {
      this.ctx.strokeStyle = `rgba(${gridr},${gridg},${gridb},0.15)`;
      this.ctx.lineWidth = 0.5;
      
      // Circles at 25%, 50%, 75%
      for (let r of [0.25, 0.5, 0.75]) {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
    
    // Center dot
    this.ctx.fillStyle = `rgba(${gridr},${gridg},${gridb},0.5)`;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  /**
   * Draw HUD with Corr, Width, Balance, Mono Risk
   */
  _drawHUD(w, h, colors) {
    // Make sure we have valid dimensions
    if (w <= 0 || h <= 0) return;
    
    const [textr, textg, textb] = colors.text;
    const [mutedR, mutedG, mutedB] = colors.textMuted;
    const [bgr, bgg, bgb] = colors.bgInset;
    
    // Bottom HUD background
    this.ctx.fillStyle = `rgba(${bgr}, ${bgg}, ${bgb}, 0.4)`;
    this.ctx.fillRect(0, h - 44, w, 44);
    this.ctx.strokeStyle = colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0, h - 44, w, 44);
    
    // Small font for HUD
    this.ctx.font = '10px monospace';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = `rgba(${textr},${textg},${textb},0.9)`;
    
    const y1 = h - 34;
    const y2 = h - 18;
    const margin = 8;
    
    // Correlation
    const corrColor = this.lastCorr < 0.2 ? `rgba(255,100,100,0.8)` : `rgba(${textr},${textg},${textb},0.8)`;
    this.ctx.fillStyle = corrColor;
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Corr: ${this.lastCorr.toFixed(2)}`, margin, y1);
    
    // Width
    this.ctx.fillStyle = `rgba(${textr},${textg},${textb},0.8)`;
    this.ctx.fillText(`Width: ${this.lastWidth.toFixed(0)}%`, margin, y2);
    
    // Balance
    this.ctx.fillStyle = `rgba(${textr},${textg},${textb},0.8)`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Balance: ${this.lastBalance.toFixed(1)}dB`, w / 2, y1);
    
    // Mode display
    this.ctx.fillStyle = `rgba(${mutedR},${mutedG},${mutedB},0.6)`;
    this.ctx.fillText(`${this.mode}`, w / 2, y2);
    
    // Mono Risk indicator
    let riskText = '✓ OK';
    let riskColor = `rgba(100,255,100,0.8)`;
    if (this.lastCorr < 0.2) {
      riskText = '⚠ Mono Risk';
      riskColor = `rgba(255,150,0,0.9)`;
    }
    if (this.lastCorr < 0) {
      riskText = '✗ Anti-Phase';
      riskColor = `rgba(255,50,50,0.9)`;
    }
    
    this.ctx.fillStyle = riskColor;
    this.ctx.textAlign = 'right';
    this.ctx.fillText(riskText, w - margin, y1);
    
    // Mapping display
    this.ctx.fillStyle = `rgba(${mutedR},${mutedG},${mutedB},0.6)`;
    this.ctx.fillText(this.mapping === 'MS' ? 'Mid/Side' : 'L/R', w - margin, y2);
  }
  
  /**
   * Public API for mode switching
   */
  setMode(mode) {
    const validModes = ['PHOSPHOR', 'DOTS', 'RIBBON', 'L/R', 'HEATMAP'];
    if (validModes.includes(mode)) {
      this.mode = mode;
    }
  }
  
  /**
   * Public API for mapping switching
   */
  setMapping(mapping) {
    if (mapping === 'MS' || mapping === 'LR') {
      this.mapping = mapping;
    }
  }
  
  /**
   * Get available render modes
   */
  getModes() {
    return ['PHOSPHOR', 'DOTS', 'RIBBON', 'L/R', 'HEATMAP'];
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// Export to global scope
window.GoniometerPanel = GoniometerPanel;
