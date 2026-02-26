/**
 * THEME.JS - Centralized design system
 * Colors, typography, spacing, shadows, and drawing helpers
 */

const THEME = {
  // Color palette
  colors: {
    bgPrimary: '#0a0e1a',      // Dark base
    bgSecondary: '#0f1429',    // Slightly lighter panels
    bgTertiary: '#141b2e',     // Hover/active state
    
    textPrimary: '#e0e6ff',    // Main text
    textSecondary: '#a0a8c8',  // Secondary/labels
    textTertiary: '#6b73a0',   // Captions/hints
    
    accentBlue: '#00e5ff',     // Cyan accent
    accentGreen: '#00ff88',    // Success/trail color
    accentYellow: '#ffcc00',   // Warning
    accentRed: '#ff2a4a',      // Danger/clipping
    
    gridLight: '#1a1f3a',      // Grid/dividers
    gridDark: '#0d10 18',      // Subtle grid
    
    strokeBright: '#2a3050',   // Borders
    strokeDim: '#161d2e',      // Subtle borders
  },

  // Typography
  fonts: {
    mono: '11px "Monaco", "Courier New", monospace',
    monoSmall: '9px "Monaco", "Courier New", monospace',
    monoBold: 'bold 11px "Monaco", "Courier New", monospace',
    monoBoldLarge: 'bold 24px "Monaco", "Courier New", monospace',
    sansRegular: '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sansBold: 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sansLarge: 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // Spacing scale (4px grid)
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  // Shadows and strokes
  shadows: {
    inner: { x: 0, y: 0, blur: 0, spread: 0, color: 'rgba(255,255,255,0.08)' },
    outerSoft: { x: 0, y: 2, blur: 8, spread: -2, color: 'rgba(0,0,0,0.3)' },
  },

  borderRadius: {
    sm: 2,
    md: 4,
    lg: 6,
  },

  // Performance thresholds
  performance: {
    trailFrames: 5,           // Number of trail frames to keep
    scanlineOpacity: 0.08,    // Subtle scanlines
    peakHoldDecay: 500,       // ms for peak indicator to fade
    valueLerpDuration: 50,    // ms for smooth value transitions
  },

  // Reference levels (standards)
  standards: {
    lufsIntegratedTarget: -23,    // EBU R128
    lufsShortTermMax: -18,
    lufsMomentaryMax: -18,
    lufsAbsoluteGate: -70,
    lufsTrueGate: -140,
    peakAbsoluteLevel: 0,         // dBFS
    peakTrueLevel: -3,            // For safety headroom
  },
};

/**
 * Drawing helpers for consistent UI elements
 */
const UIHelpers = {
  /**
   * Draw a shadow effect (inner bright + outer soft)
   */
  drawPanelShadow(ctx, x, y, w, h, radius = 4) {
    // Outer soft shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    
    ctx.fillStyle = THEME.colors.bgSecondary;
    UIHelpers.roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    
    // Inner bright stroke
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    UIHelpers.roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  },

  /**
   * Draw rounded rectangle path
   */
  roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /**
   * Draw grid with major and minor ticks
   */
  drawGrid(ctx, x, y, w, h, majorSpacing, minorSpacing = null, color = null, minorColor = null) {
    const colors = {
      major: color || THEME.colors.gridLight,
      minor: minorColor || THEME.colors.gridDark,
    };

    // Minor grid
    if (minorSpacing) {
      ctx.strokeStyle = colors.minor;
      ctx.lineWidth = 0.5;
      for (let i = y; i <= y + h; i += minorSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, i);
        ctx.lineTo(x + w, i);
        ctx.stroke();
      }
      for (let i = x; i <= x + w; i += minorSpacing) {
        ctx.beginPath();
        ctx.moveTo(i, y);
        ctx.lineTo(i, y + h);
        ctx.stroke();
      }
    }

    // Major grid
    ctx.strokeStyle = colors.major;
    ctx.lineWidth = 1;
    for (let i = y; i <= y + h; i += majorSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, i);
      ctx.lineTo(x + w, i);
      ctx.stroke();
    }
    for (let i = x; i <= x + w; i += majorSpacing) {
      ctx.beginPath();
      ctx.moveTo(i, y);
      ctx.lineTo(i, y + h);
      ctx.stroke();
    }
  },

  /**
   * Draw labeled tick marks on an axis
   */
  drawAxisTicks(ctx, x, y, length, isVertical = false, ticks = [], tickHeight = 4, color = null) {
    ctx.strokeStyle = color || THEME.colors.accentBlue;
    ctx.lineWidth = 1;
    ctx.fillStyle = THEME.colors.textSecondary;
    ctx.font = THEME.fonts.monoSmall;
    ctx.textAlign = isVertical ? 'right' : 'center';
    ctx.textBaseline = isVertical ? 'middle' : 'top';

    ticks.forEach(({ pos, label }) => {
      if (isVertical) {
        // Vertical axis (Y)
        const ty = y + (pos / 100) * length;
        ctx.beginPath();
        ctx.moveTo(x, ty);
        ctx.lineTo(x - tickHeight, ty);
        ctx.stroke();
        if (label) {
          ctx.fillText(label, x - tickHeight - 4, ty);
        }
      } else {
        // Horizontal axis (X)
        const tx = x + (pos / 100) * length;
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.lineTo(tx, y + tickHeight);
        ctx.stroke();
        if (label) {
          ctx.fillText(label, tx, y + tickHeight + 4);
        }
      }
    });
  },

  /**
   * Draw a reference line (e.g., 0 dBFS, -14 LUFS threshold)
   */
  drawReferenceLine(ctx, x, y, length, isVertical = false, label = null, style = 'dashed') {
    ctx.strokeStyle = THEME.colors.accentYellow;
    ctx.lineWidth = 1;
    ctx.setLineDash(style === 'dashed' ? [3, 3] : []);
    
    if (isVertical) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y);
      ctx.stroke();
    }

    if (label) {
      ctx.font = THEME.fonts.monoSmall;
      ctx.fillStyle = THEME.colors.accentYellow;
      ctx.fillText(label, isVertical ? x + 4 : x + 4, isVertical ? y - 6 : y - 6);
    }

    ctx.setLineDash([]);
  },

  /**
   * Draw a clip indicator flash
   */
  drawClipIndicator(ctx, x, y, w, h, intensity = 0.5, text = 'CLIP') {
    const alpha = intensity * 0.8;
    ctx.fillStyle = `rgba(255, 42, 74, ${alpha})`;
    UIHelpers.roundRect(ctx, x, y, w, h, 2);
    ctx.fill();

    // Text
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.font = THEME.fonts.monoBold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
  },

  /**
   * Draw a mini horizontal bar with gradient (for meter visualization)
   */
  drawMiniMeterBar(ctx, x, y, w, h, value = 0.5, min = -60, max = 0) {
    // Background
    ctx.fillStyle = THEME.colors.bgTertiary;
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = THEME.colors.gridLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Value bar with gradient (cold to hot)
    const fillW = ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * w;
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0, '#1a4d7a');    // Cold blue
    gradient.addColorStop(0.5, '#ffcc00');  // Warm yellow
    gradient.addColorStop(1, '#ff2a4a');    // Hot red
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, fillW, h);
  },

  /**
   * Draw a trail with alpha fade (for oscilloscope/scope effects)
   */
  drawTrail(ctx, points, color = null, maxAge = 5) {
    if (points.length < 2) return;

    const c = color || THEME.colors.accentGreen;
    const [r, g, b] = this._parseRGB(c);

    for (let i = 0; i < points.length - 1; i++) {
      const age = points.length - i;
      const alpha = 1 - (age / maxAge);
      if (alpha <= 0) continue;

      const p1 = points[i];
      const p2 = points[i + 1];

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  },

  /**
   * Add subtle scanlines overlay
   */
  drawScanlines(ctx, x, y, w, h, opacity = THEME.performance.scanlineOpacity) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = 1;
    for (let i = y; i < y + h; i += 2) {
      ctx.beginPath();
      ctx.moveTo(x, i);
      ctx.lineTo(x + w, i);
      ctx.stroke();
    }
  },

  /**
   * Smooth value transition (lerp)
   */
  lerpValue(current, target, duration = THEME.performance.valueLerpDuration) {
    const elapsed = Date.now() % duration;
    const t = elapsed / duration;
    return current + (target - current) * t;
  },

  /**
   * Parse RGB from hex or rgb string
   */
  _parseRGB(color) {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    } else if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      return match.map(Number);
    }
    return [0, 229, 255]; // Default cyan
  },
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEME, UIHelpers };
}
if (typeof window !== 'undefined') {
  window.THEME = THEME;
  window.UIHelpers = UIHelpers;
}
