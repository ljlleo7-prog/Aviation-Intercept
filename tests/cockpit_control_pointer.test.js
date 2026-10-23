import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitControlPointer } from '../src/utils/cockpitControlPointer.js';

function setup() {
  const captured = new Set();
  const movements = [];
  let releases = 0;
  const target = {
    getBoundingClientRect: () => ({ width: 200, height: 190 }),
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id)
  };
  const pointer = createCockpitControlPointer(value => movements.push(value), () => releases++);
  const event = (x = 100, id = 1) => ({ currentTarget: target, pointerId: id, clientX: x, clientY: 70, preventDefault() {} });
  return { pointer, event, target, movements, releases: () => releases };
}

test('repeated yoke and sidestick drags work after every release', () => {
  for (const isAirbus of [false, true]) {
    const { pointer, event, movements, releases } = setup();
    for (let press = 0; press < 5; press++) {
      pointer.begin(event(), { x: 0, y: 0 }, isAirbus);
      pointer.move(event(140));
      assert.ok(movements.at(-1).x > 0);
      pointer.end(event(140));
      pointer.lost(event());
    }
    assert.equal(movements.length, 5);
    assert.equal(releases(), 5);
  }
});

test('late capture loss cannot cancel the next drag using the same mouse pointer ID', () => {
  const { pointer, event, movements } = setup();
  pointer.begin(event(), { x: 0, y: 0 }, false);
  pointer.end(event());
  pointer.begin(event(), { x: 0, y: 0 }, false);
  pointer.lost(event());
  pointer.move(event(140));
  assert.equal(movements.length, 1);
});

test('cancellation and real lost capture release input and permit another press', () => {
  const { pointer, event, target, movements, releases } = setup();
  pointer.begin(event(), { x: 0, y: 0 }, false);
  target.releasePointerCapture(1);
  pointer.lost(event());
  assert.equal(releases(), 1);
  pointer.begin(event(), { x: 0, y: 0 }, false);
  pointer.move(event(60));
  assert.ok(movements.at(-1).x < 0);
});
