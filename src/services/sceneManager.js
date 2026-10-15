import eventBus, { EventTypes } from './eventBus.js';
import { sceneProgressionEnabled } from '../config/sceneProgression.js';
import { getRunwayHeading } from '../utils/routeGenerator.js';
import { getRandomTemplate } from './narrativeTemplates.js';
import narrativeData from '../data/narrativeDatabase.json';
import { checkStartupRequirements, StartupPhases } from './StartupChecklist.js';

// Flight phases with typical parameters
export const FlightPhases = {
  BOARDING: 'boarding',
  DEPARTURE_CLEARANCE: 'departure_clearance',
  PUSHBACK: 'pushback',
  TAXIING: 'taxiing',
  TAKEOFF_PREP: 'takeoff_prep',
  TAKEOFF: 'takeoff',
  CLIMB: 'climb',
  INITIAL_CLIMB: 'initial_climb',
  MAIN_CLIMB: 'main_climb',
  CRUISE: 'cruise',
  DESCENT: 'descent',
  APPROACH: 'approach',
  LANDING: 'landing',
  AFTER_LAND_TAXIING: 'after_land_taxiing',
  SHUTOFF: 'shutoff',
  EMERGENCY: 'emergency',
  POST_MORTEM: 'post_mortem'
};

// Default comprehensive scenario with realistic flight phases
// Note: Narrative text is now loaded from src/data/narrativeDatabase.json
// The 'narrative' properties in this object are legacy/fallback and overridden by the JSON database.
const defaultScenario = {
  id: 'realistic-flight-1',
  name: 'Realistic Transcontinental Flight',
  difficulty: 'medium',
  aircraftModel: 'Boeing 737-800',
  callsign: 'SKY123',
  departure: 'KJFK',
  arrival: 'KLAX',
  targetCruiseAltitude: 35000,
  
  // Flight phases with detailed parameters
  phases: [
    {
      id: 'phase-boarding',
      name: 'Boarding',
      type: FlightPhases.BOARDING,
      durationSeconds: 3600, // Long duration to allow setup without timeout
      physics: { mode: 'off' },
      narrative: {
        title: 'Boarding at ${departure}',
        content: 'The smell of jet fuel and coffee fills the cabin as passengers stow their luggage. Outside, the ground crew is prepping for our departure. "Welcome aboard ${callsign}," the flight attendant announces over the PA. The ${aircraft} is ready for the journey to ${arrival}.'
      }
    },
    {
      id: 'phase-departure-clearance',
      name: 'Departure Clearance',
      type: FlightPhases.DEPARTURE_CLEARANCE,
      durationSeconds: 3600,
      physics: { mode: 'off' },
      narrative: {
        title: 'IFR Clearance',
        content: 'The radio crackles. "${callsign}, cleared to ${arrival} via flight plan route. Climb and maintain FL350. Departure frequency 124.7. Squawk 4211." You read back the clearance as the systems come online.'
      }
    },
    {
      id: 'phase-pushback',
      name: 'Pushback & Start',
      type: FlightPhases.PUSHBACK,
      durationSeconds: 3600,
      physics: {
        mode: 'continuous',
        initialAltitude: 0,
        initialSpeed: 0
      },
      narrative: {
        title: 'Pushback Approved',
        content: 'A gentle jolt as the tug connects. "Ground to Cockpit, brakes released." The terminal building slowly drifts away as you start the engines. The hum of the APU is replaced by the roar of the main turbines.'
      }
    },
    {
      id: 'phase-taxiing',
      name: 'Taxi',
      type: FlightPhases.TAXIING,
      durationSeconds: 3600,
      physics: {
        mode: 'continuous',
        initialAltitude: 0,
        initialSpeed: 0
      },
      narrative: {
        title: 'Taxi to Runway ${departureRunway}',
        content: '"${callsign}, taxi to runway ${departureRunway} via Alpha, Bravo." You release the parking brake. The tires thump rhythmically over the concrete joints as you weave through the maze of taxiways. Sunlight glints off the tarmac.'
      }
    },
    {
      id: 'phase-takeoff-prep',
      name: 'Takeoff Preparation',
      type: FlightPhases.TAKEOFF_PREP,
      durationSeconds: 3600, // 1 hour (effectively indefinite until user action)
      physics: {
        mode: 'continuous',
        initialAltitude: 0,
        initialSpeed: 0
      },
      narrative: {
        title: 'Lined Up and Waiting',
        content: 'Lined up on runway ${departureRunway}. Brakes set. Engines at idle. "Tower, ${callsign} holding in position ${departureRunway}, ready for takeoff." Check flaps, trim, and verify takeoff data.'
      }
    },
    {
      id: 'phase-takeoff',
      name: 'Takeoff Roll',
      type: FlightPhases.TAKEOFF,
      durationSeconds: 30,
      physics: {
        mode: 'continuous',
        initialAltitude: 0,
        targetAltitude: 1000,
        targetSpeed: 150
      },
      narrative: {
        title: 'Takeoff Clearance',
        content: 'Lined up on runway ${departureRunway}. "Wind 130 at 8, runway ${departureRunway} cleared for takeoff." Throttles forward. The engines roar to life, pressing you back into the seat. Rotate at Vr.'
      }
    },
    {
      id: 'phase-initial-climb',
      name: 'Initial Climb',
      type: FlightPhases.INITIAL_CLIMB,
      durationSeconds: 120,
      physics: {
        mode: 'continuous',
        targetAltitude: 5000,
        targetSpeed: 250 // IAS
      },
      narrative: {
        title: 'Positive Rate',
        content: 'The ground falls away beneath you. "Gear up." Punching through the lower cloud layer into the sunlight. The city of ${departure} shrinks into a miniature grid below. Speed increasing to 250 knots.'
      }
    },
    {
      id: 'phase-main-climb',
      name: 'Main Climb',
      type: FlightPhases.MAIN_CLIMB,
      durationSeconds: 300,
      physics: {
        mode: 'continuous',
        targetAltitude: 35000,
        targetSpeed: 270 // IAS
      },
      narrative: {
        title: 'Climb to Cruise',
        content: 'Passing 10,000 feet. "Accelerate to cruise speed." The sky darkens to a deeper blue as we ascend. The air is smooth. Climbing steadily to Flight Level 350.'
      }
    },
    {
      id: 'phase-cruise',
      name: 'Cruise Flight',
      type: FlightPhases.CRUISE,
      durationSeconds: 3600, // Extended to 1 hour to prevent early descent
      physics: {
        mode: 'continuous',
        targetAltitude: 35000,
        targetSpeed: 250 // IAS at FL350 (about 450 KTAS in ISA conditions)
      },
      narrative: {
        title: 'Cruising at FL350',
        content: 'Level at 35,000 feet. The horizon is a curved line of haze. "Maintain Mach 0.78." The engines hum with a steady, reassuring rhythm. Passengers are settling in for the flight to ${arrival}.'
      },
      // Potential failure points during cruise
      failurePoints: [
        {
          id: 'failure-engine-1',
          type: 'engine',
          engineIndex: 0,
          probability: 0.3,
          triggerTime: 60
        },
        {
          id: 'failure-hydraulic',
          type: 'hydraulic',
          system: 'primary',
          probability: 0.2,
          triggerTime: 90
        }
      ]
    },
    {
      id: 'phase-descent',
      name: 'Descent Initiation',
      type: FlightPhases.DESCENT,
      durationSeconds: 120,
      physics: {
        mode: 'continuous',
        targetAltitude: 10000,
        targetSpeed: 300
      },
      narrative: {
        title: 'Top of Descent',
        content: 'Throttles back. The pitch drops slightly as we begin our descent. "Descend and maintain 10,000 feet." The destination ${arrival} lies ahead.'
      }
    },
    {
      id: 'phase-approach',
      name: 'Final Approach',
      type: FlightPhases.APPROACH,
      durationSeconds: 60,
      physics: {
        mode: 'continuous',
        targetAltitude: 2000,
        targetSpeed: 180
      },
      narrative: {
        title: 'Approach to ${arrival}',
        content: 'Lined up for runway ${landingRunway}. "Gear down, flaps 30." The runway threshold looms ahead through the haze. Speed checked, localized captured.'
      }
    },
    {
      id: 'phase-landing',
      name: 'Landing Roll',
      type: FlightPhases.LANDING,
      durationSeconds: 30,
      physics: {
        mode: 'continuous',
        targetAltitude: 0,
        targetSpeed: 0
      },
      narrative: {
        title: 'Touchdown',
        content: 'Flare... Touchdown. Spoilers deployed. Reverse thrust roaring. "${callsign}, welcome to ${arrival}." Braking to taxi speed.'
      }
    },
    {
      id: 'phase-after-land-taxiing',
      name: 'Taxi to Gate',
      type: FlightPhases.AFTER_LAND_TAXIING,
      durationSeconds: 30,
      physics: { mode: 'off' },
      narrative: {
        title: 'Taxi to Gate',
        content: '"Turn left next taxiway, contact Ground." The flight is over. Taxing past other aircraft to our assigned gate.'
      }
    },
    {
      id: 'phase-shutoff',
      name: 'Shutdown',
      type: FlightPhases.SHUTOFF,
      durationSeconds: 15,
      physics: { mode: 'off' },
      narrative: {
        title: 'Engine Shutdown',
        content: 'Parking brake set. Fuel cutoff. The engines spin down into silence. APU off. "Thank you for flying with us." Flight complete.'
      }
    }
  ]
};

