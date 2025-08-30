import * as THREE from "three";

export function createCloudField({ bins = 2000 } = {}) {
  const positions = new Float32Array(bins * 3);
  const colors = new Float32Array(bins * 3);
  const basePositions = new Float32Array(bins * 3);

  for (let i = 0; i < bins; i++) {
    const j = i * 3;
    basePositions[j] = (Math.random() - 0.5) * 7; // X
    basePositions[j + 1] = 0; // Y
    basePositions[j + 2] = (Math.random() - 0.5) * 7; // Z
  }
  positions.set(basePositions); // ← Copia los valores una vez

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Points(geom, mat);
  mesh.position.y = -1; // Ajusta este valor según qué tan abajo la quieres

  mesh.userData = { bins, positions, colors, basePositions };

  return mesh;
}

export function updateCloudField(mesh, frameData) {
  const { bins, positions, colors, basePositions } = mesh.userData;
  const { centroidNorm, flatness, amps } = frameData;

  for (let i = 0; i < bins; i++) {
    const j = i * 3;

    const spread = 3; // antes era 10
    const heightScale = 5; // antes 2

    const baseX = basePositions[j];
    const baseY = basePositions[j + 1];
    const baseZ = basePositions[j + 2];

    positions[j] = baseX;
    const targetY = baseY + amps[i] * heightScale;
    positions[j + 1] += (targetY - positions[j + 1]) * 0.9; // <- cambia 0.3 para controlar la "urgencia" al volver
    positions[j + 2] = baseZ;

    const freqInfluence = centroidNorm; // normalizado entre 0 y 1
    const amp = amps[i]; // amplitud individual

    const r = freqInfluence * amp; // más rojo con más frecuencia
    const g = 0.2 + amp * 0.5; // verde controlado
    const b = 1.0 - freqInfluence; // azul principal

    colors[j] = r;
    colors[j + 1] = g;
    colors[j + 2] = b;
  }

  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.color.needsUpdate = true;
}
