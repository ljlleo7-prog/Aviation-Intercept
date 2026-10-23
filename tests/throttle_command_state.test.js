import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { attachFlightKeyboard } from '../src/utils/flightKeyboard.js';
import { isReverseThrustCommand } from '../src/utils/pedestalControls.js';

const aircraft = createRequire(import.meta.url)('../src/data/aircraftDatabase.json').aircraft[0];

test('Shift+R clears commanded reverse while the physical engines spool down', () => {
  const physics = new RealisticFlightPhysicsService(aircraft);
  const target = new EventTarget();
  target.document = new EventTarget();
  const detach = attachFlightKeyboard({
    target,
    getState: () => ({ enabled: true, throttle: physics.throttleCommand ?? physics.controls.throttle }),
    onAction: (action, value) => {
      if (action === 'throttle') physics.processInputs({ throttle: value }, 0.02);
    }
  });
  const toggle = () => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code: 'KeyR', shiftKey: true });
    target.dispatchEvent(event);
  };
  toggle();
  assert.equal(physics.throttleCommand, -0.7);
  toggle();
  const output = physics.getOutputState();
  assert.ok(physics.controls.throttle < 0, 'actuator still spools down through negative values');
  assert.equal(output.throttleCommand, 0);
  assert.ok(output.engineThrottleCommands.every(command => !isReverseThrustCommand(command)));
  toggle();
  assert.equal(physics.throttleCommand, -0.7, 'next toggle reselects reverse despite residual physical thrust');
  detach();
});