export class SceneManager {
  constructor(scenario = defaultScenario) {
    this.scenario = scenario;
    this.currentIndex = 0;
    this.elapsedInPhase = 0;
    this.totalElapsed = 0;
    this.status = 'idle';
    this.lastCommand = null;
    this.activeFailures = new Map(); // Track active failures
    this.completedPhases = new Set(); // Track completed phases
    this.currentPhaseData = null; // Additional phase-specific data
    this.narrativeHistory = []; // Track narrative messages
    this.takeoffClearanceReceived = false;
    
    // Subscribe to clearance
    this.unsubscribeClearance = eventBus.subscribe('atc.clearance.takeoff', () => {
        console.log('✅ SceneManager: Takeoff Clearance Received');
        this.takeoffClearanceReceived = true;
    });
    
    // Set up command handling
    this.unsubscribeCommand = eventBus.subscribe('command.input', payload => {
      this.lastCommand = payload;
      eventBus.publishWithMetadata(EventTypes.COMMAND_EXECUTED, {
        scenarioId: this.scenario.id,
        phaseId: this.currentPhase()?.id,
        payload
      });
    });
    
    // Set up system failure resolution handling
    this.unsubscribeFailureResolved = eventBus.subscribe(EventTypes.FAILURE_RESOLVED, payload => {
      this.activeFailures.delete(payload.failureId);
    });
  }

