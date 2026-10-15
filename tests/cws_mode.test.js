import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';

test('CWS allows wheel input and captures the flight path for release', async () => {
  const aircraft = (await loadAircraftData()).find(item => item.model === 'Boeing 737-800');
  const physics = new RealisticFlightPhysicsService(aircraft, 34, -118, 'intermediate');
  physics.setInitialConditions({ latitude: 34, longitude: -118, position: { z: 5000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(180 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);
  physics.setAutopilotMode('CWS');
  physics.setAutopilot(true);

  let appliedInput;
  const originalProcessInputs = physics.processInputs.bind(physics);
  physics.processInputs = (input, dt) => { appliedInput = input; return originalProcessInputs(input, dt); };
  physics.update({ throttle: 0.5, pitch: 0.2, roll: 0.25, yaw: 0, trim: 0, flaps: 0, gear: false }, 0.05);

  assert.equal(physics.getAutopilotStatus().mode, 'CWS');
  assert.equal(appliedInput.pitch, 0.2);
  assert.equal(appliedInput.roll, 0.25);
  assert.ok(Number.isFinite(physics.getAutopilotStatus().targets.heading));
});
