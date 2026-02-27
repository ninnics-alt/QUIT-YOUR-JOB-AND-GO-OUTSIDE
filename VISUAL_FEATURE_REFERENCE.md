# VISUAL FEATURE REFERENCE

## Enhanced Car Drawing - Feature Breakdown

### Overall Vehicle Silhouette

```
                      _______________
                     /               \      ← Flat roof (long)
                    /                 \     ← Rear step down
         Hood slope /_                  \   
                   /                     |  ← Vertical rear hatch
        Windshield |                     |
         (angled)  |                     |
                   |  ◯        ◯         |
                   |            (wheels) |
                   |_          ___      _|
                     \___/‾‾‾\___/     Tires
```

### Window Layout (Top View)

```
        Windshield (large, angled)
        ________________
       /                \
      / A           B   \
     |   [Left Side]    | ← B pillar divides windows
     |     Window       |
     | Pillar   Pillar  |
     |    C             |
      \  ┌─────────┐   /
       \_│ Quarter │__/
         │ Window  │
         └─────────┘
```

### Window Features

| Component | Feature | Alpha |
|-----------|---------|-------|
| Glass Fill | Gradient (darker mid) | 0.85–0.90 |
| A Pillar | Front support stroke | 0.70 |
| B Pillar | Side divider stroke | 0.70 |
| C Pillar | Rear support stroke | 0.70 |

### Wheel Details

```
                    Tire
                   /    \
                  |  12" |  ← Rotation tick marks
                  |      |     (0.5° each, 50% opacity)
                   \    /
                    ────
                    ||||   ← 5-spoke pattern
             Center ◐◑◑◐
             Cap     ◐◑◑◐  ← Rim (border color, 65% radius)
                    ◐◑◑◐
                    \  /
                     ◯◯   ← Tire wall (dark edge)
```

### Gradient Effects

#### Body Gradient (Vertical)
```
Top (Light)     rgb(+30, +30, +30)
                       |
                       |
                    Blend
                       |
                       |
Bottom (Dark)   rgb(-20, -20, -20)
```

#### Window Glass Gradient (Vertical)
```
Top/Bottom  rgba(-50, -50, -50, 0.85)
                       |
                    Blend
                       |
Middle      rgba(-60, -60, -60, 0.90)
```

### Shadow & Lighting

```
          Car Body
            |||||
            |||||
            \___/  ← Soft shadow ellipse
        Soft Edge  (40% opacity background inset)

Side View (Specular Highlight):
    /‾‾‾‾‾
   | ◈◈◈ |  ← Thin accent strip (8% opacity)
   |     |     on upper body side
   |_____|
```

### Motion Effects

#### Boom Envelope (0.0 → 1.0)

```
Peak Impact (1.0):
    Squash: Y = 0.94 (94% height)
    Stretch: X = 1.03 (103% width)
    Jitter: ±1.5px X, ±1.2px Y
    Duration: 80–120ms

Recovery to Normal (0.0):
    Smooth exponential decay
    Spring-like rebound effect
```

#### Squash/Stretch Formula
```
scaleY = (1 - bodySquash) × (1 - 0.06 × boomEnvelope)
scaleX = (1 + bodySquash × 0.25) × (1 + 0.03 × boomEnvelope)
```

#### Jitter Implementation
```
Only when boomEnvelope > 0.7

Intensity = (boomEnvelope - 0.7) / 0.3  [0..1 scale]

jitterX = sin(phase × π × 8) × 1.5px × Intensity
jitterY = cos(phase × π × 6) × 1.2px × Intensity

Phase: (now % 100) / 100  [repeats every 100ms]
```

### Road Streaks (Motion Blur)

```
Active When: roadSpeed > 0.1

Streak Pattern:
    |‾‾    |‾‾    |‾‾
    |      |      |
    |      |      |      ← 3 diagonal lines
    |      |      |
    |__    |__    |__

Alpha: 15%  (border color)
Movement: Linked to roadScroll × 0.3
```

### Wheel Rotation Animation

```
Full rotation cycle as car moves:
    wheelSpin += roadSpeed × dtSec × 5

Tick marks (12 total):
    - Every 30° around tire
    - 1px lines, 50% opacity
    - Spans from 80% to 88% radius
    - Indicates rotation direction
```

### Double-Stroke Outline

```
Cross-section of car edge:

|━━━ Outer: 2.5px (border color)
|━  Inner: 1.0px (accent color, 40% opacity)
|  Car body color
|  ━━━━━━━━━━━━
```

### Color Palette Integration

| Element | Color Source | Opacity | Notes |
|---------|-------------|---------|-------|
| Body | bgPanel | 100% | Center color, used for gradient |
| Shadow | bgInset | 40% | Ground shadow |
| Wheel Well | bgInset | 80% | Semi-circular cutout |
| Tire | grid | 100% | Dark wheel |
| Rim | border | 100% | Inner wheel circle |
| Spoke | text | 100% | 5-spoke star |
| Center Cap | accentA | 100% | Wheel hub |
| Tick Marks | text | 50% | Rotation indicator |
| Outline (Outer) | border | 100% | 2.5px stroke |
| Outline (Inner) | accentA | 40% | 1.0px stroke |
| Pillars | border | 70% | Window supports |
| Glass | bgPanel-50 | 85–90% | Tinted windows |
| Highlight | accentGreen | 8% | Side lighting |
| Headlights | accentA | variable | Pulse with boom |
| Tail Lights | accentBad | 60% | Always on |
| Road Streaks | border | 15% | Motion blur |

### Performance Considerations

- **Gradient Gradients**: Created fresh each frame (negligible cost)
- **Rotation Tick Marks**: 12 lines per wheel × 2 wheels (minimal overdraw)
- **Transform Stack**: Properly nested save()/restore()
- **Jitter Calculation**: Sine/cosine phase-based (no random allocations)
- **No Image Data**: Pure canvas drawing commands
- **Draw Order**: Back-to-front optimization (shadow → body → details → overlay)

### Frame Budget Breakdown

| Operation | Cost |
|-----------|------|
| Canvas setup + clipping | ~0.2ms |
| Body drawing + gradients | ~0.3ms |
| Windows + pillars | ~0.2ms |
| Wheels (2×) + spokes | ~0.4ms |
| Outlines + highlights | ~0.1ms |
| VFX (shockwave, dust, etc) | ~0.3ms |
| **Total per frame** | **~1.5ms** |

(Typical 60fps budget: ~16.67ms per frame)

### Rendering Order (Back to Front)

1. Ground shadow (soft ellipse)
2. Car body (with gradient)
3. Wheel wells (semi-circles)
4. Wheels and tires (both, with spokes & marks)
5. Windows (with gradient glass)
6. Pillars (A/B/C strokes)
7. Car outline (double-stroke)
8. Specular highlight (side strip)
9. Lights (headlights, tail lights)
10. VFX overlays (shockwave ring, dust cloud, flare, shock line)

### Theme-Aware Behavior

All colors pull from `THEME.colors` object:
- Changes theme → Colors automatically update
- No hardcoded hex values except fallbacks
- Maintains visual consistency across all themes

### Scaling & Responsiveness

Car dimensions scale with panel size:
```javascript
const carScale = Math.min(w, h) / 400;
const carW = 120 * carScale;
const carH = 60 * carScale;
```

All proportions maintained regardless of panel size (responsive design).
