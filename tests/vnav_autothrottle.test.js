import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';

const createPhysics = async () => {
  const aircraft = (await loadAircraftData()).find(item => item.model === 'Boeing 737-800');
  const physics = new RealisticFlightPhysicsService(aircraft, 34, -118, 'intermediate');
  physics.setInitialConditions({ latitude: 34, longitude: -118, position: { z: 5000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(180 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);
  return physics;
};

test('VNAV is independent of the lateral mode and follows a fix altitude only when armed', async () => {
  const physics = await createPhysics();
  physics.autopilot.setNavigationPlan({ fix: { latitude: 34.1, longitude: -118, altitude: 8000 }, inboundCourseDeg: 90 });
  physics.setAutopilotMode('HDG');
  physics.setAutopilot(true);
  physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 0.05);
  assert.equal(physics.getAutopilotStatus().vnavArmed, false);
  assert.notEqual(physics.getAutopilotStatus().targets.altitude, 8000);

  physics.setVNAVArmed(true);
  physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 0.05);
  assert.equal(physics.getAutopilotStatus().mode, 'HDG');
  assert.equal(physics.getAutopilotStatus().targets.altitude, 8000);
  assert.equal(physics.getAutopilotStatus().fma.vertical.active.label, 'VNAV PTH');
});

test('disarming A/T leaves manual throttle input in control while AP remains engaged', async () => {
  const physics = await createPhysics();
  physics.setAutopilot(true);
  physics.setAutothrottleArmed(false);
  let appliedInput;
  const original = physics.processInputs.bind(physics);
  physics.processInputs = (input, dt) => { appliedInput = input; return original(input, dt); };
  physics.update({ throttle: 0.35, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 0.05);
  assert.equal(physics.getAutopilotStatus().engaged, true);
  assert.equal(physics.getAutopilotStatus().autothrottleArmed, false);
  assert.equal(appliedInput.throttle, 0.35);
  assert.equal(physics.getAutopilotStatus().fma.autothrottle, 'OFF');
});
