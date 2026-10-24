import test from 'node:test';
import assert from 'node:assert/strict';
import { localPoint, interceptPoint, constrainIntercept, insertProcedurePoint, applyProcedureEdits, procedureEndpoint, validProcedureEdit } from '../src/utils/procedureEditor.js';
import { mergeFlightPlanWithRoute, normalizeRouteDetails } from '../src/utils/routeDetails.js';
const airport = { icao: 'TEST', latitude: 0, longitude: 0 };
const endpoint = { name: 'FIX', latitude: 1, longitude: 1 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('intercept stays on selected runway extension and clamps at 2 NM on either side', () => {
  for (const side of ['departure', 'arrival']) {
    const point = constrainIntercept(airport, 90, { latitude: 1, longitude: 0 }, side);
    const offset = localPoint(airport, point);
    close(offset.y, 0);
    close(offset.x, side === 'departure' ? 2 : -2);
  }
  const point = interceptPoint(airport, 45, 8, 'departure');
  const offset = localPoint(airport, point);
  close(offset.x, offset.y);
  close(Math.hypot(offset.x, offset.y), 8);
});

test('insertion uses its segment midpoint, preserves runway leg and caps at six points', () => {
  for (const side of ['departure', 'arrival']) {
    const intercept = interceptPoint(airport, 90, 8, side);
    let points = [intercept];
    const index = side === 'departure' ? 1 : 0;
    points = insertProcedurePoint(points, index, airport, endpoint, side);
    const inserted = points[side === 'departure' ? 1 : 0];
    close(inserted.latitude, (intercept.latitude + endpoint.latitude) / 2);
    close(inserted.longitude, (intercept.longitude + endpoint.longitude) / 2);
    for (let i = 0; i < 8; i++) points = insertProcedurePoint(points, index, airport, endpoint, side);
    assert.equal(points.length, 6);
    assert.equal(points.filter(point => point.kind === 'intercept').length, 1);
  }
  const points = [interceptPoint(airport, 0, 8, 'departure')];
  assert.equal(insertProcedurePoint(points, 0, airport, endpoint, 'departure'), points);
});

test('first and last enroute fixes exclude airports and procedure points', () => {
  const route = [{ ...airport, type: 'AIRPORT' }, endpoint, { ...endpoint, name: 'LAST', longitude: 2 }, { ...endpoint, type: 'STAR_FIX' }];
  assert.equal(procedureEndpoint(route, airport, 'departure').name, 'FIX');
  assert.equal(procedureEndpoint(route, airport, 'arrival').name, 'LAST');
});

test('custom procedures reach the active route in order without duplicating on reapply', () => {
  const last = { name: 'LAST', latitude: 2, longitude: 2 };
  const dep = { points: [interceptPoint(airport, 90, 8, 'departure')], endpoint, origin: airport, runwayName: '09', airportCode: 'TEST' };
  const arr = { points: [interceptPoint(last, 90, 12, 'arrival')], endpoint: last, origin: last, runwayName: '09' };
  const route = applyProcedureEdits([airport, endpoint, last], dep, arr);
  assert.deepEqual(route.map(point => point.name), ['09', 'SID-1', 'FIX', 'LAST', 'STAR-1', '09']);
  assert.deepEqual(applyProcedureEdits(route, dep, arr), route);
  assert.equal(validProcedureEdit(dep, '27', airport), null);
  assert.equal(validProcedureEdit(dep, '09', { icao: 'OTHER' }), null);
  assert.equal(validProcedureEdit(dep, '09', airport), dep);
});

test('flight plan merge retains custom coordinates and discards edits for a different runway', () => {
  const edit = { points: [interceptPoint(airport, 90, 8, 'departure')], endpoint, runwayName: '09', airportCode: 'TEST' };
  const details = { waypoints: [endpoint], departureRunway: '09', departureProcedure: edit };
  const plan = mergeFlightPlanWithRoute({ departure: airport }, details);
  assert.equal(plan.waypoints[1].type, 'SID_FIX');
  close(plan.waypoints[1].longitude, edit.points[0].longitude);
  const changed = normalizeRouteDetails({ ...details, departureRunway: '27' }, airport);
  assert.equal(changed.departureProcedure, null);
  assert.deepEqual(mergeFlightPlanWithRoute({ departure: airport }, changed).waypoints.map(point => point.name), ['FIX']);
});
