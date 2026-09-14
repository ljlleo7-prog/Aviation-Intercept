import { failureGraphManager } from './FailureGraphManager.js';
import { cascadeResolver } from './CascadeResolver.js';
import { symptomFilter } from './SymptomFilter.js';
import { gapLogger } from './GapLogger.js';
import { narrativeManager } from './NarrativeManager.js';
import { narrativePipeline } from './NarrativePipeline.js';
import eventBus from '../eventBus.js';

class SkylinetragedyService {
    constructor() {
        this.activeFailures = new Set();
        this.physicsService = null;
        this.time = 0;
        this.initialized = false;
        this.graphArtifact = null;
    }

    async initialize() {
        await failureGraphManager.initialize();
        await narrativeManager.initialize();
        this.graphArtifact = failureGraphManager.getGraphArtifact();
        this.initialized = true;
        console.log('Skylinetragedy Service Initialized');
    }

    update(dt, physicsService) {
        if (!this.initialized) return;

        this.physicsService = physicsService;
        this.time += dt;

        const newFailures = cascadeResolver.update(dt, this.activeFailures);
        newFailures.forEach(id => this.triggerFailure(id));

        const symptoms = symptomFilter.filterSymptoms(this.activeFailures, physicsService);
        if (symptoms.length > 0) {
            narrativePipeline.update(symptoms);
        }
    }

    triggerFailure(id) {
        if (this.activeFailures.has(id)) return;

        this.activeFailures.add(id);
        const failure = failureGraphManager.getFailure(id);

        if (failure) {
            console.log(`Cascading Failure Triggered: ${failure.failure_code}`);
            eventBus.publish('FAILURE_TRIGGERED', {
                id,
                failure,
                graphVersion: this.graphArtifact?.metadata?.version || this.graphArtifact?.version || 'unknown'
            });
        } else {
            console.warn(`Failure ID ${id} triggered but not found in graph.`);
        }
    }

    injectFailure(failureCode) {
        const failure = failureGraphManager.getFailureByCode(failureCode);
        if (failure) {
            this.triggerFailure(failure.id);
        } else {
            console.warn(`Failure Code ${failureCode} not found.`);
        }
    }

    async processGaps() {
        const logs = gapLogger.getLogs();
        if (logs.length > 0) {
            console.warn('Gap logs are captured for the offline pipeline.', logs);
        }
    }
}

export const aviationInterceptService = new SkylinetragedyService();
