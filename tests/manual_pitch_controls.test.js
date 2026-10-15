import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { manualPitchToElevator } from '../src/utils/manualFlightControls.js';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { Quaternion } from '../src/utils/flightMath.js';

const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];

function pitchResponse(pilotInput) {
  const physics = new RealisticFlightPhysicsService(aircraft, 0, 0, 'intermediate');
  physics.state.pos.z = -1000;
  physics.currentGroundZ = 0;
  physics.state.quat = Quaternion.fromEuler(0, 0, 0);
  physics.state.vel.set(100, 0, 0);
  physics.state.rates.set(0, 0, 0);
  physics.onGround = false;
  physics.controls.elevator = manualPitchToElevator(pilotInput);
  const result = physics.calculateAerodynamicsAndGround(physics.calculateEnvironment(-1000));
  physics.integrate(result.forces, result.moments, 0.05);
  const next = physics.calculateAerodynamicsAndGround(physics.calculateEnvironment(physics.state.pos.z));
  physics.integrate(next.forces, next.moments, 0.05);
  return { moment: result.moments.y, pitch: physics.state.quat.toEuler().theta };
}

test('pulling S raises the nose and pushing W lowers it in the flight physics', () => {
  const pull = pitchResponse(0.3);
  const push = pitchResponse(-0.3);
  assert.ok(pull.moment > 0, `Pull must produce nose-up moment: ${pull.moment}`);
  assert.ok(push.moment < 0, `Push must produce nose-down moment: ${push.moment}`);
  assert.ok(pull.pitch > 0, `Pull must raise pitch: ${pull.pitch}`);
  assert.ok(push.pitch < 0, `Push must lower pitch: ${push.pitch}`);
});

test('manual pitch supports normalized and percentage inputs', () => {
  assert.equal(manualPitchToElevator(30), manualPitchToElevator(0.3));
  assert.equal(manualPitchToElevator(-30), manualPitchToElevator(-0.3));
  assert.equal(Math.abs(manualPitchToElevator(0)), 0);
});
