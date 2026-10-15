
/**
 * Base class for all failure instances.
 * Handles stages, progression, and state management.
 */
class BaseFailure {
    constructor(def, context = {}, onTransition = null) {
        this.id = def.id;
        this.name = def.name;
        this.category = def.category;
        this.stages = def.stages || { inactive: { next: 'active' }, active: {} };
        this.onTransitionCallback = onTransition;
        
        // State
        this.currentStage = 'inactive';
        this.timeInStage = 0;
        this.totalTime = 0;
        this.intensity = 0; // 0.0 to 1.0
        
        // Nuance (Random variations per instance)
        this.variation = {
            progressionRate: 0.8 + Math.random() * 0.4, // +/- 20% speed
            maxIntensity: 0.7 + Math.random() * 0.3, // Not always 100% catastrophic
            fluctuation: Math.random(), // Seed for noise
            context: { ...context } // Specifics like engineIndex
        };

        // History
        this.logs = [];
    }

    update(dt, flightState) {
        this.timeInStage += dt;
        this.totalTime += dt;

        const stageDef = this.stages[this.currentStage];
        if (!stageDef) return;

        // Check for stage progression
        if (stageDef.next && stageDef.duration) {
            // Resolve duration (Function or Value)
            let rawDuration = stageDef.duration;
            if (typeof rawDuration === 'function') {
                rawDuration = rawDuration(this.variation.context);
            }

            // Variation applied to duration
            const duration = rawDuration * (1 / this.variation.progressionRate);
            if (this.timeInStage > duration) {
                this.transitionTo(stageDef.next);
            }
        }
        
        // Calculate Intensity (Ramp up logic usually)
        if (stageDef.intensityTarget !== undefined) {
            const rate = (stageDef.intensityRate || 0.1) * dt;
            if (this.intensity < stageDef.intensityTarget) {
                this.intensity = Math.min(stageDef.intensityTarget, this.intensity + rate);
            }
        }
    }

    transitionTo(stageName) {
        if (this.currentStage === stageName) return;
        
        const oldStage = this.currentStage;
        this.currentStage = stageName;
        this.timeInStage = 0;
        
        const stageDef = this.stages[stageName];
        const desc = this.getDescription();
        
        this.logs.push({
            time: this.totalTime,
            from: oldStage,
            to: stageName,
            message: desc
        });

        if (this.onTransitionCallback) {
            this.onTransitionCallback(this, desc);
        }

        console.log(`[Failure] ${this.name} transitioned: ${oldStage} -> ${stageName}`);
    }

    getDescription() {
        const stageDef = this.stages[this.currentStage];
        let desc = stageDef?.description || `${this.name} is ${this.currentStage}`;

        if (typeof stageDef?.description === 'function') {
            desc = stageDef.description(this.variation.context);
        }
        
        // Normalize to object
        if (typeof desc === 'string') {
            return { text: desc };
        }
        return desc;
    }

    // To be overridden or defined in definition
    apply(physicsService) {
        const stageDef = this.stages[this.currentStage];
        if (!stageDef) return;
        if (typeof physicsService?.setFailureParams === 'function') {
            const params = typeof stageDef.params === 'function'
                ? stageDef.params(this.variation.context, this.intensity)
                : stageDef.params;
            const parameters = typeof stageDef.parameters === 'function'
                ? stageDef.parameters(this.variation.context, this.intensity)
                : stageDef.parameters;
            if (params) physicsService.setFailureParams(params);
            if (parameters) physicsService.setFailureParams(parameters);
        }
        if (typeof stageDef.effect === 'function') {
            const previousEvent = physicsService.failureDamageEventId;
            physicsService.failureDamageEventId = `failure-${this.id}-${this.instanceId ?? 0}`;
            try {
                stageDef.effect(physicsService, this.intensity, this.variation.context);
            } finally {
                physicsService.failureDamageEventId = previousEvent;
            }
        }
    }
}

export default BaseFailure;
