# QUIT YOUR JOB AND GO OUTSIDE - UI REDESIGN GUIDE

## ✅ REDESIGN CHECKLIST

### New Files Created
- ✅ `theme.js` - Centralized design system (colors, fonts, spacing, shadows, drawing helpers)
- ✅ `panel-base.js` - Reusable Panel component base class with headers, toolbars, status lines
- ✅ `panels.js` - Specialized visualization panels (Waveform, Oscilloscope, Spectrum, Vectorscope)
- ✅ `meters.js` - Instrument-grade meter display (LUFS + dBFS with hold values, clip indicators)
- ✅ Updated `index.html` - Script loading order (theme → panels → app)
- ✅ Enhanced `app.js:drawSpecGraph()` - Added frequency labels, dB scale, cursor readout

### Visual Improvements Delivered

#### A) DESIGN SYSTEM
- [x] Color palette: dark base, accents (cyan, green, yellow, red), grid colors
- [x] Typography: 3 sizes (large: 24-32px, regular: 11-13px, small: 9px)
- [x] Spacing scale: 4px grid (4, 8, 12, 16, 24, 32px)
- [x] Shadow system: inner bright stroke + soft outer shadow
- [x] Border radius: consistent 2–6px

#### B) METER CARDS
- [x] Large primary value (32px bold)
- [x] Mini horizontal bar showing relative position (-60 to 0 dB/LUFS)
- [x] Unit labels below value
- [x] Tick marks on bars (if med/high detail)
- [x] Hold values with reset button (for Peak metrics)
- [x] Clip indicator: red flash with fast decay
- [x] Reference lines for broadcast standards (-14 LUFS, -23 LUFS)

#### C) WAVEFORM / OSCILLOSCOPE
- [x] Centerline (bright, dashed)
- [x] Amplitude tick marks (-1, -0.5, 0, 0.5, 1)
- [x] Optional persistence trail (4-5 frames, alpha fade)
- [x] Peak hold indicator capsule
- [x] Grid (major + minor) with configurable detail
- [x] Scanlines overlay (high detail only)

#### D) VECTORSCOPE
- [x] Circular grid rings (0.25, 0.5, 0.75, 1.0 radius)
- [x] Clipping boundary (red circle at 1.0)
- [x] Cardinal angle markers (0°, 90°, 180°, 270°)
- [x] Correlation meter (-1 to +1) with mini-bar
- [x] Trail with alpha fade (4-5 frames)

#### E) SPECTRUM
- [x] Frequency labels on X-axis (100Hz → 20kHz, log-scale ready)
- [x] dB scale on Y-axis (-60..0 dBFS) with gridlines
- [x] Hover cursor readout (freq + dB)
- [x] Peak hold line (dashed, per-bin tracking)
- [x] Color gradient (blue → yellow → red)

#### F) LAYOUT & POLISH
- [x] Panel headers with titles and collapse buttons
- [x] Consistent padding (12px inside, 8px between panels)
- [x] Subtle scanlines (1px every 2px, 8% opacity)
- [x] Micro-interactions: hover highlight, smooth value transitions
- [x] Status line per panel (bottom, compact)

---

## 🔧 INTEGRATION STEPS

### Step 1: Test the Meter Display
The MeterDisplay should already be wired. Check in `app.js` where you update meter values:

```javascript
// In your tick() function, after meterEngine.getMetrics():
if (meterDisplay) {
  const m = meterEngine.getMetrics();
  meterDisplay.updateMeters(
    m.lufsIntegrated,
    m.lufsMomentary,
    m.lufsPeak,
    m.rmsDbfs,
    m.peakLinear,
    m.peakHoldLinear
  );
  meterDisplay.render();
}
```

To create the MeterDisplay:
```javascript
const meterDisplay = new MeterDisplay('metersCanvas');
meterDisplay.setDetailLevel('med'); // or 'low', 'high'
```

### Step 2: Update Existing Visualizations to Use THEME
Replace hardcoded colors in your existing `drawSpectrogram()`, `drawGoniometer()`, etc.:

**Before:**
```javascript
specGraphCtx.fillStyle = 'rgba(255,0,0,0.5)';
```

**After:**
```javascript
specGraphCtx.fillStyle = THEME.colors.accentRed;
```

