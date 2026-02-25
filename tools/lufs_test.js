const fs = 48000;
const targetLufs = -18.0;

function dbToLinear(db){
  return Math.pow(10, db / 20);
}

function linearToDb(value){
  return 20 * Math.log10(value + 1e-12);
}

function biquadCoeffs(type, f0, Q, gainDb, sampleRate){
  const w0 = 2 * Math.PI * (f0 / sampleRate);
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);

  let b0, b1, b2, a0, a1, a2;

  if(type === 'highpass'){
    b0 = (1 + cosw) / 2;
    b1 = -(1 + cosw);
    b2 = (1 + cosw) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw;
    a2 = 1 - alpha;
  }else if(type === 'highshelf'){
    const A = Math.pow(10, gainDb / 40);
    const sqrtA = Math.sqrt(A);
    b0 = A * ((A + 1) + (A - 1) * cosw + 2 * sqrtA * alpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
    b2 = A * ((A + 1) + (A - 1) * cosw - 2 * sqrtA * alpha);
    a0 = (A + 1) - (A - 1) * cosw + 2 * sqrtA * alpha;
    a1 = 2 * ((A - 1) - (A + 1) * cosw);
    a2 = (A + 1) - (A - 1) * cosw - 2 * sqrtA * alpha;
  }else{
    throw new Error('Unsupported filter type: ' + type);
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0
  };
}

function applyBiquad(input, coeffs){
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const {b0,b1,b2,a1,a2} = coeffs;
  for(let i=0;i<input.length;i++){
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  return out;
}

function kWeightProcess(channel){
  const hp = biquadCoeffs('highpass', 60, 0.7071, 0, fs);
  const shelf = biquadCoeffs('highshelf', 1681.974, 0.7071, 4.0, fs);
  const hpOut = applyBiquad(channel, hp);
  return applyBiquad(hpOut, shelf);
}

function generateSine(freq, durationSec){
  const n = Math.floor(durationSec * fs);
  const out = new Float32Array(n);
  const w = 2 * Math.PI * freq / fs;
  for(let i=0;i<n;i++){
    out[i] = Math.sin(w * i);
  }
  return out;
}

function makeRng(seed){
  let s = seed >>> 0;
  return function(){
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296);
  };
}

function generatePinkNoise(durationSec){
  const n = Math.floor(durationSec * fs);
  const out = new Float32Array(n);
  const rng = makeRng(123456789);
  const rows = 16;
  const maxKey = 1 << rows;
  const pink = new Float32Array(rows);
  let key = 0;
  let sum = 0;

  for(let i=0;i<rows;i++){
    pink[i] = rng() * 2 - 1;
    sum += pink[i];
  }

  for(let i=0;i<n;i++){
    key = (key + 1) % maxKey;
    let k = key;
    let row = 0;
    while((k & 1) === 0){
      k >>= 1;
      row++;
    }
    sum -= pink[row];
    pink[row] = rng() * 2 - 1;
    sum += pink[row];
    out[i] = sum / rows;
  }

  return out;
}

function scaleStereo(L, R, gain){
  const outL = new Float32Array(L.length);
  const outR = new Float32Array(R.length);
  for(let i=0;i<L.length;i++){
    outL[i] = L[i] * gain;
    outR[i] = R[i] * gain;
  }
  return {outL, outR};
}

function computeRmsDb(L, R, windowSec){
  const n = Math.floor(windowSec * fs);
  const start = Math.max(0, L.length - n);
  let sumL = 0;
  let sumR = 0;
  const count = L.length - start;
  for(let i=start;i<L.length;i++){
    const l = L[i];
    const r = R[i];
    sumL += l*l;
    sumR += r*r;
  }
  const meanSqL = sumL / count;
  const meanSqR = sumR / count;
  const meanSq = (meanSqL + meanSqR) * 0.5;
  return 10 * Math.log10(meanSq + 1e-12);
}

function computePeakDb(L, R){
  let peak = 0;
  for(let i=0;i<L.length;i++){
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if(a > peak) peak = a;
  }
  return linearToDb(peak);
}

function computeLufs(L, R){
  const wL = kWeightProcess(L);
  const wR = kWeightProcess(R);
  const blockSize = Math.floor(0.4 * fs);
  const hopSize = Math.floor(0.1 * fs);
  const energies = [];

  for(let start=0; start + blockSize <= wL.length; start += hopSize){
    let s = 0;
    for(let i=0;i<blockSize;i++){
      const l = wL[start + i];
      const r = wR[start + i];
      s += l*l + r*r;
    }
    energies.push((s / blockSize) + 1e-15);
  }

  const meanPower = energies.reduce((a,c)=>a+c,0) / energies.length;
  const ungated = -0.691 + 10 * Math.log10(meanPower + 1e-15);

  const abs = [];
  for(let i=0;i<energies.length;i++){
    const L_i = -0.691 + 10 * Math.log10(energies[i] + 1e-15);
    if(L_i > -70.0) abs.push(energies[i]);
  }
  let integrated = -100;
  let absLufs = -100;
  let relGate = -100;
  let gatedCount = 0;

  if(abs.length){
    const absMean = abs.reduce((a,c)=>a+c,0) / abs.length;
    absLufs = -0.691 + 10 * Math.log10(absMean + 1e-15);
    relGate = absLufs - 10.0;
    const gated = [];
    for(let i=0;i<energies.length;i++){
      const L_i = -0.691 + 10 * Math.log10(energies[i] + 1e-15);
      if(L_i > -70.0 && L_i > relGate) gated.push(energies[i]);
    }
    gatedCount = gated.length;
    if(gated.length){
      const gatedMean = gated.reduce((a,c)=>a+c,0) / gated.length;
      integrated = -0.691 + 10 * Math.log10(gatedMean + 1e-15);
    }
  }

  const lastEnergy = energies[energies.length - 1] || 1e-15;
  const momentary = -0.691 + 10 * Math.log10(lastEnergy + 1e-15);

  return {integrated, momentary, ungated, absLufs, relGate, gatedCount};
}

function scaleToTarget(L, R, target){
  const lufs = computeLufs(L, R).integrated;
  const gain = dbToLinear(target - lufs);
  return scaleStereo(L, R, gain);
}

function runTest(name, L, R, durationSec){
  const {outL, outR} = scaleToTarget(L, R, targetLufs);
  const lufs = computeLufs(outL, outR);
  const rmsDb = computeRmsDb(outL, outR, 0.3);
  const peakDb = computePeakDb(outL, outR);
  const dr = peakDb - rmsDb;

  console.log('\n' + name);
  console.log('Peak (dBFS):', peakDb.toFixed(2));
  console.log('RMS  (dBFS):', rmsDb.toFixed(2));
  console.log('LUFS I:', lufs.integrated.toFixed(2));
  console.log('LUFS M:', lufs.momentary.toFixed(2));
  console.log('DR:', dr.toFixed(2));

  if(Math.abs(lufs.integrated - targetLufs) > 0.1){
    throw new Error(name + ' integrated LUFS out of tolerance');
  }
  if(Math.abs(lufs.momentary - targetLufs) > 0.1){
    throw new Error(name + ' momentary LUFS out of tolerance');
  }
}

const sine = generateSine(1000, 10);
const sineStereo = {L: sine, R: sine};
runTest('Sine 1 kHz (10s)', sineStereo.L, sineStereo.R, 10);

const pink = generatePinkNoise(30);
const pinkStereo = {L: pink, R: pink};
runTest('Pink Noise (30s)', pinkStereo.L, pinkStereo.R, 30);

console.log('\nAll tests passed.');
