/**
 * BASS-CAR-PANEL.JS - 808 Bass-reactive SUV/minivan driving animation
 * Canvas2D, 60fps, no per-frame allocations
 */

class BassHitDetector {
  constructor(sampleRate, fftSize) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    
    // Band settings (Hz)
    this.bandLo = 35;
    this.bandHi = 110;
    
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
    
    // Physics params (spring constants for visible snap)
    this.suspensionStiffness = 180;
    this.suspensionDamping = 24;
    this.squashStiffness = 200;
    this.squashDamping = 28;
    this.wheelTiltStiffness = 140;
    this.wheelTiltDamping = 20;
    this.baseRoadSpeed = 1.0;
    
    // User controls
    this.shakeIntensity = 1.0;
    this.speedMultiplier = 1.0;
    
    // Timing
    this.lastNow = performance.now();
    this.boomFlashUntil = 0;
    
    // Cached shapes (rebuilt on resize/theme change)
    this.carBody = null;
    this.carWindows = null;
    this.carWheelArches = null;
    this.roadTile = null;
    this.lastThemeVersion = -1;
    
    // Draw rect
    this.drawRect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    
    // Last metrics
    this.lastMetrics = { bassEnergy: 0, isBoom: false, bandLo: 0, bandHi: 0 };
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
   * Trigger BOOM impulse (always produce visible motion)
   */
  _triggerBoom(strength) {
    // Impact scale - car expands outward when bass hits (DRAMATIC)
    this.impactScale = 0.80 * this.shakeIntensity; // Will make car 80% bigger
    
    // Camera shake (always add some)
    this.cameraShakeX += (Math.random() - 0.5) * 6 * this.shakeIntensity;
    this.cameraShakeY += (Math.random() - 0.5) * 4 * this.shakeIntensity;
    
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
    
    // Decay floor to prevent jitter
    if (Math.abs(this.suspensionY) < 0.05 && Math.abs(this.suspensionVel) < 0.05) {
      this.suspensionY = 0;
      this.suspensionVel = 0;
    }
    
    // Impact scale decay (car shrinks back to normal)
    this.impactScale *= 0.92;
    
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
    this.glowPulse *= 0.92;
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
    
    // Impact scale - car grows bigger when bass hits
    const carScale = 1 + this.impactScale;
    ctx.scale(carScale, carScale);
    
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
    
    // Wheels (rotating spokes)
    this._drawWheel(this.wheelLeft, this.wheelY, this.wheelRadius);
    this._drawWheel(this.wheelRight, this.wheelY, this.wheelRadius);
    
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
    
    ctx.font = THEME.fonts.monoSmall;
    ctx.fillStyle = colors.textMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Debug readout
    const bass = m.bassEnergy.toFixed(3);
    const transient = (m.bassEnergy - m.smoothEnergy).toFixed(3);
    const boom = m.isBoom ? '1' : '0';
    const impactScale = (1 + this.impactScale).toFixed(2);
    const suspY = this.suspensionY.toFixed(1);
    
    const debugText = `B:${bass} T:${transient} Boom:${boom} Scale:${impactScale} suspY:${suspY}`;
    ctx.fillText(debugText, 8, 8);
    
    // Boom flash (bright indicator)
    if (this.boomFlashUntil > Date.now()) {
      ctx.fillStyle = colors.accentA;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOOM!', w * 0.5, h * 0.45);
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
