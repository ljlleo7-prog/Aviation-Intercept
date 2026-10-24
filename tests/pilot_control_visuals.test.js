import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotControlVisuals, paintPilotControls } from '../src/utils/pilotControlVisuals.js';
import { manualPitchToElevator } from '../src/utils/manualFlightControls.js';

test('S pull maps the actual elevator back to positive/downward cockpit travel', () => {
  const pull = pilotControlVisuals({ pitch: manualPitchToElevator(0.3), roll: 0 }, {}, true);
  const push = pilotControlVisuals({ pitch: manualPitchToElevator(-0.3), roll: 0 }, {}, true);
  assert.equal(pull.y, 1);
  assert.equal(push.y, -1);
});

test('mechanical feedback follows live slow/jammed travel while unlinked controls follow demand', () => {
  const demand = { x: 1, y: 1, rudder: 0 };
  const controls = { pitch: manualPitchToElevator(0.03), roll: 0 };
  assert.ok(Math.abs(pilotControlVisuals(controls, demand, true).y - 0.1) < 1e-9);
  assert.equal(pilotControlVisuals(controls, demand, true).x, 0);
  assert.equal(pilotControlVisuals(controls, demand, false).y, 1);
});

test('animation updates DOM transforms directly without React state or smoothing', () => {
  const attributes = {};
  const grip = { getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; }, style: {} };
  const root = { querySelectorAll: selector => selector === '[data-control-grip]' ? [grip] : [] };
  paintPilotControls(root, { x: 1, y: 1, rudder: 0 }, false);
  assert.equal(attributes.transform, 'translate(0 15) rotate(40 100 80)');
  paintPilotControls(root, { x: 0, y: -1, rudder: 0 }, false);
  assert.equal(attributes.transform, 'translate(0 -15) rotate(0 100 80)');
  paintPilotControls(root, { x: 0, y: 1, rudder: 0 }, true);
  assert.match(grip.style.transform, /rotateX\(-24deg\)/);
});

test('unchanged controls avoid writes and repair intervening DOM updates', () => {
  let writes = 0;
  const attributes = {};
  let transform = '';
  const node = {
    dataset: { controlPedal: 'left', controlToe: 'left' },
    getAttribute: key => attributes[key],
    setAttribute: (key, value) => { writes++; attributes[key] = value; },
    style: {
      get transform() { return transform; },
      set transform(value) { writes++; transform = value; }
    }
  };
  for (const selector of ['grip', 'shaft', 'pedal', 'toe']) {
    const root = { querySelectorAll: query => query === `[data-control-${selector}]` ? [node] : [] };
    for (const isAirbus of [false, true]) {
      const visual = { x: 0.5, y: 0.2, rudder: 0.3, left: 0.4 };
      paintPilotControls(root, visual, isAirbus);
      const before = writes;
      paintPilotControls(root, visual, isAirbus);
      assert.equal(writes, before);
      attributes.transform = 'external'; attributes.d = 'external'; transform = 'external';
      paintPilotControls(root, visual, isAirbus);
      assert.equal(writes, before + 1);
    }
  }
});
