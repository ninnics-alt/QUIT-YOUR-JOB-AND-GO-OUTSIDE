/**
 * BASS-CAR-PANEL.JS - 808 Bass-reactive SUV/minivan driving animation
 * Canvas2D, 60fps, no per-frame allocations
 */

class BassHitDetector {
  constructor(sampleRate, fftSize) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    
    // Frequency band presets (Hz)
    this.bandPresets = [
      { name: 'SUB (20-60)', lo: 20, hi: 60 },
      { name: 'KICK (30-90)', lo: 30, hi: 90 },
      { name: 'BASS (35-110)', lo: 35, hi: 110 },
      { name: 'MID (70-150)', lo: 70, hi: 150 },
      { name: 'HIGH (100-200)', lo: 100, hi: 200 },
      { name: 'FULL (20-200)', lo: 20, hi: 200 }
    ];
    this.presetIndex = 2; // Default to BASS
    
    // Current band settings (Hz)
    this.bandLo = this.bandPresets[this.presetIndex].lo;
    this.bandHi = this.bandPresets[this.presetIndex].hi;
    
    // Detection state
    this.smoothedEnergy = 0;
    this.emaAlpha = 0.10;
    this.sensitivity = 50.0;        // Extreme sensitivity
    this.threshold = 0.00001;       // Nearly zero threshold
    this.lastBoomTime = 0;
    this.cooldownMs = 80;
    this.isBoom = false;
  }
  
  /**
   * Cycle to next frequency band preset
   */
  nextPreset() {
    this.presetIndex = (this.presetIndex + 1) % this.bandPresets.length;
    const preset = this.bandPresets[this.presetIndex];
    this.bandLo = preset.lo;
    this.bandHi = preset.hi;
  }
  
  /**
   * Cycle to previous frequency band preset
   */
  prevPreset() {
    this.presetIndex = (this.presetIndex - 1 + this.bandPresets.length) % this.bandPresets.length;
    const preset = this.bandPresets[this.presetIndex];
    this.bandLo = preset.lo;
    this.bandHi = preset.hi;
  }
  
  /**
   * Set band directly
   */
  setBand(lo, hi) {
    this.bandLo = lo;
    this.bandHi = hi;
    this.presetIndex = -1; // Custom
  }
  
  /**
   * Get current preset name
   */
  getPresetName() {
    if (this.presetIndex >= 0) {
      return this.bandPresets[this.presetIndex].name;
    }
    return `CUSTOM (${this.bandLo}-${this.bandHi})`;
  }
  
  /**
   * Convert Hz to FFT bin index
   */
  hzToBin(hz) {
    return Math.floor((hz * this.fftSize) / this.sampleRate);
  }
  
  /**
   * Process frequency data and detect bass hits
   * @param {Float32Array} freqData - getFloatFrequencyData output (dBFS)
   * @param {number} now - performance.now()
   */
  process(freqData, now) {
    const binLo = this.hzToBin(this.bandLo);
    const binHi = this.hzToBin(this.bandHi);
    
    // Compute energy in bass band (convert from dBFS to linear, then average)
    let energySum = 0;
    let count = 0;
    for (let i = binLo; i <= binHi && i < freqData.length; i++) {
      const linear = Math.pow(10, freqData[i] / 20); // dBFS to linear
      energySum += linear;
      count++;
    }
    const bassEnergy = count > 0 ? energySum / count : 0;
    
    // Smooth with EMA
    this.smoothedEnergy = this.emaAlpha * bassEnergy + (1 - this.emaAlpha) * this.smoothedEnergy;
    
    // Compute transient
    const transient = bassEnergy - this.smoothedEnergy;
    
    // Check for boom
    const cooldownOk = (now - this.lastBoomTime) > this.cooldownMs;
    const thresholdMet = transient > (this.threshold * this.sensitivity);
    
    if (cooldownOk && thresholdMet) {
      this.isBoom = true;
      this.lastBoomTime = now;
    } else {
      this.isBoom = false;
    }
    
    return {
      bassEnergy,
      smoothedEnergy: this.smoothedEnergy,
      transient,
      isBoom: this.isBoom
    };
  }
}

class BassCarPanel {
  constructor(canvas, analyserL, analyserR, sampleRate) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyserL = analyserL;
    this.analyserR = analyserR;
    this.sampleRate = sampleRate || 48000;
    
    // Bass detector
    const fftSize = analyserL ? analyserL.fftSize : 2048;
    this.detector = new BassHitDetector(this.sampleRate, fftSize);
    
