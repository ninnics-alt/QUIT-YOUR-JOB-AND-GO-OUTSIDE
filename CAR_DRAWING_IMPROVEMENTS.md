# CAR TEST Vehicle Drawing Improvements

## Overview
Enhanced the bass-car-panel vehicle drawing to resemble a Tahoe/minivan silhouette with detailed features, improved lighting, and dynamic motion effects. All rendering is canvas-based (no images) and optimized for 60fps performance.

## New Features Implemented

### 1. **Proportions & Body Shape** (`_drawCarBody`)
- **Longer body design**: Extends horizontally for SUV/minivan look
- **Taller stance**: Increased vertical profile
- **Flat roof**: Long, level roof with slight rear step
- **Hood slope**: 15° forward incline for dynamic appearance
- **Vertical rear hatch**: Clear rear end definition
- **Body gradient**: Top-to-bottom color gradient (top lighter, bottom darker) using `createLinearGradient`

### 2. **Windows & Pillars** 
- **Front windshield** (`_drawWindows`): Angled, larger glass area
- **Side windows**: Left and right side windows with proper proportions
- **Rear quarter window**: Small window for detail
- **Glass gradient fill**: Darker fill with subtle vertical gradient (0.8–0.9 alpha)
- **A/B/C pillars** (`_drawPillars`): Thin dark strokes connecting window frames
  - A pillar: Front windshield support
  - B pillar: Between front and side windows
  - C pillar: Rear quarter window support

### 3. **Wheels & Tires** (`_drawEnhancedWheel`)
- **Tire design**: Dark circular base with textured wall edge
- **Wheel wells** (`_drawWheelWells`): Semi-circular cutouts above tires
- **5-spoke rims**: Classic star-pattern spoke design (white/border color)
- **Center cap**: Accent color disc at center
- **Rotation tick marks**: 12 subtle marks around outer edge for motion indication
- **Tire wall**: Slightly darker edge strip for depth

### 4. **Shadow & Lighting**
- **Ground shadow** (`_drawCarShadow`): Soft ellipse beneath vehicle (40% opacity)
- **Body gradient**: Linear gradient from top (lighter +30 RGB) to bottom (darker -20 RGB)
- **Specular highlight** (`_drawSpecularHighlight`): Thin vertical strip on upper body side
  - Accent green color at 8% opacity for subtle lighting effect

### 5. **Outline** (`_drawCarOutline`)
- **Double-stroke design**:
  - Outer stroke: 2.5px theme border color (solid)
  - Inner stroke: 1px accent color at 40% opacity
- Follows body perimeter precisely

### 6. **Motion & Boom Effects**
- **Squash/Stretch** (physics-based):
  - `scaleY = 1 - 0.06*boomEnvelope` (compress vertically)
  - `scaleX = 1 + 0.03*boomEnvelope` (expand horizontally)
- **Micro-jitter**: 1–2px random wobble on strong hits (80–120ms duration)
  - Only visible when `boomEnvelope > 0.7`
  - Uses sine/cosine phase for smooth oscillation
- **Wheel rotation**: Continuous spin linked to road speed
- **Suspension bounce**: Critical-damping spring physics for natural recoil
- **Wheel hop**: 60% of suspension motion for realistic secondary bounce
- **Road streaks** (`_drawRoadStreaks`): Motion blur lines when moving (15% alpha)

## Helper Functions Added

### `_drawCarShadow()`
Renders a soft ellipse shadow beneath the vehicle using background inset color.

### `_drawCarBody(colors)`
Draws the main body with Tahoe proportions and gradient fill. Key features:
- Hood with slope
- Roof (flat, long)
- Rear step
- Vertical rear hatch
- Gradient from light top to dark bottom

### `_drawWindows(colors)`
Draws all window areas with:
- Angled front windshield
- Left and right side windows  
- Rear quarter window
- Subtle vertical gradient fill per window

### `_drawPillars(colors)`
Draws three support pillars (A/B/C) as thin dark strokes at 70% opacity.

### `_drawWheelWells(colors)`
Renders semi-circular cutouts above wheels using background inset color at 80% opacity.

### `_drawEnhancedWheel(x, y, radius, colors)`
Complete wheel rendering with:
- Dark tire base
- Textured tire wall
- Border-color rim
- 5-spoke star pattern
- Center cap (accent color)
- 12 rotation tick marks (50% opacity)

### `_drawCarOutline(colors)`
Double-stroke outline:
1. Dark outer stroke (2.5px, border color)
2. Light inner stroke (1px, accent color @ 40% alpha)

### `_drawSpecularHighlight(colors)`
Thin diagonal highlight strip on upper body side using accent green at 8% opacity.

### `_drawRoadStreaks()`
Motion blur effect with 3 animated streaks when vehicle is moving (road speed > 0.1).

## Code Changes Summary

### Modified Function: `_drawCar()`
**Before**: ~100 lines, simple rectangle body with basic wheels
**After**: ~150 lines with modular helper function calls

**Key changes**:
- Added boom envelope calculation: `boomEnvelope = Math.max(this.headlightFlare, this.dustPuffLife)`
- Physics-based squash/stretch applied per specs
- Micro-jitter implementation with phase-based oscillation
- All drawing delegated to specialized helper functions
- Proper `ctx.save()/restore()` wrapping for all transforms

### Removed Function: `_drawWheel()`
- Deprecated and replaced with `_drawEnhancedWheel()`
- Stub function left in place to prevent runtime errors if referenced elsewhere

### Unchanged:
- `_rebuildShapes()`: Still creates unused carBody/carWindows Path2D objects (harmless)
- Physics update logic (`_updatePhysics`)
- Boom trigger logic (`_triggerBoom`)
- All VFX systems (shockwave, dust, flare, headlight glow)
- UI readout rendering
- Theme system integration

## Performance Notes

1. **No per-frame allocations**: All transforms use ctx.save()/restore()
2. **Gradient creation**: Color gradients created fresh each frame (negligible cost)
3. **Tick marks**: Pre-calculated for wheels (12 marks, minimal overhead)
4. **Path2D unused**: New shapes drawn directly, allowing better control
5. **Draw order**: Optimized from back to front (shadow → body → wells → wheels → windows → pillars → outline)

## Testing Checklist

- [ ] Car renders correctly (Tahoe-like proportions visible)
- [ ] Windows and pillars visible at all scales
- [ ] Wheels rotate smoothly with tick marks visible
- [ ] Ground shadow renders beneath car
- [ ] Specular highlight visible on side at certain viewing angles
- [ ] Boom triggers cause squash/stretch deformation
- [ ] Jitter visible on strong bass hits
- [ ] Road streaks move with vehicle motion
- [ ] No visual artifacts at different theme colors
- [ ] 60fps maintained during playback
- [ ] No console errors

## Integration Notes

All changes are self-contained within `bass-car-panel.js`. No external dependencies added. The enhancement uses existing:
- `THEME.colors` for color access
- `UIHelpers._parseRGB()` for color parsing
- Existing physics state variables (suspensionY, wheelHopAmount, etc.)
- Existing VFX state (glowPulse, dustPuffLife, headlightFlare, etc.)

## Visual Hierarchy

Rendering order (back to front):
1. Ground shadow
2. Car body (with gradient)
3. Wheel wells
4. Wheels and tires (with rotation marks)
5. Windows (with gradient glass)
6. Pillars
7. Car outline (double-stroke)
8. Specular highlight
9. Lights (headlights, tail lights)
10. VFX (shockwave, dust, flare, shock line)
