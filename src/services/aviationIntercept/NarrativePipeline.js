import eventBus from '../eventBus.js';
import { narrativeManager } from './NarrativeManager.js';

class NarrativePipeline {
    constructor() {
        this.lastSignature = null;
        this.lastEmit = 0;
        this.pending = false;
        this.minInterval = 6;
    }

    async update(symptoms) {
        if (!symptoms || symptoms.length === 0) return;
        const signature = narrativeManager.buildSignature(symptoms);
        const now = Date.now();

        if (this.pending) return;
        if (this.lastSignature === signature && now - this.lastEmit < this.minInterval * 1000) return;

        this.lastSignature = signature;
        this.lastEmit = now;

        const cached = narrativeManager.getNarrative(symptoms);
        if (cached) {
            eventBus.publish(eventBus.Types.NARRATIVE_UPDATE, {
                title: 'Crew Sensory Report',
                content: cached,
                severity: 'info'
            });
            return;
        }

        this.publishFallback(symptoms);
    }

    publishFallback(symptoms) {
        const content = symptoms.map(s => s.description).join(' ');
        eventBus.publish(eventBus.Types.NARRATIVE_UPDATE, {
            title: 'Crew Sensory Report',
            content,
            severity: 'info'
        });
    }
}

export const narrativePipeline = new NarrativePipeline();
