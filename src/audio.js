import Meyda from "meyda";

let audioCtx, sourceNode, analyser, freq, time;
let meyda,
  features = { rms: 0, spectralCentroid: 0, spectralFlatness: 0, mfcc: [] };
let sensitivity = 1;

export function setSensitivity(val) {
  sensitivity = Number(val) || 1;
}

export async function startMic() {
  if (audioCtx) await stopAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaStreamSource(stream);
  setupAnalyser();
  setupMeyda();
}

export async function stopAudio() {
  if (meyda) {
    meyda.stop();
    meyda = null;
  }
  if (sourceNode && sourceNode.mediaStream) {
    sourceNode.mediaStream.getTracks().forEach((t) => t.stop());
  }
  if (audioCtx) {
    await audioCtx.close();
    audioCtx = null;
  }
}

export function isRunning() {
  return !!audioCtx;
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

function setupAnalyser() {
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;
  sourceNode.connect(analyser);
  freq = new Uint8Array(analyser.frequencyBinCount);
  time = new Float32Array(analyser.fftSize);
}

function setupMeyda() {
  meyda = Meyda.createMeydaAnalyzer({
    audioContext: audioCtx,
    source: sourceNode,
    bufferSize: 1024,
    featureExtractors: ["rms", "spectralCentroid", "spectralFlatness", "mfcc"],
    callback: (f) => {
      features = f;
    },
  });
  meyda.start();
}

export function getFrame() {
  if (!analyser) return null;
  analyser.getByteFrequencyData(freq);
  analyser.getFloatTimeDomainData(time);

  const centroidNorm = Math.min((features.spectralCentroid || 0) / 10000, 1);
  const flat = Math.min(Math.max(features.spectralFlatness || 0, 0), 1);

  const bins = 256;
  const out = new Float32Array(bins);
  const step = Math.floor(freq.length / bins);
  for (let i = 0; i < bins; i++) {
    let s = 0;
    for (let j = 0; j < step; j++) s += freq[i * step + j];
    const v = (s / step / 255) * sensitivity;
    out[i] = Math.min(v, 1);
  }
  return {
    bins: out,
    centroidHz: features.spectralCentroid || 0,
    centroidNorm,
    flatness: flat,
    rms: features.rms || 0,
  };
}
