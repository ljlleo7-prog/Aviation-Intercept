import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAirportGround } from '../src/services/outsideAirportGround.js';

test('ground reuses unchanged surfaces and invalidates for refined source data and quality', () => {
  const originalDocument = globalThis.document;
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const parent = new THREE.Group();
  const terrainMaterial = new THREE.MeshStandardMaterial();
  let ground;
  try {
    const mesh = { positions: [0, 0, 100, 0, 0, 100], chunks: [
      { minX: 0, minZ: 0, maxX: 100, maxZ: 100, indices: [0, 1, 2] }
    ] };
    ground = createAirportGround(parent, {
      heading: 0, thresholdStart: { latitude: 0, longitude: 0 }
    }, [], {
      origin: { latitude: 0, longitude: 0 },
      bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
      operatingArea: [], buildings: [], runways: [], taxiways: [],
      meshes: Object.fromEntries(['land', 'apron', 'taxiway', 'roads'].map(kind => [kind, mesh]))
    }, terrainMaterial);
    const camera = new THREE.PerspectiveCamera();
    ground.update(camera, 1000, 1, false, false, 0);
    const root = parent.children[0];
    const surfaces = root.children.filter(item => item.material?.isMeshLambertMaterial);
    assert.equal(surfaces.length, 4);
    let disposed = 0;
    surfaces.forEach(item => item.geometry.addEventListener('dispose', () => disposed++));
    const details = root.children.find(item => item.isPoints);
    let detailsDisposed = false;
    details.geometry.addEventListener('dispose', () => { detailsDisposed = true; });
    camera.position.x = 501;
    ground.update(camera, 1000, 1, false, false, 1200);
    assert.equal(disposed, 0);
    assert.equal(detailsDisposed, true);
    assert.deepEqual(root.children.filter(item => item.material?.isMeshLambertMaterial), surfaces);
    ground.update(camera, 1000, 1, true, false, 2400);
    assert.equal(disposed, 4); // Quality transitions retain the previous rebuild behavior.
    const qualitySurfaces = root.children.filter(item => item.material?.isMeshLambertMaterial);
    mesh.positions[0] = 12; // Better data with identical chunk IDs and camera cell.
    ground.update(camera, 1000, 1, true, false, 3600);
    const refined = root.children.filter(item => item.material?.isMeshLambertMaterial);
    assert.notStrictEqual(refined[0], qualitySurfaces[0]);
    assert.equal(refined[0].geometry.attributes.position.getX(0), 12);
    // Replacing the source arrays must likewise refresh without moving the camera.
    mesh.positions = [24, 0, 100, 0, 0, 100];
    ground.update(camera, 1000, 1, true, false, 4800);
    assert.equal(root.children.filter(item => item.material?.isMeshLambertMaterial)[0].geometry.attributes.position.getX(0), 24);
    ground.update(camera, 1000, 1, false, false, 6000);
    assert.notStrictEqual(root.children.filter(item => item.material?.isMeshLambertMaterial)[0], refined[0]);
    camera.position.x = 100000;
    ground.update(camera, 1000, 1, true, false, 10000);
    assert.equal(disposed, 4);
    camera.position.x = 0;
    ground.update(camera, 1000, 1, false, false, 11200);
    assert.equal(root.children.filter(item => item.material?.isMeshLambertMaterial).length, 4);
    ground.update(camera, 1000, 1, false, true, 12400);
    assert.equal(root.children.filter(item => item.material?.isMeshLambertMaterial).length, 0);
    ground.update(camera, 1000, 1, false, false, 13600);
    assert.equal(root.children.filter(item => item.material?.isMeshLambertMaterial).length, 4);
  } finally {
    ground?.dispose();
    parent.traverse(item => item.geometry?.dispose());
    terrainMaterial.dispose();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
