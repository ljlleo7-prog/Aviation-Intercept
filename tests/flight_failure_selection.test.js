import test from 'node:test';
import assert from 'node:assert/strict';
import FailureHandler from '../src/services/failures/FailureHandler.js';
import { normalizeFailureSelection, estimateFailureFlightSeconds } from '../src/config/flightFailures.js';

test('failure selection defaults and invalid inputs are contained', () => {
  assert.equal(normalizeFailureSelection().mode, 'normal');
  assert.equal(normalizeFailureSelection({ count: 200 }).count, 10);
  assert.deepEqual(normalizeFailureSelection({ banks: ['engine', 'unknown'] }).banks, ['engine']);
  assert.equal(estimateFailureFlightSeconds(null, null), 3600);
});

test('normal simulation never injects random failures', () => {
  const handler = new FailureHandler();
  handler.randomHazard = 100;
  handler.checkRandomFailures({ onGround: false });
  assert.equal(handler.activeFailures.size, 0);
});

test('custom failures honor banks, ground state and persist the probability clock', () => {
  const handler = new FailureHandler({ failureSelection: { mode: 'custom', count: 3, banks: ['sensors'] } });
  handler.randomHazard = 100;
  handler.checkRandomFailures({ onGround: true });
  assert.equal(handler.activeFailures.size, 0);
  handler.checkRandomFailures({ onGround: false });
  assert.equal(handler.activeFailures.size, 1);
  assert.equal([...handler.activeFailures.values()][0].category, 'sensors');
  const restored = new FailureHandler();
  restored.restoreState(handler.getSerializableState());
  assert.deepEqual(restored.failureSelection, handler.failureSelection);
  assert.equal(restored.nextRandomHazard, handler.nextRandomHazard);
  assert.deepEqual(restored.randomTriggered, handler.randomTriggered);
});

test('empty banks and completed flight window do not inject failures', () => {
  const handler = new FailureHandler({ failureSelection: { mode: 'custom', banks: [] } });
  handler.randomHazard = 100;
  handler.checkRandomFailures();
  assert.equal(handler.activeFailures.size, 0);
  handler.failureSelection.banks = ['engine'];
  handler.randomElapsed = handler.failureFlightSeconds + 1;
  handler.checkRandomFailures();
  assert.equal(handler.activeFailures.size, 0);
});

test('Rookie random flights only select simple failures and never overlap them', () => {
  const handler = new FailureHandler({ difficulty: 'rookie', failureSelection: { mode: 'custom', count: 10 } });
  for (let iteration = 0; iteration < 50; iteration++) {
    handler.randomHazard = handler.nextRandomHazard + 1;
    handler.checkRandomFailures();
    assert.ok(handler.activeFailures.size <= 1);
  }
  assert.equal(handler.activeFailures.size, 1);
  const first = [...handler.activeFailures.values()][0];
  assert.ok(['engine_vibration', 'cabin_fan_fail', 'emergency_lights_fail', 'autopilot_disconnect',
    'gps_signal_loss', 'weather_radar_fail', 'transponder_fail', 'marker_beacon_fail'].includes(first.id));
  assert.equal(handler.triggerFailure('engine_fire', { source: 'random' }), false);
  first.currentStage = 'recovered';
  handler.update(0, { onGround: false });
  handler.randomHazard = handler.nextRandomHazard + 1;
  handler.checkRandomFailures();
  assert.equal(handler.activeFailures.size, 1);
  assert.equal(handler.randomTriggered.size, 2);
});

test('Rookie prevents all cascades even at a zero random draw', () => {
  const handler = new FailureHandler({ difficulty: 'rookie' });
  handler.triggerFailure('engine_vibration', { source: 'random' });
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    handler.update(120, { onGround: false });
    assert.equal(handler.activeFailures.size, 1);
    assert.equal(handler.graphExecutor.pendingActivations.size, 0);
    assert.equal(handler.getIncidentLog().some(event => event.type === 'cascade_triggered'), false);
  } finally { Math.random = savedRandom; }
});

test('all difficulty levels enforce increasing simultaneous random-failure limits', () => {
  for (const [difficulty, limit] of [['rookie', 1], ['amateur', 1], ['intermediate', 2], ['advanced', 3], ['pro', 4], ['devil', 5]]) {
    const handler = new FailureHandler({ difficulty, failureSelection: { mode: 'custom', count: 10 } });
    for (let iteration = 0; iteration < 30; iteration++) {
      handler.randomHazard = handler.nextRandomHazard + 1;
      handler.checkRandomFailures();
    }
    assert.equal(handler.activeFailures.size, limit, difficulty);
  }
});

test('Devil random root creates cross-system cascading failures and persists difficulty', () => {
  const handler = new FailureHandler({ difficulty: 'devil', failureSelection: { mode: 'custom' } });
  handler.triggerFailure('uncontained_engine_failure', { source: 'random', engineIndex: 0 });
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    for (let step = 0; step < 40; step++) handler.update(0.5, { onGround: true, systems: { hydraulics: { sysA: { pressure: 0 } } } });
  } finally { Math.random = savedRandom; }
  assert.ok(handler.activeFailures.has('major_hydraulic_failure'));
  assert.ok(handler.activeFailures.has('total_flight_control_failure'));
  assert.equal(handler.activeFailures.get('major_hydraulic_failure').variation.context.source, 'random');
  const restored = new FailureHandler({ difficulty: 'rookie' });
  restored.restoreState(handler.getSerializableState());
  assert.equal(restored.difficulty, 'devil');
  assert.equal(restored.settings.maxFailures, 5);
});
