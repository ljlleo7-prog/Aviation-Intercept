import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNearbyAirportScenery } from '../src/services/nearbyAirportScenery.js';

test('nearby airports have land and runways without elevation data and release geometry behind the aircraft', () => {
  const scene = new THREE.Scene();
  const reference = { heading: 0, thresholdStart: { latitude: 30, longitude: 120, elevation: 100 } };
  const airport = { icao: 'TEST', iata: 'TST', latitude: 30.1, longitude: 120, runways: [{ name: '07/25' }] };
  const service = {
    getAirportsWithinRadius: latitude => latitude < 31 ? [airport] : [],
    getRunwayGeometry: () => ({ airportCode: 'TEST', heading: 64.7, length: 3000, width: 45,
      thresholdStart: { latitude: 30.1, longitude: 120, elevation: 500 } })
  };
  const scenery = createNearbyAirportScenery(scene, reference, service);
  scenery.update(30, 120);
  assert.equal(scenery.count, 1);
  const airportGroup = scene.children[0];
  const strip = airportGroup.children[0];
  assert.equal(strip.children.length, 2, 'land and pavement exist even with no terrain samples');
  assert.ok(Math.abs(strip.position.y - 400 * 0.3048) < 1e-8);
  assert.ok(Math.abs(strip.rotation.y + 64.7 * Math.PI / 180) < 1e-8);
  assert.ok(Math.abs(scenery.terrainHeight(30.1, 120, -30.48) - (400 * 0.3048 - 0.2)) < 1e-8);
  scenery.position(2000, -5000, 'OTHER', false);
  assert.equal(airportGroup.position.x, -2000);
  assert.equal(airportGroup.position.z, 5000);
  assert.equal(airportGroup.visible, true);
  scenery.position(0, 0, 'TEST', true);
  assert.equal(airportGroup.visible, false, 'avoid duplicate detailed airport surfaces');
  const previousRevision = scenery.revision;
  scenery.update(30, 120);
  assert.equal(scenery.revision, previousRevision, 'reuse scenery while airport remains nearby');
  let disposed = 0;
  strip.children.forEach(mesh => mesh.geometry.addEventListener('dispose', () => disposed++));
  scenery.update(32, 120);
  assert.equal(scenery.count, 0);
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, 2);
  scenery.dispose();
});
