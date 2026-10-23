import test from 'node:test';
import assert from 'node:assert/strict';
import { attachFlightKeyboard } from '../src/utils/flightKeyboard.js';

function setup() {
  const target = new EventTarget();
  target.document = new EventTarget();
  const state = { enabled: true, gear: true, flaps: 0, maxFlaps: 3, throttle: 0.5 };
  const values = { pitch: 0, roll: 0, yaw: 0 };
  let time = 0;
  let frameId = 0;
  const frames = new Map();
  target.performance = { now: () => time };
  target.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  target.cancelAnimationFrame = id => frames.delete(id);
  const advance = milliseconds => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 10) {
      time += 10;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    }
  };
  const calls = [];
  const detach = attachFlightKeyboard({ target, getState: () => state, onAction: (key, value) => { values[key] = value; calls.push([key, value]); } });
  const key = (code, type = 'keydown', extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, ...extra });
    target.dispatchEvent(event);
    return event;
  };
  return { target, state, values, calls, detach, key, advance };
}

test('held directions combine, cancel opposites, and release independently', () => {
  const { key, values, detach, advance } = setup();
  key('KeyW'); key('KeyD'); key('KeyQ');
  assert.equal(values.pitch, 0);
  advance(100);
  assert.ok(values.pitch < 0 && values.pitch > -0.3);
  advance(2000);
  assert.equal(values.pitch, -0.3);
  assert.equal(values.roll, 0.3);
  assert.equal(values.yaw, -1);
  key('KeyS'); advance(2000); assert.equal(values.pitch, 0);
  key('KeyW', 'keyup'); advance(2000); assert.equal(values.pitch, 0.3);
  key('KeyD', 'keyup'); assert.equal(values.roll, 0);
  advance(100); assert.equal(values.roll, 0);
  advance(2000); assert.equal(values.roll, 0);
  detach(); assert.equal(values.pitch, 0); assert.equal(values.yaw, 0);
});

test('brakes release on blur and hidden document', () => {
  const { key, values, target } = setup();
  key('KeyB'); assert.equal(values.toeBrakes, 1);
  target.dispatchEvent(new Event('blur')); assert.equal(values.toeBrakes, 0);
  key('KeyB'); target.document.hidden = true;
  target.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(values.toeBrakes, 0);
});

test('toggles ignore repeats and flap detents respect boundaries', () => {
  const { key, state, values, calls, advance } = setup();
  key('KeyG'); assert.equal(values.gear, false);
  key('KeyG', 'keydown', { repeat: true }); assert.equal(calls.length, 1);
  key('KeyF'); assert.equal(values.flaps, 1);
  key('KeyF', 'keydown', { shiftKey: true }); assert.equal(values.flaps, 0);
  state.flaps = 3; key('KeyF'); assert.equal(values.flaps, 3);
  key('Equal'); advance(200); assert.ok(Math.abs(values.throttle - 0.55) < 1e-9);
  key('KeyP'); assert.equal(values.parkingBrake, true);
});

test('editing, modifiers, crashed and disabled states do not trigger controls', () => {
  const { key, target, state, calls } = setup();
  key('KeyG', 'keydown', { ctrlKey: true });
  // Model an editable element through a nested event target.
  const editable = new EventTarget();
  editable.closest = () => true;
  const originalDispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = event => { Object.defineProperty(event, 'target', { value: editable }); return originalDispatch(event); };
  key('KeyG');
  target.dispatchEvent = originalDispatch;
  state.hasCrashed = true; key('KeyG');
  state.hasCrashed = false; state.enabled = false; key('KeyG');
  assert.equal(calls.length, 0);
});

test('autopilot locks flight axes but permits steering on ground and brakes', () => {
  const { key, state, values, advance } = setup();
  state.autopilot = true;
  key('KeyW'); key('KeyE'); key('KeyB');
  assert.equal(values.pitch, 0); assert.equal(values.yaw, 0); assert.equal(values.toeBrakes, 1);
  state.onGround = true; key('KeyQ'); key('KeyQ', 'keyup');
  advance(2500);
  assert.equal(values.yaw, 1);
});