  currentPhase() {
    return this.scenario.phases[this.currentIndex] || null;
  }
  
  // Get narrative based on difficulty
  getPhaseNarrative(phase) {
    const phaseData = narrativeData.phases[phase.type];
    
    if (phaseData) {
        let selectedData = null;
        
        // Try to get difficulty-specific narrative
        if (phaseData[this.scenario.difficulty]) {
            selectedData = phaseData[this.scenario.difficulty];
        }
        // Fallback to default in JSON
        else if (phaseData.default) {
            selectedData = phaseData.default;
        }

        if (selectedData) {
            // If it's an array, pick one randomly
            if (Array.isArray(selectedData)) {
                return selectedData[Math.floor(Math.random() * selectedData.length)];
            }
            return selectedData;
        }
    }
    
    // Fallback to legacy/scenario defined narrative
    return phase.narrative;
  }
  
  // Apply random template (unless rookie mode operational phase)
  applyNarrativeTemplate(narrative, phaseType) {
    if (this.scenario.difficulty === 'rookie' && 
        [FlightPhases.TAKEOFF_PREP, FlightPhases.TAKEOFF, FlightPhases.INITIAL_CLIMB].includes(phaseType)) {
        return narrative;
    }
    const template = getRandomTemplate(phaseType);
    if (template) {
        return { ...narrative, ...template };
    }
    return narrative;
  }

  // Skip the current phase (User Requested)
  skipPhase() {
    if (!sceneProgressionEnabled) return;
    const phase = this.currentPhase();
    if (phase) {
      console.log(`⏩ Skipping phase: ${phase.name}`);
      this.userSkipped = true; // Mark as user-initiated skip
      this.elapsedInPhase = phase.durationSeconds + 1; // Force completion
      this.checkPhaseCompletion(0, null); // Trigger completion check immediately
    }
  }

  start() {
    if (!this.currentPhase()) {
      return;
    }
    this.status = 'running';
    this.userSkipped = false;
    this.elapsedInPhase = 0;
    this.totalElapsed = 0;
    this.activeFailures.clear();
    this.completedPhases.clear();
    this.narrativeHistory = [];
    this.currentPhaseData = null;
    this.takeoffClearanceReceived = false;
    
    const initialPhase = this.currentPhase();
    
    // Publish phase started event
    eventBus.publishWithMetadata(EventTypes.PHASE_CHANGED, {
      scenarioId: this.scenario.id,
      phase: initialPhase,
      totalElapsed: this.totalElapsed
    });
    
    // Publish initial narrative
    const initialNarrative = this.getPhaseNarrative(initialPhase);
    if (initialNarrative) {
      let activeNarrative = this.applyNarrativeTemplate(initialNarrative, initialPhase.type);
      
      this.currentPhaseData = {
        startTime: Date.now(),
        activeNarrative
      };
      
      this.publishNarrative(activeNarrative);
    }
  }

  nextPhase() {
    if (!sceneProgressionEnabled) return;
    // Mark current phase as completed
    const currentPhase = this.currentPhase();
    if (currentPhase) {
      this.completedPhases.add(currentPhase.id);
      eventBus.publishWithMetadata(EventTypes.PHASE_COMPLETE, {
        scenarioId: this.scenario.id,
        phase: currentPhase,
        totalElapsed: this.totalElapsed,
        elapsedInPhase: this.elapsedInPhase
      });
    }
    
    // Move to next phase
    this.currentIndex += 1;
    this.elapsedInPhase = 0;
    this.userSkipped = false; // Reset skip flag for the new phase
    this.currentPhaseData = null;
    this.takeoffClearanceReceived = false;
    
    const nextPhase = this.currentPhase();
    if (!nextPhase) {
      this.status = 'completed';
      eventBus.publishWithMetadata('scenario.completed', {
        scenarioId: this.scenario.id,
        totalElapsed: this.totalElapsed,
        completedPhases: Array.from(this.completedPhases),
        activeFailures: Array.from(this.activeFailures.values())
      });
      return;
    }
    
    // Set initial physics conditions for the new phase
    this.setPhaseInitialConditions(nextPhase, currentPhase);

    // Publish phase changed event
    eventBus.publishWithMetadata(EventTypes.PHASE_CHANGED, {
      scenarioId: this.scenario.id,
      phase: nextPhase,
      totalElapsed: this.totalElapsed,
      previousPhase: currentPhase
    });
    
    // Publish narrative for new phase
    const nextNarrative = this.getPhaseNarrative(nextPhase);
    if (nextNarrative) {
      let activeNarrative = this.applyNarrativeTemplate(nextNarrative, nextPhase.type);
      
      // Store active narrative for updates
      this.currentPhaseData = { ...this.currentPhaseData, activeNarrative };
      
      this.publishNarrative(activeNarrative);
    }
  }

