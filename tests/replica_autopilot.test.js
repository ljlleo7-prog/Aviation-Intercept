import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustReplicaTarget, replicaTargets } from '../src/utils/replicaAutopilot.js';

test('replica AP windows use selected targets instead of live aircraft values', () => {
  assert.deepEqual(replicaTargets({
    ias: 220, heading: 120, altitude: 5000,
    autopilotTargets: { speed: 250, heading: 340, altitude: 8000, vs: -600 }
  }), { ias: 250, heading: 340, altitude: 8000, vs: -600 });
});

test('replica AP target adjustments use service increments and heading wrap', () => {
  const targets = { ias: 250, heading: 360, altitude: 8000, vs: -600 };
  assert.equal(adjustReplicaTarget(targets, 'heading', 1).heading, 5);
  assert.equal(adjustReplicaTarget(targets, 'heading', -1).heading, 355);
  assert.equal(adjustReplicaTarget(targets, 'altitude', 1).altitude, 8100);
  assert.equal(adjustReplicaTarget(targets, 'vs', -1).vs, -700);
  assert.equal(adjustReplicaTarget(targets, 'heading', 1, true).heading, 10);
  assert.equal(adjustReplicaTarget(targets, 'altitude', -1, true).altitude, 7000);
  assert.equal(targets.heading, 360);
});
