/**
 * THEME.JS - Centralized design system
 * Colors, typography, spacing, shadows, and drawing helpers
 */

// Define all theme palettes (NO shared object references)
const THEMES = {
  ps2: {
    // Base colors - PlayStation era inspired
    bgPrimary: '#000308',
    bgPanel: '#0A0F1A',
    bgPanel2: '#0F1422',
    bgInset: '#020508',
    border: '#2A3D5A',
    borderSoft: '#3A4D6A',
    grid: '#0E1520',
    text: '#D8E4F8',
    textMuted: '#8EA4C8',
    textDim: '#5A6E8E',
    
    // PlayStation accents
    accentA: '#3D8EFF',      // PS2 blue
    accentB: '#00C8DC',      // Memory card LED cyan
    accentC: '#9D6FE8',      // PS1 UI magenta hint
    accentGood: '#4AE88A',   // Soft confirm green
    accentWarn: '#FFB84D',
    accentBad: '#FF4757',
    
    // PlayStation-era effects
    glow: 'rgba(61, 142, 255, 0.25)',
    shadow: 'rgba(0, 0, 0, 0.7)',
    gridLine: '#1A2838',
    scanlineOpacity: 0.03,
    noiseOpacity: 0.02,
    sparkleOpacity: 0,
    
    // Bevel effect tokens
    bevelLight: 'rgba(100, 140, 200, 0.3)',
    bevelDark: 'rgba(0, 0, 0, 0.6)',
    
    // Console-era effects
    phosphorStrength: 0.15,
    ditheringStrength: 0.08,
    bloomStrength: 0.12,
    vignetteStrength: 0.25,
    
    // Meter colors
    meterGood: '#4AE88A',
    meterWarn: '#FFB84D',
    meterClip: '#FF4757',
    
    // Waveform/trace colors - chunkier feel
    waveformL: '#3D8EFF',
    waveformR: '#00C8DC',
    trace: '#3D8EFF',
    
    // Spectrogram palette
    spectroPaletteName: 'ps2',
    
    // Meter fonts - PlayStation console era
    meterFontValue: 'system-ui, -apple-system, sans-serif',
    meterFontLabel: 'ui-monospace, monospace',
    meterFontTitle: 'system-ui, -apple-system, sans-serif',
  },
  
  neon: {
    // Base colors - DEEP BLUE/BLACK
    bgPrimary: '#000408',
    bgPanel: '#050A14',
    bgPanel2: '#0A0F1C',
    bgInset: '#000204',
    border: '#1A3D6B',
    borderSoft: '#2A4D7B',
    grid: '#0F1822',
    text: '#E0F0FF',
    textMuted: '#7DB1E8',
    textDim: '#4A7FAD',
    
    // Accents - CYAN/MAGENTA
    accentA: '#00E5FF',
    accentB: '#FF3DF2',
    accentGood: '#00FFB3',
    accentWarn: '#FFD700',
    accentBad: '#FF2A77',
    
    // Effects - STRONG BLOOM/GLOW
    glow: 'rgba(0, 229, 255, 0.8)',
    shadow: 'rgba(0, 229, 255, 0.3)',
    gridLine: '#1A3D6B',
    scanlineOpacity: 0.15,
    noiseOpacity: 0.01,
    sparkleOpacity: 0,
    
    // Meter colors
    meterGood: '#00FFB3',
    meterWarn: '#FFD700',
    meterClip: '#FF2A77',
    
    // Waveform/trace colors - sharper
    waveformL: '#00E5FF',
    waveformR: '#FF3DF2',
    trace: '#00E5FF',
    
    // Spectrogram palette
    spectroPaletteName: 'neon',
    
    // Meter fonts - Arcade rounded
    meterFontValue: 'Roboto Mono, monospace',
    meterFontLabel: 'ui-monospace, monospace',
    meterFontTitle: 'Roboto Mono, monospace',
  },
  
  doom: {
    // Base colors - near-black primary, smoky panels
    bgPrimary: '#080404',
    bgPanel: '#120808',
    bgPanel2: '#1A0E0E',
    bgInset: '#030101',
    border: '#2A0808',
    borderSoft: '#3A1010',
    grid: '#1A0A0A',
    text: '#E8E0DC',
    textMuted: '#A88880',
    textDim: '#705858',
    
    // Hell-tech accents
    accentA: '#FF3333',      // Danger red - borders/warnings only
    accentB: '#FF8B33',      // Amber/Orange - numeric readouts
    accentC: '#CC5533',      // Darker orange for secondary
    accentGood: '#88DD44',   // Sulfur green - "OK" status (optional)
    accentWarn: '#FFCC00',   // Hot warning
    accentBad: '#FF1122',    // Burning red
    
    // Effects - reduced intensity grids
    glow: 'rgba(255, 51, 51, 0.25)',
    shadow: 'rgba(0, 0, 0, 0.8)',
    gridLine: '#1A0A0A',
    scanlineOpacity: 0.04,
    noiseOpacity: 0.02,
    sparkleOpacity: 0,
    
    // Bevel effect tokens
    bevelLight: 'rgba(100, 60, 60, 0.2)',
    bevelDark: 'rgba(0, 0, 0, 0.7)',
    
    // Hell-tech visual effect tokens
    doomEmberOpacity: 0.25,
    doomHeatHazeStrength: 0.12,
    doomFlareMs: 150,
    doomBorderInner: 'rgba(255, 80, 60, 0.4)',
    doomBorderOuter: 'rgba(40, 15, 15, 0.9)',
    doomDigitScanlineOpacity: 0.06,
    
    // Console-era effects
    phosphorStrength: 0.2,   // Increased for hell-tech look
    ditheringStrength: 0.1,
    bloomStrength: 0.15,
    vignetteStrength: 0.2,
    
    // Meter colors
    meterGood: '#88DD44',
    meterWarn: '#FFCC00',
    meterClip: '#FF1122',
    
    // Waveform/trace colors - charred phosphor
    waveformL: '#FF3333',
    waveformR: '#FF8B33',
    trace: '#FF3333',
    
    // Spectrogram palette
    spectroPaletteName: 'doom',
    
    // Meter fonts - Hell-tech engraved
    meterFontValue: 'Courier, monospace',
    meterFontLabel: 'ui-monospace, monospace',
    meterFontTitle: 'Courier, monospace',
  },
  
  glitter: {
    // Base colors - DARK PURPLE WITH PINK/WHITE
    bgPrimary: '#0D0611',
    bgPanel: '#180D24',
    bgPanel2: '#23152F',
    bgInset: '#08040C',
    border: '#4A2962',
    borderSoft: '#6A4A82',
    grid: '#2A183D',
    text: '#FFF7FF',
    textMuted: '#E8C8FF',
    textDim: '#B48ACF',
    
    // Accents - PINK/WHITE HIGHLIGHTS
    accentA: '#FF4FD8',
    accentB: '#D4A5FF',
    accentGood: '#C8FF6A',
    accentWarn: '#FFE5A0',
    accentBad: '#FF4A8D',
    
    // Effects - SOFT GLOWS, SHIMMER, GLITTER
    glow: 'rgba(255, 79, 216, 0.5)',
    shadow: 'rgba(255, 79, 216, 0.2)',
    gridLine: '#4A2962',
    scanlineOpacity: 0,
    noiseOpacity: 0.08,
    sparkleOpacity: 0.6,
    
    // Meter colors
    meterGood: '#C8FF6A',
    meterWarn: '#FFE5A0',
    meterClip: '#FF4A8D',
    
    // Waveform/trace colors - more variance/shimmer
    waveformL: '#FF4FD8',
    waveformR: '#D4A5FF',
    trace: '#FF9FF0',
    
    // Spectrogram palette
    spectroPaletteName: 'cottoncandy',
    
    // Meter fonts - Playful handwritten
    meterFontValue: 'cursive, sans-serif',
    meterFontLabel: 'system-ui, sans-serif',
    meterFontTitle: 'cursive',
  },
  
  nuclear: {
    // Base colors
    bgPrimary: '#050A06',
    bgPanel: '#07110A',
    bgPanel2: '#0A1810',
    bgInset: '#020503',
    border: '#0E2B1A',
    borderSoft: '#1E3B2A',
    grid: '#0A2013',
    text: '#CFFFE0',
    textMuted: '#6DBA86',
    textDim: '#4A8A5E',
    
    // Accents
    accentA: '#00FF66',
    accentB: '#00D1FF',
    accentGood: '#00FF66',
    accentWarn: '#FFB000',
    accentBad: '#FF3355',
    
    // Effects
    glow: 'rgba(0, 255, 102, 0.5)',
    shadow: 'rgba(0, 255, 102, 0.2)',
    gridLine: '#0E2B1A',
    scanlineOpacity: 0.06,
    noiseOpacity: 0.04,
    sparkleOpacity: 0,
    
    // Meter colors
    meterGood: '#00FF66',
    meterWarn: '#FFB000',
    meterClip: '#FF3355',
    
    // Waveform/trace colors
    waveformL: '#00FF66',
    waveformR: '#00D1FF',
    trace: '#00FF66',
    
    // Spectrogram palette
    spectroPaletteName: 'nuclear',
    
    // Meter fonts - Terminal/Radiation display
    meterFontValue: 'Times New Roman, serif',
    meterFontLabel: 'Times New Roman, serif',
    meterFontTitle: 'Times New Roman, serif',
  },
  
  monochrome: {
    // Base colors - Utilitarian / Photocopied aesthetic
    bgPrimary: '#050505',
    bgPanel: '#0C0C0C',
    bgPanel2: '#0F0F0F',
    bgInset: '#020202',
    border: '#2A2A2A',
    borderSoft: '#3A3A3A',
    grid: '#181818',
    text: '#EAEAEA',
    textMuted: '#A8A8A8',
    textDim: '#707070',
    
    // Accents - Extremely limited, faint gray-blue for focus
    accentA: '#DADADA',
    accentB: '#BFC7D0',
    accentGood: '#CCCCCC',
    accentWarn: '#D0D0D0',
    accentBad: '#F0F0F0',
    
    // Effects - Minimal, flat surfaces
    glow: 'rgba(255, 255, 255, 0.02)',
    shadow: 'rgba(0, 0, 0, 0.65)',
    gridLine: '#2A2A2A',
    scanlineOpacity: 0.03,
    noiseOpacity: 0.04,
    sparkleOpacity: 0,
    
    // Bevel effect tokens - Flat
    bevelLight: 'rgba(255, 255, 255, 0.05)',
    bevelDark: 'rgba(0, 0, 0, 0.5)',
    
    // Minimal effects
    phosphorStrength: 0,
    ditheringStrength: 0.02,
    bloomStrength: 0,
    vignetteStrength: 0.08,
    
    // Meter colors - Grayscale
    meterGood: '#CCCCCC',
    meterWarn: '#D8D8D8',
    meterClip: '#FFFFFF',
    
    // Waveform/trace colors - White/gray
    waveformL: '#FFFFFF',
    waveformR: '#DADADA',
    trace: '#FFFFFF',
    
    // Spectrogram palette
    spectroPaletteName: 'monochrome',
    
    // Meter fonts - Utilitarian monospace
    meterFontValue: 'Monaco, monospace',
    meterFontLabel: 'Monaco, monospace',
    meterFontTitle: 'Monaco, monospace',
  },
};

