/**
 * GLITTER-LAYER.JS - Subtle glitter underlay effect for Glitter Apocalypse theme
 * Canvas2D only, 60fps, no per-frame allocations
 */

class GlitterLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isActive = false;
    
    // Preallocated particle pool
    this.particleCount = 60;
    this.particles = new Float32Array(this.particleCount * 5); // x, y, size, alpha, phase
    
    // Tile drift animation
    this.driftX = 0;
    this.driftY = 0;
    this.driftSpeedX = 0.05;
    this.driftSpeedY = 0.03;
    
    // Offscreen tile
    this.tile = null;
    this.tileSize = 256;
    
    // Time accumulator
    this.time = 0;
    
    // Initialize particles
    this._initParticles();
  }
  
  /**
   * Initialize particle positions and properties (no per-frame allocation)
   */
  _initParticles() {
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 5;
      this.particles[idx + 0] = Math.random(); // x (normalized 0-1)
      this.particles[idx + 1] = Math.random(); // y (normalized 0-1)
      this.particles[idx + 2] = 1 + Math.random() * 2; // size (1-3px)
      this.particles[idx + 3] = Math.random(); // alpha (0-1)
      this.particles[idx + 4] = Math.random() * Math.PI * 2; // phase offset
    }
  }
  
  /**
   * Generate the sparkle tile (called once per theme change or resize)
   */
  _generateTile() {
    if (!this.tile) {
      this.tile = document.createElement('canvas');
    }
    
    this.tile.width = this.tileSize;
    this.tile.height = this.tileSize;
    const ctx = this.tile.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, this.tileSize, this.tileSize);
    
    // Add faint noise gradient
    const grad = ctx.createRadialGradient(
      this.tileSize / 2, this.tileSize / 2, 0,
      this.tileSize / 2, this.tileSize / 2, this.tileSize / 2
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(0.5, 'rgba(255, 79, 216, 0.05)');
    grad.addColorStop(1, 'rgba(125, 249, 255, 0.04)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);
    
    // Scatter ~40 static sparkles across the tile
    ctx.globalCompositeOperation = 'lighter';
    const sparkleCount = 40;
    for (let i = 0; i < sparkleCount; i++) {
      const x = Math.random() * this.tileSize;
      const y = Math.random() * this.tileSize;
      const size = 0.5 + Math.random() * 1.5;
      const hue = Math.random() > 0.5 ? 320 : 180; // pink or cyan
      const alpha = 0.1 + Math.random() * 0.15;
      
      ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalCompositeOperation = 'source-over';
  }
  
  /**
   * Start the glitter effect
   */
  start() {
    console.log('[GlitterLayer] start() called, isActive before:', this.isActive);
    console.log('[GlitterLayer] Canvas size before:', this.canvas.width, 'x', this.canvas.height);
    if (this.isActive) return;
    this.isActive = true;
    this.canvas.classList.add('active');
    console.log('[GlitterLayer] Added "active" class');
    
    // Ensure canvas has proper size (after becoming visible)
    // Defer resize to next frame to ensure CSS has updated
    requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      // Canvas is sized to content area below header
      const headerEl = document.querySelector('header');
      const appEl = document.getElementById('app');
      const appRect = appEl.getBoundingClientRect();
      const headerRect = headerEl.getBoundingClientRect();
      
      const w = appRect.width;
      const h = appRect.height - headerRect.height;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.style.top = headerRect.height + 'px';
      console.log('[GlitterLayer] Canvas resized to', this.canvas.width, 'x', this.canvas.height, 'physical, CSS:', w, 'x', h, 'top offset:', headerRect.height);
    });
    
    this._generateTile();
    this.driftX = 0;
    this.driftY = 0;
    this.time = 0;
    console.log('[GlitterLayer] Started successfully');
  }
  
  /**
   * Stop the glitter effect and clear canvas
   */
  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    this.canvas.classList.remove('active');
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  /**
   * Handle canvas resize
   */
  resize(width, height, dpr) {
    if (!this.isActive) return;
    
    // Canvas is already sized by ResizeObserver in app.js
    // Just regenerate tile if needed
    if (!this.tile || this.tile.width !== this.tileSize) {
      this._generateTile();
    }
  }
  
  /**
   * Update animation state (no allocations)
   */
  tick(dt) {
    if (!this.isActive) return;
    
    this.time += dt;
    
    // Update drift (wraps at tile size)
    this.driftX = (this.driftX + this.driftSpeedX) % this.tileSize;
    this.driftY = (this.driftY + this.driftSpeedY) % this.tileSize;
    
    // Update particle phases (pulse animation)
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 5;
      const phase = this.particles[idx + 4] + dt * 0.001;
      this.particles[idx + 4] = phase % (Math.PI * 2);
    }
  }
  
  /**
   * Render the glitter effect
   */
  draw() {
    if (!this.isActive || !this.tile) return;
    
    // Debug logging (only every 120 frames ~2 seconds)
    if (!this._drawCount) this._drawCount = 0;
    this._drawCount++;
    if (this._drawCount === 1) {
      console.log('[GlitterLayer] First draw() call - canvas size:', this.canvas.width, 'x', this.canvas.height);
    }
    if (this._drawCount % 120 === 0) {
      console.log('[GlitterLayer] Still drawing... frame', this._drawCount);
    }
    
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    
    // Handle DPI scaling
    const dpr = window.devicePixelRatio || 1;
    if (this._lastDPR !== dpr) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._lastDPR = dpr;
    }
    
    // Work with logical pixels (CSS pixels) after DPI scaling
    const logicalW = w / dpr;
    const logicalH = h / dpr;
    
    // Clear for next frame
    ctx.clearRect(0, 0, logicalW, logicalH);
    
    // Draw tiled background with drift
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    
    const tilesX = Math.ceil(logicalW / this.tileSize) + 1;
    const tilesY = Math.ceil(logicalH / this.tileSize) + 1;
    const offsetX = -this.driftX;
    const offsetY = -this.driftY;
    
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = tx * this.tileSize + offsetX;
        const y = ty * this.tileSize + offsetY;
        ctx.drawImage(this.tile, x, y);
      }
    }
    
    // Draw pulsing twinkle particles
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 5;
      const px = this.particles[idx + 0] * logicalW;
      const py = this.particles[idx + 1] * logicalH;
      const baseSize = this.particles[idx + 2];
      const baseAlpha = this.particles[idx + 3];
      const phase = this.particles[idx + 4];
      
      // Pulse alpha and size with sine wave
      const pulse = Math.sin(phase) * 0.5 + 0.5; // 0-1
      const alpha = baseAlpha * pulse * 0.3; // High visibility
      const size = baseSize * (1 + pulse * 0.5);
      
      if (alpha > 0.005) {
        // Draw sparkle with glow
        ctx.globalAlpha = alpha;
        
        // Outer glow
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 1.5;
        ctx.fillStyle = i % 3 === 0 ? '#FF4FD8' : (i % 3 === 1 ? '#7DF9FF' : '#FFF');
        ctx.beginPath();
        ctx.arc(px, py, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Reset
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GlitterLayer };
}
if (typeof window !== 'undefined') {
  window.GlitterLayer = GlitterLayer;
}
