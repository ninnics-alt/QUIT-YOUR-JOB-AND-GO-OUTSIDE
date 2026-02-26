/**
 * DOOM-FX.JS - Hell-Tech Hardware visual effects
 * Lightweight, allocation-free functions for DOOM PROPHET theme + Reactive audio-driven effects
 * - drawEmbers: Drifting particles behind content
 * - applyHeatHaze: Subtle background distortion via scanlines
 * - Reactive effects (NEW): shockwave, border flare, heat distortion
 */

const DOOM_FX = {
  // Config constants
  HIT_THRESHOLD: 0.12,   // Transient delta threshold for hit detection
  HEAT_MAX: 0.8,         // Max heatT from low-band energy
  
  // Preallocated particle pool (no per-frame allocations)
  particles: Array(256).fill(null).map(() => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
  })),
  particleCount: 0,
  nextParticleIndex: 0,
  
  // Flare state for transient detection (LEGACY)
  flareValue: 0,
  flareDecayRate: 0.88,
  
  // REACTIVE STATE (NEW) - audio-driven effects
  shockT: 0,        // 0..1, expanding shockwave
  flareT: 0,        // 0..1, border stress flash
  heatT: 0,         // 0..1, low-end distortion heat
  prevLowBandEnergy: 0,  // For transient detection
  lowBandEnvelope: 0,    // Smoothed low-band for heatT
  screenShakePx: 0,      // Small camera shake on hit
  
  // Offscreen buffer for heat distortion (reused, no per-frame alloc)
  heatDistortionBuffer: null,
  heatDistortionCtx: null,
  lastBufferW: 0,
  lastBufferH: 0,
  
  /**
   * Update reactive state with time delta (call once per frame)
   * @param {number} dt - Delta time in seconds
   */
  updateReactive(dt) {
    // Exponential decay for shockwave and flare
    const decayShock = Math.exp(-dt * 10);   // ~100ms half-life
    const decayFlare = Math.exp(-dt * 14);   // ~70ms half-life
    
    this.shockT *= decayShock;
    this.flareT *= decayFlare;
    
    // Heat distortion: smoothed envelope decay
    const decayHeat = Math.exp(-dt * 6);     // ~115ms release
    this.heatT *= decayHeat;
    
    // Clamp very small values to zero to avoid floating point noise
    if (this.shockT < 0.001) this.shockT = 0;
    if (this.flareT < 0.001) this.flareT = 0;
    if (this.heatT < 0.001) this.heatT = 0;
  },
  
  /**
   * Trigger effects on audio hit
   * @param {number} hitStrength - 0..1 transient strength
   */
  trigger(hitStrength) {
    if (hitStrength <= 0) return;
    
    const clamped = Math.min(1, hitStrength);
    if (clamped > this.shockT) {
      this.shockT = clamped;
    }
    if (clamped > this.flareT) {
      this.flareT = clamped;
    }
    this.screenShakePx = Math.min(2, clamped * 2);
  },
  
  /**
   * Update low-band heat distortion from frequency data
   * @param {Float32Array} freqData - Frequency bin data (dB)
   * @param {number} sampleRate - Audio sample rate
   */
  updateHeatFromFreq(freqData, sampleRate) {
    if (!freqData || freqData.length === 0) return;
    
    // 35-110 Hz band (bass)
    const nyquist = sampleRate / 2;
    const lowFreq = 35, highFreq = 110;
    const lowBin = Math.floor((lowFreq / nyquist) * freqData.length);
    const highBin = Math.ceil((highFreq / nyquist) * freqData.length);
    
    // Average energy in bass band
    let sum = 0, count = 0;
    for (let i = lowBin; i < highBin && i < freqData.length; i++) {
      const db = freqData[i]; // Already in dB from getFloatFrequencyData
      sum += Math.pow(10, db / 20); // Convert dB to linear
      count++;
    }
    
    const lowBandEnergy = count > 0 ? sum / count : 0;
    const maxEnergy = 0.15; // Reasonable max for normalized range
    const normalized = Math.min(lowBandEnergy / maxEnergy, 1.0);
    
    // Smoothed envelope: fast attack, slow release
    const attackCoef = Math.exp(-1.0 / (0.05 * sampleRate)); // 50ms attack
    const releaseCoef = Math.exp(-1.0 / (0.15 * sampleRate)); // 150ms release
    
    if (normalized > this.lowBandEnvelope) {
      this.lowBandEnvelope = normalized * (1 - attackCoef) + this.lowBandEnvelope * attackCoef;
    } else {
      this.lowBandEnvelope = normalized * (1 - releaseCoef) + this.lowBandEnvelope * releaseCoef;
    }
    
    this.heatT = this.lowBandEnvelope * this.HEAT_MAX;
    this.prevLowBandEnergy = lowBandEnergy;
  },
  
  /**
   * Draw radial shockwave ring (expanding on transient)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  drawShockwave(ctx, w, h) {
    if (!ctx || this.shockT < 0.02) return;
    
    const centerX = w / 2;
    const centerY = h / 2;
    const minRadius = Math.min(w, h) * 0.08;
    const maxRadius = Math.min(w, h) * 0.55;
    
    // Expand: starts small, ends large
    const t = 1 - this.shockT; // 1 -> 0 as shockT goes 0 -> 1
    const radius = minRadius + (maxRadius - minRadius) * (1 - t);
    
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    
    // Color from DOOM palette: deep red to orange
    ctx.strokeStyle = `rgba(255, 42, 42, ${this.shockT * 0.22})`;
    ctx.lineWidth = 2 + this.shockT * 10;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  },
  
  /**
   * Draw border flare (panel stress indicator on transient)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} pad - Padding from edge (default 2)
   */
  drawBorderFlare(ctx, w, h, pad = 2) {
    if (!ctx || this.flareT < 0.02) return;
    
    const alpha = this.flareT * 0.35;
    const outerColor = `rgba(255, 42, 42, ${alpha})`;
    const innerColor = `rgba(255, 100, 60, ${alpha * 0.6})`;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // Outer stroke
    ctx.strokeStyle = outerColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    
    // Inner glow stroke
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 2, pad + 2, w - pad * 4, h - pad * 4);
    
    ctx.restore();
  },
  
  /**
   * Apply cheap heat distortion via scanline offset
   * Wraps drawScene function to render to offscreen buffer first, then distort
   * @param {CanvasRenderingContext2D} ctx - Main canvas context
   * @param {Function} drawSceneFn - Function that renders the scene
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  applyHeatDistortion(ctx, drawSceneFn, w, h) {
    if (!ctx || this.heatT < 0.01 || !w || !h) {
      // Just render normally if heat is off
      drawSceneFn(ctx, w, h);
      return;
    }
    
    // Ensure offscreen buffer exists
    if (!this.heatDistortionBuffer || this.lastBufferW !== w || this.lastBufferH !== h) {
      this.heatDistortionBuffer = document.createElement('canvas');
      this.heatDistortionBuffer.width = w;
      this.heatDistortionBuffer.height = h;
      this.heatDistortionCtx = this.heatDistortionBuffer.getContext('2d');
      this.lastBufferW = w;
      this.lastBufferH = h;
    }
    
    const offCtx = this.heatDistortionCtx;
    
    // Render scene to offscreen buffer
    offCtx.clearRect(0, 0, w, h);
    drawSceneFn(offCtx, w, h);
    
    // Apply heat distortion via scanline offset
    // Only distort lower 55% of canvas (road area in Car module)
    const distortionLimit = Math.floor(h * 0.55);
    const time = performance.now() / 1000;
    const frequency = 0.008;
    const speed = 2.0;
    const maxOffset = this.heatT * 6;
    
    ctx.clearRect(0, 0, w, h);
    
    // Undistorted top 45%
    ctx.drawImage(this.heatDistortionBuffer, 0, 0, w, distortionLimit, 0, 0, w, distortionLimit);
    
    // Distorted bottom 55%: copy in horizontal strips with x-offset
    const stripHeight = 3; // Pixels per strip
    for (let y = distortionLimit; y < h; y += stripHeight) {
      const wavePhase = y * frequency + time * speed;
      const offsetX = Math.sin(wavePhase) * maxOffset;
      const remainder = Math.min(stripHeight, h - y);
      
      ctx.drawImage(
        this.heatDistortionBuffer,
        Math.max(0, offsetX), y,           // Source: offset x, scanline y
        w - Math.abs(offsetX), remainder,  // Source: remaining width, strip height
        Math.max(0, offsetX), y,           // Dest: same coords
        w - Math.abs(offsetX), remainder
      );
    }
  },
  
  // ORIGINAL METHODS (preserved)
  
  /**
   * Draw drifting embers behind visualizer content
   * Particles spawn randomly, drift up/left, fade out
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} seed - Random seed for particle positions
   * @param {number} t - Current time (ms), used for drift
   * @param {number} opacity - Ember opacity multiplier (0-1)
   */
  drawEmbers(ctx, w, h, seed = 0, t = 0, opacity = 0.2) {
    if (!ctx || w <= 0 || h <= 0 || opacity <= 0) return;
    
    // Spawn new particles at bottom, drifting upward
    const spawnRate = 2; // particles per frame
    for (let i = 0; i < spawnRate; i++) {
      const idx = this.nextParticleIndex % this.particles.length;
      const p = this.particles[idx];
      
      // Pseudo-random position using seed
      const rand1 = Math.sin(seed + t + i * 0.123) * 0.5 + 0.5;
      const rand2 = Math.sin(seed + t + i * 0.456 + 1) * 0.5 + 0.5;
      const rand3 = Math.sin(seed + t + i * 0.789 + 2) * 0.5 + 0.5;
      
      p.x = rand1 * w;
      p.y = h + 10; // Start below
      p.vx = (rand2 - 0.5) * 20; // Horizontal drift
      p.vy = -30 - rand3 * 40;   // Upward drift
      p.life = 1.0;
      p.maxLife = 1.0;
      
      this.nextParticleIndex++;
    }
    
    // Update and draw particles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      
      // Physics: drift
      p.x += p.vx * 0.02; // dt ≈ 16ms at 60fps
      p.y += p.vy * 0.02;
      p.life *= 0.96; // Fade over ~50 frames
      
      // Skip if off-screen
      if (p.y < -20 || p.x < -20 || p.x > w + 20) {
        p.life = 0;
        continue;
      }
      
      // Draw particle
      const alpha = p.life * opacity * 0.4;
      const size = 1 + p.life * 2;
      
      ctx.fillStyle = `rgba(255, 150, 80, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  },
  
  /**
   * Apply subtle heat haze effect (cheap: shift scanlines based on time)
   * Creates rippling distortion without expensive off-screen rendering
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} strength - Distortion intensity (0-1)
   * @param {number} t - Current time (ms)
   */
  applyHeatHaze(ctx, w, h, strength = 0.1, t = 0) {
    if (!ctx || strength <= 0.001) return;
    
    // Draw subtle horizontal lines with slight wave
    const spacing = 3;
    const maxShift = Math.max(1, strength * 4);
    const frequency = 0.002; // Controls wave speed
    
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 100, 0, 0.02)';
    ctx.lineWidth = 1;
    
    for (let y = 0; y < h; y += spacing) {
      const wavePhase = (y + t * frequency) * 0.05;
      const shift = Math.sin(wavePhase) * maxShift;
      
      ctx.beginPath();
      ctx.moveTo(0 + shift, y);
      ctx.lineTo(w + shift, y);
      ctx.stroke();
    }
    
    ctx.restore();
  },
  
  /**
   * Trigger flare effect when peak/transient detected
   * Stores intensity that decays over time,
   * used to brighten panel borders/headers
   * @param {number} level - Transient intensity (0-1)
   */
  triggerFlare(level = 1.0) {
    if (level > this.flareValue) {
      this.flareValue = Math.min(level, 1.0);
    }
  },
  
  /**
   * Update flare decay (called once per frame)
   * Returns current flare intensity for use in panel rendering
   * @returns {number} Current flare value (0-1)
   */
  updateFlare() {
    this.flareValue *= this.flareDecayRate;
    if (this.flareValue < 0.001) {
      this.flareValue = 0;
    }
    return this.flareValue;
  },
  
  /**
   * Get border glow color based on current flare
   * Dark rim (outer) + red glow (inner) with flare brightening
   * @returns {Object} {outer: color, inner: color}
   */
  getBorderColors(baseOuter = 'rgba(50, 10, 10, 0.8)', baseInner = 'rgba(255, 50, 30, 0.3)') {
    const flare = this.flareValue;
    
    // Inner glow intensifies with flare
    const innerAlpha = Math.min(0.3 + flare * 0.7, 1.0);
    const innerColor = `rgba(255, ${Math.max(50, 100 + flare * 155)}, ${Math.max(30, 80 + flare * 175)}, ${innerAlpha})`;
    
    // Outer stays dark but can brighten slightly
    const outerAlpha = 0.6 + flare * 0.4;
    const outerColor = `rgba(${Math.max(50, 80 + flare * 175)}, ${Math.max(10, 20 + flare * 35)}, ${Math.max(10, 20 + flare * 35)}, ${outerAlpha})`;
    
    return { outer: outerColor, inner: innerColor };
  },
  
  /**
   * Draw charred phosphor trace: thick halo + thin bright core
   * Used in oscilloscope/vectorscope to give burned-in look
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} points - Array of {x, y} coordinates
   * @param {string} color - Trace color (e.g., accentRed)
   * @param {number} coreWidth - Inner bright line width (default 1.5)
   * @param {number} haloWidth - Outer dim halo width (default 4)
   */
  drawCharedPhosphorTrace(ctx, points, color = '#FF2A3A', coreWidth = 1.5, haloWidth = 4) {
    if (!ctx || !points || points.length < 2) return;
    
    ctx.save();
    
    // Extract RGB for rgba manipulation
    let r = 255, g = 42, b = 58; // Default red
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        r = Number(match[0]);
        g = Number(match[1]);
        b = Number(match[2]);
      }
    }
    
    // Draw halo (thick, low alpha) first
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.lineWidth = haloWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    
    // Draw core (thin, bright)
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.lineWidth = coreWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    
    ctx.restore();
  },
};

// Export for use in panels
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOOM_FX };
}
if (typeof window !== 'undefined') {
  window.DOOM_FX = DOOM_FX;
}
