import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import AircraftSystemModel from '../src/services/systems/AircraftSystemModel.js';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import B737SystemTopology from '../src/services/systems/B737SystemTopology.js';
import validateSystemTopology from '../src/services/systems/validateSystemTopology.js';

const require = createRequire(import.meta.url);
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];

test('B737 resource network preserves AC bus redundancy through the bus tie', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.applyComponentDamage({ componentId: 'electrical.generator.1', type: 'disconnect', severity: 1 });
    service.update({}, 0.25);

    const resources = new Set(service.systems.resourceNetwork.resources);
    assert.equal(resources.has('ac_bus_1'), true);
    assert.equal(resources.has('ac_bus_2'), true);
    assert.deepEqual(service.systems.resourceNetwork.suppliedBy.ac_feed_2, ['electrical.generator.2']);
});

test('B737 reference topology passes structural validation', () => {
    assert.deepEqual(validateSystemTopology(B737SystemTopology), { valid: true, errors: [] });
});

test('loss of generator and tie removes only its associated AC bus path', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.systems.electrical.busTie = false;
    service.applyComponentDamage({ componentId: 'electrical.generator.1', type: 'disconnect', severity: 1 });
    service.update({}, 0.25);

    const resources = new Set(service.systems.resourceNetwork.resources);
    assert.equal(resources.has('ac_bus_1'), false);
    assert.equal(resources.has('ac_bus_2'), true);
});

test('regional damage records component-level causal evidence deterministically', () => {
    const model = new AircraftSystemModel(aircraft);
    const damage = model.applyRegionalDamage({
        zone: 'left_engine',
        eventId: 'uncontained-engine-1',
        energy: 1,
        mechanisms: { fragmentation: 1 },
        random: () => 0
    });

    assert.equal(damage.some(entry => entry.componentId === 'electrical.generator.1'), true);
    assert.equal(damage.some(entry => entry.componentId === 'hydraulic.engine_pump.A'), true);
    assert.equal(model.getSnapshot().damageLedger.every(entry => entry.eventId === 'uncontained-engine-1'), true);
});

test('unsupported aircraft do not receive the B737 topology', () => {
    const model = new AircraftSystemModel({ model: 'Airbus A320-200', icao: 'A320' });
    assert.equal(model.topology, null);
});

test('resource diagnostics explain unavailable bus through damaged providers', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.systems.electrical.busTie = false;
    service.applyComponentDamage({ componentId: 'electrical.generator.1', type: 'fragment_cut', severity: 1, eventId: 'event-1' });
    service.update({}, 0.25);

    const bus = service.systems.resourceNetwork.diagnostics.resources.find(item => item.resource === 'ac_bus_1');
    assert.equal(bus.available, false);
    assert.equal(bus.providers[0].componentId, 'electrical.ac_bus.1');
    assert.equal(service.systems.resourceNetwork.diagnostics.damagedComponents.some(item =>
        item.componentId === 'electrical.generator.1' && item.lastEventId === 'event-1'), true);
});

test('one failed pack preserves pressurization through the remaining pack', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.applyComponentDamage({ componentId: 'pneumatic.pack.L', type: 'overheat', severity: 1 });
    service.update({}, 0.25);

    const network = service.systems.resourceNetwork;
    assert.equal(network.resources.includes('conditioned_air_L'), false);
    assert.equal(network.resources.includes('conditioned_air_R'), true);
    assert.equal(network.capabilities.pressurization, 1);
});

test('loss of both packs removes cabin pressure control', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.applyComponentDamage({ componentId: 'pneumatic.pack.L', type: 'overheat', severity: 1 });
    service.applyComponentDamage({ componentId: 'pneumatic.pack.R', type: 'overheat', severity: 1 });
    service.update({}, 0.25);

    assert.equal(service.systems.resourceNetwork.capabilities.pressurization, 0);
});

test('component damage severity scales control capability', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.applyComponentDamage({ componentId: 'controls.elevator', type: 'reversion', severity: 0.75 });
    service.update({}, 0.25);

    assert.equal(service.systems.resourceNetwork.capabilities.elevator, 0.25);
    assert.equal(service.controlEffectiveness.elevator, 0.25);
});

test('fuel pump damage removes pressure without treating suction feed as a line repair', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.applyComponentDamage({ componentId: 'fuel.pump.left', type: 'failed', severity: 1 });
    service.update({}, 0.25);

    assert.equal(service.systems.fuel.pressL, 0);
    assert.equal(service.systems.resourceNetwork.resources.includes('fuel_pressure_L'), false);
});

test('live diagnostics trace bus loss and distinguish isolation from damage', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.systems.electrical.busTie = false;
    service.applyComponentDamage({ componentId: 'electrical.generator.1', severity: 1, eventId: 'generator-loss' });
    service.update({}, 0.25);
    let report = service.systems.resourceNetwork.diagnostics;
    const find = id => report.components.find(component => component.componentId === id);
    assert.equal(find('electrical.generator.1').status, 'failed');
    assert.equal(find('electrical.bus_tie.2_to_1').status, 'isolated');
    assert.equal(find('electrical.ac_bus.1').status, 'unpowered');
    assert.ok(JSON.stringify(report.resources.find(resource => resource.resource === 'ac_bus_1').causes).includes('generator-loss'));

    service.systems.electrical.busTie = true;
    service.update({}, 0.25);
    report = service.systems.resourceNetwork.diagnostics;
    assert.equal(find('electrical.ac_bus.1').status, 'available');
    assert.equal(find('electrical.generator.1').status, 'failed');
    assert.deepEqual(report.resources.find(resource => resource.resource === 'ac_bus_1').causes, []);
});

test('failure-driven component damage retains the originating incident', () => {
    const service = new RealisticFlightPhysicsService(aircraft);
    service.failureSystem.triggerFailure('generator_drive_disconnect');
    const failure = service.failureSystem.activeFailures.get('generator_drive_disconnect');
    service.update({}, 0.25);
    const damage = service.systems.resourceNetwork.damageLedger.find(entry => entry.componentId === 'electrical.generator.1');
    assert.ok(damage);
    assert.equal(damage.eventId, `failure-generator_drive_disconnect-${failure.instanceId}`);
    assert.equal(service.failureDamageEventId, undefined);
});
