import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { airportService } from '../src/services/airportService.js';
import { approachReferenceStatus, isNavFrequency } from '../src/utils/approachReference.js';

test('APP requires a selected computer reference and an exact NAV1 channel; tuning never selects a runway', async () => {
  const aircraft = (await loadAircraftData()).find(item => item.model === 'Boeing 737-800');
  const physics = new RealisticFlightPhysicsService(aircraft, 34, -118, 'rookie');
  const ground = airportService.getRunwayGeometry('LAX', '24L');
  const approach = airportService.getRunwayGeometry('LAX', '24R');
  physics.setRunwayGeometry(ground);
  physics.autopilot.setNavFrequency(ground.ilsFrequency);
  assert.equal(physics.getAutopilotStatus().approachReference, null, 'ground geometry must not become an APP reference');
  assert.equal(approachReferenceStatus(null, ground.ilsFrequency), 'No approach runway selected');
  physics.setApproachReference(approach);
  assert.equal(approachReferenceStatus(approach, ground.ilsFrequency), 'NAV1 frequency does not match');
  assert.equal(physics.runwayGeometry.runwayName, '24L', 'APP selection must not move the ground/runway datum');
  const angle = (approach.heading + 180) * Math.PI / 180;
  const state = {
    latitude: approach.thresholdStart.latitude + 4 * 1852 * Math.cos(angle) / 111132.92,
    longitude: approach.thresholdStart.longitude + 4 * 1852 * Math.sin(angle) / (111412.84 * Math.cos(approach.thresholdStart.latitude * Math.PI / 180)),
    heading: approach.heading, track: approach.heading, airspeed: 145,
    altitude: 1600, altitudeAGL: 1488, verticalSpeed: -700, groundSpeed: 145
  };
  physics.autopilot.setNavFrequency(approach.ilsFrequency + .05);
  assert.equal(physics.autopilot.updateIlsTelemetry(state).ilsDebug.active, false);
  physics.autopilot.setNavFrequency(approach.ilsFrequency);
  assert.equal(physics.autopilot.updateIlsTelemetry(state).ilsDebug.active, true);
  assert.equal(approachReferenceStatus(approach, approach.ilsFrequency), 'NAV1 tuned · APP ready');
  physics.setApproachReference(null);
  assert.equal(physics.autopilot.updateIlsTelemetry(state).ilsDebug.active, false);
});

test('NAV1 accepts valid 50 kHz channels and rejects partial, non-finite and out-of-band entries', () => {
  for (const value of [108, 108.4, 108.75, 117.95]) assert.equal(isNavFrequency(value), true);
  for (const value of [108.41, 107.95, 118, NaN, Infinity, '108.40']) assert.equal(isNavFrequency(value), false);
});
