// src/main.js
import * as THREE from "three";
import {
  createRenderer,
  createScene,
  createCamera,
  handleResize,
} from "./viz/core.js";
import { createNebula, updateNebula } from "./viz/presets/nebula.js";
import {
  startMic,
  stopAudio,
  startFile,
  getFrame,
  setSensitivity,
} from "./audio.js";

let renderer, scene, camera, mesh;
let history = 150; // slider de “trail”
const BINS = 1256; // debe MATCHEAR con audio.js (getFrame -> bins)

init();
bindUI();
loop();

function init() {
  renderer = createRenderer();
  scene = createScene();
  camera = createCamera();
  handleResize(renderer, camera);

  mesh = createNebula({ bins: BINS, history });
  scene.add(mesh);

  // opcional: una rejita pa’ no perdernos
  const grid = new THREE.GridHelper(10, 10, 0x222222, 0x111111);
  grid.position.y = -0.9;
  scene.add(grid);
}

function bindUI() {
  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const fileIn = document.getElementById("file");
  const sens = document.getElementById("sens");
  const trail = document.getElementById("trail");

  startBtn.onclick = async () => {
    await startMic();
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  stopBtn.onclick = async () => {
    await stopAudio();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };

  fileIn.onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await startFile(e.target.files[0]);
      startBtn.disabled = true;
      stopBtn.disabled = false;
    }
  };

  sens.oninput = () => setSensitivity(Number(sens.value));

  trail.oninput = () => {
    history = Number(trail.value);
    resetNebula();
  };
}

function resetNebula() {
  if (mesh) scene.remove(mesh);
  mesh = createNebula({ bins: BINS, history }); // << usa la misma cantidad de bins
  scene.add(mesh);
}

function loop() {
  requestAnimationFrame(loop);

  const f = getFrame();
  if (f) {
    updateNebula(mesh, f);

    // HUD opcional:
    const c = document.getElementById("centroid");
    const fl = document.getElementById("flatness");
    if (c) c.textContent = `Centroid: ${Math.round(f.centroidHz)} Hz`;
    if (fl) fl.textContent = `Flatness: ${f.flatness.toFixed(2)}`;
  }

  // una respiración mínima en la cámara
  camera.position.x = 0.6 + Math.sin(performance.now() * 0.001) * 0.1;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}
