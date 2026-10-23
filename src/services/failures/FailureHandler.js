import { isFailureSuitable } from '../../config/failureDifficulty.js';
import { normalizeFailureSelection } from '../../config/flightFailures.js';

import eventBus from '../eventBus.js';
import BaseFailure from './BaseFailure.js';
import { createCanonicalFailureGraph } from './CanonicalFailureGraph.js';
import FailureGraphExecutor from './FailureGraphExecutor.js';

// Registry of all failure definitions (will be populated)
import EngineFailures from './types/EngineFailures.js';
import SystemFailures from './types/SystemFailures.js';
import ControlFailures from './types/ControlFailures.js';
import EnvironmentFailures from './types/EnvironmentFailures.js';
import SensorFailures from './types/SensorFailures.js';

class FailureHandler {
    constructor(config = {}) {
        this.difficulty = config.difficulty || 'intermediate';
        this.engineCount = config.engineCount || 2;
        this.failureSelection = normalizeFailureSelection(config.failureSelection);
        this.failureFlightSeconds = Math.max(60, Number(config.failureFlightSeconds) || 3600);
        this.randomElapsed = 0;
        this.randomTriggered = new Set();
        this.randomHazard = 0;
        this.nextRandomHazard = -Math.log(1 - Math.random());
        this.activeFailures = new Map(); // id -> failureInstance
        this.registry = new Map();
        this.incidentLog = [];
        this.failureSequence = 0;
        this.graph = createCanonicalFailureGraph();
        this.settings = this.getDifficultySettings(this.difficulty);
        this.graphExecutor = new FailureGraphExecutor(this.graph, {
            onCascadeScheduled: (payload) => this.handleCascadeScheduled(payload),
            onCascadeTriggered: (payload) => this.handleCascadeTriggered(payload)
        });

        // Register definitions
        this.registerGroup(EngineFailures);
        this.registerGroup(SystemFailures);
        this.registerGroup(ControlFailures);
        this.registerGroup(EnvironmentFailures);
        this.registerGroup(SensorFailures);

        this.time = 0;
        this.nextCheckTime = 10.0;

        // Bind callback
        this.handleTransition = this.handleTransition.bind(this);
    }


    getSerializableState() {
        return {
            difficulty: this.difficulty,
            failureSelection: this.failureSelection,
            failureFlightSeconds: this.failureFlightSeconds,
            randomElapsed: this.randomElapsed,
            randomTriggered: [...this.randomTriggered],
            randomHazard: this.randomHazard,
            nextRandomHazard: this.nextRandomHazard,
            time: this.time,
            nextCheckTime: this.nextCheckTime,
            failureSequence: this.failureSequence,
            incidentLog: this.incidentLog,
            activeFailures: [...this.activeFailures].map(([id, failure]) => ({
                id, currentStage: failure.currentStage, timeInStage: failure.timeInStage,
                totalTime: failure.totalTime, intensity: failure.intensity,
                variation: failure.variation, logs: failure.logs, instanceId: failure.instanceId
            })),
            graph: {
                time: this.graphExecutor.time,
                pendingActivations: [...this.graphExecutor.pendingActivations],
                edgeDecisions: [...this.graphExecutor.edgeDecisions]
            }
        };
    }

    restoreState(state) {
        this.reset();
        this.difficulty = state.difficulty || this.difficulty;
        this.settings = this.getDifficultySettings(this.difficulty);
        this.failureSelection = normalizeFailureSelection(state.failureSelection);
        this.failureFlightSeconds = Math.max(60, Number(state.failureFlightSeconds) || 3600);
        this.randomElapsed = state.randomElapsed ?? 0;
        this.randomTriggered = new Set(state.randomTriggered || []);
        this.randomHazard = state.randomHazard ?? 0;
        this.nextRandomHazard = state.nextRandomHazard ?? -Math.log(1 - Math.random());
        this.time = state.time ?? 0;
        this.nextCheckTime = state.nextCheckTime ?? this.time + 10;
        this.failureSequence = state.failureSequence ?? 0;
        this.incidentLog = state.incidentLog || [];
        for (const saved of state.activeFailures || []) {
            const definition = this.registry.get(saved.id);
            if (!definition || !definition.stages?.[saved.currentStage]) continue;
            const failure = new BaseFailure(definition, saved.variation?.context || {}, this.handleTransition);
            Object.assign(failure, saved);
            this.activeFailures.set(saved.id, failure);
        }
        if (state.graph) {
            this.graphExecutor.time = state.graph.time ?? this.time;
            this.graphExecutor.pendingActivations = new Map(state.graph.pendingActivations || []);
            this.graphExecutor.edgeDecisions = new Set(state.graph.edgeDecisions || []);
        }
    }

    registerGroup(group) {
        if (!group) return;
        Object.values(group).forEach(def => {
            this.registry.set(def.id, def);
        });
    }

