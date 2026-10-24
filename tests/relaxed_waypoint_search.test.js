import test from 'node:test';
import assert from 'node:assert/strict';
import { searchRelaxedWaypointRoutes } from '../src/services/routes/relaxedWaypointSearch.js';
import { calculateGreatCircleNm } from '../src/services/routes/aipRouteSearch.js';

test('short direct legs beat a remote detour even when below preferred minimum spacing', () => {
  const fixes = Array.from({ length: 14 }, (_, index) => ({ ident: `FIX${String(index).padStart(2, '0')}`, point_type: 'waypoint', latitude: 0, longitude: (index + 1) * 0.8 }));
  fixes.push({ ident: 'DETOU', point_type: 'waypoint', latitude: 1, longitude: 4.5 });
  fixes.push({ ident: 'BACKT', point_type: 'waypoint', latitude: -1, longitude: 7.5 });
  const departurePoint = { latitude: 0, longitude: 0 };
  const arrivalPoint = { latitude: 0, longitude: 12 };
  const routes = searchRelaxedWaypointRoutes({
    store: { pointsByIdent: new Map(fixes.map(point => [point.ident, [point]])) },
    departureCode: 'TEST', arrivalCode: 'DEST', departurePoint, arrivalPoint,
    calculateGreatCircleNm, options: { minRelaxedLegNm: 300 }
  });
  assert.ok(routes.length > 0);
  const directDistance = calculateGreatCircleNm(departurePoint, arrivalPoint);
  assert.ok(Math.abs(routes[0].estimatedNm - directDistance) < 0.001);
  assert.ok(!routes[0].path.includes('DETOU'));
  assert.ok(!routes[0].path.includes('BACKT'));
  assert.ok(routes[0].points.some((point, index, points) => index > 0 && calculateGreatCircleNm(points[index - 1], point) < 300));
  for (const route of routes) {
    for (let i = 1; i < route.points.length; i++) {
      assert.ok(route.points[i].longitude > route.points[i - 1].longitude, 'including the join, every leg must progress towards the destination');
    }
  }
  for (let i = 1; i < routes.length; i++) assert.ok(Math.floor(routes[i].maxLegNm / 3) >= Math.floor(routes[i - 1].maxLegNm / 3));
});

test('short routes use fewer fixes instead of filling a waypoint quota', () => {
  const search = longitude => {
    const fixes = Array.from({ length: 15 }, (_, index) => ({ ident: `FIX${String(index).padStart(2, '0')}`, point_type: 'waypoint', latitude: 0, longitude: longitude * (index + 1) / 16 }));
    return searchRelaxedWaypointRoutes({ store: { pointsByIdent: new Map(fixes.map(point => [point.ident, [point]])) },
      departureCode: 'TEST', arrivalCode: 'DEST', departurePoint: { latitude: 0, longitude: 0 }, arrivalPoint: { latitude: 0, longitude }, calculateGreatCircleNm });
  };
  const short = search(0.5)[0];
  const medium = search(4)[0];
  const long = search(20)[0];
  assert.equal(short.path.length, 3);
  assert.ok(short.maxLegNm < calculateGreatCircleNm(short.points[0], short.points.at(-1)));
  assert.ok(medium.path.length <= 4);
  assert.ok(long.path.length > medium.path.length);
});

test('short route with no measured intermediate fixes can go direct', () => {
  const routes = searchRelaxedWaypointRoutes({ store: { pointsByIdent: new Map() }, departureCode: 'TEST', arrivalCode: 'DEST',
    departurePoint: { latitude: 0, longitude: 0 }, arrivalPoint: { latitude: 0, longitude: 0.5 }, calculateGreatCircleNm });
  assert.deepEqual(routes[0].path, ['TEST', 'DEST']);
});

test('route evaluation is bounded and excludes distant cells in a large dataset', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ ident: `FIX${i}`, point_type: 'waypoint', latitude: 0, longitude: (i + 1) / 4 }));
  for (let i = 0; i < 50000; i++) points.push({ ident: `R${i}`, point_type: 'waypoint', latitude: 50 + i % 20, longitude: -100 + i % 40 });
  const store = { pointsByIdent: new Map(points.map(point => [point.ident, [point]])) };
  let calls = 0;
  const routes = searchRelaxedWaypointRoutes({ store, departureCode: 'TEST', arrivalCode: 'DEST', departurePoint: { latitude: 0, longitude: 0 },
    arrivalPoint: { latitude: 0, longitude: 12 }, calculateGreatCircleNm: (a, b) => { calls++; return calculateGreatCircleNm(a, b); } });
  assert.ok(routes.length > 0);
  assert.ok(calls < 2000, `Expected bounded local evaluations, got ${calls}`);
  assert.ok(routes.length <= 24);
});
