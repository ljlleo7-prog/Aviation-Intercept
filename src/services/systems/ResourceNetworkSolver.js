const requirementsMet = (component, resources) => {
    const all = component.requires || [];
    const any = component.requiresAny || [];
    return all.every(resource => resources.has(resource)) &&
        (any.length === 0 || any.some(resource => resources.has(resource)));
};

export default class ResourceNetworkSolver {
    constructor(components = []) {
        this.components = components;
    }

    solve({ seedResources = [], commands = {}, componentStore }) {
        const resources = new Set(seedResources);
        const activeComponents = new Set();
        const suppliedBy = {};
        seedResources.forEach(resource => { suppliedBy[resource] = ['external']; });

        let changed = true;
        while (changed) {
            changed = false;
            this.components.forEach(component => {
                if (activeComponents.has(component.id)) return;
                if (!componentStore.isOperable(component.id, component.minimumHealth ?? 0.05)) return;
                if (component.command && !commands[component.command]) return;
                if (!requirementsMet(component, resources)) return;

                activeComponents.add(component.id);
                (component.provides || []).forEach(resource => {
                    if (!resources.has(resource)) changed = true;
                    resources.add(resource);
                    suppliedBy[resource] ??= [];
                    if (!suppliedBy[resource].includes(component.id)) suppliedBy[resource].push(component.id);
                });
                changed = true;
            });
        }

        return { resources, activeComponents, suppliedBy, commands: { ...commands } };
    }
}
