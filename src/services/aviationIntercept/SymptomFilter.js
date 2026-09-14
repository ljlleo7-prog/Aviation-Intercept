import { failureGraphManager } from './FailureGraphManager.js';

class SymptomFilter {
    filterSymptoms(activeFailures, physicsService) {
        const narratableSymptoms = [];

        activeFailures.forEach(failureId => {
            const symptoms = failureGraphManager.getSymptoms(failureId);
            symptoms.forEach(symptom => {
                let suppress = false;

                // Check instrument visibility
                if (symptom.instrument_related || symptom.instrumentRelated) {
                    // Check if instruments are powered/visible
                    // This is a simplification. Ideally we'd check specific instruments.
                    // Assuming if electrical main bus is active, instruments are visible.
                    const electrical = physicsService?.systems?.electrical;
                    const instrumentsPowered = electrical ? (electrical.gen1 || electrical.gen2 || electrical.stbyPower) : true;
                    
                    if (instrumentsPowered) {
                        suppress = true;
                    }
                }

                // Check physics perceptibility
                if (symptom.physics_related || symptom.physicsRelated) {
                    // If physics engine handles it (e.g., vibration, sound, motion), suppress text.
                    // Assuming physics engine always handles physics-related symptoms when active.
                    suppress = true;
                }

                if (!suppress) {
                    narratableSymptoms.push(symptom);
                }
            });
        });

        return narratableSymptoms;
    }
}

export const symptomFilter = new SymptomFilter();
