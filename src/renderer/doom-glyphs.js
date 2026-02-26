/**
 * DOOM-GLYPHS.JS - Mystical glyph grid background pattern for DOOM PROPHET theme
 * Cached CanvasPattern with chevrons, warning triangles, micro pseudo-text
 * Low opacity (0.06–0.12), subtle drift, deterministic seeded RNG
 * No per-frame allocations; pattern rebuilt only on theme/dpr/cellSize change
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

  // Cache: { key: CanvasPattern }
  // Key format: "dpr_cellPx_r_g_b" (theme colors baked in)
  _patternCache: {},

  /**
   * Get or create a CanvasPattern for the glyph grid underlay
   * @param {Object} opts - { dpr, cellPx, accentRed }
   * @returns {CanvasPattern}
   */
  getPattern(opts = {}) {
    const dpr = opts.dpr || 1;
    const cellPx = opts.cellPx || 160;
    const accentRed = opts.accentRed || '#FF3333';

    // Parse RGB from hex
    const r = parseInt(accentRed.slice(1, 3), 16);
    const g = parseInt(accentRed.slice(3, 5), 16);
    const b = parseInt(accentRed.slice(5, 7), 16);

    const cacheKey = `${dpr}_${cellPx}_${r}_${g}_${b}`;
    if (DoomGlyphs._patternCache[cacheKey]) {
      return DoomGlyphs._patternCache[cacheKey];
    }

    // Build offscreen canvas for pattern
    const cellSize = Math.ceil(cellPx * dpr);
    const offscreen = document.createElement('canvas');
    offscreen.width = cellSize;
    offscreen.height = cellSize;
    const octx = offscreen.getContext('2d');

    // Transparent background
    octx.clearRect(0, 0, cellSize, cellSize);

    // --- Diagonal chevrons (45° thin lines, broken pattern) ---
    octx.strokeStyle = accentRed;
    octx.lineWidth = Math.max(0.8 * dpr, 1);
    octx.globalAlpha = 0.08;

    const chevronSpacing = cellSize * 0.5;
    for (let x = -cellSize; x <= cellSize * 2; x += chevronSpacing) {
      octx.beginPath();
      octx.moveTo(x, 0);
      octx.lineTo(x + cellSize, cellSize);
      octx.stroke();
    }

    // --- Warning triangles (scattered, seeded RNG for consistency) ---
    octx.globalAlpha = 0.06;
    octx.lineWidth = Math.max(0.6 * dpr, 0.8);

    const rng = DoomGlyphs._seededRNG(0x13370f);
    const triCount = 3; // Few per cell
    for (let i = 0; i < triCount; i++) {
      const tx = rng() * cellSize;
      const ty = rng() * cellSize;
      const size = (2 + rng() * 1.5) * dpr;

      octx.save();
      octx.translate(tx, ty);
      octx.rotate(rng() * Math.PI);

      octx.beginPath();
      octx.moveTo(0, -size);
      octx.lineTo(size * 0.866, size * 0.5);
      octx.lineTo(-size * 0.866, size * 0.5);
      octx.closePath();
      octx.stroke();

      octx.restore();
    }

    // --- Micro pseudo-text glyphs (6-8px, partially legible, rotated) ---
    octx.globalAlpha = 0.10;
    octx.fillStyle = accentRed;
    octx.font = `${Math.max(5 * dpr, 6)}px monospace`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';

    const textCount = 2; // Few texts per cell
    const rng2 = DoomGlyphs._seededRNG(0x13370f + 1);
    for (let i = 0; i < textCount; i++) {
      const tx = rng2() * cellSize;
      const ty = rng2() * cellSize;
      const rotation = (rng2() - 0.5) * 0.3; // ±8.6° rotation

      octx.save();
      octx.translate(tx, ty);
      octx.rotate(rotation);

      const glyph = DoomGlyphs.GLYPH_STRINGS[Math.floor(rng2() * DoomGlyphs.GLYPH_STRINGS.length)];
      octx.fillText(glyph, 0, 0);

      octx.restore();
    }

    // Create pattern
    const pattern = octx.createPattern(offscreen, 'repeat');
    DoomGlyphs._patternCache[cacheKey] = pattern;

    return pattern;
  },

  /**
   * Draw the glyph underlay for a panel body
   * ONLY renders if theme === 'doom'
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} bodyX - Panel body left edge
   * @param {number} bodyY - Panel body top edge
   * @param {number} bodyW - Panel body width
   * @param {number} bodyH - Panel body height
   * @param {number} t - Time in seconds (for subtle drift)
   * @param {number} panelAlpha - Per-panel alpha override (default 0.10)
   */
  drawUnderlay(ctx, bodyX, bodyY, bodyW, bodyH, t = 0, panelAlpha = 0.10) {
    // Theme gate: only render for doom theme
    const theme = typeof THEME !== 'undefined' ? THEME : null;
    if (!theme || theme.currentPalette !== 'doom') {
      return;
    }

    const colors = (theme && theme.colors) || {};
    const accentRed = colors.accentA || '#FF3333';
    const dpr = window.devicePixelRatio || 1;
    const cellPx = 160;

    // Get cached pattern
    const pattern = DoomGlyphs.getPattern({ dpr, cellPx, accentRed });
    if (!pattern) return;

    ctx.save();

    // Clip to panel body rect (no header/toolbar overlap)
    ctx.beginPath();
    ctx.rect(bodyX, bodyY, bodyW, bodyH);
    ctx.clip();

    // Subtle drift (scrolls slowly)
    const driftX = (t * 2) % cellPx; // ~2px/sec
    const driftY = (t * 1) % cellPx; // ~1px/sec

    // Draw pattern underlay
    ctx.globalAlpha = panelAlpha;
    ctx.fillStyle = pattern;
    ctx.translate(bodyX + driftX, bodyY + driftY);
    ctx.fillRect(-cellPx, -cellPx, bodyW + cellPx * 2, bodyH + cellPx * 2);

    ctx.restore();
  },

  /**
   * Clear pattern cache (call on theme change)
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
