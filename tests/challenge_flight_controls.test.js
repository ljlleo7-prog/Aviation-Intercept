import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createRequire } from 'node:module';
import { useFlightControls } from '../src/hooks/useFlightControls.js';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';

const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];

function createControls(serviceRef) {
  let controls;
  function Harness() {
    controls = useFlightControls(serviceRef);
    return null;
  }
  renderToString(createElement(Harness));
  return controls;
}

function createChallengePhysics() {
  const physics = new RealisticFlightPhysicsService({ ...aircraft, scenarioMode: true }, 0, 0, 'rookie');
  physics.setInitialConditions({ altitude: 9000, speed: 240, difficulty: 'rookie' });
  physics.setMotionEnabled(true);
  return physics;
}

test('first Challenge physics tick preserves airborne spawn throttle', () => {
  const physics = createChallengePhysics();
  const controls = createControls({ current: physics });
  assert.equal(controls.getControls().throttle, 0.65);
  assert.deepEqual(controls.getControls().throttles, [0.65, 0.65]);
  physics.update(controls.getControls(), 1 / 60);
  assert.ok(physics.state.vel.x > 120, `Spawn speed must survive the first tick: ${physics.state.vel.x}`);
  assert.ok(physics.controls.throttle > 0.64);
  assert.ok(physics.controls.engineThrottles.every(value => value > 0.64));
});

test('async physics initialization seeds controls once and preserves subsequent pilot commands', () => {
  const ref = { current: null };
  const controls = createControls(ref);
  assert.equal(controls.getControls().throttle, 0);
  ref.current = createChallengePhysics();
  assert.equal(controls.getControls().throttle, 0.65);
  controls.setThrottle(0.8);
  assert.equal(controls.getControls().throttle, 0.8);
  controls.setEngineThrottle(0, 0.4);
  assert.equal(controls.getControls().throttles[0], 0.4);
  assert.equal(controls.getControls().throttles[1], 0.8);
});
