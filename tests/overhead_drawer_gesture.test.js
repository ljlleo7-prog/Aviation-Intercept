import test from 'node:test';
import assert from 'node:assert/strict';
import { overheadDrawerGesture } from '../src/utils/overheadDrawerGesture.js';

test('pulling down opens the overhead independently of aircraft electrical state', () => {
  assert.equal(overheadDrawerGesture(false, 0, 64), true);
  assert.equal(overheadDrawerGesture(false, 20, 100), true);
});
test('pushing up dismisses an open overhead', () => {
  assert.equal(overheadDrawerGesture(true, 0, -32), false);
  assert.equal(overheadDrawerGesture(true, 0, -31), true);
  assert.equal(overheadDrawerGesture(true, 0, -64), false);
  assert.equal(overheadDrawerGesture(true, -15, -100), false);
});
test('short and horizontal movements preserve the previous drawer state', () => {
  for (const open of [true, false]) {
    assert.equal(overheadDrawerGesture(open, 0, 0), open);
    assert.equal(overheadDrawerGesture(open, 0, 63), open);
    assert.equal(overheadDrawerGesture(open, 0, -31), open);
    assert.equal(overheadDrawerGesture(open, 110, 100), open);
    assert.equal(overheadDrawerGesture(open, -110, -100), open);
  }
});
test('pushing an already closed drawer or pulling an open drawer preserves its state', () => {
  assert.equal(overheadDrawerGesture(false, 0, -100), false);
  assert.equal(overheadDrawerGesture(true, 0, 100), true);
});
