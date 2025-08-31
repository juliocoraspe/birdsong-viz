// src/audio.js
// ESM directo desde CDN:
import Meyda from "https://esm.sh/meyda@5.6.3";

let audioCtx, sourceNode, analyser, freq, time;
let meyda;
let features = { rms: 0, spectralCentroid: 0, spectralFlatness: 0, mfcc: [] };

let sensitivity = 1; // multiplicador global (controlado por tu slider)

// ---- sensibilidad (desde la UI) ----
export function setSensitivity(val) {
  const v = Number(val);
  sensitivity = Number.isFinite(v) ? Math.max(0.1, v) : 1;
}

// ---- control de audio ----
export async function startMic() {
  if (audioCtx) await stopAudio();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  sourceNode = audioCtx.createMediaStreamSource(stream);

  setupAnalyser();
  setupMeyda();
}

export async function startFile(file) {
  if (audioCtx) await stopAudio();

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const arr = await file.arrayBuffer();
  const buf = await audioCtx.decodeAudioData(arr);

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  sourceNode = src;

  setupAnalyser();
  setupMeyda();

  src.start();
}

export async function stopAudio() {
  if (meyda) {
    try {
      meyda.stop();
    } catch {}
    meyda = null;
  }

  // corta mic stream si existe
  if (sourceNode && sourceNode.mediaStream) {
    sourceNode.mediaStream.getTracks().forEach((t) => t.stop());
  }

  try {
    if (audioCtx) await audioCtx.close();
  } catch {}

  audioCtx = null;
  sourceNode = null;
  analyser = null;
  freq = null;
  time = null;
}

export function isRunning() {
  return !!audioCtx;
}

// ---- nodos y buffers ----
function setupAnalyser() {
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; // suficiente para latido fluido
  analyser.smoothingTimeConstant = 0.7; // suavizado intra-FFT

  sourceNode.connect(analyser);

  freq = new Uint8Array(analyser.frequencyBinCount); // magnitudes 0..255
  time = new Float32Array(analyser.fftSize); // waveform (si lo ocupas)
}

function setupMeyda() {
  meyda = Meyda.createMeydaAnalyzer({
    audioContext: audioCtx,
    source: sourceNode,
    bufferSize: 1024,
    featureExtractors: ["rms", "spectralCentroid", "spectralFlatness", "mfcc"],
    callback: (f) => {
      features = f || features;
    },
  });
  meyda.start();
}

// ---- análisis por frame para la visual ----
// Suavizadores para que el latido sea bonito, no “temblor”
let bassSmooth = 0;
let midsSmooth = 0;
let highsSmooth = 0;

export function getFrame() {
  if (!analyser) return null;

  // refresca datos brutos del Analyser
  analyser.getByteFrequencyData(freq);
  analyser.getFloatTimeDomainData(time);

  // Normaliza centroid a 0..1 (cap en 10k Hz para no romper UI)
  const centroidHz = features.spectralCentroid || 0;
  const centroidNorm = Math.min(centroidHz / 10000, 1);

  const flat = Math.min(Math.max(features.spectralFlatness || 0, 0), 1);
  const rms = Math.max(0, features.rms || 0);

  // ---- bins agregados para la visual (tu nube usa 250 o 1000) ----
  const bins = 1256;
  const out = new Float32Array(bins);
  const step = Math.floor(freq.length / bins);

  for (let i = 0; i < bins; i++) {
    let s = 0;
    for (let j = 0; j < step; j++) s += freq[i * step + j] || 0;
    const v = (s / (step * 255)) * sensitivity; // 0..1 aprox
    out[i] = Math.min(1, v);
  }

  // ---- bandas (bass/mids/highs) usando índices por frecuencia ----
  const nyquist = audioCtx.sampleRate / 2; // p. ej. 22050
  const N = freq.length;
  const fToBin = (f) =>
    Math.max(0, Math.min(N - 1, Math.round((f / nyquist) * (N - 1))));

  // rangos típicos (ajusta a tu gusto)
  const iBassMin = fToBin(20);
  const iBassMax = fToBin(150);
  const iMidMax = fToBin(2000);

  let bass = 0,
    mids = 0,
    highs = 0;

  // promedio por banda (datos 0..255)
  for (let i = iBassMin; i <= iBassMax; i++) bass += freq[i] || 0;
  for (let i = iBassMax + 1; i <= iMidMax; i++) mids += freq[i] || 0;
  for (let i = iMidMax + 1; i < N; i++) highs += freq[i] || 0;

  bass /= Math.max(1, iBassMax - iBassMin + 1);
  mids /= Math.max(1, iMidMax - iBassMax);
  highs /= Math.max(1, N - (iMidMax + 1));

  // Normaliza a 0..1 y aplica sensibilidad
  bass = Math.min(1.2, (bass / 255) * sensitivity);
  mids = Math.min(1.2, (mids / 255) * sensitivity);
  highs = Math.min(1.2, (highs / 255) * sensitivity);

  // Suavizado exponencial (más bajo = más “pegado”)
  const a = 0.28;
  bassSmooth = bassSmooth * (1 - a) + bass * a;
  midsSmooth = midsSmooth * (1 - a) + mids * a;
  highsSmooth = highsSmooth * (1 - a) + highs * a;

  return {
    bins: out, // para tu geometría (250/1000 history)
    centroidHz,
    centroidNorm,
    flatness: flat,
    rms,

    // bandas listas para la animación
    bass: bassSmooth,
    mids: midsSmooth,
    highs: highsSmooth,
  };
}
