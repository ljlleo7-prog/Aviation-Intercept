import test from 'node:test';
import assert from 'node:assert/strict';
import { airportGuidance, createDiversionPlan } from '../src/utils/diversionNavigation.js';

test('guidance accepts equator coordinates and wraps bearings across the date line', () => {
  const nav = airportGuidance({ latitude: 0, longitude: 179.9, heading: 350 }, { latitude: 0, longitude: -179.9 });
  assert.ok(Math.abs(nav.distance - 12) < 0.1);
  assert.equal(nav.bearing, 90);
  assert.equal(nav.turn, 100);
  assert.equal(airportGuidance({}, { latitude: 0, longitude: 0 }), null);
});

test('diversion replaces stale active and pending FMS routes and resets sequencing', () => {
  const original = { callsign: 'TEST', waypoints: [{ label: 'OLD' }], currentWaypointIndex: 8, fms: { currentWaypointIndex: 8, execPending: true, activePlan: { waypoints: [{ label: 'OLD' }] }, temporaryPlan: { waypoints: [{ label: 'PENDING' }] } } };
  const airport = { icao: 'TEST', latitude: 0, longitude: 1 };
  const plan = createDiversionPlan(original, airport);
  assert.equal(plan.callsign, 'TEST');
  assert.equal(plan.currentWaypointIndex, 0);
  assert.equal(plan.fms.currentWaypointIndex, 0);
  assert.equal(plan.fms.execPending, false);
  assert.equal(plan.waypoints[0].label, 'TEST');
  assert.deepEqual(plan.fms.activePlan.waypoints, plan.waypoints);
  assert.deepEqual(plan.fms.temporaryPlan.waypoints, plan.waypoints);
  assert.equal(original.fms.currentWaypointIndex, 8);
  assert.throws(() => createDiversionPlan(original, {}));
});
