/**
 * DOOM-GLYPHS.JS - Mystical glyph grid background pattern for all panels
 * Precomputed diagonal chevrons, warning triangles, pseudo-text underlays
 * Low opacity (0.08-0.10), cached CanvasPattern, no per-frame allocations
 */

const DoomGlyphs = {
  // Predefine glyph strings (constants, not built per-frame)
  GLYPH_STRINGS: [
    'VLT∴RX',
    'NOX-13',
    'SIG//CAL',
    'NULLRITE',
    'XIII',
    '⊕⊖',
    'ZR:PROPH',
    '∞VOID∞',
  ],

  // Simple seeded RNG (mulberry32) for deterministic scatter
  _seededRNG(seed) {
    let m_w = seed;
    let m_z = 987654321;
    const mask = 0xffffffff;

    return function () {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  },

  // Cache: { key: { pattern, canvas, lastThemeVersion } }
  _patternCache: {},

  /**
   * Get or create a CanvasPattern for glyph grid
   * @param {number} dpr - Device pixel ratio
   * @param {number} cellPx - Cell size in pixels (before dpr scaling)
   * @returns {CanvasPattern}
   */
  getPattern(dpr = 1, cellPx = 160) {
    const cacheKey = `doom_${dpr}_${cellPx}`;
    const themeVersion = typeof THEME !== 'undefined' ? THEME.version : 0;

    // Return cached pattern if theme hasn't changed
    if (DoomGlyphs._patternCache[cacheKey]) {
      const cached = DoomGlyphs._patternCache[cacheKey];
      if (cached.lastThemeVersion === themeVersion) {
        return cached.pattern;
      }
    }

    // Create offscreen canvas for pattern
    const patternW = cellPx * dpr;
    const patternH = cellPx * dpr;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = patternW;
    patternCanvas.height = patternH;
    const pctx = patternCanvas.getContext('2d');

    // Get theme colors
    const theme = typeof THEME !== 'undefined' ? THEME : null;
    const colors = theme && theme.colors ? theme.colors : {};
    const accentOrange = colors.accentB || '#FF8B33';
    const accentRed = colors.accentA || '#FF3333';

    pctx.scale(dpr, dpr);

    // --- Diagonal chevrons (45° lines with breaks) ---
    pctx.strokeStyle = accentOrange;
    pctx.globalAlpha = 0.12;
    pctx.lineWidth = 0.6;

    const cellSize = cellPx;
    const chevronSpacing = 20; // pixels between chevron lines
    const chevronDash = 6; // length of dash

    for (let offset = -cellSize; offset < cellSize * 2; offset += chevronSpacing) {
      // Diagonal line from top-left to bottom-right
      const x1 = offset;
      const y1 = -cellSize;
      const x2 = offset + cellSize;
      const y2 = cellSize;

      // Draw dashed look with multiple small segments
      pctx.beginPath();
      pctx.moveTo(x1, y1);
      pctx.lineTo(x2, y2);
      pctx.stroke();
    }

    // --- Warning triangles (deterministic scatter via seeded RNG) ---
    const rng = DoomGlyphs._seededRNG(0x13370f);
    const triangleCount = 6;
    const triangles = [];

    for (let i = 0; i < triangleCount; i++) {
      triangles.push({
        x: rng() * cellSize,
        y: rng() * cellSize,
        size: 4 + rng() * 3,
        rotation: rng() * Math.PI * 2,
      });
    }

    pctx.strokeStyle = accentRed;
    pctx.globalAlpha = 0.08;
    pctx.lineWidth = 0.5;

    triangles.forEach((tri) => {
      pctx.save();
      pctx.translate(tri.x, tri.y);
      pctx.rotate(tri.rotation);

      // Draw hollow triangle
      const h = tri.size;
      const w = (tri.size * Math.sqrt(3)) / 2;
      pctx.beginPath();
      pctx.moveTo(0, -h / 1.5);
      pctx.lineTo(w / 2, h / 3);
      pctx.lineTo(-w / 2, h / 3);
      pctx.closePath();
      pctx.stroke();

      pctx.restore();
    });

    // --- Micro pseudo-text (precomputed glyph strings) ---
    pctx.fillStyle = accentOrange;
    pctx.globalAlpha = 0.06;
    pctx.font = 'normal 6px monospace';
    pctx.textAlign = 'left';
    pctx.textBaseline = 'top';

    // Deterministic placement of text glyphs
    const textRng = DoomGlyphs._seededRNG(0x42cafe);
    const textCount = 3;

    for (let i = 0; i < textCount; i++) {
      const glyphStr = DoomGlyphs.GLYPH_STRINGS[i % DoomGlyphs.GLYPH_STRINGS.length];
      const tx = textRng() * (cellSize - 40);
      const ty = textRng() * (cellSize - 20);
      const rotation = (textRng() - 0.5) * 0.2; // Very small rotation (-0.1 to 0.1 rad)

      pctx.save();
      pctx.translate(tx, ty);
      pctx.rotate(rotation);
      pctx.fillText(glyphStr, 0, 0);
      pctx.restore();
    }

    // Create pattern
    const pattern = pctx.createPattern(patternCanvas, 'repeat');

    // Cache it
    DoomGlyphs._patternCache[cacheKey] = {
      pattern,
      canvas: patternCanvas,
      lastThemeVersion: themeVersion,
    };

    return pattern;
  },

  /**
   * Draw glyph grid underlay in a panel area
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Panel left
   * @param {number} y - Panel top
   * @param {number} w - Panel width
   * @param {number} h - Panel height
   * @param {number} dpr - Device pixel ratio
   * @param {number} cellPx - Cell size (default 160)
   * @param {number} alpha - Opacity override (optional)
   * @param {number} driftX - Optional horizontal parallax offset
   */
  drawGlyphGrid(ctx, x, y, w, h, dpr = 1, cellPx = 160, alpha = 0.10, driftX = 0) {
    const theme = typeof THEME !== 'undefined' ? THEME : null;
    if (!theme || theme.currentPalette !== 'doom') return; // Only render in DOOM theme

    ctx.save();

    // Get pattern
    const pattern = DoomGlyphs.getPattern(dpr, cellPx);
    if (!pattern) {
      ctx.restore();
      return;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;

    // Optional subtle drift (very slow parallax)
    if (driftX !== 0) {
      ctx.translate(driftX, 0);
    }

    // Fill the panel area
    ctx.fillRect(x, y, w, h);

    ctx.restore();
  },

  /**
   * Clear pattern cache (call on theme change if needed)
   */
  clearCache() {
    DoomGlyphs._patternCache = {};
  },
};

// Export for use in panels
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DoomGlyphs };
}
if (typeof window !== 'undefined') {
  window.DoomGlyphs = DoomGlyphs;
}