const THEME = {
  // Color palette (default to PS2)
  colors: { ...THEMES.ps2 },
  
  // Current palette key
  currentPalette: 'ps2',
  
  // Version counter incremented on every palette change
  version: 0,
  
  // Legacy color aliases for backward compatibility
  get bgSecondary() { return this.colors.bgPanel; },
  get bgTertiary() { return this.colors.bgPanel; },
  get textPrimary() { return this.colors.text; },
  get textSecondary() { return this.colors.textMuted; },
  get textTertiary() { return this.colors.textMuted; },
  get accentBlue() { return this.colors.accentA; },
  get accentGreen() { return this.colors.accentB; },
  get accentYellow() { return this.colors.accentWarn; },
  get accentRed() { return this.colors.accentBad; },
  get gridLight() { return this.colors.border; },
  get gridDark() { return this.colors.grid; },

  // Typography with per-theme meter fonts
  fonts: {
    mono: '11px "Monaco", "Courier New", monospace',
    // Meter label font (dynamic per theme)
    get monoSmall() {
      const themeFonts = THEMES[THEME.currentPalette];
      console.log('[THEME monoSmall getter] currentPalette:', THEME.currentPalette, 'themeFonts:', themeFonts);
      if (themeFonts && themeFonts.meterFontLabel) {
        return `9px ${themeFonts.meterFontLabel}`;
      }
      return '9px "Monaco", "Courier New", monospace';
    },
    monoBold: 'bold 11px "Monaco", "Courier New", monospace',
    // Meter value font (dynamic per theme)
    get monoBoldLarge() {
      const themeFonts = THEMES[THEME.currentPalette];
      if (themeFonts && themeFonts.meterFontValue) {
        return `bold 24px ${themeFonts.meterFontValue}`;
      }
      return 'bold 24px "Monaco", "Courier New", monospace';
    },
    sansRegular: '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sansBold: 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    // Meter title font (dynamic per theme)
    get sansLarge() {
      const themeFonts = THEMES[THEME.currentPalette];
      if (themeFonts && themeFonts.meterFontTitle) {
        return `bold 18px ${themeFonts.meterFontTitle}`;
      }
      return 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    },
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
  
  /**
   * Apply a color palette and update the UI
   * @param {string} paletteKey - Key from THEMES object (ps2, neon, doom, glitter, nuclear)
   */
  applyPalette(paletteKey) {
    if (!THEMES[paletteKey]) {
      console.warn(`Unknown palette: ${paletteKey}, defaulting to ps2`);
      paletteKey = 'ps2';
    }
    
    // Increment version to invalidate all caches
    this.version++;
    
    // Store current palette key for theme detection
    this.currentPalette = paletteKey;
    
    // Update colors object (create new copy to avoid reference issues)
    this.colors = { ...THEMES[paletteKey] };
    
    // Set data-theme attribute on document element for CSS theme-specific styles
    document.documentElement.setAttribute('data-theme', paletteKey);
    
    // Update CSS variables on :root
    const root = document.documentElement;
    root.style.setProperty('--bgPrimary', this.colors.bgPrimary);
    root.style.setProperty('--bgPanel', this.colors.bgPanel);
    root.style.setProperty('--bgInset', this.colors.bgInset);
    root.style.setProperty('--border', this.colors.border);
    root.style.setProperty('--grid', this.colors.grid);
    root.style.setProperty('--text', this.colors.text);
    root.style.setProperty('--textMuted', this.colors.textMuted);
    root.style.setProperty('--accentA', this.colors.accentA);
    root.style.setProperty('--accentB', this.colors.accentB);
    root.style.setProperty('--accentGood', this.colors.accentGood);
    root.style.setProperty('--accentWarn', this.colors.accentWarn);
    root.style.setProperty('--accentBad', this.colors.accentBad);
    
    // Legacy CSS variable names for backward compatibility
    root.style.setProperty('--bg-base', this.colors.bgPrimary);
    root.style.setProperty('--bg-panel', this.colors.bgPanel);
    root.style.setProperty('--bg-elevated', this.colors.bgPanel);
    root.style.setProperty('--border-color', this.colors.border);
    root.style.setProperty('--text-primary', this.colors.text);
    root.style.setProperty('--text-secondary', this.colors.textMuted);
    root.style.setProperty('--text-tertiary', this.colors.textMuted);
    root.style.setProperty('--accent-blue', this.colors.accentA);
    root.style.setProperty('--accent-green', this.colors.accentB);
    root.style.setProperty('--accent-yellow', this.colors.accentWarn);
    root.style.setProperty('--accent-red', this.colors.accentBad);
    root.style.setProperty('--clipping-red', this.colors.accentBad);
    root.style.setProperty('--grid-light', this.colors.border);
    root.style.setProperty('--grid-dark', this.colors.grid);
    
    // Invalidate cached drawing assets
    this._invalidateCaches();
    
    // Trigger full redraw by dispatching custom event
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { palette: paletteKey } }));
  },
  
  /**
   * Clear cached canvases and buffers that may contain theme-specific colors
   * @private
   */
  _invalidateCaches() {
    // Clear offscreen canvas buffers if they exist
    if (typeof window !== 'undefined') {
      // Vectorscope buffer
      const vsBuffer = document.getElementById('vectorscope')?.nextElementSibling;
      if (vsBuffer && vsBuffer.tagName === 'CANVAS') {
        const ctx = vsBuffer.getContext('2d');
        ctx && ctx.clearRect(0, 0, vsBuffer.width, vsBuffer.height);
      }
      
      // Spectrogram buffer
      const specBuf = document.querySelector('canvas[data-buffer="spectrogram"]');
      if (specBuf) {
        const ctx = specBuf.getContext('2d');
        ctx && ctx.clearRect(0, 0, specBuf.width, specBuf.height);
      }
      
      // Signal that all canvases should be cleared on next frame
      window._themeCachesInvalidated = true;
    }
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

  /**
   * Get spectrograph color based on current theme
   * @param {number} positionNorm - Normalized horizontal position (0-1, left to right)
   * @param {number} intensityNorm - Normalized intensity/level (0-1, silence to peak)
   * @returns {string} HSL color string
   */
  getSpectroColor(positionNorm, intensityNorm) {
    const paletteName = THEME.colors.spectroPaletteName || 'ps2';
    
    // Clamp inputs
    const pos = Math.max(0, Math.min(1, positionNorm));
    const intensity = Math.max(0, Math.min(1, intensityNorm));
    
    let hue, sat, light;
    
    switch (paletteName) {
      case 'ps2':
        // PlayStation blue to cyan
        hue = 200 + 20 * pos;  // 200 (blue) to 220 (cyan)
        sat = 85 + 10 * intensity;
        light = 25 + 40 * intensity;
        break;
        
      case 'neon':
        // Cyan to magenta neon glow
        hue = 180 + 120 * pos;  // 180 (cyan) to 300 (magenta)
        sat = 100;
        light = 30 + 45 * intensity;
        break;
        
      case 'doom':
        // Fire/hell - red to yellow
        hue = 0 + 60 * pos;  // 0 (red) to 60 (yellow)
        sat = 100;
        light = 20 + 50 * intensity;
        break;
        
      case 'cottoncandy':
        // Sweet pastels - pink to blue
        hue = 320 + 80 * pos;  // 320 (pink) to 400 (wraps to 40, blue-teal)
        if (hue >= 360) hue -= 360;
        sat = 80 + 15 * intensity;
        light = 50 + 30 * intensity;
        break;
        
      case 'nuclear':
        // Radioactive - green to yellow
        hue = 120 + 30 * pos;  // 120 (green) to 150 (yellow-green)
        sat = 95 + 5 * intensity;
        light = 25 + 50 * intensity;
        break;
        
      case 'monochrome':
        // Grayscale - no hue variation
        hue = 0;
        sat = 0;
        light = 15 + 70 * intensity;
        break;
        
      case 'glitter':
        // Rainbow spectrum across frequency
        hue = pos * 300;  // Full rainbow sweep
        sat = 90 + 10 * intensity;
        light = 40 + 40 * intensity;
        break;
        
      default:
        // Fallback to classic green-cyan
        hue = 140 + 60 * pos;
        sat = 95;
        light = 20 + 45 * intensity;
    }
    
    return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
  },
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEME, THEMES, UIHelpers };
}
if (typeof window !== 'undefined') {
  window.THEME = THEME;
  window.THEMES = THEMES;
  window.UIHelpers = UIHelpers;
}
