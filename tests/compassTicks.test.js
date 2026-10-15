import test from 'node:test';
import assert from 'node:assert/strict';
import { compassTicks } from '../src/utils/compassTicks.js';

test('737 compass bearings move continuously with heading and center on the correct value', () => {
  const at320 = compassTicks(320);
  assert.equal(at320.find(tick => tick.label === '32').offset, 0);
  assert.equal(at320.find(tick => tick.label === '34').offset, 20);

  const at325 = compassTicks(325);
  assert.equal(at325.find(tick => tick.label === '32').offset, -5);
  assert.equal(at325.find(tick => tick.label === '33').offset, 5);
  assert.equal(at325.find(tick => tick.label === '00').offset, 35);
  assert.equal(compassTicks(359).find(tick => tick.label === '00').offset, 1);
});
