import * as THREE from 'three';
import { EffectComposer } from 'postprocessing';
import { RenderPass } from 'postprocessing';
import { BloomEffect, EffectPass } from 'postprocessing';

// Constantes para la detección de picos y KNN
const NUM_PEAKS = 24;
const K_NEIGHBORS = 3;
const MIN_AMPLITUDE = 0.1;

export function createWireBloom({ bins = 256 } = {}) {
    // Geometría para las líneas
    const positions = new Float32Array(NUM_PEAKS * 3);
    const colors = new Float32Array(NUM_PEAKS * 3);
    const indices = new Uint16Array(NUM_PEAKS * K_NEIGHBORS * 2);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    // Material con brillo
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
    });
    
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.userData = { positions, colors, indices, bins };
    
    // Configurar postprocesado con bloom
    const composer = new EffectComposer(null); // Se configurará después
    const bloomEffect = new BloomEffect({
        luminanceThreshold: 0.4,
        luminanceSmoothing: 0.7,
        intensity: 1.5
    });
    
    mesh.userData.effects = { composer, bloomEffect };
    
    return mesh;
}

function findPeaks(bins, numPeaks) {
    const peaks = [];
    for (let i = 1; i < bins.length - 1; i++) {
        if (bins[i] > MIN_AMPLITUDE && 
            bins[i] > bins[i-1] && 
            bins[i] > bins[i+1]) {
            peaks.push({ index: i, amplitude: bins[i] });
        }
    }
    
    return peaks
        .sort((a, b) => b.amplitude - a.amplitude)
        .slice(0, numPeaks);
}

function findNearestNeighbors(point, points, k) {
    return points
        .map(p => ({
            point: p,
            dist: Math.abs(p.index - point.index)
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(1, k + 1) // Excluye el punto mismo
        .map(n => n.point);
}

export function updateWireBloom(mesh, frameData) {
    const { positions, colors, indices, bins } = mesh.userData;
    const { bins: amplitudes, centroidNorm, flatness } = frameData;
    
    // Encontrar picos espectrales
    const peaks = findPeaks(amplitudes, NUM_PEAKS);
    
    // Actualizar posiciones y colores de los picos
    peaks.forEach((peak, i) => {
        const x = (peak.index / bins) * 2 - 1;
        const y = peak.amplitude;
        const z = 0;
        
        const idx = i * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
        
        // Color basado en frecuencia y amplitud
        colors[idx] = 0.5 + centroidNorm * 0.5;
        colors[idx + 1] = 0.3 + flatness * 0.7;
        colors[idx + 2] = 0.8;
    });
    
    // Conectar con vecinos más cercanos
    let indexCount = 0;
    peaks.forEach((peak, i) => {
        const neighbors = findNearestNeighbors(peak, peaks, K_NEIGHBORS);
        neighbors.forEach(neighbor => {
            const j = peaks.indexOf(neighbor);
            indices[indexCount++] = i;
            indices[indexCount++] = j;
        });
    });
    
    // Actualizar geometría
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
    mesh.geometry.indexBuffer.needsUpdate = true;
}

export function initPostprocessing(mesh, renderer, scene, camera) {
    const { composer, bloomEffect } = mesh.userData.effects;
    
    composer.setRenderer(renderer);
    composer.setSize(window.innerWidth, window.innerHeight);
    
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, bloomEffect));
    
    return composer;
}
