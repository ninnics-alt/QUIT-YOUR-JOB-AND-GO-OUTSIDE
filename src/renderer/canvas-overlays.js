/**
 * CANVAS-OVERLAYS.JS - Lightweight overlay effects for themed panels
 * No per-frame allocations, respects detail level settings
 */

/**
 * Draw CRT-style scanlines (Neon Arcade theme)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} opacity - Scanline opacity (0-1)
 * @param {number} detailLevel - 0=Low, 1=Med, 2=High
 */
function drawScanlines(ctx, w, h, opacity = 0.1, detailLevel = 1) {
  if (detailLevel === 0) return; // Low detail: no scanlines
  
  const spacing = detailLevel === 1 ? 3 : 2; // Med: every 3px, High: every 2px
  const lineOpacity = detailLevel === 1 ? opacity * 0.6 : opacity;
  
  ctx.strokeStyle = `rgba(255, 255, 255, ${lineOpacity})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  for (let y = 0; y < h; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  
  ctx.stroke();
}

/**
 * Draw subtle noise texture overlay
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} opacity - Noise opacity (0-1)
 * @param {number} detailLevel - 0=Low, 1=Med, 2=High
 * @param {number} seed - Random seed for noise pattern
 */
function drawNoise(ctx, w, h, opacity = 0.05, detailLevel = 1, seed = 0) {
  if (detailLevel === 0) return; // Low detail: no noise
  
  const density = detailLevel === 1 ? 0.005 : 0.01; // Med: sparse, High: denser
  const pixelCount = Math.floor(w * h * density);
  
  // Use seed for deterministic random
  let rng = seed;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  
  for (let i = 0; i < pixelCount; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h);
    ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * Draw vignette effect (PlayStation/console style)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} strength - Vignette strength (0-1)
 */
function drawVignette(ctx, w, h, strength = 0.25) {
  if (strength <= 0) return;
  
  const gradient = ctx.createRadialGradient(
    w / 2, h / 2, 0,
    w / 2, h / 2, Math.max(w, h) * 0.7
  );
  
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.6, `rgba(0, 0, 0, ${strength * 0.3})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw ordered Bayer-style dithering overlay (PlayStation era effect)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} strength - Dithering strength (0-1)
 * @param {number} detailLevel - 0=Low, 1=Med, 2=High
 */
function drawDither(ctx, w, h, strength = 0.08, detailLevel = 1) {
  if (detailLevel === 0 || strength <= 0) return;
  
  // 4x4 Bayer matrix
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  
  const scale = detailLevel === 2 ? 2 : 3; // Higher detail = finer pattern
  const alpha = strength * 0.15;
  
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  
  for (let y = 0; y < h; y += scale) {
    for (let x = 0; x < w; x += scale) {
      const bayerX = (x / scale) % 4;
      const bayerY = (y / scale) % 4;
      const threshold = bayerMatrix[Math.floor(bayerY)][Math.floor(bayerX)] / 16;
      
      // Only draw some pixels based on threshold
      if (Math.random() < threshold) {
        ctx.fillRect(x, y, scale, scale);
      }
    }
  }
}

/**
 * Draw glitter/sparkle overlay (Glitter Apocalypse theme)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} opacity - Sparkle opacity (0-1)
 * @param {number} detailLevel - 0=Low, 1=Med, 2=High
 * @param {number} time - Animation time in seconds
 */
function drawGlitter(ctx, w, h, opacity = 0.6, detailLevel = 1, time = 0) {
  if (detailLevel === 0) return; // Low detail: no glitter
  
  const sparkleCount = detailLevel === 1 ? 60 : 120; // Med: 60, High: 120
  const bokehCount = detailLevel === 2 ? 8 : 0; // High only: occasional large bokeh
  
  // Use time-based seed for animated sparkles
  const seed = Math.floor(time * 1000) % 10000;
  let rng = seed;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  
  ctx.globalCompositeOperation = 'lighter';
  
  // Draw small sparkles (1-2px stars)
  for (let i = 0; i < sparkleCount; i++) {
    const x = random() * w;
    const y = random() * h;
    const size = 0.5 + random() * 1.5;
    
    // Twinkle effect: phase-based alpha
    const phase = (time * 2 + i * 0.1) % (Math.PI * 2);
    const twinkle = (Math.sin(phase) + 1) * 0.5; // 0 to 1
    const alpha = opacity * twinkle * (0.3 + random() * 0.4);
    
    // Color: pink or cyan with some white
    const colorChoice = random();
    let color;
    if (colorChoice < 0.4) {
      color = `rgba(255, 79, 216, ${alpha})`; // Pink
    } else if (colorChoice < 0.8) {
      color = `rgba(212, 165, 255, ${alpha})`; // Lavender
    } else {
      color = `rgba(255, 255, 255, ${alpha})`; // White
    }
    
    ctx.fillStyle = color;
    ctx.shadowBlur = size * 2;
    ctx.shadowColor = color;
    
    // Draw 4-point star
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw larger bokeh sparkles (3-5px)
  for (let i = 0; i < bokehCount; i++) {
    const x = random() * w;
    const y = random() * h;
    const size = 3 + random() * 2;
    
    // Slower phase for bokeh
    const phase = (time * 0.5 + i * 0.5) % (Math.PI * 2);
    const pulse = (Math.sin(phase) + 1) * 0.5;
    const alpha = opacity * pulse * 0.5;
    
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(255, 159, 240, ${alpha * 0.6})`);
    gradient.addColorStop(1, `rgba(255, 79, 216, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.shadowBlur = size * 3;
    ctx.shadowColor = `rgba(255, 79, 216, ${alpha * 0.5})`;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Reset composite and shadow
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

/**
 * Apply all overlays based on current theme
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} detailLevel - 0=Low, 1=Med, 2=High
 * @param {number} time - Animation time in seconds (for glitter)
 */
function applyThemeOverlays(ctx, w, h, detailLevel = 1, time = 0) {
  if (typeof window === 'undefined' || !window.THEME) return;
  
  const theme = window.THEME.colors;
  const palette = window.THEME.currentPalette;
  
  // PlayStation Retro: vignette + dither + faint scanlines
  if (palette === 'ps2') {
    if (theme.vignetteStrength > 0) {
      drawVignette(ctx, w, h, theme.vignetteStrength);
    }
    if (theme.ditheringStrength > 0) {
      drawDither(ctx, w, h, theme.ditheringStrength, detailLevel);
    }
    if (theme.scanlineOpacity > 0) {
      drawScanlines(ctx, w, h, theme.scanlineOpacity, detailLevel);
    }
    return;
  }
  
  // Apply scanlines (Neon Arcade)
  if (theme.scanlineOpacity > 0) {
    drawScanlines(ctx, w, h, theme.scanlineOpacity, detailLevel);
  }
  
  // Apply noise
  if (theme.noiseOpacity > 0) {
    const seed = Math.floor(time * 10) % 1000; // Slowly changing noise
    drawNoise(ctx, w, h, theme.noiseOpacity, detailLevel, seed);
  }
  
  // Apply glitter (Glitter Apocalypse)
  if (theme.sparkleOpacity > 0) {
    drawGlitter(ctx, w, h, theme.sparkleOpacity, detailLevel, time);
  }
}

// Export for use in panels
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawScanlines, drawNoise, drawGlitter, drawVignette, drawDither, applyThemeOverlays };
}
if (typeof window !== 'undefined') {
  window.CanvasOverlays = { drawScanlines, drawNoise, drawGlitter, drawVignette, drawDither, applyThemeOverlays };
}