  // Update the scenario with new flight parameters
  updateScenario(newParams) {
    this.scenario = {
      ...this.scenario,
      ...newParams
    };
    
    // If running, update current phase narrative
    if (this.currentPhaseData && this.currentPhaseData.activeNarrative) {
      this.publishNarrative(this.currentPhaseData.activeNarrative);
    } else {
      const currentPhase = this.currentPhase();
      const currentNarrative = currentPhase ? this.getPhaseNarrative(currentPhase) : null;
      if (currentNarrative) {
        this.publishNarrative(currentNarrative);
      }
    }
    
    return this.scenario;
  }

  update(dt, payload = null) {
    if (this.status !== 'running') {
      return;
    }
    
    const phase = this.currentPhase();
    if (!phase) {
      this.status = 'completed';
      return;
    }
    
    this.elapsedInPhase += dt;
    this.totalElapsed += dt;
    
    // Check for failure triggers in current phase
    this.checkFailureTriggers(phase);
    
    // Update active failures
    this.updateActiveFailures(dt);
    
    // Publish phase tick event
    eventBus.publishWithMetadata('phase.tick', {
      scenarioId: this.scenario.id,
      phaseId: phase.id,
      phaseType: phase.type,
      elapsedInPhase: this.elapsedInPhase,
      totalElapsed: this.totalElapsed,
      activeFailures: Array.from(this.activeFailures.values()),
      physicsActive: this.physicsActive()
    });
    
    this.checkPhaseCompletion(dt, payload);
  }

