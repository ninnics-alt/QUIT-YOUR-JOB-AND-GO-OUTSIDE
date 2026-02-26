/**
 * METERS-SIMPLE.JS - Minimal meter display for quick testing
 * Shows if canvas rendering works at all
 */

class MeterDisplay {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error('[MeterDisplay] Canvas element not found:', canvasId);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    console.log('[MeterDisplay] Initialized:', canvasId);

    // Data
    this.lufsIntegrated = 0;
    this.lufsMomentary = 0;
    this.lufsPeak = 0;
    this.rmsDbfs = 0;
    this.peakDbfs = 0;
    this.peakHoldDbfs = 0;
    
    this.detailLevel = 'med';
  }

  onResize(w, h) {
    // Called when canvas is resized
    // No need to store dimensions - we'll read them fresh each render
    console.log('[MeterDisplay] Resized to:', w, 'x', h);
  }

  updateMeters(integrated, momentary, peak, rms, peakLinear, peakHold) {
    this.lufsIntegrated = integrated || -120;
    this.lufsMomentary = momentary || -120;
    this.lufsPeak = peak || -120;
    this.rmsDbfs = rms || -120;
    this.peakDbfs = 20 * Math.log10(Math.max(0.00001, peakLinear || 0));
    this.peakHoldDbfs = 20 * Math.log10(Math.max(0.00001, peakHold || 0));
  }

  render() {
    if (!this.ctx) return;
    
    // Use current canvas client dimensions (CSS pixels)
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    // Background
    this.ctx.fillStyle = '#0a0e1a';
    this.ctx.fillRect(0, 0, w, h);
    
    // Border
    this.ctx.strokeStyle = '#00e5ff';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, w, h);
    
    // Title - responsive font size
    const titleSize = Math.max(12, Math.min(16, h * 0.08));
    this.ctx.fillStyle = '#e0e6ff';
    this.ctx.font = `bold ${titleSize}px monospace`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('LEVEL METERS', 12, 8);
    
    // Responsive layout: 2 rows, 3 columns
    const titleHeight = titleSize + 16;
    const gap = Math.max(8, w * 0.012); // ~1.2% of width
    const padding = Math.max(8, w * 0.008); // ~0.8% of width
    
    const availableW = w - (padding * 2) - (gap * 2);
    const availableH = h - titleHeight - padding - gap;
    
    const meterW = availableW / 3;
    const meterH = availableH / 2;
    
    const startY = titleHeight;
    const meters = [
      { x: padding, y: startY, label: 'LUFS Int', value: this.lufsIntegrated },
      { x: padding + meterW + gap, y: startY, label: 'LUFS Mom', value: this.lufsMomentary },
      { x: padding + (meterW + gap) * 2, y: startY, label: 'LUFS Peak', value: this.lufsPeak },
      { x: padding, y: startY + meterH + gap, label: 'RMS', value: this.rmsDbfs },
      { x: padding + meterW + gap, y: startY + meterH + gap, label: 'Peak', value: this.peakDbfs },
      { x: padding + (meterW + gap) * 2, y: startY + meterH + gap, label: 'Hold', value: this.peakHoldDbfs },
    ];
    
    meters.forEach(m => {
      // Card background
      this.ctx.fillStyle = '#0f1429';
      this.ctx.fillRect(m.x, m.y, meterW, meterH);
      
      // Card border
      this.ctx.strokeStyle = '#00e5ff';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.x, m.y, meterW, meterH);
      
      // Responsive font sizes
      const labelSize = Math.max(9, Math.min(12, meterH * 0.12));
      const valueSize = Math.max(14, Math.min(28, meterH * 0.35));
      
      // Label
      this.ctx.fillStyle = '#a0a8c8';
      this.ctx.font = `${labelSize}px monospace`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(m.label, m.x + 6, m.y + 4);
      
      // Value
      this.ctx.fillStyle = '#00ff88';
      this.ctx.font = `bold ${valueSize}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const valueStr = m.value.toFixed(1);
      this.ctx.fillText(valueStr, m.x + meterW / 2, m.y + meterH / 2 + 5);
    });
  }

  setDetailLevel(level) {
    this.detailLevel = level;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.MeterDisplay = MeterDisplay;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MeterDisplay;
}
