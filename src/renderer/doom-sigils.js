/**
 * DOOM-SIGILS.JS - Mystical sigil calibration rings for Vectorscope/Goniometer
 * Draws rotating runes, ticks, and warning teeth as occult UI overlay
 * Low opacity (0.08-0.15), Canvas-only, no per-frame allocations
 */

const DoomSigils = {
  // Precomputed angles for runes (placed around ring circumference)
  RUNE_ANGLES: [
    0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4,
    Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4,
  ],

  // Precomputed angles for ticks (45° increments)
  TICK_ANGLES: [
    0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4,
    Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4,
  ],

  // Precomputed angles for warning teeth (every 30° = π/6, then every other)
  TEETH_ANGLES: (() => {
    const angles = [];
    for (let i = 0; i < 12; i += 2) {
      angles.push((i * Math.PI) / 6);
    }
    return angles;
  })(),

  /**
   * Draw calibration rings with runes, ticks, and teeth
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} radius - Ring radius
   * @param {number} t - Time (seconds) for rotation
   * @param {object} opts - Options { accentColor, theme }
   */
  drawCalibration(ctx, cx, cy, radius, t = 0, opts = {}) {
    // Always render for testing (will only appear when panels call it)
    const theme = opts.theme || (typeof THEME !== 'undefined' ? THEME : null);
    const accentColor = opts.accentColor || (theme && theme.colors && theme.colors.accentRed) || '#FF3333';

    // Slow rotation: ~0.12 rad/s * t
    const angleOffset = t * 0.12;

    ctx.save();

    // --- Concentric circular glyph rings ---
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.2;

    // Draw 3 concentric circles
    const ringRadii = [radius * 0.33, radius * 0.67, radius];
    ringRadii.forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // --- Runes: small arc segments around the rings ---
    ctx.globalAlpha = 0.20;
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = accentColor;

    DoomSigils.RUNE_ANGLES.forEach((angle) => {
      ringRadii.forEach((r, idx) => {
        const arcStart = angle - 0.15;
        const arcEnd = angle + 0.15;
        const startX = cx + Math.cos(arcStart) * r;
        const startY = cy + Math.sin(arcStart) * r;
        const endX = cx + Math.cos(arcEnd) * r;
        const endY = cy + Math.sin(arcEnd) * r;

        ctx.beginPath();
        ctx.arc(cx, cy, r, arcStart, arcEnd, false);
        ctx.stroke();
      });
    });

    // --- Rotating ticks (8 at 45° increments) ---
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = accentColor;

    DoomSigils.TICK_ANGLES.forEach((baseAngle, idx) => {
      const angle = baseAngle + angleOffset;
      const outerRadius = radius;
      const innerRadii = [radius * 0.28, radius * 0.58, radius * 0.88];

      // Draw ticks at different scales for visual hierarchy
      const tickLength = 8 + idx % 3 * 2; // Slight variation
      const x1 = cx + Math.cos(angle) * (outerRadius - tickLength);
      const y1 = cy + Math.sin(angle) * (outerRadius - tickLength);
      const x2 = cx + Math.cos(angle) * outerRadius;
      const y2 = cy + Math.sin(angle) * outerRadius;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // --- Warning teeth on outer radius (every other position) ---
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accentColor;

    DoomSigils.TEETH_ANGLES.forEach((angle) => {
      // Small triangle pointing outward
      const baseRadius = radius + 6;
      const tipRadius = radius + 14;
      const sideAngle = 0.2; // Half-angle of tooth

      const tipX = cx + Math.cos(angle) * tipRadius;
      const tipY = cy + Math.sin(angle) * tipRadius;

      const leftX = cx + Math.cos(angle - sideAngle) * baseRadius;
      const leftY = cy + Math.sin(angle - sideAngle) * baseRadius;

      const rightX = cx + Math.cos(angle + sideAngle) * baseRadius;
      const rightY = cy + Math.sin(angle + sideAngle) * baseRadius;

      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  },
};

// Export for use in panels
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DoomSigils };
}
if (typeof window !== 'undefined') {
  window.DoomSigils = DoomSigils;
}
