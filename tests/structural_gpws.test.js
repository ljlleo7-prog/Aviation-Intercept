import { test } from 'node:test';
import assert from 'node:assert/strict';
import StructuralLimitsService from '../src/services/physics/StructuralLimitsService.js';
import WarningSystem from '../src/services/WarningSystem.js';
import { terrainRadarService } from '../src/services/TerrainRadarService.js';

test('normal flight preserves structure; excessive G causes persistent damage and departure', () => {
  const model = new StructuralLimitsService();
  model.update({ loadFactor: 1, dynamicPressure: 8000, mach: 0.75, onGround: false, dt: 600 });
  assert.equal(model.health.wing, 1);
  const damage = [];
  model.update({ loadFactor: 8, dynamicPressure: 8000, mach: 0.75, onGround: false, dt: 10 }, item => damage.push(item));
  assert.equal(model.health.wing, 0);
  assert.equal(model.events.length, 8);
  assert.ok(damage.some(item => item.componentId === 'controls.elevator' && item.severity === 1));
  model.update({ loadFactor: 1, dynamicPressure: 8000, mach: 0.75, onGround: false, dt: 10 });
  assert.equal(model.health.wing, 0);
  assert.equal(model.events.length, 8);
});

test('negative G, high dynamic pressure and Mach each cause damage; ground loads do not', () => {
  for (const overrides of [{ loadFactor: -3 }, { dynamicPressure: 50000 }, { mach: 1.2 }]) {
    const model = new StructuralLimitsService();
    model.update({ loadFactor: 1, dynamicPressure: 8000, mach: 0.7, onGround: false, dt: 5, ...overrides });
    assert.ok(model.health.wing < 1);
  }
  const model = new StructuralLimitsService();
  model.update({ loadFactor: 8, dynamicPressure: 8000, mach: 0.7, onGround: true, dt: 10 });
  assert.equal(model.health.wing, 1);
});

const check = ({ agl = 300, vs = -700, gear = 1, flaps = 0.5, speed = 140, ground = false, region = 'RUNWAY', terrain = 0 } = {}) => {
  const warning = new WarningSystem();
  const previous = terrainRadarService.getTerrainHeight;
  terrainRadarService.getTerrainHeight = () => terrain;
  try {
    warning.checkGPWS(agl, vs, gear, flaps, speed, { status: region }, {
      debugPhysics: { isOnGround: ground }, position: { latitude: 0, longitude: 0 },
      derived: { groundSpeed: speed, heading: 0, altitude_ft: agl, airport_elevation_ft: 0 }
    });
  } finally { terrainRadarService.getTerrainHeight = previous; }
  return warning.activeWarnings;
};

test('GPWS stays quiet during taxi, normal runway approach and takeoff climb', () => {
  assert.deepEqual(check({ ground: true, agl: 0, vs: 0, speed: 20 }), []);
  assert.deepEqual(check(), []);
  assert.deepEqual(check({ agl: 50, vs: 1500, flaps: 0.1 }), []);
});

test('GPWS warns for a fast dive over runway despite landing configuration', () => {
  assert.ok(check({ vs: -6000, speed: 350 }).some(item => item.id === 'GPWS_PULL_UP'));
});

test('GPWS detects mountain collision with gear/flaps down and missing terrain stays unknown', () => {
  assert.ok(check({ terrain: 500, vs: 0 }).some(item => item.id === 'GPWS_PULL_UP'));
  assert.deepEqual(check({ agl: 3000, vs: 0, terrain: null, region: 'OBJECTS' }), []);
});

test('brief load exceedance warns without damaging structure', () => {
  const model = new StructuralLimitsService();
  model.update({ loadFactor: 3, dynamicPressure: 8000, mach: 0.7, onGround: false, dt: 0.5 });
  assert.equal(model.overload, true);
  assert.equal(model.health.wing, 1);
});
