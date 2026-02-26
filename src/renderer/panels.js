/**
 * SPECIALIZED PANELS - Enhanced visualization panels
 * Waveform, Oscilloscope, Vectorscope, Spectrum panels with instrument detail
 */

/**
 * RingBufferF32 - Preallocated circular buffer for streaming samples
 * No allocations during push; O(1) writes with wraparound
 */
class RingBufferF32 {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.size = size;
    this.writeIndex = 0;
    this.filled = false; // True once wrapped around at least once
  }

  pushBlock(input) {
    const b = this.buf;
    let wi = this.writeIndex;
    const n = input.length;
    const size = this.size;
    for (let i = 0; i < n; i++) {
      b[wi++] = input[i];
      if (wi === size) { wi = 0; this.filled = true; }
    }
    this.writeIndex = wi;
  }

  // Read sample at absolute ring index (0..size-1) without copying
  at(index) {
    return this.buf[index];
  }

  // Extract window [startIdx..startIdx+length) circularly
  // Handles wraparound safely
  extract(startIdx, length) {
    const result = new Float32Array(length);
    const size = this.size;
    for (let i = 0; i < length; i++) {
      result[i] = this.buf[(startIdx + i) % size];
    }
    return result;
  }

  // Return most recent N samples (from writeIndex backwards)
  getLast(count) {
    const result = new Float32Array(count);
    const size = this.size;
    let idx = this.writeIndex - 1;
    if (idx < 0) idx = size - 1;
    for (let i = count - 1; i >= 0; i--) {
      result[i] = this.buf[idx];
      idx--;
      if (idx < 0) idx = size - 1;
    }
    return result;
  }
}

class WaveformPanel extends Panel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || 'Waveform';
    this.data = new Float32Array(1024);
    this.peakHold = 0;
    this.peakHoldTime = 0;
    this.centerlineY = 0;
  }

  render(parentCtx) {
    const headerH = 28;
    const contentY = this.y + headerH;
    const contentH = this.height - headerH - 24;
    const { colors, spacing, fonts } = THEME;

    // Header
    this._renderHeader(parentCtx);

    // Content background
    parentCtx.fillStyle = colors.bgSecondary;
    parentCtx.fillRect(this.x, contentY, this.width, contentH);

    // Grid
    if (this.detailLevel !== 'low') {
      UIHelpers.drawGrid(parentCtx, this.x, contentY, this.width, contentH, contentH / 4, contentH / 16 / 4);
    }

    // Glyph grid overlay (after grid so visible)
    if (typeof DoomGlyphs !== 'undefined') {
      const dpr = window.devicePixelRatio || 1;
      DoomGlyphs.drawGlyphGrid(parentCtx, this.x, contentY, this.width, contentH, dpr, 160, 0.25);
    }

    // Centerline (brighter)
    this.centerlineY = contentY + contentH / 2;
    parentCtx.strokeStyle = colors.accentBlue;
    parentCtx.lineWidth = 1.5;
    parentCtx.setLineDash([4, 4]);
    parentCtx.beginPath();
    parentCtx.moveTo(this.x, this.centerlineY);
    parentCtx.lineTo(this.x + this.width, this.centerlineY);
    parentCtx.stroke();
    parentCtx.setLineDash([]);

    // Amplitude tick marks (if med or high detail)
    if (this.detailLevel !== 'low') {
      const ampTicks = [
        { pos: 0, label: '-1.0' },
        { pos: 25, label: '-0.5' },
        { pos: 50, label: '0' },
        { pos: 75, label: '0.5' },
        { pos: 100, label: '1.0' },
      ];
      UIHelpers.drawAxisTicks(parentCtx, this.x + 5, contentY, contentH, true, ampTicks, 3);
    }

    // Draw waveform
    this._drawWaveformData(parentCtx, contentY, contentH);

    // Peak hold indicator (small capsule at top)
    if (this.peakHold > 0.01) {
      const peakY = this.centerlineY - (this.peakHold * contentH / 2);
      parentCtx.fillStyle = colors.accentRed;
      parentCtx.fillRect(this.x + this.width - 30, peakY - 2, 20, 4);
    }

    // Scanlines
    if (this.detailLevel === 'high') {
      UIHelpers.drawScanlines(parentCtx, this.x, contentY, this.width, contentH);
    }

    // Status
    this.setStatus(`Peak: ${this.peakHold.toFixed(3)} | Clip: ${this.peakHold > 0.95 ? 'YES' : 'NO'}`);
    this._renderStatusLine(parentCtx);
  }

  _drawWaveformData(ctx, contentY, contentH) {
    const { colors } = THEME;
    const centerY = contentY + contentH / 2;

    ctx.strokeStyle = colors.accentGreen;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const pixelPerSample = this.width / this.data.length;
    let firstPoint = true;

    for (let i = 0; i < this.data.length; i++) {
      const sample = this.data[i];
      const x = this.x + i * pixelPerSample;
      const y = centerY - (sample * contentH / 2);

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }

      // Track peak
      if (Math.abs(sample) > this.peakHold) {
        this.peakHold = Math.abs(sample);
        this.peakHoldTime = Date.now();
      }
    }

    ctx.stroke();

    // Decay peak hold
    const elapsed = Date.now() - this.peakHoldTime;
    if (elapsed > THEME.performance.peakHoldDecay) {
      this.peakHold *= 0.95; // Fade
    }
  }

  updateData(floatData) {
    this.data = floatData || new Float32Array(1024);
  }
}

