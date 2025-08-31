import * as THREE from "https://unpkg.com/three@0.160/build/three.module.js";

// 1. Iniciar cámara trasera
const video = document.getElementById("cam");
async function startCam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
  } catch (e) {
    alert("Permite acceso a la cámara: " + e);
  }
}
startCam();

// 2. Configurar Three.js
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
});
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0); // fondo transparente

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  innerWidth / innerHeight,
  0.01,
  100
);
camera.position.set(0, 0, 2);

const light = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
scene.add(light);

// 3. Objeto de ejemplo (cámbialo por tu animación)
const geo = new THREE.TorusKnotGeometry(0.4, 0.12, 160, 32);
const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.5 });
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);

// 4. Animación loop
function animate() {
  mesh.rotation.y += 0.01; // rotación simple
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
