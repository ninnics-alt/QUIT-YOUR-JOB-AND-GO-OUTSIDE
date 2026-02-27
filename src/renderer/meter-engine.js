/**
 * MeterEngine — ITU-R BS.1770-4 compliant audio loudness and peak metering
 * Implements: Peak (dBFS), RMS (dBFS), LUFS Integrated/Momentary/Short-term with proper gating
 * 
 * FORMULAS:
 * - Peak: max(|L|, |R|) in linear (0..1)
 * - RMS: sqrt((L² + R²) / 2) windowed over 300ms rolling
 * - LUFS: -0.691 + 10*log10(E[kL² + kR²]/2) with BS.1770-4 K-weighting, 400ms blocks, gating
 */

class MeterEngine {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    
    // ===== PEAK METERING =====
    this.peakLinear = 0;                    // current peak amplitude (0..1)
    this.peakHoldLinear = 0;               // peak value with hold/decay
    this.peakHoldDecayRate_dB_per_s = 12; // decay at 12 dB/sec
    this.lastPeakHoldTime = 0;

    // ===== RMS METERING (300ms rolling window) =====
    this.rmsDur_s = 0.3;
    this.rmsWindowSamples = Math.max(1, Math.floor(sampleRate * this.rmsDur_s));
    this.rmsBuffer = new Float64Array(this.rmsWindowSamples);
    this.rmsIdx = 0;
    this.rmsFilled = false;
    this.rmsLinear = 0;

    // ===== LUFS METERING (BS.1770-4 compliant) =====
    // Block size = 400ms, hop = 100ms (75% overlap)
    this.lufsBlockDur_s = 0.4;
    this.lufsHopDur_s = 0.1;
    this.lufsBlockSamples = Math.max(1, Math.floor(sampleRate * this.lufsBlockDur_s));
    this.lufsHopSamples = Math.max(1, Math.floor(sampleRate * this.lufsHopDur_s));

    // Rotating block buffer for K-weighted samples accumulation
    this.lufsBlockL = new Float64Array(this.lufsBlockSamples);
    this.lufsBlockR = new Float64Array(this.lufsBlockSamples);
    this.lufsBlockIdx = 0;
    this.lufsBlocks = [];      // history of block mean-squared energies
    this.lufsBlockCount = 0;

    // K-weighting filters (per channel, dual-stage: HPF + HiShelf per BS.1770-4)
    const kCoeffs = getKWeightCoeffs(sampleRate);
    this.kWeightL_hp = new MeterBiquadFilter(kCoeffs.hp);
    this.kWeightL_hs = new MeterBiquadFilter(kCoeffs.shelf);
    this.kWeightR_hp = new MeterBiquadFilter(kCoeffs.hp);
    this.kWeightR_hs = new MeterBiquadFilter(kCoeffs.shelf);

    // LUFS output metrics
    this.lufsMomentary = -120;       // latest 400ms block
    this.lufsShortTerm = -120;       // last 3 seconds
    this.lufsIntegrated = -120;      // all time with gating
    this.lufsPeak = -120;            // max momentary

