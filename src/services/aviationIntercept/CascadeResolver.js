import { failureGraphManager } from './FailureGraphManager.js';

class CascadeResolver {
    constructor() {
        this.pendingCascades = []; // { failureId, triggerTime, sourceId }
        this.processedFailures = new Set();
        this.time = 0;
    }

    update(dt, activeFailures) {
        this.time += dt;
        const newFailures = [];

        this.pendingCascades = this.pendingCascades.filter(cascade => {
            if (this.time >= cascade.triggerTime) {
                newFailures.push(cascade.failureId);
                return false;
            }
            return true;
        });

        activeFailures.forEach(failureId => {
            if (this.processedFailures.has(failureId)) return;

            const edges = failureGraphManager.getEdgesFrom(failureId);
            edges.forEach(edge => {
                if ((edge.propagation_type || edge.propagationType) === 'PHYSICS') return;
                if (Math.random() > (edge.probability ?? 1)) return;

                const effectFailure = edge.effect_failure || edge.targetRuntimeId || edge.targetId;
                const delay = edge.delay_seconds ?? edge.delaySeconds ?? 0;
                const triggerTime = this.time + delay;

                if (activeFailures.has(effectFailure)) return;
                if (this.pendingCascades.some(c => c.failureId === effectFailure)) return;

                this.pendingCascades.push({
                    failureId: effectFailure,
                    triggerTime,
                    sourceId: failureId
                });
            });

            this.processedFailures.add(failureId);
        });

        this.processedFailures.forEach(id => {
            if (!activeFailures.has(id)) {
                this.processedFailures.delete(id);
            }
        });

        return newFailures;
    }

    reset() {
        this.pendingCascades = [];
        this.processedFailures.clear();
        this.time = 0;
    }
}

export const cascadeResolver = new CascadeResolver();