test('keyboard visual subscribers receive axis updates and neutral release', async () => {
  const { publishKeyboardControl, subscribeKeyboardControls } = await import('../src/utils/flightKeyboardVisuals.js');
  const updates = [];
  const unsubscribe = subscribeKeyboardControls(value => updates.push(value));
  publishKeyboardControl('pitch', -0.3);
  publishKeyboardControl('yaw', 1);
  publishKeyboardControl('toeBrakes', 1);
  assert.deepEqual(updates.at(-1), { pitch: -0.3, roll: 0, yaw: 1, toeBrakes: 1 });
  publishKeyboardControl('pitch', 0);
  publishKeyboardControl('yaw', 0);
  publishKeyboardControl('toeBrakes', 0);
  assert.deepEqual(updates.at(-1), { pitch: 0, roll: 0, yaw: 0, toeBrakes: 0 });
  unsubscribe();
  publishKeyboardControl('roll', 0.3);
  assert.equal(updates.length, 6);
  publishKeyboardControl('roll', 0);
});

test('S pulls and W pushes with frame-rate-independent easing and safe focus reset', () => {
  const { key, values, advance, target } = setup();
  key('KeyS');
  advance(100);
  assert.ok(values.pitch > 0 && values.pitch < 0.3);
  key('KeyS', 'keyup');
  assert.equal(values.pitch, 0);
  advance(100);
  assert.equal(values.pitch, 0);
  key('KeyW');
  advance(500);
  assert.ok(values.pitch < 0 && values.pitch > -0.3);
  target.dispatchEvent(new Event('blur'));
  assert.equal(values.pitch, 0);
  advance(1000);
  assert.equal(values.pitch, 0);
});


test('held throttle is continuous, cancels opposites, clamps and stops on release or blur', () => {
  const { key, values, state, advance, target } = setup();
  key('Equal'); advance(1000); assert.ok(Math.abs(values.throttle - 0.75) < 1e-9);
  key('Equal', 'keydown', { repeat: true }); advance(1100); assert.equal(values.throttle, 1);
  key('Minus'); advance(500); assert.equal(values.throttle, 1);
  key('Equal', 'keyup'); advance(1000); assert.ok(Math.abs(values.throttle - 0.75) < 1e-9);
  key('Minus', 'keyup'); const stopped = values.throttle;
  advance(1000); assert.equal(values.throttle, stopped);
  state.throttle = 0.1; key('Minus'); advance(1000); assert.equal(values.throttle, 0);
  target.dispatchEvent(new Event('blur')); advance(1000); assert.equal(values.throttle, 0);
});

test('reverse thrust requires Shift+R and airbrake detents use L/Shift+L', () => {
  const { key, state, values, calls } = setup();
  key('KeyR'); assert.equal(calls.length, 0);
  key('KeyR', 'keydown', { shiftKey: true }); assert.equal(values.throttle, -0.7);
  key('KeyR', 'keydown', { shiftKey: true, repeat: true }); assert.equal(calls.length, 1);
  state.throttle = -0.7;
  key('KeyR', 'keydown', { shiftKey: true }); assert.equal(values.throttle, 0);
  state.airBrakes = 0; state.maxAirBrakes = 3;
  key('KeyL'); assert.equal(values.airBrakes, 1);
  key('KeyL', 'keydown', { shiftKey: true }); assert.equal(values.airBrakes, 0);
  state.airBrakes = 3; key('KeyL'); assert.equal(values.airBrakes, 3);
});


test('Shift+R exits reverse even after holding minus to reverse idle', () => {
  const { key, state, values, advance } = setup();
  state.throttle = -0.7;
  key('Minus'); advance(4000); key('Minus', 'keyup');
  assert.ok(Object.is(values.throttle, -0));
  state.throttle = values.throttle;
  key('KeyR', 'keydown', { shiftKey: true });
  assert.ok(Object.is(values.throttle, 0));
  state.throttle = values.throttle;
  key('Equal'); advance(1000);
  assert.ok(values.throttle > 0);
});
