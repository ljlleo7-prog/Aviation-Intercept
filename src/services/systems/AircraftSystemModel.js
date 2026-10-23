import { hasManualReversion } from '../physics/controlTransmission.js';
import ComponentStateStore from './ComponentStateStore.js';
import ResourceNetworkSolver from './ResourceNetworkSolver.js';
import B737SystemTopology from './B737SystemTopology.js';
import SystemDiagnostics from './SystemDiagnostics.js';

export default class AircraftSystemModel {
    constructor(aircraft = {}) {
        const identity = aircraft.icao || aircraft.model;
        this.topology = B737SystemTopology.aircraft.includes(identity) ? B737SystemTopology : null;
        this.aircraft = aircraft;
        this.componentStore = new ComponentStateStore(this.topology?.components || []);
        this.solver = new ResourceNetworkSolver(this.topology?.components || []);
        this.diagnostics = this.topology ? new SystemDiagnostics(this.topology, this.componentStore) : null;
        this.lastResolution = { resources: new Set(), activeComponents: new Set(), suppliedBy: {} };
        this.eventSequence = 0;
    }

    applyDamage(damage) {
        return this.componentStore.applyDamage({
            eventId: damage.eventId || `damage-${++this.eventSequence}`,
            ...damage
        });
    }

    applyRegionalDamage({ zone, mechanisms = {}, energy = 1, eventId, time = 0, random = Math.random }) {
        if (!this.topology) return [];
        const zoneDefinition = this.topology.zones[zone];
        if (!zoneDefinition) return [];
        const results = [];
        zoneDefinition.components.forEach(componentId => {
            const exposure = Object.entries(mechanisms).reduce((highest, [mechanism, strength]) =>
                Math.max(highest, (zoneDefinition.exposure[mechanism] || 0) * strength), 0);
            const severity = Math.max(0, Math.min(1, energy * exposure));
            if (severity > 0 && random() < severity) {
                results.push(this.applyDamage({ componentId, type: 'regional_damage', severity, eventId, zone, time }));
            }
        });
        return results;
    }

    update(systems, engines) {
        if (!this.topology) return null;
        const electrical = systems.electrical || {};
        const hydraulics = systems.hydraulics || {};
        const pneumatic = systems.pressurization || {};
        const fuel = systems.fuel || {};
        const commands = {
            gen1: !!electrical.gen1,
            gen2: !!electrical.gen2,
            apuGen1: !!(electrical.apuGen1 ?? electrical.apuGen),
            apuGen2: !!(electrical.apuGen2 ?? electrical.apuGen),
            busTie: !!electrical.busTie,
            // The selector is the pilot command; electrical.battery is a derived
            // output and may still reflect the previous simulation frame.
            battery: electrical.batterySelector !== 'OFF',
            engPumpA: !!hydraulics.sysA?.engPump,
            elecPumpA: !!hydraulics.sysA?.elecPump,
            engPumpB: !!hydraulics.sysB?.engPump,
            elecPumpB: !!hydraulics.sysB?.elecPump,
            apuRunning: !!systems.apu?.running,
            bleed1: !!pneumatic.bleed1,
            bleed2: !!pneumatic.bleed2,
            apuBleed: !!systems.apu?.bleed,
            isolationValve: !!pneumatic.isolationValve,
            packL: !!pneumatic.packL,
            packR: !!pneumatic.packR,
            leftPumps: !!fuel.leftPumps,
            rightPumps: !!fuel.rightPumps,
            centerPumps: !!fuel.centerPumps
        };
        const seedResources = [];
        if (engines[0]?.state?.running || engines[0]?.state?.n2 > 25) seedResources.push('engine_1_shaft');
        if (engines[1]?.state?.running || engines[1]?.state?.n2 > 25) seedResources.push('engine_2_shaft');
        if ((fuel.tanks?.left || 0) > 0) seedResources.push('fuel_tank_L');
        if ((fuel.tanks?.right || 0) > 0) seedResources.push('fuel_tank_R');
        if ((fuel.tanks?.center || 0) > 0) seedResources.push('fuel_tank_C');

        this.lastResolution = this.solver.solve({ seedResources, commands, componentStore: this.componentStore });
        const snapshot = this.getSnapshot();
        systems.resourceNetwork = snapshot;
        return snapshot;
    }

    isResourceAvailable(resource) {
        return this.lastResolution.resources.has(resource);
    }

    getSnapshot() {
        const resources = this.lastResolution.resources;
        const hydraulicCount = Number(resources.has('hydraulic_A')) + Number(resources.has('hydraulic_B'));
        const components = this.componentStore.getSnapshot();
        const health = componentId => components[componentId]?.health ?? 1;
        return {
            topologyId: this.topology.id,
            resources: Array.from(this.lastResolution.resources).sort(),
            activeComponents: Array.from(this.lastResolution.activeComponents).sort(),
            suppliedBy: { ...this.lastResolution.suppliedBy },
            components,
            damageLedger: this.componentStore.getDamageLedger(),
            capabilities: {
                aileron: hasManualReversion(this.aircraft, 'aileron') ? health('controls.aileron') : resources.has('roll_control') ? (hydraulicCount === 2 ? 1 : 0.65) * health('controls.aileron') : 0,
                elevator: hasManualReversion(this.aircraft, 'elevator') ? health('controls.elevator') : resources.has('pitch_control') ? (hydraulicCount === 2 ? 1 : 0.6) * health('controls.elevator') : 0,
                rudder: resources.has('yaw_control') ? (hydraulicCount === 2 ? 1 : 0.55) * health('controls.rudder') : 0,
                spoilers: resources.has('spoiler_control') ? (hydraulicCount === 2 ? 1 : 0.5) * health('controls.spoilers') : 0,
                gear: resources.has('gear_actuation') ? health('controls.landing_gear') : 0,
                brakes: resources.has('wheel_braking') ? (hydraulicCount === 2 ? 1 : 0.5) * health('controls.normal_brakes') : 0.1,
                pressurization: resources.has('cabin_pressure_control') ? health('pressurization.controller') : 0
            },
            diagnostics: this.diagnostics?.buildReport(this.lastResolution) || null
        };
    }
}