  checkPhaseCompletion(dt, payload) {
    if (!sceneProgressionEnabled) return;
    const phase = this.currentPhase();
    if (!phase) return;

    // Check if phase is complete
    let isPhaseComplete = false;
    
    // Condition-based completion for specific phases
    if (phase.type === FlightPhases.TAKEOFF) {
      const altitude_m = payload?.position?.z || 0;
      const altitude_ft = altitude_m * 3.28084;
      
      // Calculate vertical speed safely (support both structure types)
      let verticalSpeed_fpm = 0;
      if (typeof payload?.velocity?.z === 'number') {
        verticalSpeed_fpm = payload.velocity.z * 60 * 3.28084; // m/s to ft/min
      } else if (typeof payload?.velocity?.w === 'number') {
        verticalSpeed_fpm = payload.velocity.w * 60; // Assuming ft/s if using w (legacy)
      } else if (payload?.verticalSpeed) {
        verticalSpeed_fpm = payload.verticalSpeed; // Direct value if available
      }
      
      // Transition from TAKEOFF to INITIAL_CLIMB
      // Relaxed conditions to ensure smooth transition
      if (
        verticalSpeed_fpm > 200 && // Positive climb rate
        altitude_ft >= 400 // Lowered from 800 to 400 to catch early climb
      ) {
        isPhaseComplete = true;
      }
    } else if (phase.type === FlightPhases.TAKEOFF_PREP) {
      // Transition ONLY on ATC Clearance
      if (this.takeoffClearanceReceived) {
        const isHardcore = ['pro', 'devil'].includes(this.scenario.difficulty.toLowerCase());
        
        if (isHardcore) {
            // In Pro mode, wait for user to apply power for takeoff OR click Continue
             // This prevents jarring transition immediately upon clearance
             // Check throttle input (0-1) or engine N1 if available
             const throttleInput = payload?.controls?.throttle || payload?.throttle || 0;
             // Try to get N1 from systems (OverheadLogic sync) or engineParams (Physics output)
             const engineN1 = payload?.engineParams?.n1?.[0] || payload?.systems?.engines?.eng1?.n1 || 0;
             
             // Trigger if throttle is advanced (> 40%) or user clicked continue
             if (this.userSkipped || throttleInput > 0.4 || engineN1 > 40) {
                 isPhaseComplete = true;
             }
        } else {
            // Normal mode: Auto-advance on clearance
            isPhaseComplete = true;
        }
      }
    } else if (phase.type === FlightPhases.INITIAL_CLIMB) {
      const altitude_m = payload?.position?.z || 0;
      const altitude_ft = altitude_m * 3.28084;
      
      // Transition from INITIAL_CLIMB to MAIN_CLIMB
      if (altitude_ft >= 5000) { // Lowered from 10000 to ensure progression
        isPhaseComplete = true;
      }
    } else if (phase.type === FlightPhases.MAIN_CLIMB) {
      const altitude_m = payload?.position?.z || 0;
      const altitude_ft = altitude_m * 3.28084;
      
      // Transition from MAIN_CLIMB to CRUISE
      // Allow transition if within 1000ft of cruise altitude
      if (altitude_ft >= (this.scenario.targetCruiseAltitude - 1000)) {
        isPhaseComplete = true;
      }
    } else if (phase.type === FlightPhases.CRUISE) {
        // Transition from CRUISE to DESCENT based on distance to destination
        if (this.scenario.arrival && payload?.geo) {
            const arrivalAirport = airportService.getAirportByCode(this.scenario.arrival);
            if (arrivalAirport) {
                const distance = airportService.calculateDistance(
                    { latitude: payload.geo.latitude, longitude: payload.geo.longitude },
                    { latitude: arrivalAirport.latitude, longitude: arrivalAirport.longitude }
                );
                
                // Trigger descent if distance <= 200 nm
                if (distance <= 200) {
                    isPhaseComplete = true;
                    console.log(`📉 Initiating descent: Distance to ${this.scenario.arrival} is ${distance}nm`);
                }
            }
        }
    } else if (phase.type === FlightPhases.PUSHBACK) {
        const isHardcore = ['pro', 'devil'].includes(this.scenario.difficulty.toLowerCase());
        // Wait for engines to start (N2 > 15% - Idle is 20%) or significant time pass
        const enginesRunning = payload?.systems?.engines && Object.values(payload.systems.engines).some(e => e.n2 > 15);
        
        if (isHardcore) {
            // In Pro mode, we require checklist completion AND manual continue
             if (payload && payload.systems) {
               // Use systems.engines because payload.engines might be empty/undefined in outputState
               const checklistResult = checkStartupRequirements(StartupPhases.ENGINE_START, payload.systems, payload.systems.engines);
               
               // User requested to DISABLE the barrier.
               // So we allow progression if the user clicks Continue (this.userSkipped), regardless of checklist.
               if (this.userSkipped) {
                   isPhaseComplete = true;
               } else {
                   isPhaseComplete = false;
                   // Warn logic (simplified)
                   if (this.elapsedInPhase >= phase.durationSeconds && checklistResult.missingItems.length > 0) {
                        const timeOver = Math.floor(this.elapsedInPhase - phase.durationSeconds);
                        if (timeOver > 0 && timeOver % 15 === 5) {
                            const lastWarnTime = this.lastChecklistWarningTime || 0;
                            const now = Date.now();
                            if (now - lastWarnTime > 2000) {
                                this.publishNarrative({
                                    title: 'Startup Checklist Incomplete',
                                    content: `Cannot proceed to next phase. Missing: ${checklistResult.missingItems.join(', ')}`,
                                    severity: 'warning'
                                });
                                this.lastChecklistWarningTime = now;
                            }
                        }
                   }
               }
            } else {
                // Fallback if systems payload missing
                if (this.userSkipped) isPhaseComplete = true;
                else isPhaseComplete = false;
            }
        } else {
            // Normal mode: Auto-complete if engines running OR User Manual Continue
            // Fix: Added this.userSkipped check so Rookies aren't stuck waiting for timer
            if (this.userSkipped || (this.elapsedInPhase > 20 && enginesRunning)) {
                isPhaseComplete = true;
            } else if (this.elapsedInPhase > 300) {
                isPhaseComplete = true; // Timeout
            }
        }
    } else if (phase.type === FlightPhases.TAXIING) {
        const isHardcore = ['pro', 'devil'].includes(this.scenario.difficulty.toLowerCase());
        
        if (isHardcore) {
             // In Pro mode, Taxiing ends ONLY when user clicks Continue (presumably at Hold Short)
             if (this.userSkipped) {
                 isPhaseComplete = true;
             } else {
                 isPhaseComplete = false;
             }
        } else {
            // Wait for taxi (speed > 5 kts) and duration
            const groundSpeed = payload?.derived?.groundSpeed ?? payload?.groundSpeed ?? payload?.airspeed ?? 0;
            // Fix: Allow manual continue for Rookies too
            if (this.userSkipped) {
                isPhaseComplete = true;
            } else if (this.elapsedInPhase > 30 && groundSpeed > 5) {
                 // Maybe wait until aligned? Hard to detect without runway logic.
                 // Just give them more time.
                 if (this.elapsedInPhase > 120) isPhaseComplete = true;
            } else if (this.elapsedInPhase > 300) {
                isPhaseComplete = true; // Timeout
            }
        }
    } else {
      // Default: time-based completion
      const isHardcore = ['pro', 'devil'].includes(this.scenario.difficulty.toLowerCase());
      
      // If Pro/Devil, disable time-based completion for ALL phases to enforce user control
      // Exceptions: purely physics-driven phases that have their own logic above (Takeoff, Climb, etc.)
      // But this 'else' block only catches phases that fell through the specific checks above.
      // So effectively, we are disabling the "durationSeconds" timeout for Boarding, Cruise, Taxi, etc.
      if (isHardcore) {
          // For startup phases, we also enforce the checklist (already handled or we handle it here)
          const isStartupPhase = [FlightPhases.BOARDING, FlightPhases.DEPARTURE_CLEARANCE, FlightPhases.PUSHBACK].includes(phase.type);
          
          if (isStartupPhase && payload && payload.systems) {
               // Enforce checklist
               const checklistResult = checkStartupRequirements(
                  phase.type === FlightPhases.PUSHBACK ? StartupPhases.ENGINE_START : StartupPhases.POWER_UP, 
                  payload.systems, 
                  payload.engines || []
               );
               
               // FORCE ALLOW if user skipped, regardless of checklist
               if (this.userSkipped) {
                   isPhaseComplete = true;
               } else {
                   isPhaseComplete = false;
                   // Warn if timeout passed?
                   if (this.elapsedInPhase >= phase.durationSeconds && checklistResult.missingItems.length > 0) {
                        const timeOver = Math.floor(this.elapsedInPhase - phase.durationSeconds);
                        if (timeOver > 0 && timeOver % 15 === 5) {
                            const lastWarnTime = this.lastChecklistWarningTime || 0;
                            const now = Date.now();
                            if (now - lastWarnTime > 2000) {
                                this.publishNarrative({
                                    title: 'Startup Checklist Incomplete',
                                    content: `Cannot proceed to next phase. Missing: ${checklistResult.missingItems.join(', ')}`,
                                    severity: 'warning'
                                });
                                this.lastChecklistWarningTime = now;
                            }
                        }
                   }
               }
          } else {
               // Non-startup phases (e.g. Cruise, Taxi, Shutoff) in Hardcore mode
               // STRICTLY require user to click Continue. NEVER auto-complete on time.
               if (this.userSkipped) {
                   isPhaseComplete = true;
               } else {
                   isPhaseComplete = false;
               }
          }
      } else {
          // Rookie/Captain modes: Auto-complete when time is up
          // Fix: Allow manual continue here too
          isPhaseComplete = this.userSkipped || (this.elapsedInPhase >= phase.durationSeconds);
      }
    }

    if (isPhaseComplete) {
      eventBus.publishWithMetadata('phase.ended', {
        scenarioId: this.scenario.id,
        phaseId: phase.id,
        elapsedInPhase: this.elapsedInPhase
      });
      this.nextPhase();
    }
  }

