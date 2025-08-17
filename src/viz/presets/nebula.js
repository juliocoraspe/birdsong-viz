import * as THREE from "three";

export function createNebula({ bins = 256, history = 120 } = {}) {
  const points = bins * history;
  const positions = new Float32Array(points * 3);
  const colors = new Float32Array(points * 3);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Points(geom, mat);
  mesh.userData = { bins, history, positions, colors, frame: 0, zStep: 0.02 };
  return mesh;
}

export function updateNebula(mesh, frameData) {
  const { bins, history, positions, colors } = mesh.userData;
  const { zStep } = mesh.userData;
  const { centroidNorm, flatness, bins: amps } = frameData;
  const row = mesh.userData.frame % history;
  const base = row * bins * 3;

  for (let i = 0; i < bins; i++) {
    const x = (i / (bins - 1)) * 2 - 1;
    const y = amps[i];
    const z = -row * zStep;

    const j = base + i * 3;
    positions[j + 0] = x + noise(x, row * 0.01) * 0.02 * (0.2 + amps[i]);
    positions[j + 1] = y;
    positions[j + 2] = z;

    const t = flatness; // 0..1
    const r = (t * 0.9 + 0.1) * amps[i];
    const g = (1.0 - Math.abs(0.5 - t) * 2.0) * 0.8 * (0.5 + 0.5 * amps[i]);
    const b = ((1 - t) * 0.9 + 0.1) * (0.4 + 0.6 * centroidNorm);

    colors[j + 0] = r;
    colors[j + 1] = g;
    colors[j + 2] = b;
  }

  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.color.needsUpdate = true;

  mesh.position.z = (mesh.userData.frame % history) * zStep;
  mesh.userData.frame++;
}

function noise(x, y) {
  const s = Math.sin((x * 12.9898 + y * 78.233) * 43758.5453);
  return s - Math.floor(s);
}
