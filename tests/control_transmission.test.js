import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { hasManualReversion, hasMechanicalFeedback, advanceControlPosition } from '../src/services/physics/controlTransmission.js';
const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft;
const boeing = aircraft.find(item => item.icao === 'B738');
const airbus = aircraft.find(item => item.icao === 'A320');
const serviceFor = definition => {
  const service = new RealisticFlightPhysicsService(definition);
  service.setAutopilot(false);
  return service;
};
const removeHydraulics = service => {
  if (service.systemModel.topology) {
    for (const circuit of ['A', 'B']) service.applyComponentDamage({ componentId: `hydraulic.circuit.${circuit}`, severity: 1 });
    service.systemModel.update(service.systems, service.engines);
  }
  Object.values(service.systems.hydraulics).forEach(circuit => { circuit.pressure = 0; });
  service.updateControlEffectiveness(0);
};

test('manual reversion is scoped to 737 pitch/roll, not rudder or unlinked aircraft', () => {
  assert.equal(hasManualReversion(boeing, 'aileron'), true);
  assert.equal(hasManualReversion(boeing, 'elevator'), true);
  assert.equal(hasManualReversion(boeing, 'rudder'), false);
  assert.equal(hasManualReversion(airbus, 'elevator'), false);
  assert.equal(hasMechanicalFeedback(airbus), false);
});

test('737 hydraulic loss requires sustained input but preserves eventual authority', () => {
  const powered = serviceFor(boeing);
  const manual = serviceFor(boeing);
  removeHydraulics(manual);
  for (let index = 0; index < 10; index++) {
    powered.processInputs({ roll: 0.3, pitch: -0.3 }, 0.02);
    manual.processInputs({ roll: 0.3, pitch: -0.3 }, 0.02);
  }
  assert.ok(powered.controls.aileron > 0.28);
  assert.ok(manual.controls.aileron < 0.02);
  for (let index = 0; index < 250; index++) manual.processInputs({ roll: 0.3, pitch: -0.3 }, 0.02);
  assert.equal(manual.controls.aileron, 0.3);
  assert.equal(manual.controls.elevator, -0.3);
  assert.equal(manual.controlEffectiveness.aileron, 1);
  assert.equal(manual.controlEffectiveness.elevator, 1);
  assert.equal(manual.controlEffectiveness.rudder, 0);
  assert.equal(manual.getOutputState().controlFeedback.mechanical, true);
});

test('hydraulic failure effects do not repeatedly reduce 737 cable deflection', () => {
  const service = serviceFor(boeing);
  service.controls.aileron = 0.3;
  service.controls.elevator = -0.3;
  service.failureSystem.triggerFailure('hydraulic_failure');
  for (let index = 0; index < 20; index++) service.failureSystem.applyImpact(service);
  service.updateSystems(0.02);
  assert.equal(service.controls.aileron, 0.3);
  assert.equal(service.controls.elevator, -0.3);
  assert.equal(service.controlEffectiveness.aileron, 1);
});

test('non-cable aircraft has no manual-reversion authority without hydraulic power', () => {
  const service = serviceFor(airbus);
  removeHydraulics(service);
  for (let index = 0; index < 20; index++) service.processInputs({ roll: 0.3, pitch: 0.3 }, 0.02);
  assert.ok(service.controls.aileron > 0.29);
  assert.equal(service.controlEffectiveness.aileron, 0);
  assert.equal(service.controlEffectiveness.elevator, 0);
  assert.equal(service.getOutputState().controlFeedback.mechanical, false);
});

test('a jam captures the existing position and resists subsequent demands and AP input', () => {
  const service = serviceFor(boeing);
  service.controls.elevator = -0.17;
  service.failureSystem.triggerFailure('control_jam', { surface: 'elevator' });
  for (let index = 0; index < 20; index++) {
    service.processInputs({ pitch: 0.3, roll: 0.3, autopilotActive: index % 2 === 0 }, 0.02);
    service.failureSystem.applyImpact(service);
  }
  assert.equal(service.controls.elevator, -0.17);
  assert.ok(service.controls.aileron > 0);
  assert.equal(service.getOutputState().controls.pitch, -0.17);
});

test('mechanical component lockout freezes only the affected control axis', () => {
  const service = serviceFor(boeing);
  service.controls.aileron = 0.14;
  service.applyComponentDamage({ componentId: 'controls.aileron', type: 'mechanical_lockout', severity: 1 });
  service.processInputs({ roll: -0.3, pitch: 0.3 }, 0.1);
  assert.equal(service.controls.aileron, 0.14);
  assert.ok(service.controls.elevator > 0);
});

test('manual-reversion travel is time based and release centers immediately', () => {
  const integrate = step => {
    let position = 0;
    for (let time = 0; time < 1 - 1e-9; time += step) position = advanceControlPosition(position, 1, 1, step, true);
    return position;
  };
  assert.ok(Math.abs(integrate(0.01) - integrate(0.1)) < 1e-9);
  assert.equal(advanceControlPosition(0.3, 0, 1, 0.1, true), 0);
});