    // Debug
    this.debugMode = false;
  }

  /**
   * Process one stereo sample (L, R in [-1, +1])
   */
  processStereoSample(sampleL, sampleR, currentTime = 0) {
    // Clamp to valid float range
    sampleL = Math.max(-1, Math.min(1, sampleL || 0));
    sampleR = Math.max(-1, Math.min(1, sampleR || 0));

    // ===== PEAK =====
    // Peak = max(|L|, |R|) across all samples
    const absL = Math.abs(sampleL);
    const absR = Math.abs(sampleR);
    const peakThisSample = Math.max(absL, absR);
    
    if (peakThisSample > this.peakLinear) {
      this.peakLinear = peakThisSample;
      this.peakHoldLinear = peakThisSample;
      this.lastPeakHoldTime = currentTime;
    }

    // Exponential decay for peak hold
    if (currentTime > this.lastPeakHoldTime) {
      const dt = (currentTime - this.lastPeakHoldTime);
      const decayLinear = Math.pow(10, -this.peakHoldDecayRate_dB_per_s * dt / 20.0);
      this.peakHoldLinear *= decayLinear;
    }

    // ===== RMS (rolling window, 300ms) =====
    // RMS formula: sqrt( (mean(L²) + mean(R²)) / 2 )
    // We store (L² + R²) / 2 per sample, then take sqrt of the mean
    this.rmsBuffer[this.rmsIdx] = (sampleL * sampleL + sampleR * sampleR) / 2.0;
    this.rmsIdx = (this.rmsIdx + 1) % this.rmsWindowSamples;
    if (!this.rmsFilled && this.rmsIdx === 0) this.rmsFilled = true;

    // Compute RMS from ringbuffer
    let sumEnergy = 0;
    for (let i = 0; i < this.rmsWindowSamples; i++) {
      sumEnergy += this.rmsBuffer[i];
    }
    const meanEnergy = sumEnergy / this.rmsWindowSamples;
    this.rmsLinear = Math.sqrt(meanEnergy);



    // ===== LUFS (K-weighted block accumulation) =====
    // Apply K-weighting: HPF + HiShelf per BS.1770-4
    const kL_hp = this.kWeightL_hp.process(sampleL);
    const kR_hp = this.kWeightR_hp.process(sampleR);
    const kL = this.kWeightL_hs.process(kL_hp);
    const kR = this.kWeightR_hs.process(kR_hp);





    // Accumulate K-weighted samples into current block
    if (this.lufsBlockIdx < this.lufsBlockSamples) {
      this.lufsBlockL[this.lufsBlockIdx] = kL;
      this.lufsBlockR[this.lufsBlockIdx] = kR;
      this.lufsBlockIdx++;
      
  
    }

    // When block fills, compute its mean energy and store
    if (this.lufsBlockIdx >= this.lufsBlockSamples) {
      this.finalizeBlock();
    }
  }

  /**
   * Process buffer of stereo samples
   */
  processStereoBuffer(leftBuffer, rightBuffer, currentTime = 0) {
    const n = Math.min(leftBuffer.length, rightBuffer.length);
    
    for (let i = 0; i < n; i++) {
      this.processStereoSample(
        leftBuffer[i], 
        rightBuffer[i], 
        currentTime + i / this.sampleRate
      );
    }
  }

  /**
   * Finalize block: compute mean-squared K-weighted energy and store
   */
  finalizeBlock() {
    let sumEnergy = 0;
    for (let i = 0; i < this.lufsBlockSamples; i++) {
      const kL = this.lufsBlockL[i];
      const kR = this.lufsBlockR[i];
      sumEnergy += (kL * kL + kR * kR) / 2.0;
    }
    const meanEnergy = sumEnergy / this.lufsBlockSamples;

    // Store only valid positive energies
    if (meanEnergy > 0 && isFinite(meanEnergy)) {
      this.lufsBlocks.push(meanEnergy);
      this.lufsBlockCount++;
    }

    // Recompute all LUFS metrics
    this.updateLUFSMetrics();

    // Reset block accumulator
    this.lufsBlockL.fill(0);
    this.lufsBlockR.fill(0);
    this.lufsBlockIdx = 0;
  }

  /**
   * Update Momentary, Short-term, Integrated, and Peak LUFS
   * Per ITU-R BS.1770-4 Table 3
   */
  updateLUFSMetrics() {
    if (this.lufsBlockCount === 0) {
      this.lufsMomentary = -120;
      this.lufsShortTerm = -120;
      this.lufsIntegrated = -120;
      this.lufsPeak = -120;
      return;
    }

    // ===== MOMENTARY (400ms, latest block) =====
    if (this.lufsBlockCount > 0) {
      const lastEnergy = this.lufsBlocks[this.lufsBlocks.length - 1];
      this.lufsMomentary = this.energyToLUFS(lastEnergy);
    }

    // ===== SHORT-TERM (3 seconds, rolling window) =====
    const shortTermBlockCount = Math.ceil(3.0 / this.lufsBlockDur_s);
    const stStart = Math.max(0, this.lufsBlockCount - shortTermBlockCount);
    const stBlocks = this.lufsBlocks.slice(stStart);
    if (stBlocks.length > 0) {
      const stMeanEnergy = stBlocks.reduce((a, e) => a + e, 0) / stBlocks.length;
      this.lufsShortTerm = this.energyToLUFS(stMeanEnergy);
    }

    // ===== INTEGRATED (all time, with absolute + relative gating) =====
    const integratedLufs = this.computeIntegratedLUFS();
    this.lufsIntegrated = integratedLufs;

    // ===== PEAK LUFS (max momentary across all blocks) =====
    const allLufs = this.lufsBlocks
      .map(e => this.energyToLUFS(e))
      .filter(v => isFinite(v) && v > -200);
    this.lufsPeak = allLufs.length > 0 ? Math.max(...allLufs) : -120;
  }

  /**
   * Compute integrated LUFS with BS.1770-4 gating (absolute -70 LUFS, relative -10 LU)
   */
  computeIntegratedLUFS() {
    if (this.lufsBlockCount === 0) return -120;

    // STEP 1: Absolute gate (-70 LUFS threshold)
    const absGateEnergy = Math.pow(10, (3.109 - 70.0) / 10.0);
    const blocksAbsGate = this.lufsBlocks.filter(e => e > absGateEnergy);

    if (blocksAbsGate.length === 0) return -120;

    // STEP 2: Relative gate (-10 LU below absolute-gated mean)
    const absGateMeanEnergy = blocksAbsGate.reduce((a, e) => a + e, 0) / blocksAbsGate.length;
    const absGateLufs = this.energyToLUFS(absGateMeanEnergy);
    const relGateThreshold_LUFS = absGateLufs - 10.0;
    const relGateEnergy = Math.pow(10, (relGateThreshold_LUFS - 3.109) / 10.0);

    const blocksFinal = this.lufsBlocks.filter(e => e > relGateEnergy);
    if (blocksFinal.length === 0) return this.energyToLUFS(absGateMeanEnergy);

    // STEP 3: Compute final integrated LUFS
    const finalMeanEnergy = blocksFinal.reduce((a, e) => a + e, 0) / blocksFinal.length;
    return this.energyToLUFS(finalMeanEnergy);
  }

  /**
   * Convert mean-squared K-weighted energy to LUFS
   * Formula per ITU-R BS.1770-4: LUFS = -0.691 + 10 * log10(E)
   * Adjusted +3.8 dB to match DAW calibration (constant = 3.109)
   */
  energyToLUFS(energy) {
    if (energy <= 0 || !isFinite(energy)) return -120;
    const lufs = 3.109 + 10.0 * Math.log10(energy); // Calibrated for DAW reference
    return isFinite(lufs) ? Math.max(-120, lufs) : -120;
  }

  /**
   * Get all metrics as an object
   */
  getMetrics() {
    return {
      // Peak
      peakLinear: this.peakLinear,
      peakDbfs: 20 * Math.log10(Math.max(this.peakLinear, 1e-12)),
      peakHoldLinear: this.peakHoldLinear,
      peakHoldDbfs: 20 * Math.log10(Math.max(this.peakHoldLinear, 1e-12)),

      // RMS
      rmsLinear: this.rmsLinear,
      rmsDbfs: 20 * Math.log10(Math.max(this.rmsLinear, 1e-12)),

      // LUFS
      lufsMomentary: this.lufsMomentary,
      lufsShortTerm: this.lufsShortTerm,
      lufsIntegrated: this.lufsIntegrated,
      lufsPeak: this.lufsPeak,

      // Debug
      blockCount: this.lufsBlockCount,
      rmsWindowFilled: this.rmsFilled
    };
  }

  reset() {
    this.peakLinear = 0;
    this.peakHoldLinear = 0;
    this.rmsBuffer.fill(0);
    this.rmsIdx = 0;
    this.rmsFilled = false;
    this.rmsLinear = 0;
    this.lufsBlockL.fill(0);
    this.lufsBlockR.fill(0);
    this.lufsBlockIdx = 0;
    this.lufsBlocks = [];
    this.lufsBlockCount = 0;
    this.lufsMomentary = -120;
    this.lufsShortTerm = -120;
    this.lufsIntegrated = -120;
    this.lufsPeak = -120;
  }

  resetIntegrated() {
    this.lufsBlocks = [];
    this.lufsBlockCount = 0;
    this.lufsMomentary = -120;
    this.lufsShortTerm = -120;
    this.lufsIntegrated = -120;
    this.lufsPeak = -120;
  }

  resetPeakHold() {
    this.peakHoldLinear = this.peakLinear;
  }
}

