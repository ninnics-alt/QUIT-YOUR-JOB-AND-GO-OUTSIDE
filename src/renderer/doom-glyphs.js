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
   * Get or create a CanvasPattern for glyph grid (DEPRECATED - now using direct drawing)
   * @deprecated Use drawGlyphGrid instead
   */
  getPattern(dpr = 1, cellPx = 160) {
    // Pattern-based approach is deprecated; drawGlyphGrid now renders directly
    return null;
  },

  drawGlyphGrid(ctx, x, y, w, h, dpr = 1, cellPx = 160, alpha = 0.25) {
    // Always render for all themes (will use defaults if theme not available)
    const theme = typeof THEME !== 'undefined' ? THEME : null;
    const colors = (theme && theme.colors) || {};
    const accentOrange = colors.accentB || '#FF8B33';
    const accentRed = colors.accentA || '#FF3333';

    ctx.save();

    // --- Diagonal chevrons (45° lines) ---
    ctx.strokeStyle = accentRed;
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = alpha * 1.2;

    const chevronSpacing = cellPx * 0.75;
    for (let ox = x - h; ox < x + w + h; ox += chevronSpacing) {
      ctx.beginPath();
      ctx.moveTo(ox, y - h);
      ctx.lineTo(ox + h, y + h);
      ctx.stroke();
    }

    // --- Warning triangles (seeded RNG for consistency) ---
    ctx.globalAlpha = alpha * 1.0;
    ctx.strokeStyle = accentRed;
    ctx.lineWidth = 1.2;

    const rng = DoomGlyphs._seededRNG(0x13370f);
    const gridCols = Math.ceil(w / cellPx) + 1;
    const gridRows = Math.ceil(h / cellPx) + 1;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        rng(); // Advance RNG
        const triX = x + col * cellPx + rng() * cellPx * 0.5;
        const triY = y + row * cellPx + rng() * cellPx * 0.5;
        const triSize = 3 + rng() * 2;

        ctx.save();
        ctx.translate(triX, triY);
        ctx.rotate(rng() * Math.PI);

        ctx.beginPath();
        ctx.moveTo(0, -triSize);
        ctx.lineTo(triSize * 0.866, triSize * 0.5);
        ctx.lineTo(-triSize * 0.866, triSize * 0.5);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }
    }

    // --- Micro glyph text ---
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#FF0000';  // Pure bright red
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Place glyphs in specific visible locations within the panel
    const glyphs = [
      { x: 0.15, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.85, y: 0.2 },
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
      { x: 0.15, y: 0.8 },
      { x: 0.5, y: 0.8 },
      { x: 0.85, y: 0.8 }
    ];

    glyphs.forEach((pos, i) => {
      const glyph = DoomGlyphs.GLYPH_STRINGS[i % DoomGlyphs.GLYPH_STRINGS.length];
      const tx = x + pos.x * w;
      const ty = y + pos.y * h;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.fillText(glyph, 0, 0);
      ctx.restore();
    });

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
