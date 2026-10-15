export default class SystemDiagnostics {
    constructor(topology, componentStore) {
        this.topology = topology;
        this.componentStore = componentStore;
    }

    explainResource(resource, resolution) {
        const providers = this.topology.components.filter(component =>
            (component.provides || []).includes(resource));
        return {
            resource,
            available: resolution.resources.has(resource),
            suppliedBy: resolution.suppliedBy[resource] || [],
            providers: providers.map(component => {
                const state = this.componentStore.ensure(component.id);
                return {
                    componentId: component.id,
                    zone: component.zone,
                    active: resolution.activeComponents.has(component.id),
                    health: state.health,
                    damageModes: [...state.damageModes],
                    requires: [...(component.requires || [])],
                    requiresAny: [...(component.requiresAny || [])]
                };
            })
        };
    }

    buildReport(resolution) {
        const components = this.topology.components.map(component => {
            const state = this.componentStore.ensure(component.id);
            const active = resolution.activeComponents.has(component.id);
            const isolated = component.command && !resolution.commands?.[component.command];
            const missingResources = (component.requires || []).filter(resource => !resolution.resources.has(resource));
            if (component.requiresAny?.length && !component.requiresAny.some(resource => resolution.resources.has(resource))) {
                missingResources.push(...component.requiresAny);
            }
            return {
                componentId: component.id,
                command: component.command || null,
                status: !this.componentStore.isOperable(component.id, component.minimumHealth ?? 0.05)
                    ? 'failed' : isolated ? 'isolated' : !active ? 'unpowered' : state.health < 1 ? 'degraded' : 'available',
                health: state.health,
                lastEventId: state.lastEventId,
                missingResources,
                provides: [...(component.provides || [])]
            };
        });
        const traceResource = (resource, visited = new Set()) => {
            if (visited.has(resource) || resolution.resources.has(resource)) return [];
            const next = new Set([...visited, resource]);
            return components.filter(component => component.provides.includes(resource)).map(component => ({
                componentId: component.componentId,
                status: component.status,
                eventId: component.lastEventId,
                dependencies: component.missingResources.map(missing => ({
                    resource: missing,
                    providers: traceResource(missing, next)
                }))
            }));
        };
        const criticalResources = [
            'ac_bus_1', 'ac_bus_2', 'dc_essential', 'hydraulic_A', 'hydraulic_B',
            'fuel_feed_engine_1', 'fuel_feed_engine_2', 'bleed_duct_L', 'bleed_duct_R',
            'cabin_pressure_control', 'roll_control', 'pitch_control', 'yaw_control',
            'wheel_braking', 'gear_actuation'
        ];
        return {
            components,
            resources: criticalResources.map(resource => ({
                ...this.explainResource(resource, resolution),
                causes: traceResource(resource)
            })),
            damagedComponents: Object.entries(this.componentStore.getSnapshot())
                .filter(([, state]) => state.health < 1)
                .map(([componentId, state]) => ({ componentId, ...state }))
        };
    }
}