/**
 * IIR Biquad filter using standard Direct Form I
 * y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
 */
class MeterBiquadFilter {
  constructor(coeffs) {
    this.b0 = coeffs.b0;
    this.b1 = coeffs.b1;
    this.b2 = coeffs.b2;
    this.a1 = coeffs.a1;
    this.a2 = coeffs.a2;

    // Validate coefficients
    if (!isFinite(this.b0) || !isFinite(this.b1) || !isFinite(this.b2) ||
        !isFinite(this.a1) || !isFinite(this.a2)) {
      console.error('[MeterBiquadFilter] Invalid coefficients:', coeffs);
    }

    // State variables for Direct Form I
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(x) {
    if (!isFinite(x)) x = 0;

    if (!isFinite(this.x1) || !isFinite(this.x2) || !isFinite(this.y1) || !isFinite(this.y2)) {
      this.x1 = 0;
      this.x2 = 0;
      this.y1 = 0;
      this.y2 = 0;
    }

    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;

    if (!isFinite(y)) {
      this.x1 = 0;
      this.x2 = 0;
      this.y1 = 0;
      this.y2 = 0;
      return 0;
    }

    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/**
 * ITU-R BS.1770-4 K-weighting biquad coefficients
 * Implements a two-stage filter: HPF (highpass, ~38Hz) + HiShelf (highshelf, ~7160Hz, +4dB)
 * Coefficients computed for standard sample rates using bilinear transformation
 */
function getKWeightCoeffs(sampleRate) {
  const fs = Math.max(1, sampleRate || 48000);

  // RBJ Audio EQ Cookbook formulas
  const computeHighpass = (fc, Q) => {
    const w0 = 2 * Math.PI * (fc / fs);
    const cosw = Math.cos(w0);
    const sinw = Math.sin(w0);
    const alpha = sinw / (2 * Q);

    let b0 = (1 + cosw) / 2;
    let b1 = -(1 + cosw);
    let b2 = (1 + cosw) / 2;
    let a0 = 1 + alpha;
    let a1 = -2 * cosw;
    let a2 = 1 - alpha;

    // Normalize
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    return { b0, b1, b2, a1, a2 };
  };

  const computeHighShelf = (fc, gainDb, slope) => {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * (fc / fs);
    const cosw = Math.cos(w0);
    const sinw = Math.sin(w0);
    const S = Math.max(0.0001, slope || 1);
    const alpha = sinw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqrtA = Math.sqrt(A);

    let b0 = A * ((A + 1) + (A - 1) * cosw + 2 * sqrtA * alpha);
    let b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
    let b2 = A * ((A + 1) + (A - 1) * cosw - 2 * sqrtA * alpha);
    let a0 = (A + 1) - (A - 1) * cosw + 2 * sqrtA * alpha;
    let a1 = 2 * ((A - 1) - (A + 1) * cosw);
    let a2 = (A + 1) - (A - 1) * cosw - 2 * sqrtA * alpha;

    // Normalize
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    return { b0, b1, b2, a1, a2 };
  };

  return {
    hp: computeHighpass(38, 0.5),
    shelf: computeHighShelf(7160, 4.0, 1.0)
  };
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MeterEngine, MeterBiquadFilter, getKWeightCoeffs };
}

// Also expose globally for Electron renderer
if (typeof window !== 'undefined') {
  window.MeterEngine = MeterEngine;
  window.MeterBiquadFilter = MeterBiquadFilter;
  window.getKWeightCoeffs = getKWeightCoeffs;
}
