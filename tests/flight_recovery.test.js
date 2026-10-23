import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { buildFlightSavePayload } from '../src/services/buildFlightSavePayload.js';
import { validateFlightSave, getRecoveryConfig } from '../src/services/flightRecovery.js';
import { airportService } from '../src/services/airportService.js';
import { encryptFlightData, decryptFlightData } from '../src/utils/flightDataCrypto.js';

async function createPhysics() {
  const aircraft = (await loadAircraftData()).find(item => item.model === 'Boeing 737-800');
  return new RealisticFlightPhysicsService(aircraft, 34, -118, 'rookie');
}

async function createSave() {
  const physics = await createPhysics();
  physics.setInitialConditions({ latitude: 34, longitude: -118, position: { z: 1800 }, heading: 254, fuel: 4300, coldStart: false });
  physics.state.vel.set(95, 2, -1);
  physics.state.rates.set(0.01, 0.02, 0.03);
  physics.time = 123;
  physics.state.fuel = 4300;
  physics.systems.fuel.tanks = { left: 1900, right: 1900, center: 500 };
  physics.controls.throttle = .64;
  physics.controls.engineThrottles = [.6, .68];
  physics.sessionContext = { callsign: 'TEST123', selectedDeparture: { icao: 'KLAX' }, selectedArrival: { icao: 'VHHH' }, difficulty: 'rookie', routeDetails: { landingRunway: '25L' } };
  const flightPlan = { waypoints: [{ latitude: 34, longitude: -118 }, { latitude: 35, longitude: -117 }], currentWaypointIndex: 1 };
  physics.updateFlightPlan(flightPlan);
  physics.setRunwayGeometry(airportService.getRunwayGeometry('LAX', '24L'));
  physics.setApproachReference(airportService.getRunwayGeometry('LAX', '24L'));
  physics.setAutopilot(true, { mode: 'LNAV', altitude: 8000, speed: 240, vs: 500 });
  physics.setVNAVArmed(true);
  physics.setAutothrottleArmed(false);
  physics.autopilot.setFlightDirectorEnabled(true);
  physics.autopilot.setNavFrequency(111.7);
  physics.failureSystem.triggerFailure('engine_oil_leak', { engineIndex: 0 });
  return { physics, save: buildFlightSavePayload({ physicsService: physics, flightData: physics.getOutputState(), flightPlan, aircraftModel: 'Boeing 737-800', weatherData: { windSpeed: 8 } }) };
}

test('save round trip restores kinematics, fuel, systems, navigation, failures and AP/FD arming', async () => {
  const { physics, save } = await createSave();
  const restored = await createPhysics();
  restored.loadFlightState(save);
  assert.deepEqual(restored.state.geo, physics.state.geo);
  assert.deepEqual(restored.state.pos, physics.state.pos);
  assert.deepEqual(restored.state.vel, physics.state.vel);
  for (const key of ['w', 'x', 'y', 'z']) assert.ok(Math.abs(restored.state.quat[key] - physics.state.quat[key]) < 1e-12);
  assert.deepEqual(restored.state.rates, physics.state.rates);
  assert.equal(restored.state.fuel, 4300);
  assert.equal(restored.time, 123);
  assert.equal(restored.currentWaypointIndex, 1);
  assert.ok(Array.isArray(restored.flightPlan));
  assert.equal(restored.autopilot.runwayGeometry.runwayName, '24L');
  assert.equal(restored.getAutopilotStatus().approachReference.runwayName, '24L');
  assert.equal(restored.autopilot.mode, 'LNAV');
  assert.equal(restored.autopilot.vnavArmed, true);
  assert.equal(restored.autopilot.autothrottleArmed, false);
  assert.equal(restored.autopilot.flightDirectorEnabled, true);
  assert.equal(restored.autopilot.nav1Frequency, 111.7);
  assert.deepEqual(restored.failureSystem.getSerializableState(), physics.failureSystem.getSerializableState());
  assert.deepEqual(restored.controls.engineThrottles, [.6, .68]);
  assert.equal(getRecoveryConfig(save).config.callsign, 'TEST123');
  // Snapshot objects must not keep references into the live aircraft.
  physics.systems.electrical.batterySelector = 'OFF';
  assert.notEqual(save.physicsState.systems.electrical.batterySelector, 'OFF');
  restored.setMotionEnabled(true);
  assert.doesNotThrow(() => restored.update({ throttle: .64, pitch: 0, roll: 0, yaw: 0, trim: 0 }, .05));
});

test('legacy 1.0 saves remain recoverable and signed altitude is preserved below sea level', async () => {
  const { save } = await createSave();
  save.version = '1.0';
  delete save.session;
  delete save.physicsState.failureState;
  save.physicsState.position.z = -20;
  const restored = await createPhysics();
  restored.loadFlightState(save);
  assert.equal(restored.state.pos.z, 20);
});

test('corrupt saves fail before mutating a live aircraft', async () => {
  const { save } = await createSave();
  const restored = await createPhysics();
  const original = restored.getSerializableState().position;
  for (const corrupt of [null, { ...save, version: '9' }, { ...save, physicsState: { ...save.physicsState, position: { ...save.physicsState.position, latitude: 100 } } }]) {
    assert.throws(() => restored.loadFlightState(corrupt));
    assert.deepEqual(restored.getSerializableState().position, original);
  }
  save.physicsState.position.z = NaN;
  assert.throws(() => validateFlightSave(save));
});

test('downloaded saves preserve Chinese text and retain legacy file compatibility', () => {
  const value = { version: '1.1', session: { airline: '中国航空', callsign: '测试123' } };
  assert.deepEqual(decryptFlightData(encryptFlightData(value)), value);
  const legacy = { version: '1.0', aircraftModel: 'Boeing 737-800' };
  const text = JSON.stringify(legacy);
  const salt = 'AIRCRASHSIM2025';
  const encoded = btoa([...text].map((char, index) => String.fromCharCode(char.charCodeAt(0) ^ salt.charCodeAt(index % salt.length))).join(''));
  assert.deepEqual(decryptFlightData(encoded), legacy);
});
