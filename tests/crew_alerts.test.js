import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import CrewAlertState from '../src/services/CrewAlertState.js';
import WarningSystem from '../src/services/WarningSystem.js';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import overheadLogic from '../src/services/OverheadLogic.js';
import EngineFailures from '../src/services/failures/types/EngineFailures.js';
import SystemFailures from '../src/services/failures/types/SystemFailures.js';

const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];
const warning = (id, level = 'WARNING') => ({ id, message: id, level });

test('acknowledgement keeps active faults, recalls them, and resets on recurrence or escalation', () => {
  const state = new CrewAlertState();
  const lowFuel = warning('FUEL_LOW');
  assert.equal(state.update([lowFuel]).caution, true);
  assert.equal(state.acknowledge('caution').caution, false);
  assert.equal(state.update([lowFuel]).warnings[0].acknowledged, true);
  assert.deepEqual(state.snapshot().annunciators, []);
  assert.deepEqual(state.recall().annunciators, ['FUEL']);
  assert.equal(state.snapshot().caution, false);
  assert.equal(state.update([lowFuel, warning('ELEC_EMER')]).caution, true);
  state.acknowledge('caution');
  state.update([]);
  assert.equal(state.update([lowFuel]).caution, true);
  state.acknowledge('caution');
  assert.equal(state.update([warning('FUEL_LOW', 'CRITICAL')]).warning, true);
});

test('fire reset is independent of caution and cannot silence flight hazards', () => {
  const state = new CrewAlertState();
  const active = [warning('FUEL_LOW'), warning('FIRE_ENG1', 'CRITICAL'), warning('GPWS_PULL_UP', 'CRITICAL'), warning('STALL', 'CRITICAL'), warning('OVERSPEED', 'CRITICAL')];
  state.update(active);
  const reset = state.acknowledge('fire');
  assert.equal(reset.fire, false);
  assert.equal(reset.caution, true);
  assert.equal(reset.warnings.find(w => w.id === 'FIRE_ENG1').acknowledged, true);
  state.acknowledge('warning');
  assert.deepEqual(state.snapshot().visualWarnings.map(w => w.id), ['GPWS_PULL_UP', 'STALL', 'OVERSPEED']);
  assert.equal(state.update([...active, warning('FIRE_ENG2', 'CRITICAL')]).fire, true);
});

test('ground mode detects engine and APU fires using the same stable IDs', () => {
  const detector = new WarningSystem();
  const warnings = detector.update({ groundMode: true, systems: { fire: { eng1: true, eng2: true, apu: true } }, fuel: 5000 });
  assert.deepEqual(warnings.map(w => w.id), ['FIRE_ENG1', 'FIRE_ENG2', 'FIRE_APU']);
});

test('bottles require a pulled handle, target one engine, clamp empty, and cannot be reused', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const fire = service.systems.fire;
  fire.eng1 = true;
  fire.eng2 = true;
  service.performSystemAction('fire', 'eng1_bottle1');
  assert.equal(fire.bottle1_discharge, undefined);
  service.performSystemAction('fire', 'eng1_handle', true);
  service.performSystemAction('fire', 'eng2_handle', true);
  service.performSystemAction('fire', 'eng1_bottle1');
  service.performSystemAction('fire', 'eng2_bottle1');
  assert.equal(fire.bottle1_target, 'eng1');
  overheadLogic.updateFireProtection(service.systems, {}, 3);
  assert.equal(fire.eng1, false);
  assert.equal(fire.eng2, true);
  assert.equal(fire.bottle1, 0);
  assert.equal(fire.bottle1_discharge, false);
  service.performSystemAction('fire', 'eng2_bottle1');
  assert.equal(fire.bottle1_discharge, false);
  service.performSystemAction('fire', 'eng2_bottle2');
  overheadLogic.updateFireProtection(service.systems, {}, 3);
  assert.equal(fire.eng2, false);
  assert.equal(fire.bottle2, 0);
});

test('APU has its own bottle and fire reset never operates a handle or discharges agent', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const fire = service.systems.fire;
  fire.apu = true;
  service.getOutputState();
  service.performSystemAction('alerts', 'fire');
  assert.equal(fire.apu, true);
  assert.equal(fire.apuHandle, false);
  assert.equal(fire.apuBottle, 100);
  service.performSystemAction('fire', 'apu_handle', true);
  service.performSystemAction('fire', 'apu_bottle1');
  overheadLogic.updateFireProtection(service.systems, {}, 3);
  assert.equal(fire.apu, false);
  assert.equal(fire.apuBottle, 0);
  assert.equal(fire.bottle1, 100);
  assert.equal(fire.bottle2, 100);
});

