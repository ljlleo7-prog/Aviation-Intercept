
import { supabase } from './aviationIntercept/SupabaseClient.js';
import eventBus from './eventBus.js';
import fallbackResponses from '../data/npc_fallback_responses.json';

class NPCCrewService {
    constructor() {
        this.difficulty = 'intermediate'; // Default
        this.stressLevel = 0;
        this.crewState = {
            FO: { status: 'idle', stress: 0, lastResponseTime: 0 },
            CABIN_CREW: { status: 'idle', stress: 0, lastResponseTime: 0 }
        };
        this.responseCache = new Map(); // key: scenario_id + role + difficulty -> [responses]
        this.initialized = false;
        
        // Data Provider
        this.aircraftStateProvider = null;

        // Pending timeouts mapping
        this.pendingTimeouts = new Map();
        
        // Decay interval ID
        this.decayInterval = null;

        // Bind methods
        this.handleFailure = this.handleFailure.bind(this);
        this.handlePhaseChange = this.handlePhaseChange.bind(this);
        this.summon = this.summon.bind(this);
        this.decayStress = this.decayStress.bind(this);
    }

    setAircraftStateProvider(providerFn) {
        this.aircraftStateProvider = providerFn;
    }

    initialize(difficulty = 'intermediate') {
        if (this.initialized) return;
        
        this.difficulty = difficulty;
        this.initialized = true;
        this.setupListeners();
        
        // Preload common scenarios
        this.preloadResponses();

        // Start stress decay loop
        this.decayInterval = setInterval(this.decayStress, 5000);
        
        console.log(`NPCCrewService initialized with difficulty: ${this.difficulty}`);
    }

