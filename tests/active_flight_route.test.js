import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFlightPlanWithRoute } from '../src/utils/routeDetails.js';
import { activateFlightRoute, getActiveWaypoints } from '../src/services/activeFlightPlan.js';
import NavigationService from '../src/services/physics/NavigationService.js';

const departure = { icao: 'TEST', latitude: 0, longitude: 0 };
const arrival = { icao: 'DEST', latitude: 2, longitude: 2 };
const first = { name: 'FIRST', latitude: 0.5, longitude: 0.5 };
const last = { name: 'LAST', latitude: 1.5, longitude: 1.5 };
const stalePlan = { departure, arrival, waypoints: [first, last], fms: { currentWaypointIndex: 7, execPending: true,
  activePlan: { waypoints: [first, last] }, temporaryPlan: { waypoints: [{ name: 'STALE' }] } } };

test('selected custom SID/STAR replace stale direct FMS route in every consumer', () => {
  const sid = { name: 'REF1', latitude: 0, longitude: 0.2 };
  const star = { name: 'INTCP', latitude: 2, longitude: 1.8 };
  const result = mergeFlightPlanWithRoute(stalePlan, { waypoints: [first, last], departureRunway: '09', landingRunway: '09',
    departureProcedure: { airportCode: 'TEST', runwayName: '09', endpoint: first, points: [sid] },
    arrivalProcedure: { airportCode: 'DEST', runwayName: '09', endpoint: last, origin: arrival, points: [star] } });
  assert.deepEqual(result.waypoints.map(point => point.name), ['09', 'SID-1', 'FIRST', 'LAST', 'STAR-1', '09']);
  assert.deepEqual(getActiveWaypoints(result), result.waypoints);
  assert.deepEqual(result.fms.temporaryPlan.waypoints, result.waypoints);
  assert.deepEqual(result.routeObject.waypoints, result.waypoints);
  assert.equal(result.fms.execPending, false);
  assert.equal(result.fms.currentWaypointIndex, 0);
  assert.equal(result.waypoints[1].longitude, sid.longitude);
  assert.equal(result.fms.activePlan.legs[1].longitude, sid.longitude);
  const navigation = new NavigationService();
  navigation.updateFlightPlan(result.waypoints, 0);
  const guidance = navigation.update({ ...departure, heading: 90, groundSpeed: 140 });
  assert.equal(guidance.activeWaypoint.name, 'SID-1');
  assert.ok(result.procedureSegments.some(segment => segment.kind === 'sid'));
  assert.ok(result.procedureSegments.some(segment => segment.kind === 'star'));
  assert.deepEqual(stalePlan.fms.activePlan.waypoints, [first, last]);
});

test('selected runway procedures have intercepts even if the editor was never opened', () => {
  const result = mergeFlightPlanWithRoute(stalePlan, { waypoints: [first, last], sid: 'FIRST1D', star: 'LAST1A', departureRunway: '09', landingRunway: '09' });
  assert.equal(result.waypoints[1].type, 'SID_FIX');
  assert.ok(result.waypoints[1].longitude > departure.longitude);
  const star = result.waypoints.find(point => point.type === 'STAR_FIX');
  assert.ok(star.longitude < arrival.longitude);
  assert.equal(result.waypoints.at(-1).type, 'RUNWAY_FIX');
});

test('published SID/STAR geometry is flown in order without direct airport shortcuts', () => {
  const sid = { name: 'PUBSID', latitude: 0, longitude: 0.2 };
  const star = { name: 'PUBSTAR', latitude: 2, longitude: 1.8 };
  const result = mergeFlightPlanWithRoute(stalePlan, { waypoints: [{ ...departure, type: 'AIRPORT' }, first, last, { ...arrival, type: 'AIRPORT' }],
    sid: 'PUBLISHED', star: 'PUBLISHED', departureRunway: '09', landingRunway: '09',
    procedureSegments: [{ kind: 'sid', waypoints: [sid, first] }, { kind: 'star', waypoints: [last, star] }, { kind: 'approach', waypoints: [arrival] }] });
  assert.deepEqual(result.waypoints.map(point => point.name), ['09', 'PUBSID', 'FIRST', 'LAST', 'PUBSTAR', 'WPT1']);
  assert.deepEqual(result.fms.activePlan.waypoints, result.routeObject.waypoints);
});

test('in-flight waypoint changes update FMS route instead of leaving the old direct plan active', () => {
  const result = activateFlightRoute(stalePlan, [first, { name: 'DIVERT', latitude: 1, longitude: 1 }], 1);
  assert.equal(result.currentWaypointIndex, 1);
  assert.equal(getActiveWaypoints(result)[1].name, 'DIVERT');
  assert.deepEqual(result.routeObject.waypoints, result.waypoints);
});

test('calculator airport-code wrappers retain the selected custom SID during flight-plan merging', () => {
  const sid = { latitude: 34, longitude: -118, name: 'CUSTOM' };
  const plan = mergeFlightPlanWithRoute({ departure: { airport: 'LAX' }, arrival: { airport: 'HND' } }, {
    waypoints: [first, last], departureRunway: '25R',
    departureProcedure: { airportCode: 'KLAX', runwayName: '25R', endpoint: first, points: [sid] }
  });
  assert.equal(plan.departure.icao, 'KLAX');
  assert.equal(plan.waypoints[1].type, 'SID_FIX');
  assert.equal(plan.waypoints[1].longitude, sid.longitude);
  assert.deepEqual(plan.fms.activePlan.waypoints, plan.routeObject.waypoints);
});
