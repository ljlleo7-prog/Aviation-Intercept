import { supabase } from './SupabaseClient.js';
import { narrativeCache } from './NarrativeCache.js';

class NarrativeManager {
    constructor() {
        this.narratives = new Map();
        this.initialized = false;
        this.unavailableKey = 'skylinetragedy_narrative_unavailable_v1';
    }

    buildSignature(symptoms) {
        return symptoms
            .map(s => `${s.sensory_type || ''}:${s.description || ''}`.trim())
            .sort()
            .join('|');
    }

    async initialize() {
        if (this.initialized) return;

        const cached = narrativeCache.load();
        if (cached) {
            this.loadFromCache(cached);
        }

        if (typeof window !== 'undefined') {
            const unavailable = window.localStorage.getItem(this.unavailableKey);
            if (unavailable) {
                const lastFailedAt = Number(unavailable);
                if (Number.isFinite(lastFailedAt) && Date.now() - lastFailedAt < 24 * 60 * 60 * 1000) {
                    this.initialized = true;
                    return;
                }
            }
        }

        try {
            const { data, error } = await supabase
                .from('skylinetragedy_narratives')
                .select('*');
            if (error) throw error;
            if (data) {
                this.narratives = new Map();
                data.forEach(row => {
                    this.narratives.set(row.signature, row.content);
                });
                narrativeCache.save({
                    narratives: data,
                    cachedAt: new Date().toISOString()
                });
            }
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(this.unavailableKey);
            }
        } catch (error) {
            const cachedFallback = narrativeCache.load();
            if (cachedFallback) {
                this.loadFromCache(cachedFallback);
            }
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(this.unavailableKey, String(Date.now()));
            }
        }

        this.initialized = true;
    }

    loadFromCache(cached) {
        this.narratives = new Map();
        (cached.narratives || []).forEach(row => {
            this.narratives.set(row.signature, row.content);
        });
    }

    getNarrative(symptoms) {
        const signature = this.buildSignature(symptoms);
        return this.narratives.get(signature) || null;
    }
}

export const narrativeManager = new NarrativeManager();