/**
 * OSCILLOSCOPE PANEL - Trigger-locked, decimated, phosphor trails
 * Features: RingBuffer sample storage, rising-edge trigger detection,
 * min/max decimation per pixel, persistence canvas for trails
 */
class OscilloscopePanel extends Panel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || 'Oscilloscope';

    // Sample ring buffers (stereo, continuous streaming)
    const bufSize = 192000; // 4 seconds at 48kHz (enough for sustained viewing)
    this.ringBufferL = new RingBufferF32(bufSize);
    this.ringBufferR = new RingBufferF32(bufSize);

    // Timebase settings: ms per division
    this.timebases = [1, 2, 5, 10, 20, 50, 100]; // ms/div
    this.timebaseIdx = 4; // Start at 20ms/div
    this.divCount = 10; // Always 10 divisions visible

    // Trigger settings
    this.triggerLevel = 0.0;
    this.triggerChannel = 'L'; // L or R
    this.triggerIndex = 0;

    // Persistence buffer (offscreen canvas)
    const w = options.width || 1024;
    const h = options.height || 256;
    this.persistenceCanvas = document.createElement('canvas');
    this.persistenceCanvas.width = w;
    this.persistenceCanvas.height = h;
    this.persistenceCtx = this.persistenceCanvas.getContext('2d');
    this.fadeAlpha = 0.05; // Persistence fade per frame

    // Decimation working arrays (pre-allocated)
    this.decimated = new Float32Array(w);
    this.decimatedMin = new Float32Array(w);
    this.decimatedMax = new Float32Array(w);

    // Stats for readout
    this.msPerDiv = 20;
    this.peakL = 0;
    this.peakR = 0;
    this.rmsL = 0;
    this.rmsR = 0;
    this.clipL = false;
    this.clipR = false;
  }

  render(parentCtx) {
    const headerH = 28;
    const contentY = this.y + headerH;
    const contentH = this.height - headerH - 56; // Leave room for readout strip
    const { colors, spacing, fonts } = THEME;

    // Header
    this._renderHeader(parentCtx);

    // Content background
    parentCtx.fillStyle = colors.bgSecondary;
    parentCtx.fillRect(this.x, contentY, this.width, contentH);

    // === STEP 1: Fade persistence buffer (phosphor decay) ===
    const [r, g, b] = UIHelpers._parseRGB(colors.bgInset);
    this.persistenceCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.fadeAlpha})`;
    this.persistenceCtx.fillRect(0, 0, this.persistenceCanvas.width, this.persistenceCanvas.height);

    // === STEP 2: Draw grid (cached if possible) ===
    if (this.detailLevel !== 'low') {
      const divH = contentH / this.divCount;
      const divW = this.width / this.divCount;
      UIHelpers.drawGrid(this.persistenceCtx, 0, 0, this.persistenceCanvas.width, contentH, divH, divW / 4);
    }

    // === STEP 3: Find trigger point in most recent window ===
    this.triggerIndex = this._findTriggerEdge();

    // === STEP 4: Extract and decimate time window ===
    const sampleCount = Math.floor((this.msPerDiv / 1000) * 48000 * this.divCount); // Total samples for visible window
    const startIdx = (this.triggerIndex - sampleCount / 2 + this.ringBufferL.size) % this.ringBufferL.size;

    const windowL = this.ringBufferL.extract(startIdx, sampleCount);
    const windowR = this.ringBufferR.extract(startIdx, sampleCount);

    // Decimate to pixel width
    this._decimateWindow(windowL, windowR, this.width);

    // === STEP 5: Draw trace on persistence buffer (soft) ===
    this._drawTraceOnPersistence(this.decimated, colors.accentGreen, 0.7, false);

    // Compute stats
    this._computeStats(windowL, windowR);

    // === STEP 6: Composite persistence → main canvas ===
    parentCtx.drawImage(this.persistenceCanvas, this.x, contentY);

    // === STEP 7: Draw crisp trace on top (main canvas) ===
    this._drawTraceCrisp(parentCtx, contentY, contentH, colors);

    // === STEP 8: Draw trigger level indicator ===
    const triggerY = contentY + (contentH / 2) - (this.triggerLevel * contentH / 2);
    parentCtx.strokeStyle = colors.accentYellow;
    parentCtx.lineWidth = 2;
    parentCtx.setLineDash([4, 4]);
    parentCtx.beginPath();
    parentCtx.moveTo(this.x, triggerY);
    parentCtx.lineTo(this.x + this.width, triggerY);
    parentCtx.stroke();
    parentCtx.setLineDash([]);

    // Centerline
    const centerY = contentY + contentH / 2;
    const [gr, gg, gb] = UIHelpers._parseRGB(colors.accentA);
    parentCtx.strokeStyle = `rgba(${gr},${gg},${gb},0.2)`;
    parentCtx.lineWidth = 1;
    parentCtx.setLineDash([2, 2]);
    parentCtx.beginPath();
    parentCtx.moveTo(this.x, centerY);
    parentCtx.lineTo(this.x + this.width, centerY);
    parentCtx.stroke();
    parentCtx.setLineDash([]);

    // Scanlines
    if (this.detailLevel === 'high') {
      UIHelpers.drawScanlines(parentCtx, this.x, contentY, this.width, contentH);
    }

    // === STEP 9: Draw readout strip (bottom) ===
    this._drawReadoutStrip(parentCtx, contentY + contentH, colors, fonts, spacing);

    const status = `${this.msPerDiv.toFixed(1)}ms/div | Trig: ${this.triggerLevel.toFixed(2)} | Peak L: ${this.peakL.toFixed(3)} R: ${this.peakR.toFixed(3)}`;
    this.setStatus(status);
    this._renderStatusLine(parentCtx);
  }

  _findTriggerEdge() {
    // Look for rising edge in recent samples on trigger channel
    const buf = this.triggerChannel === 'L' ? this.ringBufferL : this.ringBufferR;
    const searchLen = Math.floor(48000 * 0.2); // Search last 200ms
    const startSearch = (buf.writeIndex - searchLen + buf.size) % buf.size;

    // Scan backwards for rising edge across triggerLevel
    for (let i = searchLen - 1; i > 0; i--) {
      const idx = (startSearch + i + buf.size) % buf.size;
      const prev = buf.at((idx - 1 + buf.size) % buf.size);
      const curr = buf.at(idx);

      if (prev < this.triggerLevel && curr >= this.triggerLevel) {
        // Rising edge found!
        return idx;
      }
    }

    // Fallback: use most recent sample
    return buf.writeIndex;
  }

  _decimateWindow(windowL, windowR, pixelWidth) {
    const samplePerPixel = windowL.length / pixelWidth;

    // Pre-fill min/max arrays
    this.decimatedMin.fill(Infinity);
    this.decimatedMax.fill(-Infinity);

    for (let px = 0; px < pixelWidth; px++) {
      const startIdx = Math.floor(px * samplePerPixel);
      const endIdx = Math.floor((px + 1) * samplePerPixel);

      let min = Infinity, max = -Infinity, sum = 0;
      for (let i = startIdx; i < endIdx && i < windowL.length; i++) {
        const v = windowL[i];
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += Math.abs(v);
      }

      // Store decimated value (use max magnitude for visual impact)
      const endCount = Math.max(1, endIdx - startIdx);
      this.decimated[px] = Math.max(Math.abs(min), Math.abs(max));
      this.decimatedMin[px] = min === Infinity ? 0 : min;
      this.decimatedMax[px] = max === -Infinity ? 0 : max;
    }
  }

  _drawTraceOnPersistence(decimated, color, alpha, useMinMax) {
    const ctx = this.persistenceCtx;
    const w = this.persistenceCanvas.width;
    const h = this.persistenceCanvas.height;
    const centerY = h / 2;

    ctx.strokeStyle = color.replace(')', `, ${alpha})`); // Inject alpha
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let px = 0; px < w; px++) {
      const val = decimated[px];
      const y = centerY - (val * centerY);

      if (px === 0) {
        ctx.moveTo(px, y);
      } else {
        ctx.lineTo(px, y);
      }
    }

    ctx.stroke();
  }

  _drawTraceCrisp(ctx, contentY, contentH, colors) {
    const centerY = contentY + contentH / 2;

    ctx.strokeStyle = colors.accentGreen;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let px = 0; px < this.width; px++) {
      const val = this.decimated[px];
      const y = centerY - (val * contentH / 2);

      if (px === 0) {
        ctx.moveTo(this.x + px, y);
      } else {
        ctx.lineTo(this.x + px, y);
      }
    }

    ctx.stroke();
  }

  _computeStats(windowL, windowR) {
    let sumL = 0, sumR = 0, maxL = 0, maxR = 0;
    const n = windowL.length;

    for (let i = 0; i < n; i++) {
      const l = windowL[i], r = windowR[i];
      sumL += l * l;
      sumR += r * r;
      maxL = Math.max(maxL, Math.abs(l));
      maxR = Math.max(maxR, Math.abs(r));
    }

    this.peakL = maxL;
    this.peakR = maxR;
    this.rmsL = Math.sqrt(sumL / n);
    this.rmsR = Math.sqrt(sumR / n);
    this.clipL = maxL > 0.99;
    this.clipR = maxR > 0.99;
  }

  _drawReadoutStrip(ctx, stripY, colors, fonts, spacing) {
    const stripH = 24;
    ctx.fillStyle = colors.bgTertiary;
    ctx.fillRect(this.x, stripY, this.width, stripH);

    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, stripY, this.width, stripH);

    // Text readout
    ctx.fillStyle = colors.textSecondary;
    ctx.font = fonts.mono;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const y = stripY + stripH / 2;
    const text = `${this.msPerDiv.toFixed(1)}ms/div | L: ${this.peakL.toFixed(3)}${this.clipL ? ' CLIP' : ''} | R: ${this.peakR.toFixed(3)}${this.clipR ? ' CLIP' : ''} | RMS: ${this.rmsL.toFixed(4)}/${this.rmsR.toFixed(4)}`;
    ctx.fillText(text, this.x + spacing.md, y);

    // Timebase indicator (right side)
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.accentBlue;
    ctx.fillText(`Trig: ${this.triggerLevel.toFixed(2)}`, this.x + this.width - spacing.md, y);
  }

  updateData(leftData, rightData) {
    // Push new samples into ring buffers (no allocations)
    if (leftData) this.ringBufferL.pushBlock(leftData);
    if (rightData) this.ringBufferR.pushBlock(rightData);
  }

  // Allow UI to adjust settings
  setTimebase(idx) {
    this.timebaseIdx = Math.max(0, Math.min(idx, this.timebases.length - 1));
    this.msPerDiv = this.timebases[this.timebaseIdx];
  }

  setTriggerLevel(level) {
    this.triggerLevel = Math.max(-1, Math.min(1, level));
  }

  setTriggerChannel(ch) {
    this.triggerChannel = ch === 'R' ? 'R' : 'L';
  }
}

class SpectrumPanel extends Panel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || 'Spectrum';
    this.freqData = new Float32Array(256);
    this.rawBins = new Float32Array(256);
    this.smoothedBins = new Float32Array(256);
    this.peakBins = new Float32Array(256);
    this.logX = new Float32Array(256);
    this.labelX = new Float32Array(11);
    this.binCount = 256;
    this.sampleRate = 48000;
    this.minDb = -90;
    this.maxDb = -10;
    this.minFreq = 20;
    this.freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    this.hoverFreq = null;
    this.hoverDb = null;
    this.hoverX = null;
    this.logScale = true;
    this._rebuildLogMap();
  }

  render(parentCtx) {
    const headerH = 28;
    const contentY = this.y + headerH;
    const contentH = this.height - headerH - 24;
    const { colors, fonts, spacing } = THEME;
    const axisH = 16; // Space for frequency axis at bottom
    const drawX = this.x + spacing.md;
    const drawY = contentY + spacing.sm;
    const drawW = Math.max(1, this.width - spacing.md * 2);
    const drawH = Math.max(1, contentH - spacing.sm - axisH);

    // Header
    this._renderHeader(parentCtx);

    // Content background
    parentCtx.fillStyle = colors.bgSecondary;
    parentCtx.fillRect(this.x, contentY, this.width, contentH);

    // Grid + axes
    this._drawGrid(parentCtx, drawX, drawY, drawW, drawH, axisH);

    // Glyph grid overlay (after grid so visible)
    if (typeof DoomGlyphs !== 'undefined') {
      const dpr = window.devicePixelRatio || 1;
      DoomGlyphs.drawGlyphGrid(parentCtx, this.x, contentY, this.width, contentH, dpr, 160, 0.25);
    }

    // Draw spectrum
    this._drawSpectrum(parentCtx, drawX, drawY, drawW, drawH);

    // Hover readout
    if (this.hoverFreq !== null && this.detailLevel === 'high') {
      parentCtx.fillStyle = colors.accentBlue;
      parentCtx.font = fonts.monoSmall;
      parentCtx.textAlign = 'left';
      const text = `${this.hoverFreq.toFixed(0)}Hz / ${this.hoverDb.toFixed(1)}dB`;
      parentCtx.fillText(text, drawX, drawY);

      if (this.hoverX !== null) {
        parentCtx.strokeStyle = colors.accentBlue;
        parentCtx.lineWidth = 1;
        parentCtx.globalAlpha = 0.6;
        parentCtx.beginPath();
        parentCtx.moveTo(this.hoverX, drawY);
        parentCtx.lineTo(this.hoverX, drawY + drawH);
        parentCtx.stroke();
        parentCtx.globalAlpha = 1;
      }
    }

    // Scanlines
    if (this.detailLevel === 'high') {
      UIHelpers.drawScanlines(parentCtx, this.x, contentY, this.width, contentH);
    }

    this.setStatus(`${this.freqData.length} bins | ${(this.sampleRate / 2 / 1000).toFixed(1)}kHz Nyquist`);
    this._renderStatusLine(parentCtx);
  }

  _drawGrid(ctx, x, y, w, h, axisH) {
    const { colors, fonts } = THEME;
    const nyquist = this.sampleRate / 2;
    const logMin = Math.log10(this.minFreq);
    const logRange = Math.log10(Math.max(this.minFreq, nyquist)) - logMin;

    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 1;

    // Vertical log-frequency grid lines
    for (let i = 0; i < this.freqLabels.length; i++) {
      const freq = this.freqLabels[i];
      if (freq > nyquist) continue;
      const fx = (Math.log10(freq) - logMin) / logRange;
      const xPos = x + fx * w;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(xPos, y);
      ctx.lineTo(xPos, y + h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Frequency axis labels at bottom
    ctx.fillStyle = colors.textPrimary;
    ctx.font = fonts.monoSmall;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.freqLabels.length; i++) {
      const freq = this.freqLabels[i];
      if (freq > nyquist) continue;
      const fx = (Math.log10(freq) - logMin) / logRange;
      const xPos = x + fx * w;
      const label = freq >= 1000 ? (freq / 1000).toFixed(0) + 'k' : String(freq);
      ctx.fillText(label, xPos, y + h + 3);
    }
    ctx.globalAlpha = 1;

    // Horizontal dB lines
    const dbLines = [0, -20, -40, -60, -80];
    for (let i = 0; i < dbLines.length; i++) {
      const db = dbLines[i];
      const yPos = this._dbToY(db, y, h);
      ctx.strokeStyle = colors.gridDark;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, yPos);
      ctx.lineTo(x + w, yPos);
      ctx.stroke();

      if (this.detailLevel === 'high') {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colors.textSecondary;
        ctx.font = fonts.monoSmall;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${db} dB`, x - 6, yPos);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawSpectrum(ctx, x, y, w, h) {
    const { colors } = THEME;
    const bins = this.binCount;
    const alpha = this.detailLevel === 'high' ? 0.12 : (this.detailLevel === 'med' ? 0.1 : 0.08);
    const smoothA = this.detailLevel === 'high' ? 0.12 : (this.detailLevel === 'med' ? 0.18 : 0.28);
    const peakDecay = this.detailLevel === 'high' ? 0.25 : (this.detailLevel === 'med' ? 0.35 : 0.5);

    // Smooth + peak hold
    for (let i = 0; i < bins; i++) {
      const raw = this._clampDb(this.rawBins[i]);
      const sm = this.smoothedBins[i] + smoothA * (raw - this.smoothedBins[i]);
      this.smoothedBins[i] = sm;
      const peak = this.peakBins[i] - peakDecay;
      this.peakBins[i] = sm > peak ? sm : peak;
    }

    // Filled area
    ctx.fillStyle = colors.accentGreen;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let i = 0; i < bins; i++) {
      const xPos = x + this.logX[i] * w;
      const yPos = this._dbToY(this.smoothedBins[i], y, h);
      ctx.lineTo(xPos, yPos);
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Glow pass A
    ctx.strokeStyle = colors.accentBlue;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.25;
    ctx.shadowBlur = 4;
    ctx.shadowColor = colors.accentBlue;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const xPos = x + this.logX[i] * w;
      const yPos = this._dbToY(this.smoothedBins[i], y, h);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.stroke();

    // Pass B: crisp outline
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const xPos = x + this.logX[i] * w;
      const yPos = this._dbToY(this.smoothedBins[i], y, h);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Peak hold line
    ctx.strokeStyle = colors.textPrimary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const xPos = x + this.logX[i] * w;
      const yPos = this._dbToY(this.peakBins[i], y, h);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _dbToY(db, y, h) {
    const t = (db - this.minDb) / (this.maxDb - this.minDb);
    const clamped = Math.max(0, Math.min(1, t));
    return y + (1 - clamped) * h;
  }

  _clampDb(db) {
    if (db > this.maxDb) return this.maxDb;
    if (db < this.minDb) return this.minDb;
    return db;
  }

  _rebuildLogMap() {
    const nyquist = this.sampleRate / 2;
    const logMin = Math.log10(this.minFreq);
    const logRange = Math.log10(Math.max(this.minFreq, nyquist)) - logMin;
    const bins = this.binCount;
    for (let i = 0; i < bins; i++) {
      const freq = Math.max(this.minFreq, (i / Math.max(1, bins - 1)) * nyquist);
      const fx = (Math.log10(freq) - logMin) / logRange;
      this.logX[i] = Math.max(0, Math.min(1, fx));
    }
  }

  updateData(freqData, sampleRate) {
    if (sampleRate) this.sampleRate = sampleRate;
    if (!freqData) return;

    if (freqData.length !== this.binCount) {
      this.binCount = freqData.length;
      this.rawBins = new Float32Array(this.binCount);
      this.smoothedBins = new Float32Array(this.binCount);
      this.peakBins = new Float32Array(this.binCount);
      this.logX = new Float32Array(this.binCount);
      this._rebuildLogMap();
    }

    // If Float32Array from getFloatFrequencyData, use directly
    if (freqData instanceof Float32Array) {
      this.freqData = freqData;
      for (let i = 0; i < this.binCount; i++) {
        this.rawBins[i] = freqData[i];
      }
    } else {
      // Assume Uint8Array and map to dB range
      for (let i = 0; i < this.binCount; i++) {
        const v = freqData[i] / 255;
        this.rawBins[i] = this.minDb + v * (this.maxDb - this.minDb);
      }
    }
  }

  setHoverPos(freqBin, dbValue) {
    const nyquist = this.sampleRate / 2;
    if (Number.isInteger(freqBin)) {
      this.hoverFreq = (freqBin / Math.max(1, this.binCount - 1)) * nyquist;
    } else {
      this.hoverFreq = Math.max(this.minFreq, Math.min(nyquist, freqBin || this.minFreq));
    }

    if (dbValue > 0) {
      this.hoverDb = this.minDb + (dbValue / 255) * (this.maxDb - this.minDb);
    } else {
      this.hoverDb = dbValue;
    }

    const logMin = Math.log10(this.minFreq);
    const logRange = Math.log10(Math.max(this.minFreq, nyquist)) - logMin;
    const fx = (Math.log10(this.hoverFreq) - logMin) / logRange;
    this.hoverX = this.x + THEME.spacing.md + Math.max(0, Math.min(1, fx)) * (this.width - THEME.spacing.md * 2);
  }
}

