const STAGE_ORDER = [
    'inactive',
    'incipient',
    'degraded',
    'active',
    'critical',
    'stabilized',
    'irreversible',
    'recovered'
];

const getStageRank = (stage) => {
    const index = STAGE_ORDER.indexOf(stage);
    return index === -1 ? STAGE_ORDER.indexOf('active') : index;
};

const getByPath = (value, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), value);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const compareObservable = (actual, operator, expected) => {
    switch (operator) {
        case '<': return actual < expected;
        case '<=': return actual <= expected;
        case '>': return actual > expected;
        case '>=': return actual >= expected;
        case '!=': return actual !== expected;
        case 'includes': return Array.isArray(actual) ? actual.includes(expected) : false;
        case 'truthy': return !!actual;
        case 'falsy': return !actual;
        case '=':
        case '==':
        default:
            return actual === expected;
    }
};

const resolveEdgeDifficulty = (edge, cascadePolicy = {}) => {
    const blockedCascadeClasses = Array.isArray(cascadePolicy.blockedCascadeClasses)
        ? cascadePolicy.blockedCascadeClasses
        : [];
    const blocked = blockedCascadeClasses.includes(edge.cascadeClass);
    const effectiveProbability = blocked
        ? 0
        : clamp((edge.probability ?? 1) * (cascadePolicy.probabilityMultiplier ?? 1), 0, 1);
    const effectiveDelay = Math.max(0, (edge.delaySeconds || 0) * (cascadePolicy.delayMultiplier ?? 1));

    return {
        difficulty: cascadePolicy.difficulty,
        blocked,
        effectiveProbability,
        effectiveDelay
    };
};

class FailureGraphExecutor {
    constructor(graph, hooks = {}) {
        this.graph = graph;
        this.time = 0;
        this.pendingActivations = new Map();
        this.edgeDecisions = new Set();
        this.hooks = hooks;
    }

    reset() {
        this.time = 0;
        this.pendingActivations.clear();
        this.edgeDecisions.clear();
    }

    update(dt, payload) {
        const { activeFailures, flightState, triggerFailure, getCascadePolicy } = payload;
        this.time += dt;

        this.scheduleEligibleEdges(activeFailures, flightState, getCascadePolicy);

        for (const [key, pending] of Array.from(this.pendingActivations.entries())) {
            if (activeFailures.has(pending.edge.targetRuntimeId)) {
                this.pendingActivations.delete(key);
                continue;
            }

            if (this.time < pending.triggerAt) {
                continue;
            }

            const sourceFailure = activeFailures.get(pending.edge.sourceRuntimeId);
            if (!sourceFailure || sourceFailure.currentStage === 'recovered') {
                this.pendingActivations.delete(key);
                continue;
            }

            const triggered = triggerFailure(pending.edge.targetRuntimeId, pending.context);
            this.pendingActivations.delete(key);
            if (triggered === false) continue;

            if (typeof this.hooks.onCascadeTriggered === 'function') {
                this.hooks.onCascadeTriggered({
                    edge: pending.edge,
                    sourceFailure,
                    context: pending.context,
                    scheduledAt: pending.scheduledAt,
                    triggerAt: pending.triggerAt,
                    time: this.time
                });
            }

        }
    }

    scheduleEligibleEdges(activeFailures, flightState, getCascadePolicy) {
        this.graph.edges.forEach((edge) => {
            const sourceFailure = activeFailures.get(edge.sourceRuntimeId);
            if (!sourceFailure) return;
            if (activeFailures.has(edge.targetRuntimeId)) return;

            const key = `${edge.id}:${sourceFailure.instanceId ?? sourceFailure.id}:${edge.targetRuntimeId}`;
            if (this.pendingActivations.has(key)) return;
            if (this.edgeDecisions.has(key)) return;
            if (!this.isEdgeEligible(edge, sourceFailure, flightState)) return;

            // Probability is one decision per source incident, not per frame.
            this.edgeDecisions.add(key);

            const cascadePolicy = typeof getCascadePolicy === 'function'
                ? getCascadePolicy(sourceFailure)
                : {};
            const edgeDifficulty = resolveEdgeDifficulty(edge, cascadePolicy);
            if (edgeDifficulty.blocked) return;
            if (edgeDifficulty.effectiveProbability <= 0 || Math.random() > edgeDifficulty.effectiveProbability) return;

            const pending = {
                edge,
                scheduledAt: this.time,
                triggerAt: this.time + edgeDifficulty.effectiveDelay,
                context: this.buildTargetContext(edge, sourceFailure, edgeDifficulty)
            };

            this.pendingActivations.set(key, pending);

            if (typeof this.hooks.onCascadeScheduled === 'function') {
                this.hooks.onCascadeScheduled({
                    edge,
                    sourceFailure,
                    context: pending.context,
                    scheduledAt: pending.scheduledAt,
                    triggerAt: pending.triggerAt,
                    time: this.time
                });
            }
        });
    }

    isEdgeEligible(edge, sourceFailure, flightState) {
        if (edge.sourceStage) {
            if (edge.sourceStageMode === 'minimum') {
                if (getStageRank(sourceFailure.currentStage) < getStageRank(edge.sourceStage)) return false;
            } else if (sourceFailure.currentStage !== edge.sourceStage) {
                return false;
            }
        }

        if ((edge.minSourceTimeInStage || 0) > sourceFailure.timeInStage) {
            return false;
        }

        if (!this.evaluateObservables(edge.requiredObservables, sourceFailure, flightState, true)) {
            return false;
        }

        if (!this.evaluateObservables(edge.inhibitedObservables, sourceFailure, flightState, false)) {
            return false;
        }

        return true;
    }

    evaluateObservables(observables = [], sourceFailure, flightState, expectedResult) {
        return observables.every((observable) => {
            const actual = this.resolveObservableValue(observable.path, sourceFailure, flightState);
            const passed = compareObservable(actual, observable.operator, observable.value);
            return expectedResult ? passed : !passed;
        });
    }

    resolveObservableValue(path, sourceFailure, flightState) {
        if (!path) return undefined;

        if (path === 'source.context.engineIndex') {
            return sourceFailure?.variation?.context?.engineIndex;
        }

        if (path === 'source.stage') {
            return sourceFailure?.currentStage;
        }

        return getByPath(flightState, path);
    }

    buildTargetContext(edge, sourceFailure, edgeDifficulty = {}) {
        const template = edge.targetContextTemplate || {};
        const context = {};

        Object.entries(template).forEach(([key, value]) => {
            if (key === 'inheritEngineIndex' && value) {
                const engineIndex = sourceFailure?.variation?.context?.engineIndex;
                if (engineIndex !== undefined) {
                    context.engineIndex = engineIndex;
                }
                return;
            }

            context[key] = value;
        });

        context.source = sourceFailure?.variation?.context?.source;
        context.triggeredBy = edge.sourceRuntimeId;
        context.propagationType = edge.propagationType;
        context.cascadeEdgeId = edge.id;
        context.cascadePolicy = {
            difficulty: edgeDifficulty.difficulty,
            blocked: edgeDifficulty.blocked === true,
            effectiveProbability: edgeDifficulty.effectiveProbability ?? edge.probability ?? 1,
            effectiveDelay: edgeDifficulty.effectiveDelay ?? edge.delaySeconds ?? 0
        };
        return context;
    }
}

export default FailureGraphExecutor;