    getDifficultySettings(difficulty) {
        const settings = {
            rookie: {
                probMultiplier: 0.2,
                maxFailures: 1,
                cascadeProbabilityMultiplier: 0,
                cascadeDelayMultiplier: 2.5,
                blockedCascadeClasses: ['catastrophic']
            },
            amateur: {
                probMultiplier: 0.2,
                maxFailures: 1,
                cascadeProbabilityMultiplier: 0.35,
                cascadeDelayMultiplier: 1.5,
                blockedCascadeClasses: []
            },
            intermediate: {
                probMultiplier: 0.5,
                maxFailures: 2,
                cascadeProbabilityMultiplier: 1.0,
                cascadeDelayMultiplier: 1.0,
                blockedCascadeClasses: []
            },
            advanced: {
                probMultiplier: 1.0,
                maxFailures: 3,
                cascadeProbabilityMultiplier: 1.1,
                cascadeDelayMultiplier: 0.9,
                blockedCascadeClasses: []
            },
            pro: {
                probMultiplier: 1.5,
                maxFailures: 4,
                cascadeProbabilityMultiplier: 1.2,
                cascadeDelayMultiplier: 0.8,
                blockedCascadeClasses: []
            },
            devil: {
                probMultiplier: 2.5,
                maxFailures: 5,
                cascadeProbabilityMultiplier: 1.35,
                cascadeDelayMultiplier: 0.65,
                blockedCascadeClasses: []
            }
        };
        return settings[difficulty] || settings.intermediate;
    }

    getCascadePolicy(context = {}) {
        const difficulty = context.difficulty || this.difficulty;
        const settings = this.getDifficultySettings(difficulty);
        return {
            difficulty,
            probabilityMultiplier: difficulty === 'rookie' && context.source !== 'random'
                ? 0.35 : settings.cascadeProbabilityMultiplier ?? 1,
            delayMultiplier: settings.cascadeDelayMultiplier ?? 1,
            blockedCascadeClasses: Array.isArray(settings.blockedCascadeClasses) ? [...settings.blockedCascadeClasses] : []
        };
    }

    update(dt, flightState) {
        this.time += dt;

        // Update active failures
        this.activeFailures.forEach(failure => {
            failure.update(dt, flightState);
        });

        // Recovered incidents no longer apply effects or originate cascades.
        this.activeFailures.forEach((failure, id) => {
            if (failure.currentStage === 'recovered') {
                this.activeFailures.delete(id);
                this.recordIncident('failure_recovered', { failureId: id });
            }
        });

        this.graphExecutor.update(dt, {
            activeFailures: this.activeFailures,
            flightState,
            triggerFailure: (id, context) => this.triggerFailure(id, context),
            getCascadePolicy: (sourceFailure) => this.getCascadePolicy(sourceFailure?.variation?.context)
        });

        if (!flightState?.onGround) {
            this.randomElapsed += dt;
            this.randomHazard += dt * this.failureSelection.count / this.failureFlightSeconds;
        }

        // Random triggering logic
        if (this.time > this.nextCheckTime) {
            this.checkRandomFailures(flightState);
            this.nextCheckTime = this.time + 5.0 + Math.random() * 5.0;
        }
    }



    applyImpact(physicsService) {
        this.activeFailures.forEach(failure => {
            failure.apply(physicsService);
        });
    }

    recordIncident(type, payload = {}) {
        this.incidentLog.push({
            time: this.time,
            type,
            ...payload
        });
    }

    getIncidentLog() {
        return this.incidentLog.map(entry => ({ ...entry }));
    }

    handleCascadeScheduled({ edge, sourceFailure, context, scheduledAt, triggerAt, time }) {
        const payload = {
            edgeId: edge.id,
            source: edge.sourceRuntimeId,
            target: edge.targetRuntimeId,
            context,
            scheduledAt,
            triggerAt,
            time,
            sourceStage: sourceFailure?.currentStage || null,
            effectiveProbability: context?.cascadePolicy?.effectiveProbability ?? edge.probability ?? 1,
            effectiveDelay: context?.cascadePolicy?.effectiveDelay ?? edge.delaySeconds ?? 0,
            cascadeBlocked: context?.cascadePolicy?.blocked === true
        };
        this.recordIncident('cascade_scheduled', payload);
        eventBus.publish(eventBus.Types.FAILURE_CASCADE_SCHEDULED, payload);
    }

    handleCascadeTriggered({ edge, sourceFailure, context, scheduledAt, triggerAt, time }) {
        const payload = {
            edgeId: edge.id,
            source: edge.sourceRuntimeId,
            target: edge.targetRuntimeId,
            context,
            scheduledAt,
            triggerAt,
            time,
            sourceStage: sourceFailure?.currentStage || null,
            effectiveProbability: context?.cascadePolicy?.effectiveProbability ?? edge.probability ?? 1,
            effectiveDelay: context?.cascadePolicy?.effectiveDelay ?? edge.delaySeconds ?? 0,
            cascadeBlocked: context?.cascadePolicy?.blocked === true
        };
        this.recordIncident('cascade_triggered', payload);
        eventBus.publish(eventBus.Types.FAILURE_CASCADE_TRIGGERED, payload);
    }

