import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { cockpitVisualState } from '../src/utils/cockpitVisualState.js';

const aircraft = createRequire(import.meta.url)('../src/data/aircraftDatabase.json').aircraft[0];

for (const control of ['panel', 'background', 'flood', 'dome']) {
  test(`${control} lighting can be set and toggled through the simulator action handler`, () => {
    const physics = new RealisticFlightPhysicsService(aircraft);
    assert.equal(physics.systems.lighting[control], false);
    physics.systems.electrical.dcVolts = 28;
    physics.performSystemAction('lighting', control, true);
    assert.equal(cockpitVisualState(physics.systems)[control], true);
    physics.performSystemAction('lighting', control);
    assert.equal(physics.systems.lighting[control], false);
    physics.performSystemAction('lighting', control);
    assert.equal(physics.systems.lighting[control], true);
    physics.systems.electrical.dcVolts = 0;
    assert.equal(cockpitVisualState(physics.systems)[control], false);
    assert.equal(physics.systems.lighting[control], true, 'Switch selection survives loss of power');
  });

  test(`${control} lighting works immediately after restoring a legacy lighting state`, () => {
    const physics = new RealisticFlightPhysicsService(aircraft);
    physics.systems.lighting = { taxi: true, powered: true };
    physics.performSystemAction('lighting', control);
    assert.equal(physics.systems.lighting[control], true);
    assert.equal(physics.systems.lighting.taxi, true);
    physics.performSystemAction('lighting', control, false);
    assert.equal(physics.systems.lighting[control], false);
  });
}