    destroy() {
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
            this.decayInterval = null;
        }
        this.pendingTimeouts.forEach(id => clearTimeout(id));
        this.pendingTimeouts.clear();
        this.initialized = false;
    }

    decayStress() {
        // Decay stress gradually if no active failures
        // FO decays slightly slower than CABIN_CREW
        if (this.crewState.FO.stress > 0) {
            this.crewState.FO.stress = Math.max(0, this.crewState.FO.stress - 2);
        }
        if (this.crewState.CABIN_CREW.stress > 0) {
            this.crewState.CABIN_CREW.stress = Math.max(0, this.crewState.CABIN_CREW.stress - 3);
        }
        
        // Occasionally notify UI of stress change even without a message, but we'll do it silently or just let the next message carry it.
    }

    setupListeners() {
        // Listen for failures
        eventBus.subscribe(eventBus.Types.FAILURE_OCCURRED, (data) => {
            this.handleFailure(data);
        });

        // Listen for phase changes
        eventBus.subscribe(eventBus.Types.PHASE_CHANGED, (data) => {
            this.handlePhaseChange(data);
        });
    }

    async preloadResponses() {
        const scenarios = ['taxi', 'takeoff_roll', 'climb', 'cruise', 'descent', 'approach', 'landing'];
        for (const scenario of scenarios) {
            // Pre-fetch for FO
            this.fetchResponses(scenario, 'FO').catch(err => console.warn(err));
        }
    }

    async fetchResponses(scenarioId, role) {
        const key = `${scenarioId}-${role}-${this.difficulty}`;
        
        if (this.responseCache.has(key)) {
            return this.responseCache.get(key);
        }

        try {
            // Map difficulty to DB values if needed, or use direct string
            // DB has: rookie, amateur, intermediate, advanced, pro, devil
            // Service receives: rookie, amateur, intermediate, advanced, pro, devil
            
            const { data, error } = await supabase
                .from('skylinetragedy_npc_responses')
                .select('content')
                .eq('scenario_id', scenarioId)
                .eq('role', role)
                .eq('difficulty', this.difficulty);

            if (error) {
                console.warn(`Supabase error fetching NPC responses: ${error.message}`);
                return this.getFallbackResponses(role, scenarioId);
            }
            
            if (data && data.length > 0) {
                const responses = data.map(r => r.content);
                this.responseCache.set(key, responses);
                return responses;
            } else {
                return this.getFallbackResponses(role, scenarioId);
            }
        } catch (err) {
            console.warn(`Failed to fetch NPC responses for ${key}:`, err);
            return this.getFallbackResponses(role, scenarioId);
        }
    }

    getFallbackResponses(role, scenarioId = null) {
        if (role && fallbackResponses[role]) {
            if (scenarioId && fallbackResponses[role][scenarioId]) {
                return fallbackResponses[role][scenarioId];
            }
            if (fallbackResponses[role]['generic_failure']) {
                return fallbackResponses[role]['generic_failure'];
            }
        }

        if (role === 'FO') {
            return ["(Silence)", "Copy that.", "I'm checking.", "Standby."];
        }
        return ["(Cabin Noise)", "Captain?", "Everything okay back here?"];
    }

    hydrateMessage(content) {
        if (!this.aircraftStateProvider) return content;
        
        const state = this.aircraftStateProvider();
        if (!state) return content;

        let output = content;

        // Altitude (round to nearest 100)
        if (state.altitude !== undefined) {
            const alt = Math.round(state.altitude / 100) * 100;
            output = output.replace(/\[ALTITUDE\]/g, `${alt}`);
        } else {
            output = output.replace(/\[ALTITUDE\]/g, `current altitude`);
        }

        // Airspeed (round to nearest 10)
        if (state.airspeed !== undefined) {
            const spd = Math.round(state.airspeed / 10) * 10;
            output = output.replace(/\[AIRSPEED\]/g, `${spd}`);
        } else {
            output = output.replace(/\[AIRSPEED\]/g, `current speed`);
        }

        // Heading (round to nearest 5)
        if (state.heading !== undefined) {
            const hdg = Math.round(state.heading / 5) * 5;
            output = output.replace(/\[HEADING\]/g, `${hdg.toString().padStart(3, '0')}`);
        } else {
            output = output.replace(/\[HEADING\]/g, `current heading`);
        }

        // Fuel (round to nearest 100)
        if (state.fuel !== undefined) {
            const fuel = Math.round(state.fuel / 100) * 100;
            output = output.replace(/\[FUEL\]/g, `${fuel} kg`);
        } else {
            output = output.replace(/\[FUEL\]/g, `fuel quantity`);
        }

        // Runways, Temps, Alarms etc (Fallbacks if not specific)
        output = output.replace(/\[RUNWAY\]/g, `the runway`);
        output = output.replace(/\[TEMP\]/g, `temperature`);
        output = output.replace(/\[PRESSURE\]/g, `pressure`);
        output = output.replace(/\[VOLTAGE\]/g, `voltage`);
        output = output.replace(/\[AMP\]/g, `amps`);
        output = output.replace(/\[CB_PANEL\]/g, `the panel`);
        output = output.replace(/\[CB_LABEL\]/g, `the breaker`);
        output = output.replace(/\[ALARM_NAME\]/g, `master warning`);

        return output;
    }

    async triggerResponse(scenarioId, role, force = false) {
        // Difficulty Logic: Latency & Ignored Requests
        const isHard = ['pro', 'devil'].includes(this.difficulty);
        
        // Chance to ignore (unless forced by summon)
        if (!force && isHard && Math.random() < 0.3) {
            console.log(`${role} ignored implicit trigger due to stress.`);
            return;
        }

        // Clear any pending timeout for this role to prevent overlapping messages
        if (this.pendingTimeouts.has(role)) {
            clearTimeout(this.pendingTimeouts.get(role));
            this.pendingTimeouts.delete(role);
        }

        // Latency simulation
        const baseLatency = isHard ? 2000 : 500;
        const randomLatency = Math.random() * (isHard ? 3000 : 1000);
        const delay = baseLatency + randomLatency;
        
        const timeoutId = setTimeout(async () => {
            this.pendingTimeouts.delete(role);

            const responses = await this.fetchResponses(scenarioId, role);
            
            // Pick random response
            let content = responses[Math.floor(Math.random() * responses.length)];
            
            // Hydrate specific data
            content = this.hydrateMessage(content);
            
            const payload = {
                sender: role === 'FO' ? 'First Officer' : 'Cabin Crew',
                content: content,
                timestamp: Date.now(),
                stress: this.crewState[role].stress,
                role: role
            };
            eventBus.publish(eventBus.Types.NPC_CREW_MESSAGE, payload);
            eventBus.publish('NPC_CREW_MESSAGE', payload);
            
            console.log(`[NPC ${role}] Says: "${content}"`);
            
        }, delay);
        
        this.pendingTimeouts.set(role, timeoutId);
    }

    handleFailure(data) {
        // Map failure type to scenario ID
        // data.type might be 'engine_fire', 'gear_failure', etc.
        const failureId = data.type || 'generic_failure';
        
        // Increase stress
        this.crewState.FO.stress = Math.min(100, this.crewState.FO.stress + 20);
        this.crewState.CABIN_CREW.stress = Math.min(100, this.crewState.CABIN_CREW.stress + 10);
        
        console.log(`NPC Stress Increased: FO=${this.crewState.FO.stress}, Cabin=${this.crewState.CABIN_CREW.stress}`);
        
        // Trigger FO response
        // Use the failure ID as scenario ID if it matches DB, otherwise generic
        this.triggerResponse(failureId, 'FO');
    }

    handlePhaseChange(data) {
        const phaseName = data.phase?.name?.toLowerCase() || '';
        
        let scenarioId = null;
        if (phaseName.includes('taxi')) scenarioId = 'taxi';
        else if (phaseName.includes('takeoff')) scenarioId = 'takeoff_roll';
        else if (phaseName.includes('climb')) scenarioId = 'climb';
        else if (phaseName.includes('cruise')) scenarioId = 'cruise';
        else if (phaseName.includes('descent')) scenarioId = 'descent';
        else if (phaseName.includes('approach')) scenarioId = 'approach';
        else if (phaseName.includes('landing')) scenarioId = 'landing';
        
        if (scenarioId) {
            // Only occasional comments in normal phases
            if (Math.random() < 0.3) {
                this.triggerResponse(scenarioId, 'FO');
            }
        }
    }

    // Public method for UI interaction
    summon(role) {
        console.log(`Summoning ${role}...`);
        
        // In high difficulty, summoning might fail or be delayed significantly
        const isHard = ['pro', 'devil'].includes(this.difficulty);
        
        if (isHard && Math.random() < 0.2) {
            // Ignored completely
            console.log(`${role} ignored summon!`);
            // Maybe show a "No Response" hint in UI?
            const payload = {
                sender: 'System',
                content: `${role === 'FO' ? 'First Officer' : 'Cabin Crew'} is not responding.`,
                timestamp: Date.now(),
                type: 'system'
            };
            eventBus.publish(eventBus.Types.NPC_CREW_MESSAGE, payload);
            eventBus.publish('NPC_CREW_MESSAGE', payload);
            return;
        }

        this.triggerResponse('summon', role, true);
    }
}

export const npcCrewService = new NPCCrewService();