    // Frequency data buffers
    this.freqDataL = new Float32Array(analyserL ? analyserL.frequencyBinCount : 1024);
    this.freqDataR = new Float32Array(analyserR ? analyserR.frequencyBinCount : 1024);
    
    // Animation state (preallocated)
    this.suspensionY = 0;
    this.suspensionVel = 0;
    this.impactScale = 0; // Boom causes car to expand
    this.bodySquash = 0;
    this.cameraShakeX = 0;
    this.cameraShakeY = 0;
    this.wheelSpin = 0;
    this.roadScroll = 0;
    this.roadSpeed = 1.0;
    this.glowPulse = 0;
    this.wheelTilt = 0;
    this.wheelTiltVel = 0;
    
    // Physics params (critically damped springs for snappy motion)
    this.suspensionStiffness = 220;  // Stiffer for punchier bounce
    this.suspensionDamping = 22;     // Less damping for bigger oscillation
    this.wheelHopAmount = 0;         // Wheel hop from suspension
    this.wheelTiltStiffness = 140;
    this.wheelTiltDamping = 20;
    this.baseRoadSpeed = 1.0;
    
    // User controls
    this.shakeIntensity = 1.0;
    this.speedMultiplier = 1.0;
    
    // Timing
    this.lastNow = performance.now();
    this.boomFlashUntil = 0;
    this.lastBoomTime = 0;
    
    // VFX state (preallocated, no per-frame objects)
    this.shockwaveRadius = 0;        // Expanding ring on boom
    this.dustPuffLife = 0;           // Dust cloud opacity
    this.headlightFlare = 0;         // Headlight glow on boom
    
    // Cached shapes (rebuilt on resize/theme change)
    this.carBody = null;
    this.carWindows = null;
    this.carWheelArches = null;
    this.carRoofRack = null;
    this.carDoors = null;
    this.roadTile = null;
    this.mountainsPath = null;
    this.lastThemeVersion = -1;
    
    // Draw rect
    this.drawRect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    
    // Last metrics
    this.lastMetrics = { bassEnergy: 0, isBoom: false, bandLo: 0, bandHi: 0 };
    
