import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { airportBuildingLayout, papiColors, runwayLightLayout } from '../src/utils/outsideAirportScenery.js';
import { createAirportBuildings, createRunwayLighting } from '../src/services/outsideAirportVisuals.js';

test('runway lighting provides approach, threshold, edge, end, and four PAPI lamps', () => {
  const { lights, papi } = runwayLightLayout(3000, 45);
  assert.equal(papi.length, 4);
  assert.ok(lights.some((light) => light.z === 900));
  assert.ok(lights.some((light) => light.z === 0 && light.color === 0x40ff80));
  assert.ok(lights.some((light) => light.z === -3000 && light.color === 0xff3830));
  assert.ok(lights.some((light) => light.x === 23.5 && light.z < 0));
});

test('PAPI shows low, on-slope, high and no reverse/side indication', () => {
  const eye = (angle) => ({ x: -52, y: Math.tan(angle * Math.PI / 180) * 3300 + .8, z: 3000 });
  assert.deepEqual(papiColors(eye(2), 45), Array(4).fill(0xff3020));
  assert.deepEqual(papiColors(eye(3), 45), [0xfff5e6, 0xfff5e6, 0xff3020, 0xff3020]);
  assert.deepEqual(papiColors(eye(4), 45), Array(4).fill(0xfff5e6));
  assert.deepEqual(papiColors({ x: 0, y: 200, z: -1000 }, 45), [0, 0, 0, 0]);
  assert.deepEqual(papiColors({ x: 2000, y: 200, z: 2000 }, 45), [0, 0, 0, 0]);
});

test('airport buildings leave the main and parallel runway approaches clear', () => {
  const parallel = { x: 310, z: 0, heading: 0, length: 3000, width: 45 };
  const buildings = airportBuildingLayout(3000, 45, [parallel]);
  assert.ok(buildings.length > 0);
  assert.ok(buildings.some((building) => building.detailed));
  assert.ok(buildings.some((building) => !building.detailed));
  for (const building of buildings) {
    const clearance = Math.hypot(building.width, building.depth) / 2 + 85;
    assert.ok(Math.abs(building.x) >= 22.5 + clearance);
    assert.ok(Math.abs(building.x - 310) >= 22.5 + clearance);
  }
});

test('parallel runway PAPI uses its own elevation and heading', () => {
  const group = new THREE.Group();
  group.position.set(600, 50, -100);
  group.rotation.y = Math.PI / 3;
  const lighting = createRunwayLighting(group, 3000, 45);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(group.localToWorld(new THREE.Vector3(-52, Math.tan(3 * Math.PI / 180) * 3300 + .8, 3000)));
  lighting.update(camera, 8000, 0, .75);
  const points = group.children[0];
  const { papi } = runwayLightLayout(3000, 45);
  const colors = points.geometry.attributes.color;
  assert.ok(colors.getY(papi[0]) > .5);
  assert.ok(colors.getY(papi[3]) < .1);
  assert.equal(points.material.uniforms.pixelRatio.value, .75);
  assert.equal(points.material.uniforms.visibility.value, 8000);
  assert.equal(points.visible, true);
  points.geometry.dispose(); points.material.dispose();
});

test('Economy keeps airport buildings while Balanced restores extra buildings and roof detail', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  const parent = new THREE.Group();
  try {
    const buildings = createAirportBuildings(parent, 3000, 45, []);
    buildings.update(true, 0);
    assert.ok(parent.children.some((mesh) => mesh.visible && mesh.count > 0));
    const economyCount = parent.children.filter((mesh) => mesh.visible).reduce((sum, mesh) => sum + mesh.count, 0);
    buildings.update(false, 1);
    const balancedCount = parent.children.filter((mesh) => mesh.visible).reduce((sum, mesh) => sum + mesh.count, 0);
    assert.ok(balancedCount > economyCount);
    assert.ok(parent.children.every((mesh) => mesh.visible));
  } finally {
    const materials = new Set(); const geometries = new Set();
    parent.children.forEach((mesh) => {
      geometries.add(mesh.geometry);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material));
    });
    materials.forEach((material) => { material.map?.dispose(); material.emissiveMap?.dispose(); material.dispose(); });
    geometries.forEach((geometry) => geometry.dispose());
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