  // Check for failure points to trigger in current phase
  checkFailureTriggers(phase) {
    return; // DISABLED: User requested to disable failures for now
    if (!phase.failurePoints) return;
    
    for (const failurePoint of phase.failurePoints) {
      // Skip already triggered failures
      if (this.activeFailures.has(failurePoint.id)) continue;
      
      // Check if trigger time has been reached
      if (this.elapsedInPhase >= failurePoint.triggerTime) {
        // Randomly trigger based on probability
        if (Math.random() <= failurePoint.probability) {
          this.triggerFailure(failurePoint);
        }
      }
    }
  }
  
  // Trigger a system failure
  triggerFailure(failurePoint) {
    const failure = {
      id: failurePoint.id,
      type: failurePoint.type,
      severity: 'minor', // Initial severity
      progress: 0, // 0-100% progression
      startTime: this.totalElapsed,
      data: { ...failurePoint },
      isCritical: false,
      timeToCritical: null
    };
    
    this.activeFailures.set(failure.id, failure);
    
    // Publish failure occurred event
    eventBus.publishWithMetadata(EventTypes.FAILURE_OCCURRED, {
      failureId: failure.id,
      failure,
      phaseId: this.currentPhase()?.id,
      scenarioId: this.scenario.id,
      totalElapsed: this.totalElapsed
    });
    
    // Create narrative for failure
    this.publishNarrative({
      title: 'System Alert',
      content: this.getFailureNarrative(failure),
      severity: 'warning'
    });
  }
  
  // Update active failures progression
  updateActiveFailures(dt) {
    for (const [failureId, failure] of this.activeFailures.entries()) {
      // Update failure progress
      failure.progress += dt * (5 + Math.random() * 10); // 5-15% per second
      
      // Check if failure has become critical
      if (failure.progress >= 75 && !failure.isCritical) {
        failure.isCritical = true;
        failure.timeToCritical = this.totalElapsed;
        
        eventBus.publishWithMetadata(EventTypes.FAILURE_PROGRESSED, {
          failureId: failure.id,
          failure,
          phaseId: this.currentPhase()?.id,
          scenarioId: this.scenario.id,
          totalElapsed: this.totalElapsed
        });
        
        this.publishNarrative({
          title: 'Critical Failure Alert',
          content: this.getCriticalFailureNarrative(failure),
          severity: 'critical'
        });
      }
      
      // Check if failure is complete (100% progression)
      if (failure.progress >= 100) {
        this.resolveFailure(failureId, false); // False = not resolved by user
      }
    }
  }
  