test('failure ticks do not immediately recreate an extinguished engine fire', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const context = { engineIndex: 0, egtOffset: 400 };
  const effect = EngineFailures.ENGINE_FIRE.stages.active.effect;
  effect(service, 1, context);
  service.performSystemAction('fire', 'eng1_handle', true);
  service.performSystemAction('fire', 'eng1_bottle1');
  overheadLogic.updateFireProtection(service.systems, {}, 3);
  effect(service, 1, context);
  assert.equal(service.systems.fire.eng1, false);
  assert.equal(service.systems.engines.eng1.fuelControl, false);
});

test('physics output preserves acknowledgement across polling and re-alerts for a new fire', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  service.groundMode = true;
  service.systems.fire.eng1 = true;
  assert.equal(service.getOutputState().alertState.fire, true);
  service.performSystemAction('alerts', 'fire');
  for (let index = 0; index < 5; index++) assert.equal(service.getOutputState().alertState.fire, false);
  assert.ok(service.getOutputState().activeWarnings.some(w => w.id === 'FIRE_ENG1'));
  service.systems.fire.eng2 = true;
  assert.equal(service.getOutputState().alertState.fire, true);
});

test('extinguished APU fire stays clear on subsequent failure ticks', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const context = {};
  const effect = SystemFailures.APU_FIRE.stages.active.effect;
  effect(service, 1, context);
  service.performSystemAction('fire', 'apu_handle', true);
  service.performSystemAction('fire', 'apu_bottle1');
  overheadLogic.updateFireProtection(service.systems, {}, 3);
  effect(service, 1, context);
  assert.equal(service.systems.fire.apu, false);
});

test('extinguishing a very hot damaged engine stops fire heating and allows gradual cooling', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const engine = service.engines[0];
  const context = { engineIndex: 0, egtOffset: 800 };
  const effect = EngineFailures.ENGINE_FIRE.stages.active.effect;
  effect(service, 1, context);
  engine.state.egt = 1400;
  engine.state.egtOffset = 25; // Independent thermal fault must survive extinguishing.
  engine.setFailed(true);
  service.performSystemAction('fire', 'eng1_handle', true);
  service.performSystemAction('fire', 'eng1_bottle1');
  service.updateSystems(1);
  assert.equal(service.systems.fire.eng1, false);
  assert.equal(engine.state.fireHeatInput, 0);
  assert.equal(engine.state.egt, 1400, 'Agent does not instantly cool engine metal');
  effect(service, 1, context);
  engine.update(1, 0, 0, 0, 1, 15);
  assert.equal(engine.state.failed, true);
  assert.equal(engine.state.egtOffset, 25);
  assert.ok(engine.state.egt < 1400 && engine.state.egt > 1200);
});

test('old saved engine fire heat is migrated without leaving a permanent heat source', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  const engine = service.engines[0];
  engine.state.egtOffset = 600;
  const context = { engineIndex: 0, egtOffset: 600 };
  EngineFailures.ENGINE_FIRE.stages.active.effect(service, 1, context);
  assert.equal(engine.state.egtOffset, 0);
  assert.ok(engine.state.fireHeatInput > 600);
});

test('a running engine fire reaches cockpit smoke output through operating packs', () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  service.engines.forEach(engine => Object.assign(engine.state, { n1: 80, n2: 90, running: true, fuelAvailable: true }));
  EngineFailures.ENGINE_FIRE.stages.active.effect(service, 1, { engineIndex: 0 });
  for (let tick = 0; tick < 500; tick++) service.updateSystems(.02);
  const smoke = service.getOutputState().systems.cockpitSmoke;
  assert.ok(smoke.density > .1);
  assert.ok(smoke.transportedRate > 0);
  service.systems.pressurization.bleed1 = false;
  service.updateSystems(1);
  assert.equal(service.systems.cockpitSmoke.transportedRate, 0);
  assert.ok(service.systems.cockpitSmoke.density < smoke.density);
  assert.equal(service.systems.fire.eng1, true);
});