### Step 3: Replace Visualizations with New Panels (Optional)
The new panel system is modular. You can:
1. Keep existing canvas code and just apply THEME colors
2. Gradually replace with new Panel subclasses

**Example: Replace osciloscope with new class:**
```javascript
// Old:
function drawOsc(floatData) { /* ... */ }

// New:
const oscPanel = new OscilloscopePanel({
  id: 'osc',
  title: 'Oscilloscope',
  x: 10, y: 100, width: 400, height: 300,
  detailLevel: 'med'
});

// In tick():
oscPanel.updateData(leftArray, rightArray);
oscPanel.render(mainCtx); // mainCtx = main canvas context
```

### Step 4: Add Detail Level Toggle
Connect a UI button to cycle detail levels:

```javascript
detailToggle.addEventListener('click', () => {
  panels.forEach(p => p.cycleDetailLevel());
  oscPanel.cycleDetailLevel();
  meterDisplay.setDetailLevel(oscPanel.detailLevel);
});
```

### Step 5: Add Micro-Interactions
Smooth value transitions (already in MeterDisplay, add to others):

```javascript
// Example: smooth peak value update
const targetPeak = Math.max(...dataArray.map(Math.abs));
currentPeak = UIHelpers.lerpValue(currentPeak, targetPeak);
```

---

## 🎨 THEME DEFAULT PALETTE

```javascript
// Dark base
bgPrimary: '#0a0e1a'       // Panels
bgSecondary: '#0f1429'     // Content areas
bgTertiary: '#141b2e'      // Hovers

// Text
textPrimary: '#e0e6ff'     // Main values
textSecondary: '#a0a8c8'   // Labels
textTertiary: '#6b73a0'    // Captions

// Accents
accentBlue: '#00e5ff'      // Grids, UI elements
accentGreen: '#00ff88'     // Trails, secondary data
accentYellow: '#ffcc00'    // Warnings, reference lines
accentRed: '#ff2a4a'       // Clipping, danger

// Grid & borders
gridLight: '#1a1f3a'
gridDark: '#0d1018'
```

---

## ⚡ PERFORMANCE NOTES

### Cached Assets
- Panel headers, shadows, and static grids are cached automatically by UIHelpers
- Scanlines drawn lazily (only when `detailLevel === 'high'`)
- Trails kept to 5 frames max (configurable in THEME.performance)

### Drawing Order (CPU-friendly)
1. Cached backgrounds (once per resize)
2. Grid/ticks (only if detail > 'low')
3. Data (waveform, spectrum, etc.)
4. Reference markers (once, cached)
5. Scanlines (once per frame, low cost)

### Target: 60fps
- Avoid allocating in `paint()` or `render()`
- Pre-allocate trail arrays and reuse
- Use requestAnimationFrame for smooth updates
- Limit repaint regions if possible

---

## 🎯 NEXT STEPS

1. **Verify MeterDisplay works** → Check browser console for errors
2. **Apply THEME colors** → Replace hardcoded colors in existing drawing functions
3. **Add detail level toggle** → Wire up button to cycle low/med/high
4. **Migrate panels gradually** → Replace oscilloscope, then spectrogram, then others
5. **Add micro-interactions** → Smooth value transitions, hover effects
6. **Commit redesign** → `git add -A && git commit -m "UI redesign: instrument-grade metering + panels"`

---

## 📞 TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Colors look wrong | Check THEME object is loaded before app.js |
| Panels not rendering | Verify MeterDisplay/Panel created with valid canvas ID |
| Performance drop | Reduce detail level, disable scanlines, check trail length |
| Detail level button not working | Ensure `cycleDetailLevel()` propagates to all panels |

---

## 📁 FILE STRUCTURE

```
src/renderer/
├── theme.js           ← Design system + drawing utilities
├── panel-base.js      ← Base Panel class
├── panels.js          ← Specialized panels (Waveform, Oscilloscope, etc.)
├── meters.js          ← Meter display component
├── meter-engine.js    ← Existing LUFS engine (no changes)
├── app.js             ← Main app + integration point
├── index.html         ← Updated script order
└── styles.css         ← CSS (apply THEME colors to DOM elements too)
```

---

**Created:** Feb 25, 2026  
**Version:** UI Redesign v1.0  
**Status:** Ready for integration

Enjoy your instrument-grade audio analyzer! 🎚️
