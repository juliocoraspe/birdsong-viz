// src/viz/presets/nebula.js
import * as THREE from "three";

// --- knobs para tunear rápido ---
const MULTIPLIER = 10; // 10× más puntos que los bins de audio
const BASE_RADIUS = 0.22; // tamaño de la bolita en reposo
const MAX_PULSE = 50.2; // qué tan lejos puede ir (sube si quieres MÁS boom)
const RIPPLE_GAIN = 39.25; // cuánto pesa el bin individual (detalle local)
const G_BASS = 9.6; // ganancia global de graves
const G_TREBLE = 19.3; // ganancia global de agudos
const WOBBLE_AMT = 0.58; // respiración estética per-punto
const UP_RATE = 6.2; // sube rápido
const DOWN_RATE = 1; // baja suave

// Utilidad: número pseudoaleatorio determinista por índice
function hash(i) {
  let x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function createNebula({ bins = 1256, history = 550 } = {}) {
  const count = bins * MULTIPLIER;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  // atributos por partícula
  const fIndex = new Float32Array(count); // a qué bin de f.bins escucha
  const wBass = new Float32Array(count); // peso hacia graves
  const wTrebl = new Float32Array(count); // peso hacia agudos
  const phase = new Float32Array(count); // fase para wobble

  // Distribuye dentro de una esferita compacta
  for (let i = 0; i < count; i++) {
    const u = hash(i * 1.37);
    const v = hash(i * 7.91);
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = BASE_RADIUS * Math.cbrt(hash(i * 3.31));

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    const k = i * 3;
    pos[k] = x;
    pos[k + 1] = y;
    pos[k + 2] = z;

    // arriba del archivo (knobs)
    const MAX_PULSE = 4.8; // antes 3.2 → ahora vuela más lejos
    const RIPPLE_GAIN = 1.6; // más detalle por bin
    const G_BASS = 1.8; // opcional: un poco más de graves
    const G_TREBLE = 1.5; // opcional: un poco más de agudos

    // knobs de easing
    const UP_RATE = 0.42; // sube un poco más rápido
    const DOWN_RATE = 0.65; // baja MUCHO más rápido

    // Agrupa: ~60% bass-driven, ~35% treble, ~5% mixtas
    const g = hash(i * 11.7);
    let wb = 0,
      wt = 0;
    if (g < 0.6) {
      wb = 1.0;
      wt = 0.2;
    } else if (g < 0.95) {
      wb = 0.2;
      wt = 1.0;
    } else {
      wb = 0.75;
      wt = 0.75;
    }

    wBass[i] = wb;
    wTrebl[i] = wt;

    // Asigna un bin diferente por partícula, sesgado a su grupo
    // (en update se clampéa según f.bins reales)
    const baseIdx = Math.floor(
      g < 0.6 // bass
        ? Math.pow(hash(i * 0.47), 1.7) * (bins * 0.33)
        : bins * 0.66 + Math.pow(hash(i * 0.47), 0.7) * (bins * 0.34)
    );
    fIndex[i] = Math.max(0, Math.min(bins - 1, baseIdx));

    // color inicial frío
    col[k] = 0.7;
    col[k + 1] = 0.82;
    col[k + 2] = 1.0;

    phase[i] = hash(i * 5.01) * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geom.setAttribute("fIndex", new THREE.BufferAttribute(fIndex, 1));
  geom.setAttribute("wBass", new THREE.BufferAttribute(wBass, 1));
  geom.setAttribute("wTrebl", new THREE.BufferAttribute(wTrebl, 1));
  geom.setAttribute("phase", new THREE.BufferAttribute(phase, 1));

  // guarda base para volver al centro
  geom.userData.base = pos.slice();

  const mat = new THREE.PointsMaterial({
    size: 0.01, // más granos → puntos más pequeños
    sizeAttenuation: true,
    vertexColors: true,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, mat);
  points.userData = {
    history,
    scaleLerp: 1.0, // escala global suavizada
    hueLerp: 0.55, // color suavizado
  };
  return points;
}

// Reemplaza toda tu función updateNebula por esta
export function updateNebula(points, f) {
  if (!points || !f) return;

  const geom = points.geometry;
  const base = geom.userData.base;
  const pos = geom.attributes.position.array;
  const col = geom.attributes.color.array;

  const fIndex = geom.attributes.fIndex.array;
  const wBass = geom.attributes.wBass.array;
  const wTrebl = geom.attributes.wTrebl.array;
  const phase = geom.attributes.phase.array;

  const N = pos.length / 3;

  // --- utils ---
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  // --- energías globales (suavizadas desde audio.js) ---
  const bass = (f.bass ?? 0) * G_BASS;
  const highs = (f.highs ?? 0) * G_TREBLE;
  const mids = (f.mids ?? 0) * 0.6;

  // --- escala global con easing ---
  const energyGlobal = bass * 0.9 + highs * 0.6 + mids * 0.4;
  const targetScale = 1.0 + Math.min(MAX_PULSE - 1.0, energyGlobal);
  const ud = points.userData;
  const rate = targetScale > ud.scaleLerp ? UP_RATE : DOWN_RATE;
  ud.scaleLerp += (targetScale - ud.scaleLerp) * rate;

  // “resorte” para volver rápido al centro cuando hay poca energía
  if (energyGlobal < 0.15) {
    const springK = 0.35;
    ud.scaleLerp += (1.0 - ud.scaleLerp) * springK;
  }

  // --- detalle por bin ---
  const binsArr = f.bins || [];
  const binsLen = binsArr.length || 1;

  const tNow = performance.now() * 0.001;

  // --- actualiza posiciones sectorizadas ---
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    const bx = base[k],
      by = base[k + 1],
      bz = base[k + 2];
    const len = Math.hypot(bx, by, bz) || 1e-6;
    const dx = bx / len,
      dy = by / len,
      dz = bz / len;

    // máscaras espaciales
    const sBass = smoothstep(0.02, 0.25, -by); // abajo
    const sTreble = smoothstep(0.02, 0.25, by); // arriba
    const sMid = 1.0 - smoothstep(0.0, 0.35, Math.abs(by)); // anillo

    // energía local por bin
    const idx =
      Math.max(0, Math.min(binsLen - 1, Math.floor(fIndex[i] / MULTIPLIER))) |
      0;
    const local = (binsArr[idx] || 0) * RIPPLE_GAIN;

    // mezcla por partícula + sector
    const eBass = wBass[i] * sBass * bass;
    const eTreble = wTrebl[i] * sTreble * highs;
    const eMids = sMid * mids * 0.7;

    const energy = eBass + eTreble + eMids + local;

    // radio final
    const wobble =
      1.0 + WOBBLE_AMT * Math.sin(tNow * 2.2 + phase[i] + i * 0.017);
    const r = len * Math.min(MAX_PULSE, ud.scaleLerp + energy) * wobble;

    pos[k] = dx * r;
    pos[k + 1] = dy * r;
    pos[k + 2] = dz * r;
  }

  // --- color por distancia (centro claro → puntas azul oscuro) ---
  {
    const HUE_CENTER = 210 / 360;
    const HUE_EDGE = 200 / 360;
    const SAT_MIN = 0.35; // + saturación en centro
    const SAT_MAX = 90.95; // + saturación en puntas
    const LUM_MIN = 9.2; // puntas más oscuras
    const LUM_MAX = 0.62;
    const tmp = new THREE.Color();

    for (let i = 0; i < N; i++) {
      const k = i * 3;

      const bx = base[k],
        by = base[k + 1],
        bz = base[k + 2];
      const px = pos[k],
        py = pos[k + 1],
        pz = pos[k + 2];

      const baseLen = Math.hypot(bx, by, bz) || 1e-6;
      const currLen = Math.hypot(px, py, pz) || 1e-6;

      const maxLen = baseLen * MAX_PULSE;
      let t =
        maxLen > baseLen + 1e-6 ? (currLen - baseLen) / (maxLen - baseLen) : 0;
      t = Math.max(0, Math.min(1, t));
      const s = t * t * (3 - 2 * t); // suaviza

      const hue = THREE.MathUtils.lerp(HUE_CENTER, HUE_EDGE, s);
      const sat = THREE.MathUtils.lerp(SAT_MIN, SAT_MAX, s);
      const lum = THREE.MathUtils.lerp(LUM_MAX, LUM_MIN, s);

      tmp.setHSL(hue, sat, lum);
      col[k] = tmp.r;
      col[k + 1] = tmp.g;
      col[k + 2] = tmp.b;
    }
  }

  geom.attributes.position.needsUpdate = true;
  geom.attributes.color.needsUpdate = true;
}