  // Resolve a failure (either by user action or natural completion)
  resolveFailure(failureId, resolvedByUser = true) {
    const failure = this.activeFailures.get(failureId);
    if (!failure) return;
    
    eventBus.publishWithMetadata(EventTypes.FAILURE_RESOLVED, {
      failureId: failure.id,
      failure,
      resolvedByUser,
      phaseId: this.currentPhase()?.id,
      scenarioId: this.scenario.id,
      totalElapsed: this.totalElapsed
    });
    
    this.activeFailures.delete(failureId);
    
    if (resolvedByUser) {
      this.publishNarrative({
        title: 'System Restored',
        content: this.getResolutionNarrative(failure),
        severity: 'success'
      });
    }
  }
  
  // Publish narrative message
  publishNarrative(narrative) {
    // If we have data, we should pass it along so the UI can interpolate it
    // But we should NOT try to interpolate the English string here if we want translation support
    
    // Check if the title/content is a key (e.g. "narrative.phases.boarding.title")
    // If it is, we pass it as is. If it's a raw string, we also pass it as is.
    
    // HOWEVER, for legacy support, if we are interpolating variables into English text,
    // we need to be careful. The new system expects keys.
    
    // Correct approach: Pass the key and the data separately.
    // The UI (LanguageContext) will handle looking up the key and interpolating the data.
    
    const narrativeEntry = {
      id: `narrative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: this.totalElapsed,
      phaseId: this.currentPhase()?.id,
      title: narrative.title, // Pass raw key
      content: narrative.content, // Pass raw key
      severity: narrative.severity,
      // Enrich data with scenario context for interpolation
      data: {
        callsign: this.scenario.callsign || 'Flight 123',
        departure: this.scenario.departure || 'Unknown',
        arrival: this.scenario.arrival || 'Unknown',
        aircraft: this.scenario.aircraftModel || 'Unknown Aircraft',
        difficulty: this.scenario.difficulty || 'Unknown',
        ...narrative.data
      }
    };
    
    this.narrativeHistory.push(narrativeEntry);
    eventBus.publishWithMetadata(EventTypes.NARRATIVE_UPDATE, narrativeEntry);
    
    // Publish critical messages as separate events
    if (narrative.severity === 'critical') {
      eventBus.publishWithMetadata(EventTypes.CRITICAL_MESSAGE, narrativeEntry);
    }
  }
  
  // Parse template with dynamic data
  parseTemplate(template, data) {
    if (!template) return '';
    
    // Create a context with scenario data and provided data
    const context = {
      callsign: this.scenario.callsign || 'Flight 123',
      departure: this.scenario.departure || 'Unknown',
      arrival: this.scenario.arrival || 'Unknown',
      aircraft: this.scenario.aircraftModel || 'Unknown Aircraft',
      difficulty: this.scenario.difficulty || 'Unknown',
      ...data
    };
    
    // Replace variables in template
    return template.replace(/\${([^}]+)}/g, (match, key) => {
      const trimmedKey = key.trim();
      // Handle nested properties (e.g., ${some.object.prop})
      const value = trimmedKey.split('.').reduce((obj, prop) => {
        return obj && obj[prop] !== undefined ? obj[prop] : undefined;
      }, context);
      
      return value !== undefined ? value : match;
    });
  }

  // Generate narrative text for failures
  getFailureNarrative(failure) {
    const failureData = narrativeData.failures[failure.type] || narrativeData.defaults.failure;
    // Return key, not interpolated string
    return failureData.minor;
  }
  
  // Generate critical failure narrative
  getCriticalFailureNarrative(failure) {
    const failureData = narrativeData.failures[failure.type] || narrativeData.defaults.failure;
    // Return key
    return failureData.critical;
  }
  
  // Generate resolution narrative
  getResolutionNarrative(failure) {
    const failureData = narrativeData.failures[failure.type] || narrativeData.defaults.failure;
    // Return key
    return failureData.resolved;
  }

  physicsActive() {
    if (!sceneProgressionEnabled) return true;
    const phase = this.currentPhase();
    if (!phase || !phase.physics) {
      return false;
    }
    if (phase.physics.mode === 'off') {
      return false;
    }
    if (phase.physics.mode === 'continuous') {
      return true;
    }
    if (phase.physics.mode === 'window') {
      const limit = typeof phase.physics.activeUntilSeconds === 'number'
        ? phase.physics.activeUntilSeconds
        : phase.durationSeconds;
      return this.elapsedInPhase <= limit;
    }
    return false;
  }

  getState() {
    const phase = this.currentPhase();
    return {
      scenarioId: this.scenario.id,
      status: this.status,
      phaseId: phase ? phase.id : null,
      phaseName: phase ? phase.name : null,
      phaseType: phase ? phase.type : null,
      elapsedInPhase: this.elapsedInPhase,
      totalElapsed: this.totalElapsed,
      physicsActive: this.physicsActive(),
      activeFailures: Array.from(this.activeFailures.values()),
      completedPhases: Array.from(this.completedPhases),
      lastCommand: this.lastCommand,
      takeoffClearanceReceived: this.takeoffClearanceReceived,
      narrativeHistory: this.narrativeHistory.slice(-5) // Return last 5 narrative entries
    };
  }

  // Set initial physics conditions for the current phase
  setPhaseInitialConditions(phase, previousPhase = null) {
    if (!sceneProgressionEnabled) return;
    if (!phase || !phase.physics) {
      return;
    }

    const physics = phase.physics;
    
    // Logic: If transitioning from PHY-ON (continuous) to PHY-ON (continuous),
    // we should NOT reset physics state (teleport) unless explicitly forced.
    // This allows smooth transitions between Climb, Cruise, Descent, etc.
    const isPreviousContinuous = previousPhase && previousPhase.physics && previousPhase.physics.mode === 'continuous';
    const isNextContinuous = physics.mode === 'continuous';
    const isLiveTakeoffHandoff = previousPhase?.type === FlightPhases.TAKEOFF_PREP && phase.type === FlightPhases.TAKEOFF;
    const shouldSkipReset = (isPreviousContinuous && isNextContinuous && !physics.forceReset) || isLiveTakeoffHandoff;

    if (shouldSkipReset) {
      // Just update targets without resetting position/velocity
      const minimalConditions = {};

      // Special case: Release brakes when transitioning to Takeoff from Prep
      if (phase.type === FlightPhases.TAKEOFF) {
        minimalConditions.brakes = 0;
      }

       eventBus.publishWithMetadata(EventTypes.PHYSICS_INITIALIZE, {
        phaseId: phase.id,
        phaseType: phase.type,
        // Pass minimal conditions if any (e.g. brake release)
        initialConditions: Object.keys(minimalConditions).length > 0 ? minimalConditions : undefined,
        // DISABLED: Do not update AP targets during continuous transitions
        // targetAltitude: physics.targetAltitude ? physics.targetAltitude * 0.3048 : undefined,
        // targetSpeed: physics.targetSpeed ? physics.targetSpeed * 0.514444 : undefined,
        // targetHeading: physics.targetHeading ? physics.targetHeading * Math.PI / 180 : undefined
      });
      return;
    }

    const initialConditions = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { u: 0, v: 0, w: 0 },
      orientation: { phi: 0, theta: 0, psi: 0 },
      throttle: 0
      // Gear is omitted here to preserve current state in physics service
      // Unless explicitly set by a phase below
    };

    // Apply phase-specific physics settings
    if (physics.initialAltitude !== undefined) {
      // Convert to meters if altitude is in feet
      initialConditions.position.z = physics.initialAltitude * 0.3048;
    }

    if (physics.initialSpeed !== undefined) {
      // Convert to m/s if speed is in knots
      initialConditions.velocity.u = physics.initialSpeed * 0.514444;
    }

    if (physics.initialHeading !== undefined) {
      // Convert to radians if heading is in degrees
      initialConditions.orientation.psi = physics.initialHeading * Math.PI / 180;
    }

    // Handle takeoff and takeoff prep
    if (phase.type === FlightPhases.TAKEOFF || phase.type === FlightPhases.TAKEOFF_PREP) {
      // Always start on the ground with zero speed for takeoff/prep
      initialConditions.position.z = 0;
      initialConditions.velocity.u = 0;
      initialConditions.velocity.v = 0;
      initialConditions.velocity.w = 0;
      initialConditions.orientation.theta = 0;
      initialConditions.gear = true; // Explicitly DOWN for takeoff
      
      // Set initial heading based on departure airport runway (default to 130 degrees for runway 13R)
      let runwayHeading = 130;
      if (this.scenario.initialHeading !== undefined) {
        runwayHeading = this.scenario.initialHeading;
      } else {
        runwayHeading = this.getDepartureRunwayHeading() || 130;
      }
      initialConditions.orientation.psi = runwayHeading * Math.PI / 180;
      
      // Apply takeoff configuration
      if (phase.type === FlightPhases.TAKEOFF_PREP) {
        initialConditions.throttle = 0.0; // Idle
        initialConditions.brakes = 0; // Keep rollout/taxi under user control in live ground phases
      } else {
        initialConditions.throttle = 0.4; // Initial power for takeoff (if starting directly)
        initialConditions.brakes = 0; // Release brakes
      }
    }

    // Publish initial conditions event
    eventBus.publishWithMetadata(EventTypes.PHYSICS_INITIALIZE, {
      phaseId: phase.id,
      phaseType: phase.type,
      initialConditions,
      targetAltitude: physics.targetAltitude ? physics.targetAltitude * 0.3048 : undefined,
      targetSpeed: physics.targetSpeed, // AP speed targets are IAS in knots
      targetHeading: physics.targetHeading ? physics.targetHeading * Math.PI / 180 : undefined // Add target heading
    });
  }

  getDepartureRunwayHeading() {
    const runway = this.scenario?.departureRunway;
    if (typeof runway === 'string' && runway.length > 0) {
      return getRunwayHeading(runway);
    }
    return 130;
  }
}

// Create a singleton instance
const instance = new SceneManager();
export default instance;
