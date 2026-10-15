import test from 'node:test';
import assert from 'node:assert/strict';
import Physics from '../src/services/RealisticFlightPhysicsService.js';
import { Vector3, Quaternion } from '../src/utils/flightMath.js';
import GroundInteraction from '../src/services/physics/GroundInteractionService.js';

for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
test(`live touchdown loop bounds gear compression throughout landing and rollout at ${1 / dt}Hz`, () => {
  const physics = new Physics({ mass: 70000, engineCount: 2, gearHeight: 3.5 }, 30, 120, 'professional');
  physics.setRunwayGeometry({ heading: 0, length: 10000, width: 60,
    thresholdStart: { latitude: 30, longitude: 120, elevation: 0 } });
  physics.state.pos.z = -6;
  physics.state.vel = new Vector3(50, 0, 2);
  physics.onGround = false;
  physics.setMotionEnabled(true);
  let contacted = false;
  for (let frame = 0; frame < 10 / dt; frame++) {
    physics.update({ throttle: 0, gear: true }, dt);
    contacted ||= physics.onGround;
    const lowest = Math.max(...physics.groundInteractionService.getContactPoints(physics.aircraft.gearHeight)
      .map(point => physics.state.quat.rotate(point.pos).z));
    const penetration = physics.state.pos.z + lowest - physics.currentGroundZ;
    assert.ok(penetration <= 0.351, `frame ${frame}: gear penetration ${penetration}m`);
    assert.ok(!physics.crashed, physics.crashReason);
  }
  assert.ok(contacted, 'must exercise actual touchdown');
});
}

test('identical contact inputs replay deterministically and hard impacts retain crash detection', () => {
  const run = () => {
    const physics = new Physics({ mass: 70000, engineCount: 2 }, 30, 120, 'professional');
    physics.state.pos.z = -2;
    physics.state.vel = new Vector3(60, 0, 12);
    physics.currentGroundZ = 0;
    physics.checkConstraints(1 / 300);
    assert.equal(physics.crashed, true);
    assert.equal(physics.crashReason, 'Hard Landing / Crash');
    return { position: physics.state.pos, velocity: physics.state.vel, ground: physics.onGround };
  };
  assert.deepEqual(run(), run());
});

test('contact resolution preserves attitude and horizontal velocity at pitched and banked touchdown', () => {
  const ground = new GroundInteraction();
  for (const gearDown of [true, false]) {
    const attitude = Quaternion.fromEuler(0.1, 0.08, 1.2);
    const inverse = new Quaternion(attitude.w, -attitude.x, -attitude.y, -attitude.z);
    const state = { pos: new Vector3(0, 0, 0), quat: attitude, vel: inverse.rotate(new Vector3(40, 20, 3)) };
    const contact = ground.resolveSurfaceContact(state, -25, 3.5, gearDown);
    assert.ok(contact.contact);
    assert.ok(Math.abs(contact.sinkRate - 3) < 1e-10);
    const earthVelocity = attitude.rotate(state.vel);
    assert.ok(Math.abs(earthVelocity.x - 40) < 1e-10);
    assert.ok(Math.abs(earthVelocity.y - 20) < 1e-10);
    assert.ok(Math.abs(earthVelocity.z) < 1e-10);
    const lowest = Math.max(...ground.getContactPoints(3.5, gearDown).map(point => attitude.rotate(point.pos).z));
    assert.ok(Math.abs(state.pos.z + lowest + 25 - (gearDown ? 0.35 : 0)) < 1e-10);
    assert.equal(state.quat, attitude);
    const restingZ = state.pos.z;
    ground.resolveSurfaceContact(state, -25, 3.5, gearDown);
    assert.equal(state.pos.z, restingZ, 'constraint is idempotent');
  }
});

test('runway contact uses destination elevation relative to the departure datum', () => {
  const ground = new GroundInteraction();
  const result = ground.updateGroundStatus({ geo: { lat: 30, lon: 120 }, pos: new Vector3(), vel: new Vector3() },
    { thresholdStart: { latitude: 30, longitude: 120, elevation: 1000 }, heading: 0, length: 3000, width: 60 },
    999, 100);
  assert.equal(result.groundStatus.status, 'RUNWAY');
  assert.equal(result.currentGroundZ, -(1000 * 0.3048 - 100));
});
