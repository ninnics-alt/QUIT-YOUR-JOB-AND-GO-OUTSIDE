/**
 * METERS-SIMPLE.JS - Minimal meter display for quick testing
 * Shows if canvas rendering works at all
 */

class MeterDisplay {
  constructor(canvasId) {
    console.log('[METERS] MeterDisplay constructor called with canvasId:', canvasId);
    this.canvas = document.getElementById(canvasId);
    console.log('[METERS] Canvas element:', this.canvas);
    if (!this.canvas) {
      console.error('[METERS] Canvas element not found:', canvasId);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    console.log('[METERS] Canvas ready, size:', this.canvas.width, 'x', this.canvas.height);

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
    console.log('[METERS] render() called');
    if (!this.ctx) return;
    
    // Use current canvas client dimensions (CSS pixels)
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const colors = THEME.colors;
    
    // Get theme-specific fonts (direct access to invoke getters)
    const fonts = THEME.fonts;
    console.log('[METERS] Theme:', THEME.currentPalette, 'sansLarge font:', fonts.sansLarge);
    
    // Background
    this.ctx.fillStyle = colors.bgPrimary;
    this.ctx.fillRect(0, 0, w, h);
    
    // Border
    this.ctx.strokeStyle = colors.accentA;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, w, h);
    
    // Title - use theme meter title font
    const titleSize = Math.max(12, Math.min(16, h * 0.08));
    this.ctx.fillStyle = colors.text;
    this.ctx.font = fonts.sansLarge;  // Use theme's meter title font
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
      this.ctx.fillStyle = colors.bgPanel;
      this.ctx.fillRect(m.x, m.y, meterW, meterH);
      
      // Card border
      this.ctx.strokeStyle = colors.accentA;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.x, m.y, meterW, meterH);
      
      // Responsive font sizes
      const labelSize = Math.max(9, Math.min(12, meterH * 0.12));
      const valueSize = Math.max(14, Math.min(28, meterH * 0.35));
      
      // Label - use theme meter label font
      this.ctx.fillStyle = colors.textMuted;
      this.ctx.font = fonts.monoSmall;  // Use theme's meter label font
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(m.label, m.x + 6, m.y + 4);
      
      // Value - use theme meter value font
      // Nuclear theme uses accentA (green) for meter values instead of accentB
      this.ctx.fillStyle = THEME.currentPalette === 'nuclear' ? colors.accentA : colors.accentB;
      this.ctx.font = fonts.monoBoldLarge;  // Use theme's meter value font
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
