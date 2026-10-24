import test from 'node:test';
import assert from 'node:assert/strict';
import NavigationService from '../src/services/physics/NavigationService.js';
import { sampleFlyByRoute } from '../src/utils/flightMath.js';

const route = () => [
  { latitude: 0, longitude: 0, label: 'START' },
  { latitude: 0, longitude: 1, name: 'TURN' },
  { latitude: 1, longitude: 1, label: 'END' }
];

test('cached path matches sampling while position guidance continues updating', () => {
  const service = new NavigationService();
  const flightPlan = route();
  const options = { flightPlan, turnRadiusMeters: 1852, sampleSpacingMeters: 250 };
  const first = service.update({ latitude: 0, longitude: 0.1 }, options);
  const second = service.update({ latitude: 0, longitude: 0.2 }, options);
  assert.strictEqual(first.navigationPath, second.navigationPath);
  assert.deepEqual(second.navigationPath, sampleFlyByRoute(flightPlan, options));
  assert.notEqual(first.distanceToWaypoint, second.distanceToWaypoint);
  const fresh = new NavigationService().update({ latitude: 0, longitude: 0.2 }, options);
  assert.deepEqual(second, fresh);
});

test('path invalidates for in-place edits, names, insertions and sampling options', () => {
  const service = new NavigationService();
  const points = route();
  let previous = service.getSampledPath(points);
  for (const change of [
    () => { points[1].latitude = 0.1; },
    () => { points[1].longitude = 1.1; },
    () => { points[1].name = 'RENAMED'; },
    () => { points[1].label = 'LABEL'; },
    () => { points[1].isHold = true; },
    () => { points[1].isHold = false; points[1].flyOver = true; },
    () => { points.push({ latitude: 2, longitude: 1 }); },
    () => { points.reverse(); }
  ]) {
    change();
    const next = service.getSampledPath(points);
    assert.notStrictEqual(next, previous);
    assert.deepEqual(next, sampleFlyByRoute(points));
    previous = next;
  }
  for (const options of [{ turnRadiusMeters: 3000 }, { sampleSpacingMeters: 500 }]) {
    const next = service.getSampledPath(points, options);
    assert.notStrictEqual(next, previous);
    assert.deepEqual(next, sampleFlyByRoute(points, options));
    previous = next;
  }
  points.splice(0);
  assert.deepEqual(service.getSampledPath(points), []);
  assert.deepEqual(service.update({}, { flightPlan: points }).navigationPath, []);
});

test('replacing a route and invalid coordinates preserve uncached output', () => {
  const service = new NavigationService();
  service.updateFlightPlan(route());
  const replacement = [{ latitude: NaN, longitude: 1 }, { latitude: 0, longitude: 0 }];
  assert.deepEqual(service.updateFlightPlan(replacement).navigationPath, sampleFlyByRoute(replacement));
  assert.deepEqual(service.update({}, { flightPlan: replacement }).navigationPath, sampleFlyByRoute(replacement));
});

test('cached and uncached guidance agree through sequencing, turns and holds', () => {
  const cached = new NavigationService();
  const uncached = new NavigationService();
  uncached.getSampledPath = sampleFlyByRoute;
  const points = route();
  points.push({ latitude: 1.2, longitude: 1, isHold: true, label: 'HOLD' });
  const options = { flightPlan: points, turnRadiusMeters: 1852, sampleSpacingMeters: 250 };
  for (const [latitude, longitude] of [[0, 0.1], [0, 0.98], [0.02, 1], [0.8, 1], [0.99, 1], [1.1, 1], [1.2, 1.03]]) {
    const state = { latitude, longitude };
    assert.deepEqual(cached.update(state, options), uncached.update(state, options));
  }
});
