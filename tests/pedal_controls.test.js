import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { Quaternion } from '../src/utils/flightMath.js';
import { installDeterministicRandom } from './support/deterministicRandom.js';

const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];
const runway = { heading: 0, thresholdStart: { latitude: 0, longitude: 0 }, length: 3000, width: 60 };
const createGroundPhysics = (rudder = 0) => {
  const physics = new RealisticFlightPhysicsService(aircraft, 0, 0, 'rookie');
  physics.runwayGeometry = runway;
  physics.groundStatus = { status: 'RUNWAY' };
  physics.currentGroundZ = 0;
  physics.state.pos.z = -2.5;
  physics.state.quat = Quaternion.fromEuler(0, 0, 0);
  physics.state.vel.set(5, 0, 0);
  physics.state.rates.set(0, 0, 0);
  physics.controls.rudder = rudder;
  physics.performSystemAction('brakes', 'parkingBrake', false);
  physics.onGround = true;
  return physics;
};

test('toe braking releases independently and preserves the parking brake latch', () => {
  const physics = createGroundPhysics();
  physics.setToeBrakes(1);
  assert.equal(physics.controls.wheelBrakes, 1);
  assert.equal(physics.systems.brakes.parkingBrake, false);
  physics.setToeBrakes(0);
  assert.equal(physics.controls.wheelBrakes, 0);
  physics.performSystemAction('brakes', 'parkingBrake', true);
  physics.setToeBrakes(0);
  assert.equal(physics.controls.wheelBrakes, 1);
  assert.equal(physics.systems.brakes.parkingBrake, true);
  physics.setToeBrakes(0.6);
  physics.performSystemAction('brakes', 'parkingBrake', false);
  assert.equal(physics.controls.wheelBrakes, 0.6, 'Held toe brakes stay applied when the parking brake releases');
  physics.setToeBrakes(0);
  assert.equal(physics.controls.wheelBrakes, 0);
});

test('toe brake pressure clamps invalid and out-of-range inputs', () => {
  const physics = createGroundPhysics();
  for (const [input, expected] of [[NaN, 0], [undefined, 0], [-1, 0], [2, 1], [0.5, 0.5]]) {
    physics.setToeBrakes(input);
    assert.equal(physics.controls.wheelBrakes, expected);
  }
});

test('ground forces do not pull an offset aircraft toward the runway centerline', () => {
  for (const difficulty of ['rookie', 'intermediate', 'professional']) {
    const physics = createGroundPhysics();
    physics.difficulty = difficulty;
    physics.state.vel.set(30, 0, 0);
    const environment = physics.calculateEnvironment(physics.state.pos.z);
    physics.state.geo.lon = 0.0001;
    const right = physics.calculateAerodynamicsAndGround(environment, 1 / 300);
    physics.state.geo.lon = -0.0001;
    const left = physics.calculateAerodynamicsAndGround(environment, 1 / 300);
    assert.equal(right.forces.y, left.forces.y);
    assert.equal(right.moments.z, left.moments.z);
  }
});

test('left and right rudder produce opposite nosewheel steering and turning moments', () => {
  const right = createGroundPhysics(Math.PI / 6);
  const left = createGroundPhysics(-Math.PI / 6);
  const rightForces = right.calculateAerodynamicsAndGround(right.calculateEnvironment(right.state.pos.z));
  const leftForces = left.calculateAerodynamicsAndGround(left.calculateEnvironment(left.state.pos.z));
  assert.ok(rightForces.debug.nosewheelSteeringAngle > 0.1);
  assert.ok(leftForces.debug.nosewheelSteeringAngle < -0.1);
  assert.ok(rightForces.moments.z > 0);
  assert.ok(leftForces.moments.z < 0);
  right.integrate(rightForces.forces, rightForces.moments, 0.05);
  left.integrate(leftForces.forces, leftForces.moments, 0.05);
  assert.ok(right.state.rates.z > 0);
  assert.ok(left.state.rates.z < 0);
});

test('ground stability retains the full commanded rudder aerodynamic moment', () => {
  const neutral = createGroundPhysics();
  const deflected = createGroundPhysics(Math.PI / 6);
  neutral.state.vel.x = deflected.state.vel.x = 25;
  const base = neutral.calculateAerodynamicsAndGround(neutral.calculateEnvironment(neutral.state.pos.z));
  const result = deflected.calculateAerodynamicsAndGround(deflected.calculateEnvironment(deflected.state.pos.z));
  const expected = result.debug.q * deflected.aircraft.wingArea * deflected.aircraft.wingSpan * deflected.aircraft.Cdr * deflected.controls.rudder;
  assert.ok(Math.abs(result.debug.yawMoment - base.debug.yawMoment - expected) < Math.abs(expected) * 1e-8);
});

test('sustained pedal input turns the aircraft during beginner-mode taxi', () => {
  const restoreRandom = installDeterministicRandom(7301);
  try {
    const headings = [];
    for (const direction of [-1, 0, 1]) {
      const physics = createGroundPhysics();
      physics.setInitialConditions({ latitude: 0, longitude: 0, position: { z: 0 }, heading: 0, fuel: 5000, coldStart: false });
      physics.performSystemAction('brakes', 'parkingBrake', false);
      physics.state.vel.set(5, 0, 0);
      physics.setMotionEnabled(true);
      for (let frame = 0; frame < 60; frame++) {
        physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: direction * Math.PI / 6, trim: 0 }, 0.02);
      }
      assert.equal(physics.crashed, false);
      assert.ok(physics.state.vel.magnitude() > 3, 'Aircraft should still be taxiing');
      headings.push(physics.state.quat.toEuler().psi * 180 / Math.PI);
    }
    assert.ok(headings[0] < -5, 'Left pedal must turn left');
    assert.ok(Math.abs(headings[1]) < 2, 'Neutral pedals should track straight');
    assert.ok(headings[2] > 5, 'Right pedal must turn right');
  } finally {
    restoreRandom();
  }
});