    triggerFailure(id, context = {}) {
        if (this.activeFailures.has(id)) return false;
        // Scripted scenario incidents remain explicit. Random incidents and
        // their descendants obey the same suitability and concurrency limits.
        if (context.source === 'random' &&
            (!isFailureSuitable(id, this.difficulty) ||
                (this.activeFailures.size >= this.settings.maxFailures &&
                    !(this.difficulty === 'devil' && context.cascadeEdgeId)))) return false;

        const def = this.registry.get(id);
        if (!def) {
            console.warn(`Failure definition not found: ${id}`);
            return false;
        }

        // Auto-fill context if needed
        if (context.difficulty === undefined) {
            context.difficulty = this.difficulty;
        }
        if (!context.cascadePolicy) {
            context.cascadePolicy = this.getCascadePolicy(context);
        }

        if ((def.category === 'engine' || ['uncontained_engine_failure', 'bird_strike'].includes(id)) && context.engineIndex === undefined) {
            context.engineIndex = Math.floor(Math.random() * this.engineCount);
        }

        const failure = new BaseFailure(def, context, this.handleTransition);
        failure.instanceId = ++this.failureSequence;
        const initialStage = def.stages?.inactive?.next || (def.stages?.incipient ? 'incipient' : 'active');
        failure.transitionTo(initialStage);

        this.activeFailures.set(id, failure);
        this.recordIncident('failure_triggered', {
            failureId: id,
            context: { ...context },
            stage: failure.currentStage
        });

        // Global Event
        eventBus.publish(eventBus.Types.FAILURE_OCCURRED, {
            type: id,
            severity: 'major', // Dynamic?
            data: context,
            time: this.time
        });
        return true;
    }
    
    handleTransition(failure, desc) {
        // Handle sensory events
        let message = typeof desc === 'string' ? desc : desc.text;
        this.recordIncident('failure_progressed', {
            failureId: failure.id,
            stage: failure.currentStage,
            message,
            description: desc
        });
        eventBus.publish(eventBus.Types.FAILURE_PROGRESSED, {
            type: failure.id,
            stage: failure.currentStage,
            message,
            description: desc,
            time: this.time
        });

        if (typeof desc === 'object') {
            if (desc.sound) {
                eventBus.publish('SENSORY_SOUND', { id: desc.sound });
            }
            if (desc.visual) {
                eventBus.publish('SENSORY_VISUAL', { type: desc.visual });
            }
            if (desc.smell) {
                eventBus.publish('SENSORY_SMELL', { type: desc.smell });
            }
            if (desc.system_alert) {
                 // Publish to Warning System directly if possible, or via event bus
                 // SystemStatusPanel listens to flightState.activeWarnings
                 // We need to push this to flightState or let WarningSystem pick it up
                 // For now, let's assume we use eventBus to notify WarningSystem
                 eventBus.publish('SYSTEM_ALERT_TRIGGERED', { 
                     id: failure.id, 
                     message: desc.system_alert, 
                     level: 'WARNING' 
                 });
            }
        }

        // Narrative Event (Legacy Support + New Log)
        if (message) {
            eventBus.publish(eventBus.Types.CRITICAL_MESSAGE, {
                title: 'SYSTEM ALERT',
                content: message,
                severity: 'warning',
                time: this.time
            });
        }
    }

    checkRandomFailures(flightState = {}) {
        if (this.failureSelection.mode !== 'custom' || flightState.onGround ||
            this.randomElapsed > this.failureFlightSeconds || this.randomHazard < this.nextRandomHazard ||
            this.activeFailures.size >= this.settings.maxFailures) return;
        const candidates = [...this.registry.values()].filter(def =>
            this.failureSelection.banks.includes(def.category) && isFailureSuitable(def.id, this.difficulty) &&
            !this.activeFailures.has(def.id) && !this.randomTriggered.has(def.id));
        if (!candidates.length) return;
        // Devil favors system-chain initiators, while preserving selected banks.
        const weight = definition => this.difficulty === 'devil' &&
            this.graph.edges.some(edge => edge.sourceRuntimeId === definition.id) ? 4 : 1;
        let draw = Math.random() * candidates.reduce((total, definition) => total + weight(definition), 0);
        const definition = candidates.find(candidate => (draw -= weight(candidate)) < 0) || candidates[candidates.length - 1];
        this.triggerFailure(definition.id, { source: 'random' });
        this.randomTriggered.add(definition.id);
        this.nextRandomHazard = this.randomHazard - Math.log(1 - Math.random());
    }

    reset() {
        this.activeFailures.clear();
        this.randomElapsed = 0;
        this.randomTriggered.clear();
        this.randomHazard = 0;
        this.nextRandomHazard = -Math.log(1 - Math.random());
        this.time = 0;
        this.graphExecutor.reset();
    }
}

export default FailureHandler;