    // Click handler (for frequency band selection)
    this.canvas.addEventListener('click', (e) => this._onCanvasClick(e));
  }
  
  /**
   * Handle canvas clicks for frequency band selection
   */
  _onCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // HUD is at top, ~44px tall
    if (y > 44) return;
    
    const w = rect.width;
    const centerX = w / 2;
    
    // Left arrow zone: prevPreset
    if (x > centerX - 75 && x < centerX - 35) {
      this.detector.prevPreset();
      return;
    }
    
    // Center zone: nextPreset
    if (x > centerX - 35 && x < centerX + 35) {
      this.detector.nextPreset();
      return;
    }
    
    // Right arrow zone: nextPreset
    if (x > centerX + 35 && x < centerX + 75) {
      this.detector.nextPreset();
      return;
    }
  }
  
  /**
   * Resize handler
   */
  onResize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawRect = { x: 0, y: 0, w, h };
    this._rebuildShapes();
  }
  
  /**
   * Rebuild cached shapes when theme or size changes
   */
  _rebuildShapes() {
    const w = this.drawRect.w;
    const h = this.drawRect.h;
    const colors = THEME.colors;
    
    // Car dimensions (responsive to panel size)
    const carScale = Math.min(w, h) / 400;
    const carW = 120 * carScale;
    const carH = 60 * carScale;
    const carX = w * 0.5;
    const carY = h * 0.6;
    
    // Car body (boxy SUV shape)
    this.carBody = new Path2D();
    this.carBody.rect(-carW / 2, -carH / 2, carW, carH);
    
    // Windows (large side windows for SUV)
    this.carWindows = new Path2D();
    const winX = -carW * 0.35;
    const winY = -carH * 0.3;
    const winW = carW * 0.65;
    const winH = carH * 0.4;
    this.carWindows.rect(winX, winY, winW, winH);
    
    // Wheel arches (higher for SUV clearance)
    this.carWheelArches = new Path2D();
    const wheelRadius = carH * 0.25;
    const wheelY = carH * 0.4;
    const wheelLeft = -carW * 0.35;
    const wheelRight = carW * 0.35;
    this.carWheelArches.arc(wheelLeft, wheelY, wheelRadius, 0, Math.PI * 2);
    this.carWheelArches.moveTo(wheelRight + wheelRadius, wheelY);
    this.carWheelArches.arc(wheelRight, wheelY, wheelRadius, 0, Math.PI * 2);
    
    // Road tile (cached noise pattern)
    this._generateRoadTile();
    
    this.carScale = carScale;
    this.carX = carX;
    this.carY = carY;
    this.carW = carW;
    this.carH = carH;
    this.wheelRadius = wheelRadius;
    this.wheelY = wheelY;
    this.wheelLeft = wheelLeft;
    this.wheelRight = wheelRight;
  }
  
  /**
   * Generate asphalt noise tile
   */
  _generateRoadTile() {
    const tileSize = 128;
    if (!this.roadTile) {
      this.roadTile = document.createElement('canvas');
    }
    this.roadTile.width = tileSize;
    this.roadTile.height = tileSize;
    const ctx = this.roadTile.getContext('2d');
    
    // Base color
    const colors = THEME.colors;
    ctx.fillStyle = colors.bgInset;
    ctx.fillRect(0, 0, tileSize, tileSize);
    
    // Noise
    const imageData = ctx.getImageData(0, 0, tileSize, tileSize);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 20;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Trigger BOOM impulse (strong, visible motion)
   */
  _triggerBoom(strength) {
    // Suspension impulse (upward rebound from impact)
    this.suspensionVel -= 500 * this.shakeIntensity;
    
    // Body squash + stretch
    this.bodySquash = Math.min(this.bodySquash + 0.22 * this.shakeIntensity, 0.35);
    
    // Camera shake
    this.cameraShakeX += (Math.random() - 0.5) * 10 * this.shakeIntensity;
    this.cameraShakeY += (Math.random() - 0.5) * 6 * this.shakeIntensity;
    
    // VFX: Shockwave ring expands from car
    this.shockwaveRadius = 1;
    this.dustPuffLife = 1.0;
    this.headlightFlare = 1.0;
    this.lastBoomTime = performance.now();
    
    // Road speed burst
    this.roadSpeed = this.baseRoadSpeed * (1 + strength * 2) * this.speedMultiplier;
    
    // Glow pulse
    this.glowPulse = 1.0;
    
    // Wheel tilt
    this.wheelTiltVel += (Math.random() - 0.5) * strength * 0.1 * this.shakeIntensity;
  }
  
  /**
   * Update physics (critically damped springs) - F = -kx - cv
   */
  _updatePhysics(dtSec) {
    // Suspension spring (vertical) - units: px, px/sec
    const suspAccel = (-this.suspensionStiffness * this.suspensionY) - (this.suspensionDamping * this.suspensionVel);
    this.suspensionVel += suspAccel * dtSec;
    this.suspensionY += this.suspensionVel * dtSec;
    
    // Wheel hop follows suspension with slight delay (0.6 multiplier)
    this.wheelHopAmount = this.suspensionY * 0.6;
    
    // Decay floor to prevent jitter
    if (Math.abs(this.suspensionY) < 0.1 && Math.abs(this.suspensionVel) < 0.1) {
      this.suspensionY = 0;
      this.suspensionVel = 0;
    }
    
    // Body squash natural decay
    this.bodySquash *= 0.88;
    
    // Wheel tilt wobble - units: deg, deg/sec
    const tiltAccel = (-this.wheelTiltStiffness * this.wheelTilt) - (this.wheelTiltDamping * this.wheelTiltVel);
    this.wheelTiltVel += tiltAccel * dtSec;
    this.wheelTilt += this.wheelTiltVel * dtSec;
    
    // Camera shake decay
    this.cameraShakeX *= 0.88;
    this.cameraShakeY *= 0.88;
    
    // Road speed decay back to base
    this.roadSpeed = this.roadSpeed * 0.98 + this.baseRoadSpeed * this.speedMultiplier * 0.02;
    
    // Wheel spin
    this.wheelSpin += this.roadSpeed * dtSec * 5;
    
    // Road scroll
    this.roadScroll += this.roadSpeed * dtSec * 100;
    
    // Glow decay
    this.glowPulse *= 0.86;
    
    // VFX decays
    this.shockwaveRadius *= 1.15; // Expand ring
    if (this.shockwaveRadius > 3) this.shockwaveRadius = 0;
    this.dustPuffLife *= 0.92; // Fade dust
    this.headlightFlare *= 0.88; // Fade flare
  }
  
  /**
   * Draw background (sky + parallax)
   */
  _drawBackground() {
    const { w, h } = this.drawRect;
    const ctx = this.ctx;
    const colors = THEME.colors;
    
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, colors.bgPrimary);
    skyGrad.addColorStop(1, colors.bgInset);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);
    
    // Distant hills (parallax - moves slowly)
    const hillScroll = (this.roadScroll * 0.1) % w;
    ctx.fillStyle = colors.border;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    for (let x = -w; x < w * 2; x += 60) {
      const hillX = x - hillScroll;
      const hillH = 40 + Math.sin(x * 0.05) * 20;
      const hillY = h * 0.5 - hillH;
      ctx.lineTo(hillX, hillY);
    }
    ctx.lineTo(w * 2, h * 0.5);
    ctx.lineTo(-w, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  
  /**
   * Draw road (perspective trapezoid with scrolling markers)
   */
  _drawRoad() {
    const { w, h } = this.drawRect;
    const ctx = this.ctx;
    const colors = THEME.colors;
    
    const roadY = h * 0.6;
    const roadH = h * 0.4;
    
    // Road trapezoid (perspective)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.2, roadY);
    ctx.lineTo(w * 0.8, roadY);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.clip();
    
    // Tiled asphalt
    if (this.roadTile) {
      const tileSize = 128;
      const scrollOffset = this.roadScroll % tileSize;
      for (let y = roadY - tileSize; y < h; y += tileSize) {
        for (let x = -tileSize; x < w + tileSize; x += tileSize) {
          ctx.drawImage(this.roadTile, x, y - scrollOffset);
        }
      }
    }
    
    // Lane markers (scrolling dashes)
    ctx.strokeStyle = colors.textMuted;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    const markerGap = 60;
    const markerLen = 30;
    const markerScroll = this.roadScroll % (markerGap + markerLen);
    for (let y = roadY; y < h; y += (markerGap + markerLen)) {
      const markerY = y - markerScroll;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, markerY);
      ctx.lineTo(w * 0.5, markerY + markerLen);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    ctx.restore();
  }
  
  /**
   * Draw SUV/minivan (procedural boxy shape)
   */
  _drawCar() {
    const ctx = this.ctx;
    const colors = THEME.colors;
    
    ctx.save();
    
    // Apply camera shake
    ctx.translate(this.cameraShakeX, this.cameraShakeY);
    
    // Car position with suspension bounce
    ctx.translate(this.carX, this.carY + this.suspensionY);
    
    // Body squash/stretch (compress vertically, expand horizontally)
    const squashY = 1 - this.bodySquash;
    const squashX = 1 + this.bodySquash * 0.25;
    ctx.scale(squashX, squashY);
    
    // Wheel tilt
    ctx.rotate(this.wheelTilt * Math.PI / 180);
    
    // Undercar shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.ellipse(0, this.carH * 0.5 + 5, this.carW * 0.45, this.carH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Car body (boxy SUV)
    const [r, g, b] = UIHelpers._parseRGB(colors.bgPanel);
    ctx.fillStyle = `rgb(${r + 20}, ${g + 20}, ${b + 20})`;
    ctx.fill(this.carBody);
    
    // Body outline
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.stroke(this.carBody);
    
    // Windows (tinted)
    ctx.fillStyle = `rgba(${r - 30}, ${g - 30}, ${b - 30}, 0.8)`;
    ctx.fill(this.carWindows);
    ctx.strokeStyle = colors.border;
    ctx.stroke(this.carWindows);
    
    // Roof rack (optional detail)
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-this.carW * 0.35, -this.carH * 0.5);
    ctx.lineTo(this.carW * 0.25, -this.carH * 0.5);
    ctx.stroke();
    
    // Wheel wells / arches
    ctx.fillStyle = colors.bgInset;
    ctx.fill(this.carWheelArches);
    
    // Wheels (rotating spokes) - with hop from suspension
    const wheelYWithHop = this.wheelY + this.wheelHopAmount;
    this._drawWheel(this.wheelLeft, wheelYWithHop, this.wheelRadius);
    this._drawWheel(this.wheelRight, wheelYWithHop, this.wheelRadius);
    
    // Headlights glow (with boom pulse)
    if (this.glowPulse > 0.01) {
      const glowAlpha = this.glowPulse * 0.5;
      const [ar, ag, ab] = UIHelpers._parseRGB(colors.accentA);
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${glowAlpha})`;
      ctx.beginPath();
      ctx.arc(-this.carW * 0.45, 0, 8, 0, Math.PI * 2);
      ctx.arc(-this.carW * 0.45, this.carH * 0.2, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Tail lights (subtle)
    ctx.fillStyle = colors.accentBad;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(this.carW * 0.48, -this.carH * 0.15, 4, 8);
    ctx.fillRect(this.carW * 0.48, this.carH * 0.07, 4, 8);
    ctx.globalAlpha = 1;
    
    // VFX: Shockwave ring expanding from car on boom
    if (this.shockwaveRadius > 0 && this.shockwaveRadius < 3) {
      ctx.strokeStyle = colors.accentA;
      ctx.globalAlpha = (1 - this.shockwaveRadius / 3) * 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, this.carH * 0.3, this.carW * this.shockwaveRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    // VFX: Dust puff behind rear wheel on boom
    if (this.dustPuffLife > 0) {
      ctx.fillStyle = colors.grid;
      ctx.globalAlpha = this.dustPuffLife * 0.2;
      ctx.beginPath();
      ctx.arc(this.wheelRight + 8, this.wheelY + this.carH * 0.1, this.carW * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // VFX: Headlight flare on boom
    if (this.headlightFlare > 0.01) {
      const flareAlpha = this.headlightFlare * 0.4;
      const [ar, ag, ab] = UIHelpers._parseRGB(colors.accentA);
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${flareAlpha})`;
      ctx.beginPath();
      ctx.arc(-this.carW * 0.45, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Draw wheel with rotating spokes
   */
  _drawWheel(x, y, radius) {
    const ctx = this.ctx;
    const colors = THEME.colors;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.wheelSpin);
    
    // Tire
    ctx.fillStyle = colors.grid;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Rim
    ctx.fillStyle = colors.border;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    
    // Spokes (5 spokes)
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * radius * 0.6, Math.sin(angle) * radius * 0.6);
      ctx.stroke();
    }
    
    // Center cap
    ctx.fillStyle = colors.accentA;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  /**
   * Draw UI readout with debug info
   */
  _drawReadout() {
    const { w, h } = this.drawRect;
    const ctx = this.ctx;
    const colors = THEME.colors;
    const m = this.lastMetrics;
    
    // HUD background (subtle)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(8, 8, w - 16, 28);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, 28);
    
    // Bass level indicator (left)
    ctx.font = '12px monospace';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const bassBar = Math.min(m.bassEnergy * 20, 40);
    ctx.fillText(`BASS`, 12, 23);
    ctx.fillStyle = colors.accentA;
    ctx.fillRect(50, 20, bassBar, 6);
    
    // Center frequency band selector (clickable)
    const centerX = w / 2;
    const presetName = this.detector.getPresetName();
    
    // Left arrow (clickable)
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.font = '14px monospace';
    ctx.fillText('◀', centerX - 55, 23);
    
    // Preset name + band info
    ctx.fillStyle = colors.textMuted;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillText(presetName, centerX, 23);
    
    // Right arrow (clickable)
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.font = '14px monospace';
    ctx.fillText('▶', centerX + 50, 23);
    
    // BOOM indicator (right)
    if (m.isBoom || this.headlightFlare > 0.3) {
      ctx.fillStyle = colors.accentA;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`◈ BOOM ◈`, w - 12, 23);
    } else {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`—`, w - 12, 23);
    }
  }
  
  /**
   * Main render loop
   */
  render(freqDataL, freqDataR) {
    // Check theme version
    if (THEME.version !== this.lastThemeVersion) {
      this._rebuildShapes();
      this.lastThemeVersion = THEME.version;
    }
    
    const { w, h } = this.drawRect;
    const ctx = this.ctx;
    const now = performance.now();
    
    // Get frequency data
    if (this.analyserL && freqDataL) {
      this.analyserL.getFloatFrequencyData(freqDataL);
    }
    
    // Detect bass hit (use left channel or average)
    const metrics = this.detector.process(freqDataL || this.freqDataL, now);
    this.lastMetrics = {
      bassEnergy: metrics.bassEnergy,
      smoothEnergy: metrics.smoothedEnergy,
      isBoom: metrics.isBoom,
      bandLo: this.detector.bandLo,
      bandHi: this.detector.bandHi
    };
    
    // Trigger boom if detected
    if (metrics.isBoom) {
      this._triggerBoom(1.0);
      this.boomFlashUntil = Date.now() + 150; // Flash for 150ms
    }
    
    // Update physics with actual time delta
    const dtSec = (now - this.lastNow) / 1000; // Convert ms to seconds
    this.lastNow = now;
    this._updatePhysics(Math.min(dtSec, 0.05)); // Cap dt to prevent overshoots
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Draw scene
    this._drawBackground();
    this._drawRoad();
    this._drawCar();
    this._drawReadout();
  }
}

// Export to window
if (typeof window !== 'undefined') {
  window.BassCarPanel = BassCarPanel;
}
