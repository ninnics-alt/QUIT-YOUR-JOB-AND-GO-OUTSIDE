/**
 * METERS.JS - Instrument-grade meter display
 * LUFS Integrated/Momentary/Peak + RMS/Peak dBFS with mini bars, hold values, and clip indicators
 */

// UI Smoothing Constants
const RMS_TAU = 0.250;           // 250ms smoothing for RMS display
const PEAK_TAU = 0.120;          // 120ms smoothing for Peak display
const HOLD_FREEZE = 0.800;       // 800ms freeze duration for hold
const HOLD_DECAY_DB_PER_SEC = 12.0; // 12 dB/sec decay rate

class MeterDisplay {
  constructor(canvasId) {
    console.log('[METERS] MeterDisplay constructor called with canvasId:', canvasId);
    this.canvas = document.getElementById(canvasId);
    console.log('[METERS] Canvas element:', this.canvas);
    if (!this.canvas) {
      console.error('[METERS] ERROR: Canvas not found!');
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    console.log('[METERS] Canvas size:', this.width, 'x', this.height);

    // Meter data (raw DSP values, not smoothed)
    this.meters = {
      lufsIntegrated: 0,
      lufsMomentary: 0,
      lufsPeak: 0,
      rmsDbs: 0,
      peakDbfs: 0,
      peakHoldDbfs: 0,
    };

    // Display-smoothed values (UI layer only)
    this.displaySmoothed = {
      rmsDbs: -120,
      peakDbfs: -120,
      holdDbfs: -120,
      holdTimerSec: 0,
      lastPeakTimeSec: 0,
    };

    // Hold values (for peak metrics)
    this.holdValues = {
      lufsPeak: 0,
      peakDbfs: 0,
      peakHoldTime: 0,
      lufsPeakHoldTime: 0,
    };

    // Clip indicators
    this.hasClipped = false;
    this.clipTime = 0;

    // Timing for smoothing
    this.lastUpdateTime = performance.now() / 1000;

    this.detailLevel = 'med'; // low, med, high
  }

  render() {
    console.log('[METERS] render() called');
    const { colors, spacing } = THEME;
    
    // Access fonts directly to ensure getters are called
    const fonts = THEME.fonts;
    console.log('[METERS] Theme:', THEME.currentPalette, 'Font (sansLarge):', fonts.sansLarge);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('Level Meters', spacing.md, spacing.md);

    // Layout: 2 rows x 3 columns
    const meterW = (this.width - spacing.lg * 2) / 3;
    const meterH = (this.height - spacing.xl * 3) / 2;

    const positions = [
      { x: spacing.md, y: spacing.lg * 2, label: 'LUFS Integrated', value: this.meters.lufsIntegrated, unit: 'LUFS', min: -60, max: 0, holdValue: this.holdValues.lufsPeak },
      { x: spacing.md + meterW + spacing.md, y: spacing.lg * 2, label: 'LUFS Momentary', value: this.meters.lufsMomentary, unit: 'LUFS', min: -60, max: 0 },
      { x: spacing.md + (meterW + spacing.md) * 2, y: spacing.lg * 2, label: 'LUFS Peak', value: this.meters.lufsPeak, unit: 'LUFS', min: -60, max: 0, holdValue: this.holdValues.lufsPeak, showHold: true },
      { x: spacing.md, y: spacing.lg * 2 + meterH + spacing.md, label: 'RMS', value: this.displaySmoothed.rmsDbs, unit: 'dBFS', min: -60, max: 0 },
      { x: spacing.md + meterW + spacing.md, y: spacing.lg * 2 + meterH + spacing.md, label: 'Peak', value: this.displaySmoothed.peakDbfs, unit: 'dBFS', min: -60, max: 0 },
      { x: spacing.md + (meterW + spacing.md) * 2, y: spacing.lg * 2 + meterH + spacing.md, label: 'Peak Hold', value: this.displaySmoothed.holdDbfs, unit: 'dBFS', min: -60, max: 0, showHold: true },
    ];

    positions.forEach((pos) => {
      this._renderMeterCard(pos.x, pos.y, meterW, meterH, pos);
    });

    // Clip indicator
    if (this.hasClipped) {
      const clipAlpha = 1 - (Date.now() - this.clipTime) / THEME.performance.peakHoldDecay;
      if (clipAlpha > 0) {
        this.ctx.fillStyle = `rgba(255, 42, 74, ${clipAlpha * 0.8})`;
        this.ctx.fillRect(this.width - 60, spacing.md, 50, 30);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        this.ctx.font = fonts.monoBoldLarge;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('CLIP', this.width - 35, spacing.md + 15);
      } else {
        this.hasClipped = false;
      }
    }
  }

  _renderMeterCard(x, y, w, h, data) {
    const { colors, spacing } = THEME;
    // Access fonts directly to ensure getters are invoked
    const fonts = THEME.fonts;
    const cornerRadius = 4;
    const contentPadding = spacing.md;
    const barHeight = 16;

    // Card background with shadow
    UIHelpers.drawPanelShadow(this.ctx, x, y, w, h, cornerRadius);

    // Title
    this.ctx.fillStyle = colors.textSecondary;
    this.ctx.font = fonts.monoSmall;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(data.label, x + contentPadding, y + contentPadding);

    // Large value display
    this.ctx.fillStyle = colors.textPrimary;
    this.ctx.font = fonts.monoBoldLarge;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'top';
    const valueX = x + w - contentPadding;
    const valueY = y + contentPadding;
    this.ctx.fillText(data.value.toFixed(1), valueX, valueY);

    // Unit label
    this.ctx.fillStyle = colors.textSecondary;
    this.ctx.font = fonts.monoSmall;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(data.unit, valueX, valueY + 28);

    // Mini horizontal bar
    const barY = y + h - contentPadding - barHeight - 8;
    const barW = w - contentPadding * 2;
    UIHelpers.drawMiniMeterBar(this.ctx, x + contentPadding, barY, barW, barHeight, data.value, data.min, data.max);

    // Tick marks on bar (if med/high detail)
    if (this.detailLevel !== 'low') {
      this._drawMeterTicks(x + contentPadding, barY, barW, barHeight, data.min, data.max);
    }

    // Hold value indicator (if applicable)
    if (data.showHold && data.holdValue !== undefined) {
      this.ctx.fillStyle = colors.accentYellow;
      this.ctx.font = fonts.monoSmall;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(`Hold: ${data.holdValue.toFixed(1)}`, x + contentPadding, barY - 18);

      // Hold reset button (small X)
      const btnX = x + w - contentPadding - 20;
      const btnY = barY - 20;
      this.ctx.fillStyle = colors.accentRed;
      this.ctx.font = fonts.monoSmall;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('↻', btnX, btnY);
    }

    // Reference lines (if high detail)
    if (this.detailLevel === 'high' && data.unit === 'LUFS') {
      // -14 LUFS and -23 LUFS standards
      const refs = [
        { level: -14, label: '-14', color: colors.accentYellow },
        { level: -23, label: '-23', color: colors.accentGreen },
      ];
      refs.forEach((ref) => {
        if (ref.level >= data.min && ref.level <= data.max) {
          const pos = ((ref.level - data.min) / (data.max - data.min)) * barW;
          this.ctx.strokeStyle = ref.color;
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([2, 2]);
          this.ctx.beginPath();
          this.ctx.moveTo(x + contentPadding + pos, barY);
          this.ctx.lineTo(x + contentPadding + pos, barY + barHeight);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        }
      });
    }
  }

  _drawMeterTicks(barX, barY, barW, barH, min, max) {
    const { colors } = THEME;
    const range = max - min;
    const major = Math.floor(range / 5) || 1;

    this.ctx.strokeStyle = colors.accentBlue;
    this.ctx.lineWidth = 1;

    for (let val = min; val <= max; val += major) {
      const pos = ((val - min) / range) * barW;
      this.ctx.beginPath();
      this.ctx.moveTo(barX + pos, barY - 3);
      this.ctx.lineTo(barX + pos, barY);
      this.ctx.stroke();
    }
  }

  // Update methods
  updateMeters(integrated, momentary, peak, rms, peakLinear, peakHold) {
    // Update raw DSP values (accurate, high-rate)
    this.meters.lufsIntegrated = integrated;
    this.meters.lufsMomentary = momentary;
    this.meters.lufsPeak = peak;
    this.meters.rmsDbs = rms;
    this.meters.peakDbfs = 20 * Math.log10(Math.max(0.00001, peakLinear));
    this.meters.peakHoldDbfs = 20 * Math.log10(Math.max(0.00001, peakHold));

    // Time-based smoothing for display values
    const now = performance.now() / 1000; // seconds
    const dt = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Clamp dt to prevent massive jumps if tab was backgrounded
    const dtClamped = Math.min(dt, 0.1);

    // UI-layer smoothing using time-based EMA: alpha = 1 - exp(-dt / tau)
    const alphaRms = 1 - Math.exp(-dtClamped / RMS_TAU);
    const alphaPeak = 1 - Math.exp(-dtClamped / PEAK_TAU);

    // Smooth RMS display
    this.displaySmoothed.rmsDbs += alphaRms * (this.meters.rmsDbs - this.displaySmoothed.rmsDbs);

    // Smooth Peak display
    this.displaySmoothed.peakDbfs += alphaPeak * (this.meters.peakDbfs - this.displaySmoothed.peakDbfs);

    // Peak Hold behavior: freeze for HOLD_FREEZE seconds, then decay at HOLD_DECAY_DB_PER_SEC
    // Always latch to new peaks
    if (this.meters.peakDbfs > this.displaySmoothed.holdDbfs) {
      this.displaySmoothed.holdDbfs = this.meters.peakDbfs;
      this.displaySmoothed.lastPeakTimeSec = now;
      this.displaySmoothed.holdTimerSec = 0;
    } else {
      // Accumulate hold timer
      this.displaySmoothed.holdTimerSec += dtClamped;

      // After freeze duration, decay
      if (this.displaySmoothed.holdTimerSec > HOLD_FREEZE) {
        const decayAmount = HOLD_DECAY_DB_PER_SEC * dtClamped;
        this.displaySmoothed.holdDbfs -= decayAmount;
        
        // Never drop below current peak
        if (this.displaySmoothed.holdDbfs < this.meters.peakDbfs) {
          this.displaySmoothed.holdDbfs = this.meters.peakDbfs;
        }
      }
    }

    // Track peak hold values for LUFS Peak display
    if (this.meters.lufsPeak > this.holdValues.lufsPeak) {
      this.holdValues.lufsPeak = this.meters.lufsPeak;
      this.holdValues.lufsPeakHoldTime = Date.now();
    }

    if (this.meters.peakDbfs > this.holdValues.peakDbfs) {
      this.holdValues.peakDbfs = this.meters.peakDbfs;
      this.holdValues.peakHoldTime = Date.now();
    }

    // Clip detection
    if (peakLinear > 0.99) {
      this.hasClipped = true;
      this.clipTime = Date.now();
    }

    // Decay hold values (for LUFS Peak hold indicator)
    if (Date.now() - this.holdValues.lufsPeakHoldTime > THEME.performance.peakHoldDecay) {
      this.holdValues.lufsPeak *= 0.98;
    }
    if (Date.now() - this.holdValues.peakHoldTime > THEME.performance.peakHoldDecay) {
      this.holdValues.peakDbfs *= 0.98;
    }
  }

  resetHold() {
    this.holdValues.lufsPeak = 0;
    this.holdValues.peakDbfs = 0;
    this.displaySmoothed.holdDbfs = -120;
    this.displaySmoothed.holdTimerSec = 0;
  }

  setDetailLevel(level) {
    this.detailLevel = level; // low, med, high
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MeterDisplay };
}
if (typeof window !== 'undefined') {
  window.MeterDisplay = MeterDisplay;
}