class VectorScopePanel extends Panel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || 'Vectorscope';
    this.dataL = new Float32Array(1024);
    this.dataR = new Float32Array(1024);
    this.trail = [];
    this.correlation = 0;
  }

  render(parentCtx) {
    const headerH = 28;
    const contentY = this.y + headerH;
    const contentH = this.height - headerH - 24;
    const { colors, fonts, spacing } = THEME;

    // Header
    this._renderHeader(parentCtx);

    // Content background
    parentCtx.fillStyle = colors.bgSecondary;
    parentCtx.fillRect(this.x, contentY, this.width, contentH);

    const centerX = this.x + this.width / 2;
    const centerY = contentY + contentH / 2;
    const radius = Math.min(this.width, contentH) / 2 - 20;

    // Circular grid rings
    if (this.detailLevel !== 'low') {
      this._drawCircularGrid(parentCtx, centerX, centerY, radius);
    }

    // Glyph grid overlay (after grid so visible)
    if (typeof DoomGlyphs !== 'undefined') {
      const dpr = window.devicePixelRatio || 1;
      DoomGlyphs.drawGlyphGrid(parentCtx, this.x, contentY, this.width, contentH, dpr, 160, 0.30);
    }

    // Sigil calibration rings
    if (typeof DoomSigils !== 'undefined') {
      const time = performance.now() / 1000;
      DoomSigils.drawCalibration(parentCtx, centerX, centerY, radius, time);
    }

    // Clipping boundary (circle at 1.0)
    parentCtx.strokeStyle = colors.accentRed;
    parentCtx.lineWidth = 1.5;
    parentCtx.setLineDash([4, 4]);
    parentCtx.beginPath();
    parentCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    parentCtx.stroke();
    parentCtx.setLineDash([]);

    // Cardinal markers (0°, 90°, 180°, 270°)
    if (this.detailLevel === 'high') {
      const angles = [0, 90, 180, 270];
      const labels = ['R', 'T', 'L', 'B'];
      angles.forEach((ang, idx) => {
        const rad = (ang * Math.PI) / 180;
        const x = centerX + Math.cos(rad) * (radius + 10);
        const y = centerY - Math.sin(rad) * (radius + 10);
        parentCtx.fillStyle = colors.accentBlue;
        parentCtx.font = fonts.monoSmall;
        parentCtx.textAlign = 'center';
        parentCtx.textBaseline = 'middle';
        parentCtx.fillText(labels[idx], x, y);
      });
    }

    // Draw trail
    if (this.detailLevel === 'high') {
      UIHelpers.drawTrail(parentCtx, this.trail, colors.accentGreen, 5);
    }

    // Draw current point
    const len = Math.min(this.dataL.length, this.dataR.length);
    let sumL = 0, sumR = 0, count = 0;
    for (let i = 0; i < len; i += 8) {
      sumL += this.dataL[i];
      sumR += this.dataR[i];
      count++;
    }
    const avgL = sumL / (count || 1);
    const avgR = sumR / (count || 1);

    const px = centerX + avgL * radius;
    const py = centerY - avgR * radius;

    parentCtx.fillStyle = colors.accentGreen;
    parentCtx.beginPath();
    parentCtx.arc(px, py, 3, 0, Math.PI * 2);
    parentCtx.fill();

    // Add to trail
    this.trail.push({ x: px, y: py });
    if (this.trail.length > 6) this.trail.shift();

    // Correlation readout
    const corrBar = (this.correlation + 1) / 2; // -1..1 => 0..1
    this._drawCorrelationMeter(parentCtx, this.x + spacing.md, contentY + spacing.md, 80, 12, corrBar);

    // Scanlines
    if (this.detailLevel === 'high') {
      UIHelpers.drawScanlines(parentCtx, this.x, contentY, this.width, contentH);
    }

    this.setStatus(`Corr: ${this.correlation.toFixed(2)}`);
    this._renderStatusLine(parentCtx);
  }

  _drawCircularGrid(ctx, cx, cy, radius) {
    const { colors } = THEME;
    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 0.5;

    // Rings
    const rings = [0.25, 0.5, 0.75, 1.0];
    rings.forEach((ring) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
      ctx.stroke();

      if (ring < 1.0) {
        ctx.fillStyle = colors.textTertiary;
        ctx.font = THEME.fonts.monoSmall;
        ctx.fillText(ring.toFixed(2), cx + radius * ring + 2, cy - 2);
      }
    });

    // Crosshairs
    ctx.strokeStyle = colors.gridDark;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawCorrelationMeter(ctx, x, y, w, h, value) {
    const { colors } = THEME;

    // Background
    ctx.fillStyle = colors.bgTertiary;
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Fill
    const fillW = value * w;
    const [fillr, fillg, fillb] = UIHelpers._parseRGB(colors.accentA);
    ctx.fillStyle = `rgba(${fillr},${fillg},${fillb},0.5)`;
    ctx.fillRect(x, y, fillW, h);

    // Value label
    ctx.fillStyle = colors.textPrimary;
    ctx.font = THEME.fonts.monoSmall;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Corr', x + w / 2, y + h / 2);
  }

  updateData(leftData, rightData, correlation) {
    this.dataL = leftData || new Float32Array(1024);
    this.dataR = rightData || new Float32Array(1024);
    this.correlation = correlation || 0;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RingBufferF32,
    WaveformPanel,
    OscilloscopePanel,
    SpectrumPanel,
    VectorScopePanel,
  };
}
if (typeof window !== 'undefined') {
  window.RingBufferF32 = RingBufferF32;
  window.WaveformPanel = WaveformPanel;
  window.OscilloscopePanel = OscilloscopePanel;
  window.SpectrumPanel = SpectrumPanel;
  window.VectorScopePanel = VectorScopePanel;
}
