import test from 'node:test';
import assert from 'node:assert/strict';
import GroundInteraction from '../src/services/physics/GroundInteractionService.js';

const ground = new GroundInteraction();
const [, left, right] = ground.getContactPoints(3.5);
const force = (gear, depth, speed) => ground.getNormalForce(gear, depth, speed, 70000);

test('touchdown support approaches zero continuously even with a descending wheel', () => {
  assert.equal(force(left, -0.001, 3), 0);
  assert.equal(force(left, 0, 3), 0);
  assert.ok(Math.abs(force(left, 0.000001, 3)) < 2);
  // A nearly level touchdown must not produce a full one-sided damper impulse.
  const imbalance = Math.abs(force(left, 0.0001, 3) - force(right, -0.0001, 3));
  assert.ok(imbalance < 150);
});

test('liftoff support is continuous, unilateral, and symmetric between mains', () => {
  for (const speed of [-3, 0, 3]) {
    for (const depth of [0, 0.000001, 0.005, 0.03, 0.1]) {
      assert.equal(force(left, depth, speed), force(right, depth, speed));
      assert.ok(force(left, depth, speed) <= 0);
    }
  }
  assert.ok(Math.abs(force(left, 0.000001, -3)) < 2);
});

test('loaded suspension retains existing spring, damping, and impact limits', () => {
  assert.equal(force(left, 0.1, 2), -(left.k * 0.1 + left.c * 2));
  assert.equal(force(left, 0.1, -10), 0);
  assert.equal(force(left, 10, 100), -70000 * 9.81 * 4);
});
