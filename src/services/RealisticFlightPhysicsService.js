
/**
 * Realistic Flight Physics Service (6-DOF Rigid Body Dynamics)
 * 
 * A high-fidelity physics model based on standard equations of motion for a rigid body.
 * Uses Quaternion for attitude tracking to avoid gimbal lock.
 * Implements standard ISA atmosphere, aerodynamic coefficients, and landing gear dynamics.
 * 
 * Coordinate Systems:
 * - Internal Physics: NED (North-East-Down) for Earth, FRD (Forward-Right-Down) for Body.
 * - External Interface: ENU (East-North-Up) or project specific (Z-Up) converted at boundaries.
 */

import EnginePhysicsService from './EnginePhysicsService.js';
import FADECService from './FADECService.js';
import RealisticAutopilotService from './RealisticAutopilotService.js';
import FailureHandler from './failures/FailureHandler.js';
import WarningSystem from './WarningSystem.js';
import StructuralLimitsService from './physics/StructuralLimitsService.js';
import { airportService } from './airportService.js';
import { Vector3, Quaternion, calculateDistanceMeters } from '../utils/flightMath.js';
import EnvironmentService from './physics/EnvironmentService.js';
import GroundInteractionService from './physics/GroundInteractionService.js';
import SystemsService from './physics/SystemsService.js';
import AerodynamicsService from './physics/AerodynamicsService.js';
import NavigationService from './physics/NavigationService.js';
import AircraftSystemModel from './systems/AircraftSystemModel.js';

// ==========================================
// Main Service
// ==========================================

class RealisticFlightPhysicsService {
    constructor(aircraftData, initialLat = 0, initialLon = 0, difficulty = 'rookie') {
        this.aircraft = this.validateAndParseAircraft(aircraftData);
        
        // Physical Constants
        this.CONSTANTS = {
            G: 9.80665,
            R_GAS: 287.05,
            GAMMA: 1.4,
            SEA_LEVEL_PRESSURE: 101325,
            SEA_LEVEL_DENSITY: 1.225,
            SEA_LEVEL_TEMP: 288.15,
            TEMP_LAPSE_RATE: -0.0065
        };

        // Initial State (Internal Physics uses NED: North, East, Down)
        this.state = {
            // Position (Earth Fixed NED)
            pos: new Vector3(0, 0, -this.aircraft.gearHeight), // Start ON THE GROUND
            geo: { lat: initialLat, lon: initialLon },
            
            // Velocity (Body Frame FRD: Forward, Right, Down) - u, v, w
            vel: new Vector3(0, 0, 0),
            
            // Attitude (Quaternion) - Body to Earth
            quat: new Quaternion(),
            
            // Angular Velocity (Body Frame) - p, q, r
            rates: new Vector3(0, 0, 0),
            
            // Mass Properties
            mass: this.aircraft.mass,
            fuel: (typeof aircraftData.fuelWeight === 'number' ? aircraftData.fuelWeight : (this.aircraft.maxFuelCapacity ?? 10000))
        };
        
        // Payload Mass (Pax + Cargo)
        this.payloadMass = typeof aircraftData.payloadWeight === 'number' ? aircraftData.payloadWeight : ((this.aircraft.maxPayload || 15000) * 0.7);

        // Control State
        this.controls = {
            throttle: 0,
            engineThrottles: Array(this.aircraft.engineCount).fill(0), // Individual throttles
            aileron: 0, // -1 to 1 (Roll)
            elevator: 0, // -1 to 1 (Pitch)
            rudder: 0,   // -1 to 1 (Yaw)
            flaps: 0,    // 0 to 1
            gear: 1,     // 0 (up) to 1 (down)
            airBrakes: 0,
            wheelBrakes: 0,   // Start released so pushback/taxi can move once motion is enabled
            trim: 0      // Pitch trim
        };

        // Failure Simulation State
        this.controlLag = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0, flaps: 1.0 };
        this.controlEffectiveness = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0, flaps: 1.0, spoilers: 1.0 };
        this.vibrationLevel = 0;
        this.navigationPath = [];
        this._prevDistToWaypoint = Infinity;
        this._lastWaypointIndex = null;

        // Failure Parameters (Generic)
        this.failureParams = {
            movement_restricted: { aileron: false, elevator: false, rudder: false, flaps: false, gear: false },
            control_sensitivity: { aileron: 1.0, elevator: 1.0, rudder: 1.0, flaps: 1.0, gear: 1.0 },
            structural_health: 1.0,
            stress_limit_reduction: 0,
            aerodynamic_efficiency: 1.0,
            friction_increase: 0,
            quantity_rate: {}, // e.g. { hydraulicA: 0.1, fuel: 0.5 } (units per second)
            data_integrity: 1.0 // 1.0 = perfect, <1.0 = noise/errors
        };

        // Engine State
        const reverseCapableList = this.aircraft.engineReverseCapable; // per-engine array or undefined
        this.engines = Array(this.aircraft.engineCount).fill(0).map((_, i) => {
            const uncertainty = 0.95 + Math.random() * 0.10;
            const reverseCapable = Array.isArray(reverseCapableList)
                ? (reverseCapableList[i] !== false)
                : true;
            return new EnginePhysicsService({
                maxThrust: this.aircraft.maxThrust,
                specificFuelConsumption: this.aircraft.specificFuelConsumption,
                responsiveness: uncertainty,
                maxN1: this.aircraft.maxN1 || 102,
                operationalMaxN1: this.aircraft.operationalMaxN1 || 98.4,
                emergencyMaxN1: this.aircraft.emergencyMaxN1 || this.aircraft.maxN1 || 102,
                egtYellow: this.aircraft.egtYellow || 750,
                egtRed: this.aircraft.egtRed || 850,
                reverseCapable,
            });
        });

        // FADEC — Airbus only (fadec: true in static.json)
        this.fadec = this.aircraft.fadec ? new FADECService(this.aircraft.family || this.aircraft.icao) : null;

        // Simulation Metadata
        this.crashed = false;
        this.onGround = true;
        this.crashReason = "";
        this.time = 0;
        this.runwayGeometry = null;
        this.groundStatus = { status: 'UNKNOWN', remainingLength: 0 };
        this.objectCollisionTimer = 0;
        this.difficulty = difficulty; // Set from constructor
        this.groundMode = false; // Ground operations mode (suppress flight warnings)
        // Initialize airport elevation from config (converted from feet to meters if provided)
        this.airportElevation = (aircraftData.airportElevation || 0) * 0.3048; 
        console.log("Physics Init: Elevation Data", {
            inputFt: aircraftData.airportElevation,
            convertedM: this.airportElevation,
            gearHeight: this.aircraft.gearHeight
        });

        this.terrainElevation = null; // AMSL in meters
        this.currentGroundZ = 0; // NED Z coordinate of ground (runway level in local frame)
        this.environment = {
            wind: new Vector3(0, 0, 0),
            baseWind: new Vector3(0, 0, 0),
            gust: 0,
            gustTarget: 0,
            gustTimer: 0,
            shear: new Vector3(0, 0, 0),
            shearTarget: new Vector3(0, 0, 0),
            shearTimer: 0,
            gustStrength: 0,
            shearStrength: 0,
            turbulence: 0,
            precipitation: 0,
            cloudCover: 0,
            temperature: null,
            windDirection: 0,
            windSpeed: 0,
            windGust: 0,
            windShear: 0,
            weatherCode: 0
        };
        this.icingState = { level: 0, rate: 0 };

        // If starting on ground, spawn at 0 AGL (runway level) with gear height above ground.
        // Internal Z is always relative to runway; AMSL is derived later as:
        // altitudeAMSL = (-state.pos.z) + airportElevation.
        if (this.onGround) {
             const gearHeight = this.aircraft.gearHeight || 2;
             // Ground is Z = 0, aircraft CG starts gearHeight above ground
             this.state.pos.z = -gearHeight;
        }

        // Autopilot
        this.autopilot = new RealisticAutopilotService();
        
        // Failure System
        this.failureSystem = new FailureHandler({ 
            difficulty: this.difficulty,
            engineCount: this.aircraft.engineCount
        });
        this.warningSystem = new WarningSystem();
        this.structuralLimits = new StructuralLimitsService(aircraftData);
        this.sensors = { 
            pitotBlocked: false,
            staticBlocked: false,
            radAlt: null, // null means valid/auto, -1 means failed
            aoaFrozen: false,
            ilsDeviation: 0,
            data_integrity: 1.0 // 1.0 = perfect, <1.0 = noise/errors
        };

        // Motion control flag (allows disabling physics integration while keeping systems active)
        // Start DISABLED to prevent initial settling/sliding until scene is fully ready
        this.motionEnabled = false;

        // Initialize extracted service modules
        this.environmentService = new EnvironmentService(this.CONSTANTS, this.difficulty);
        this.groundInteractionService = new GroundInteractionService();
        this.systemsService = new SystemsService();
        this.aerodynamicsService = new AerodynamicsService();
        this.navigationService = new NavigationService();

        // Aircraft Systems State
        this.initializeSystems(this.difficulty);
    }

    setMotionEnabled(enabled) {
        this.motionEnabled = !!enabled;
        if (!enabled) {
            // Reset rates to stop rotation when freezing
            this.state.rates = new Vector3(0, 0, 0);
            this.state.vel = new Vector3(0, 0, 0);

            // If on ground (preparing for flight), enforce flat attitude (NO pitch/roll)
            if (this.onGround) {
                const euler = this.state.quat.toEuler();
                // Reset pitch (theta) and roll (phi) to 0, preserve yaw (psi)
                this.state.quat = Quaternion.fromEuler(0, 0, euler.psi);
            }
        }
    }

    initializeSystems(difficulty) {
        this.systemModel = new AircraftSystemModel(this.aircraft);
        this.systems = this.systemsService.initializeSystems(this.aircraft, difficulty, this.state.fuel, this.engines);
        if (this.systems?.flightControls && this.systems.flightControls.yawDamper !== undefined) {
            this.systems.flightControls.yawDamper = !['pro', 'devil', 'professional', 'survival'].includes(difficulty);
        }
    }


    validateAndParseAircraft(data) {
        const wingArea = data.wingArea || 125;
        const wingSpan = data.wingSpan || 35;
        const chord = wingArea / wingSpan;
        const cgPos = typeof data.centerOfGravityPosition === 'number' ? data.centerOfGravityPosition : 0.15;
        const acPos = typeof data.aerodynamicCenterPosition === 'number' ? data.aerodynamicCenterPosition : 0.25;
        const groundGravityArm = typeof data.groundGravityArm === 'number' ? data.groundGravityArm : chord * cgPos;
        const defaultLiftArmFrac = acPos - cgPos;
        const groundLiftArm = typeof data.groundLiftArm === 'number'
            ? data.groundLiftArm
            : chord * (defaultLiftArmFrac !== 0 ? defaultLiftArmFrac : 0.1);
        return {
            ...data,
            specificFuelConsumption: (function() {
                if (typeof data.specificFuelConsumption === 'number') return data.specificFuelConsumption;
                const burnPerNm = data.typicalFuelBurn || 2.5; // kg per nautical mile
                const cruiseKts = data.cruiseSpeed || 450; // knots
                const engines = data.engineCount || 2;
                const perEngineThrust = data.maxThrustPerEngine || 120000; // N
                const totalThrust = engines * perEngineThrust;
                const kgPerSec = (burnPerNm * cruiseKts) / 3600;
                const sfc = totalThrust > 0 ? kgPerSec / totalThrust : 0.000015;
                return sfc;
            })(),
            mass: (data.emptyWeight || 40000) + (data.fuelWeight || 10000) + (data.payloadWeight || 0),
            wingArea,
            wingSpan,
            chord,
            groundGravityArm,
            groundLiftArm,
            maxThrust: data.maxThrustPerEngine || 120000,
            engineCount: data.engineCount || 2,
            enginePositions: data.enginePositions || (function() {
                const count = data.engineCount || 2;
                const span = data.wingSpan || 35;
                const positions = [];
                
                // Defaults based on engine count
                // Body Frame: X (Forward), Y (Right), Z (Down)
                // CG is at 0,0,0
                
                if (count === 1) {
                    positions.push(new Vector3(2.0, 0, 0)); // Nose/Center
                } else if (count === 2) {
                    // Under-wing engines (approx 25% span)
                    // Z = 1.0 (Underslung)
                    positions.push(new Vector3(0, -span * 0.25, 1.0)); // Left
                    positions.push(new Vector3(0, span * 0.25, 1.0));  // Right
                } else if (count === 3) {
                     // MD-11/DC-10 style
                     positions.push(new Vector3(0, -span * 0.25, 1.0)); // Left
                     positions.push(new Vector3(0, span * 0.25, 1.0));  // Right
                     positions.push(new Vector3(-15, 0, -3.0)); // Tail (High, Aft)
                } else if (count === 4) {
                     // 747/A380 style
                     positions.push(new Vector3(2.0, -span * 0.35, 1.0)); // Out L
                     positions.push(new Vector3(4.0, -span * 0.18, 1.5)); // In L
                     positions.push(new Vector3(4.0, span * 0.18, 1.5));  // In R
                     positions.push(new Vector3(2.0, span * 0.35, 1.0)); // Out R
                } else {
                    // Fallback for others (distribute along span)
                    for (let i=0; i<count; i++) {
                        const y = (i - (count-1)/2) * (span * 0.5 / count);
                        positions.push(new Vector3(0, y, 1.0));
                    }
                }
                return positions;
            })(),
            
            // Inertia Tensor Approximation (if not provided)
            // Ixx, Iyy, Izz
            Ix: data.momentOfInertiaRoll || 1000000,
            Iy: data.momentOfInertiaPitch || 2000000,
            Iz: data.momentOfInertiaYaw || 3000000,
            
            // Aerodynamic Centers relative to CG (Positive X is Aft in many conventions, but we stick to FRD)
            // CG is at 0,0,0 body frame for simplicity of equations, we apply moments based on arms
            
            // Coefficients (Linearized)
            CL0: data.basicLiftCoefficient || 0.2,
            CLa: data.liftCurveSlope || 5.5, // per radian
            CD0: data.zeroLiftDragCoefficient || 0.02,
            K: data.inducedDragFactor || 0.025, // Reduced from 0.04 to 0.025 to lower induced drag
            
            // Stability Derivatives (Approximated if missing)
            Cm0: 0.0, // Pitching moment at zero AoA
            Cma: -1.2, // Pitch stability (Increased from -0.5 to -1.2 for better stability)
            Cmq: -15.0, // Pitch damping
            Cde: -0.8, // Elevator effectiveness (Increased from -0.4 to -0.8 for better rotation authority)
            
            // Lateral/Directional
            Clb: -0.1, // Dihedral effect (Roll due to sideslip)
            Clp: -0.4, // Roll damping
            Cda: 0.15, // Aileron effectiveness
            
            Cnb: 0.1, // Weathercock stability (Yaw stability)
            Cnr: -0.2, // Yaw damping
            Cdr: 0.1, // Rudder effectiveness
            
            // Ground Handling
            gearHeight: Number.isFinite(data.gearHeight) && data.gearHeight > 0 ? data.gearHeight : 3.0,
            gearStiffness: 3000000, // Increased to support ~80 tons (Weight ~800kN). Compression ~0.3m
            gearDamping: 300000, // Increased for stability
            frictionCoeff: 0.02,
            brakingFriction: 0.8,
            
            // Flap Profile Fallback
            flapProfile: data.flapProfile || {
                positions: [
                    { angle: 0, clIncrement: 0, cdIncrement: 0 },
                    { angle: 35, clIncrement: 0.3, cdIncrement: 0.01 }
                ]
            }
        };
    }

    /**
     * Main Physics Loop
     * @param {Object} input - Control inputs
     * @param {number} dt - Time step (seconds)
     */
    // --- Helper Methods ---
    // (Moved to flightMath.js)

    update(input, dt) {
        if (this.crashed) return this.getOutputState();

        // Update ground status based on current position
        this.updateGroundStatus();

        // Sub-stepping for stability (High stiffness springs need small dt)
        const subSteps = Math.max(5, Math.ceil(dt / (1 / 300)));
        const subDt = dt / subSteps;

        // --- Autopilot Update ---
        // Compute essential derived values for AP
        const v_earth = this.state.quat.rotate(this.state.vel);
        const airspeedsForAP = this.calculateAirspeeds();
        const currentAirspeed = airspeedsForAP.indicatedAirspeed; // IAS in knots
        const currentVS = -v_earth.z * 196.85; // m/s -> ft/min (z is down, so -z is up)
        const euler = this.state.quat.toEuler();
        const currentHeading = (euler.psi * 180 / Math.PI + 360) % 360;
        
        // Calculate Track (Ground Course)
        const track = (Math.atan2(v_earth.y, v_earth.x) * 180 / Math.PI + 360) % 360;

        // Calculate Sideslip (Beta) for coordinated turns
        // Body Frame: X=Forward, Y=Right, Z=Down
        // Beta = atan(Vy / Vx)
        const vx = this.state.vel.x;
        const vy = this.state.vel.y;
        // Avoid division by zero
        const beta = (Math.abs(vx) > 1) ? Math.atan2(vy, vx) : 0;

        const altitudeAGL = (this.currentGroundZ - this.state.pos.z) * 3.28084;
        const altitudeIndicated = (-this.state.pos.z + (this.airportElevation || 0)) * 3.28084;
        const apState = {
            airspeed: currentAirspeed,
            verticalSpeed: currentVS,
            pitch: euler.theta,
            roll: euler.phi,
            altitude: altitudeIndicated,
            altitudeAGL,
            heading: currentHeading,
            track: track,
            latitude: this.state.geo.lat,
            longitude: this.state.geo.lon,
            beta: beta, // Radians
            groundSpeed: airspeedsForAP.groundSpeed,
            onGround: this.onGround,
            time: this.time
        };

        // --- Waypoint Sequencing & LNAV ---
        if (this.flightPlan && this.flightPlan.length > 0) {
            const navUpdate = this.navigationService.update(apState, {
                flightPlan: this.flightPlan,
                currentWaypointIndex: this.currentWaypointIndex,
                previousDistanceToWaypoint: this._prevDistToWaypoint,
                turnRadiusMeters: 1852,
                sampleSpacingMeters: 250
            });

            this.currentWaypointIndex = navUpdate.currentWaypointIndex;
            this.navigationPath = navUpdate.navigationPath;

            if (navUpdate.activeWaypoint) {
                const activeWaypoint = navUpdate.activeWaypoint;
                const dist = Number.isFinite(navUpdate.distanceToWaypoint)
                    ? navUpdate.distanceToWaypoint
                    : calculateDistanceMeters(this.state.geo.lat, this.state.geo.lon, activeWaypoint.latitude, activeWaypoint.longitude);

                if (this._lastWaypointIndex !== this.currentWaypointIndex) {
                    this._prevDistToWaypoint = dist;
                    this._lastWaypointIndex = this.currentWaypointIndex;
                    console.log(`📍 Sequencing to waypoint ${activeWaypoint.label || activeWaypoint.name || this.currentWaypointIndex}`);
                } else {
                    this._prevDistToWaypoint = dist;
                }

                if (this.autopilot.mode === 'LNAV' && Number.isFinite(navUpdate.targetHeading)) {
                    this.autopilot.setTargets({ heading: navUpdate.targetHeading });
                }

                if (!this.onGround && (activeWaypoint.type === 'airport' || activeWaypoint.type === 'runway') && activeWaypoint.selectedRunway && activeWaypoint.details) {
                    const airportCode = activeWaypoint.details.iata || activeWaypoint.details.icao || activeWaypoint.label;
                    if (!this.runwayGeometry || (this.runwayGeometry.runwayName !== activeWaypoint.selectedRunway && this.runwayGeometry.airportCode !== airportCode)) {
                        const geom = airportService.getRunwayGeometry(airportCode, activeWaypoint.selectedRunway);
                        if (geom) {
                            this.setRunwayGeometry(geom);
                            console.log(`📍 Physics: Auto-selected runway ${activeWaypoint.selectedRunway} at ${airportCode}`);
                        }
                    }
                }
            } else {
                this.navigationPath = this.navigationService.lastPath || [];
            }
        }

        const autopilotControlReference = {
            throttle: Number.isFinite(input?.throttle) ? input.throttle : this.controls.throttle,
            elevator: Number.isFinite(input?.pitch) ? input.pitch : this.controls.elevator,
            aileron: Number.isFinite(input?.roll) ? input.roll : this.controls.aileron,
            rudder: Number.isFinite(input?.yaw) ? input.yaw : this.controls.rudder,
            trim: Number.isFinite(input?.trim) ? input.trim : this.controls.trim
        };

        const cwsPitch = this.autopilot.engaged && this.autopilot.mode === 'CWS' && Math.abs(Number(input?.pitch) || 0) > 0.08;
        const cwsRoll = this.autopilot.engaged && this.autopilot.mode === 'CWS' && Math.abs(Number(input?.roll) || 0) > 0.08;
        if (cwsPitch || cwsRoll) {
            this.autopilot.setTargets({
                ...(cwsPitch ? { altitude: apState.altitude, vs: apState.verticalSpeed } : {}),
                ...(cwsRoll ? { heading: apState.heading } : {})
            });
        }
        const apOutputs = this.autopilot.update(apState, autopilotControlReference, dt);

        let finalInput = input;
        if (apOutputs) {
            // Override user inputs with AP outputs
            finalInput = {
                ...input,
                autopilotActive: true,
                throttles: null,
                throttle: this.autopilot.autothrottleArmed ? apOutputs.throttle : autopilotControlReference.throttle,
                pitch: cwsPitch ? input.pitch : apOutputs.elevator,
                roll: cwsRoll ? input.roll : apOutputs.aileron,
                trim: apOutputs.trim,
                yaw: apOutputs.rudder
            };
        }

        this.processInputs(finalInput, dt); // Process inputs once per frame
        
        // Update Failure System
        if (this.failureSystem) {
            this.failureSystem.update(dt, this.getOutputState());
            this.failureSystem.applyImpact(this);
        }

        this.updateSystems(dt); // Update overhead systems logic
        this.updateDynamicWeather(dt);
        this.updateIcing(dt);

        for (let i = 0; i < subSteps; i++) {
            this.time += subDt;

            // 1. Position Update (Geo)
            // NED to Geo approximation
            // Only update position if motion is enabled
            if (this.motionEnabled) {
                const v_ned = this.state.quat.rotate(this.state.vel);
                const latRad = this.state.geo.lat * Math.PI / 180;
                const metersPerLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
                const metersPerLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
                
                this.state.geo.lat += (v_ned.x * subDt) / metersPerLat;
                this.state.geo.lon += (v_ned.y * subDt) / metersPerLon;
            }

            // 2. Environment
            const env = this.calculateEnvironment(this.state.pos.z);

            // 3. Engine Dynamics
            this.updateEngines(env, subDt);

            // 3.1 Update Total Fuel Mass from Tanks
            if (this.systems.fuel && this.systems.fuel.tanks) {
                this.state.fuel = (this.systems.fuel.tanks.left || 0) + 
                                  (this.systems.fuel.tanks.right || 0) + 
                                  (this.systems.fuel.tanks.center || 0);
            }
            
            // Recalculate Total Mass: Empty + Fuel + Payload
            const emptyWeight = this.aircraft.emptyWeight || 40000;
            this.state.mass = emptyWeight + this.state.fuel + this.payloadMass;

            // 4. Calculate Forces and Moments
            const { forces, moments, aeroForces, thrustForces, gravityForces, groundForces, debug } = this.calculateAerodynamicsAndGround(env, subDt);
            
            // Store last for UI
            if (i === subSteps - 1) {
                this.aeroForces = aeroForces;
                this.thrustForces = thrustForces;
                this.gravityForces = gravityForces;
                this.groundForces = groundForces;
                this.debugData = debug;
            }

            // 5. Integrate
            if (this.motionEnabled) {
                this.integrate(forces, moments, subDt);
            } else {
                // Force velocity to zero when motion is disabled to prevent drift
                this.state.vel.set(0, 0, 0);
                this.state.rates.set(0, 0, 0);
            }

            // Keep runway/ground classification in sync with live substep motion.
            this.updateGroundStatus();

            // 6. Constraints
            this.checkConstraints(subDt);
            if (this.crashed) break;
        }

        return this.getOutputState();
    }

    processInputs(input, dt) {
        // Smooth inputs to simulate actuator dynamics
        const responseRate = Math.min(1, 5.0 * dt);
        const autopilotActive = input.autopilotActive === true;
        let throttleInput = Number.isFinite(input.throttle) ? input.throttle : this.controls.throttle;
        const pitchInput = Number.isFinite(input.pitch) ? input.pitch : this.controls.elevator;
        const rollInput = Number.isFinite(input.roll) ? input.roll : this.controls.aileron;
        const yawInput = Number.isFinite(input.yaw) ? input.yaw : this.controls.rudder;

        const throttleResponse = autopilotActive ? Math.min(1, 18.0 * dt) : responseRate;
        const elevatorResponse = autopilotActive ? responseRate : Math.min(1, responseRate * 2);
        const aileronResponse = autopilotActive ? Math.min(1, responseRate * 1.15) : Math.min(1, responseRate * 3);
        const rudderResponse = autopilotActive ? responseRate : Math.min(1, responseRate * 2);

        // Throttle (Master)
        this.controls.throttle += (throttleInput - this.controls.throttle) * throttleResponse;

        // Individual Throttles
        if (input.throttles && Array.isArray(input.throttles)) {
            // If individual inputs provided, smooth them independently
            for (let i = 0; i < this.controls.engineThrottles.length; i++) {
                const rawTarget = input.throttles[i];
                const target = Number.isFinite(rawTarget) ? rawTarget : throttleInput;
                this.controls.engineThrottles[i] += (target - this.controls.engineThrottles[i]) * throttleResponse;
            }
        } else {
            // Sync to master if no individual inputs
            for (let i = 0; i < this.controls.engineThrottles.length; i++) {
                this.controls.engineThrottles[i] += (throttleInput - this.controls.engineThrottles[i]) * responseRate;
            }
        }

        // Flight Controls (Pitch, Roll, Yaw)
        this.controls.elevator += (pitchInput - this.controls.elevator) * elevatorResponse;
        this.controls.aileron += (rollInput - this.controls.aileron) * aileronResponse;
        this.controls.rudder += (yawInput - this.controls.rudder) * rudderResponse;

        // Systems
        if (input.flaps !== undefined) this.controls.flaps = input.flaps;
        if (input.gear !== undefined) this.controls.gear = input.gear ? 1 : 0;

        // Trim smoothing
        const targetTrim = input.trim !== undefined ? input.trim : this.controls.trim;
        this.controls.trim += (targetTrim - this.controls.trim) * responseRate;

        // Brakes (simple logic: low throttle + on ground)
        if (this.onGround && this.controls.throttle < 0.1) {
            // this.controls.brakes = 1.0; // Auto brakes for now? No, let's assume user wants to roll unless stopped
             // Actually, let's map brakes to a key or just drag. For now, implicit drag.
        }
    }

    updateSystems(dt) {
        this.systemsService.updateSystems(
            this.systems,
            this.engines,
            this.state,
            this.onGround,
            this.difficulty,
            this.failureParams,
            this.aircraft,
            this.payloadMass,
            dt,
            this.systemModel
        );

        this.updateControlEffectiveness(dt);
    }

    /**
     * Updates control surface effectiveness based on hydraulic system health.
     * Simulates redundancy and degradation.
     */
    updateControlEffectiveness(dt) {
        if (!this.controlEffectiveness) {
            this.controlEffectiveness = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0, flaps: 1.0, spoilers: 1.0 };
        }
        if (!this.controlLag) {
            this.controlLag = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0, flaps: 1.0 };
        }

        const effectiveness = this.systemsService?.updateControlEffectiveness?.(this.systems) || {};
        this.controlEffectiveness.elevator = effectiveness.elevator ?? this.controlEffectiveness.elevator;
        this.controlEffectiveness.aileron = effectiveness.aileron ?? this.controlEffectiveness.aileron;
        this.controlEffectiveness.rudder = effectiveness.rudder ?? this.controlEffectiveness.rudder;
        this.controlEffectiveness.gear = effectiveness.gear ?? this.controlEffectiveness.gear;
        this.controlEffectiveness.spoilers = effectiveness.spoilers ?? this.controlEffectiveness.spoilers ?? 1.0;

        const hydraulicSystems = Object.values(this.systems?.hydraulics || {});
        const totalSystems = hydraulicSystems.length;
        const activeSystems = hydraulicSystems.filter(sys => sys.pressure > 1500).length;
        const lagFactor = totalSystems === 0 || activeSystems === totalSystems
            ? 1.0
            : (1.0 + 2.0 * (1.0 - (activeSystems / totalSystems)));

        this.controlLag.elevator = lagFactor;
        this.controlLag.aileron = lagFactor;
        this.controlLag.rudder = lagFactor;
        this.controlLag.gear = lagFactor;

        ['aileron', 'elevator', 'rudder', 'gear', 'flaps'].forEach(axis => {
            if (this.failureParams.control_sensitivity[axis] !== undefined) {
                this.controlEffectiveness[axis] = (this.controlEffectiveness[axis] || 1.0) * this.failureParams.control_sensitivity[axis];
            }

            if (this.failureParams.movement_restricted[axis]) {
                this.controlEffectiveness[axis] = Math.min(this.controlEffectiveness[axis] || 1.0, 0.05);
            }
        });
    }

    /**
     * Set generic failure parameters
     */
    setFailureParams(params) {
        if (params.movement_restricted !== undefined) {
            if (typeof params.movement_restricted === 'boolean') {
                this.failureParams.movement_restricted = {
                    aileron: params.movement_restricted,
                    elevator: params.movement_restricted,
                    rudder: params.movement_restricted,
                    flaps: params.movement_restricted,
                    gear: params.movement_restricted
                };
            } else {
                this.failureParams.movement_restricted = { ...this.failureParams.movement_restricted, ...params.movement_restricted };
            }
        }
        if (params.control_sensitivity !== undefined) {
            if (typeof params.control_sensitivity === 'number') {
                this.failureParams.control_sensitivity = {
                    aileron: params.control_sensitivity,
                    elevator: params.control_sensitivity,
                    rudder: params.control_sensitivity,
                    flaps: params.control_sensitivity,
                    gear: params.control_sensitivity
                };
            } else {
                this.failureParams.control_sensitivity = { ...this.failureParams.control_sensitivity, ...params.control_sensitivity };
            }
        }
        if (params.structural_health !== undefined) this.failureParams.structural_health = params.structural_health;
        if (params.structural_integrity !== undefined) this.failureParams.structural_health = params.structural_integrity;
        if (params.stress_limit_reduction !== undefined) this.failureParams.stress_limit_reduction = params.stress_limit_reduction;
        if (params.aerodynamic_efficiency !== undefined) this.failureParams.aerodynamic_efficiency = params.aerodynamic_efficiency;
        if (params.friction_increase !== undefined) this.failureParams.friction_increase = params.friction_increase;
        if (params.vibration_level !== undefined) this.vibrationLevel = params.vibration_level;
        if (params.quantity_rate !== undefined) {
            if (typeof params.quantity_rate === 'number') {
                this.failureParams.quantity_rate = { ...this.failureParams.quantity_rate, fuel: params.quantity_rate };
            } else {
                this.failureParams.quantity_rate = { ...this.failureParams.quantity_rate, ...params.quantity_rate };
            }
        }
        if (params.surface_deflection_locked) {
            this.failureParams.movement_restricted = {
                aileron: true,
                elevator: true,
                rudder: true,
                flaps: true,
                gear: true
            };
        }
        if (params.data_integrity !== undefined || params.data_validity !== undefined) {
            const value = params.data_integrity !== undefined ? params.data_integrity : params.data_validity;
            this.failureParams.data_integrity = value;
            if (this.sensors) this.sensors.data_integrity = value;
        }
    }

    applyComponentDamage(damage) {
        return this.systemModel?.applyDamage({ time: this.time, eventId: this.failureDamageEventId, ...damage });
    }

    applyRegionalDamage(event) {
        return this.systemModel?.applyRegionalDamage({ time: this.time, eventId: this.failureDamageEventId, ...event }) || [];
    }

    calculateEnvironment(z_down) {
        return this.environmentService.calculateEnvironment(z_down);
    }

    setEnvironment(envData) {
        this.environmentService.setEnvironment(envData);
        this.environment = this.environmentService.environment;
    }

    getDifficultyScale() {
        return this.environmentService.getDifficultyScale();
    }

    updateDynamicWeather(dt) {
        this.environmentService.updateDynamicWeather(dt);
        this.environment = this.environmentService.environment;
    }

    updateIcing(dt) {
        this.environmentService.updateIcing(dt, this.systems, this.onGround, this.icingState);
    }

    applyWindShear(intensity = 0.5) {
        this.environmentService.applyWindShear(intensity);
        this.environment = this.environmentService.environment;
    }

    getRunwayBrakingData() {
        const stage = this.groundInteractionService.getRunwayBrakingData(this.runwayGeometry, this.environment);
        this.runwayBraking = stage;
        return stage;
    }

    updateEngines(env, dt) {
        // Mach number approx
        const speedOfSound = env.speedOfSound || 340;
        
        // Transform Wind to Body Frame for Airspeed Calculation
        const q_inv = new Quaternion(this.state.quat.w, -this.state.quat.x, -this.state.quat.y, -this.state.quat.z);
        const V_wind_body = q_inv.rotate(env.wind || new Vector3(0,0,0));
        const V_air_body = this.state.vel.sub(V_wind_body);
        const V_airspeed = V_air_body.magnitude();

        const mach = V_airspeed / speedOfSound;
        const airDensityRatio = env.density / this.CONSTANTS.SEA_LEVEL_DENSITY;

        this.engines.forEach((engine, index) => {
             // 1. Get Control Inputs
             let engineThrottle = Number.isFinite(this.controls.engineThrottles[index])
                 ? this.controls.engineThrottles[index]
                 : (Number.isFinite(this.controls.throttle) ? this.controls.throttle : 0);

             // OEI emergency thrust authorization: allow only if another engine is failed/not running.
             const otherEngineOut = this.engines.some((otherEngine, otherIndex) =>
                 otherIndex !== index && (otherEngine.state.failed || !otherEngine.state.running)
             );
             engine.setEmergencyBoostAllowed(otherEngineOut);

             // FADEC: for Airbus, lever position drives a computed N1 target.
             // We pass a synthetic throttle (0–1) that maps to the FADEC N1 fraction.
             if (this.fadec && engineThrottle >= 0) {
                 const altitudeFt = -this.state.pos.z * 3.28084;
                 const fadecN1 = this.fadec.targetN1(engineThrottle, this.aircraft.maxN1 || 102, altitudeFt);
                 // Convert back to 0–1 throttle so EnginePhysicsService can use it normally
                 const maxN1 = this.aircraft.maxN1 || 102;
                 const idleN1 = 20;
                 engineThrottle = Math.max(0, Math.min(1, (fadecN1 - idleN1) / (maxN1 - idleN1)));
             }
             
             // 2. Feed System State to Engine Physics
             const sysEng = this.systems.engines[`eng${index + 1}`];
             const pneu = this.systems.pressurization;
             let fuelSourceAvailable = false;
             
             if (sysEng) {
                 // Determine Pneumatic Pressure Availability
                 // Split point logic (same as OverheadLogic)
                 const engineCount = this.engines.length;
                 const splitPoint = Math.ceil(engineCount / 2);
                 const isLeft = index < splitPoint;
                 
                 const ductPress = isLeft ? (pneu?.ductPressL || 0) : (pneu?.ductPressR || 0);
                 const pneumaticAvailable = ductPress > 20;
                 
                 // Pass Startup State to Physics Engine
                 // starterEngaged: Switch is GRD or CONT/FLT doesn't engage starter usually, only GRD.
                 // fuelAvailable: Checked below in source logic, but we pass the valve status here.
                 // Actually, we determine "fuelAvailable" based on tank logic below.
                 
                 // Let's calculate fuel availability first
                 const fuel = this.systems.fuel;
                 fuelSourceAvailable = false;
                 
                 const currentAltFt = Math.max(0, (-this.state.pos.z || 0) * 3.28084);
                // Suction feed is available at low altitude as a fallback when tanks contain fuel.
                // Pumps/pressure are still required at cruise altitude.
                const suctionAvailable = this.onGround || currentAltFt < 20000;
                const feedComponent = this.systems.resourceNetwork?.components?.[`fuel.feed.${isLeft ? 'left' : 'right'}`];
                // Pump loss still permits the modeled low-altitude suction feed. Physical
                // feed-line damage does not: it is downstream of every tank and pump path.
                const feedLineIntact = !feedComponent || feedComponent.health > 0.05;
                
                if (fuel.pressC > 10 && fuel.tanks.center > 0) fuelSourceAvailable = true;
                 else if (isLeft) {
                     if ((fuel.pressL > 10 || suctionAvailable) && fuel.tanks.left > 0) fuelSourceAvailable = true;
                     else if (fuel.crossfeed && fuel.pressR > 10 && fuel.tanks.right > 0) fuelSourceAvailable = true;
                 } else {
                     if ((fuel.pressR > 10 || suctionAvailable) && fuel.tanks.right > 0) fuelSourceAvailable = true;
                     else if (fuel.crossfeed && fuel.pressL > 10 && fuel.tanks.left > 0) fuelSourceAvailable = true;
                 }
                fuelSourceAvailable = fuelSourceAvailable && feedLineIntact;

                 // Update Engine Physics State
                const hasIgnitionPower = (this.systems.electrical?.dcVolts || 0) > 20;
                const ignitionCommanded = hasIgnitionPower && (sysEng.startSwitch === 'GRD' || sysEng.startSwitch === 'FLT');

                engine.setStartupState(
                    sysEng.startSwitch === 'GRD', // Starter Valve Open
                    ductPress,                   // Air Pressure (PSI)
                    sysEng.fuelControl && fuelSourceAvailable, // Fuel Valve & Supply
                    ignitionCommanded
                );
                 
                 // Sync External Fuel Burn
                 // We need to actually remove fuel from tanks if engine is burning it
                 if (engine.state.running && engine.state.fuelFlow > 0) {
                     // Find active sources for distribution
                     let activeSources = [];
                     if (fuel.pressC > 10 && fuel.tanks.center > 0) activeSources.push('center');
                     if (isLeft) {
                         if ((fuel.pressL > 10 || suctionAvailable) && fuel.tanks.left > 0) activeSources.push('left');
                         if (fuel.crossfeed && fuel.pressR > 10 && fuel.tanks.right > 0) activeSources.push('right');
                     } else {
                         if ((fuel.pressR > 10 || suctionAvailable) && fuel.tanks.right > 0) activeSources.push('right');
                         if (fuel.crossfeed && fuel.pressL > 10 && fuel.tanks.left > 0) activeSources.push('left');
                     }
                     if (!feedLineIntact) activeSources = [];
                     
                     // Fallback if logic mismatch (shouldn't happen if fuelSourceAvailable is true)
                     if (activeSources.length > 0) {
                         const burn = engine.state.fuelFlow * dt;
                         const burnPerSource = burn / activeSources.length;
                         activeSources.forEach(src => {
                             fuel.tanks[src] = Math.max(0, fuel.tanks[src] - burnPerSource);
                         });
                     }
                 }
             }

             // 3. Update Physics
             engine.setFailureParams({
                 quantity_rate: this.failureParams.quantity_rate.fuel || 0,
                 data_integrity: this.failureParams.data_integrity
             });
             engine.update(dt, engineThrottle, mach, -this.state.pos.z, airDensityRatio, env.temp);
             
             // 4. Sync Back to Systems (for UI and Logic)
             // We are the source of truth for running engines
             if (sysEng) {
                 sysEng.n1 = engine.state.n1;
                 sysEng.n2 = engine.state.n2;
                 sysEng.egt = engine.state.egt;
                 sysEng.ff = engine.state.fuelFlow;

                 const engineSelfSustaining = engine.state.running || sysEng.n2 >= 50;
                 if (sysEng.startSwitch === 'GRD' && engineSelfSustaining) {
                     sysEng.startSwitch = 'OFF';
                 }
             }
             
             // 5. Detect Engine Stall/Failure conditions?
             // (Already handled in engine.update mostly)
        });
        
        if (this.state.fuel < 0) {
            this.state.fuel = 0;
            this.engines.forEach(e => e.setFailed(true));
        }
    }

    calculateAerodynamicCoefficients(V_airspeed, alpha, beta, rates, q) {
        // Flap Increments from Profile
        const flapIncrements = this.getFlapIncrements();
        const CL_flaps = flapIncrements.cl;
        const CD_flaps_base = flapIncrements.cd;

        // Apply Control Effectiveness (Failures)
        const effAileron = this.controls.aileron * Math.min(this.structuralLimits.health.aileron, this.controlEffectiveness.aileron ?? 1);
        const effElevator = this.controls.elevator * Math.min(this.structuralLimits.health.elevator, this.controlEffectiveness.elevator ?? 1);
        const effRudder = this.controls.rudder * Math.min(this.structuralLimits.health.rudder, this.controlEffectiveness.rudder ?? 1);

        // Airbrake Increments
        const airbrakeIncrements = this.getAirbrakeIncrements();
        const CL_brakes = airbrakeIncrements.cl;
        const CD_brakes = airbrakeIncrements.cd;

        // Lift (CL)
        // CL = CL0 + CLa * alpha + CL_flaps + CL_elevator + CL_brakes
        const CL_stall_drop = Math.abs(alpha) > 0.3 ? -0.5 * Math.sin((Math.abs(alpha) - 0.3) * 5) : 0; // Simple stall drop
        let CL = this.aircraft.CL0 + this.aircraft.CLa * alpha + CL_flaps + CL_brakes + (effElevator * 0.3) + CL_stall_drop;
        
        if (this.failureParams.aerodynamic_efficiency !== 1.0) {
            CL *= this.failureParams.aerodynamic_efficiency;
        }

        const icingLevel = this.icingState?.level || 0;
        if (icingLevel > 0) {
            CL *= 1 - (0.3 * icingLevel);
        }

        // Drag (CD)
        // CD = CD0 + K * CL^2 + CD_flaps + CD_gear + CD_brakes
        
        // Ground Effect on Induced Drag
        const h = -this.state.pos.z; // Altitude (CG)
        const wingSpan = this.aircraft.wingSpan;
        let groundEffectFactor = 1.0;
        
        if (h < wingSpan) {
            const r = h / wingSpan;
            // Torenbeek's approximation for induced drag reduction
            groundEffectFactor = (16 * r * r) / (1 + 16 * r * r);
            // Clamp to avoid unrealistic zero drag (min 10% of induced drag)
            if (groundEffectFactor < 0.1) groundEffectFactor = 0.1; 
        }

        const CD_flaps = CD_flaps_base; 
        const CD_gear = this.controls.gear * 0.015; 
        const CD_elevator = Math.abs(effElevator) * 0.02; // Parasitic drag from elevator deflection
        const rollRateIntensity = V_airspeed > 12
            ? Math.min(1.5, Math.abs(rates.x) * this.aircraft.wingSpan / (2 * Math.max(V_airspeed, 12)))
            : 0;
        const rollCompressionDrag = Math.min(0.08, 0.045 * rollRateIntensity * rollRateIntensity);
        this.rollCompressionDebug = {
            rollRate: rates.x,
            rollRateIntensity,
            extraDragCoefficient: rollCompressionDrag
        };

        // Clamp CL for induced drag to prevent runaway drag at high angles (stall region)
        const CL_induced_calc = Math.min(Math.abs(CL), 1.35); // Cap effective CL for induced drag
        const CD_induced = this.aircraft.K * CL_induced_calc * CL_induced_calc * groundEffectFactor;
        
        const mach = V_airspeed / this.calculateEnvironment(this.state.pos.z).speedOfSound;
        const waveDrag = Math.min(0.4, Math.max(0, mach - this.structuralLimits.limits.mmo + 0.04) ** 2 * 2);
        let CD = waveDrag + (1 - this.structuralLimits.health.wing) * 0.12 + this.aircraft.CD0 + CD_induced + CD_flaps + CD_gear + CD_brakes + CD_elevator + rollCompressionDrag;
        if (icingLevel > 0) {
            CD += 0.1 * icingLevel;
        }

        // Side Force (CY)
        // CY = CYb * beta + CYdr * rudder
        const CY = -0.5 * beta + (effRudder * 0.2);

        // Moments
        // Pitch (Cm)
        // Cm = Cm0 + Cma * alpha + Cmq * (q * c / 2V) + Cde * elevator
        const c = this.aircraft.chord;
        const b = this.aircraft.wingSpan;
        const pitch_damping = this.aircraft.Cmq * (rates.y * c) / (2 * (V_airspeed + 0.1));
        
        // Flaps Pitch Moment (Cm_flaps)
        // Flaps typically cause a nose-down moment (negative Cm) due to aft shift of CP,
        // though downwash on tail can counteract. User requested "slight downward pitch torque".
        const Cm_flaps = this.controls.flaps * -0.01;
        
        const Cm = this.aircraft.Cm0 + (this.aircraft.Cma * alpha) + pitch_damping + (this.aircraft.Cde * (effElevator + this.controls.trim)) + Cm_flaps;

        // Roll (Cl)
        // Cl = Clb * beta + Clp * (p * b / 2V) + Cda * aileron
        const roll_damping = this.aircraft.Clp * (rates.x * b) / (2 * (V_airspeed + 0.1));
        let Cl = (this.aircraft.Clb * beta) + roll_damping + (this.aircraft.Cda * effAileron);

        // Yaw (Cn)
        // Cn = Cnb * beta + Cnr * (r * b / 2V) + Cdr * rudder
        const yaw_damping = this.aircraft.Cnr * (rates.z * b) / (2 * (V_airspeed + 0.1));
        const Cn = (this.aircraft.Cnb * beta) + yaw_damping + (this.aircraft.Cdr * effRudder);

        // --- PHYSICAL YAW-ROLL COUPLING (Differential Lift) ---
        // Calculate velocity difference due to yaw rate
        if (V_airspeed > 5 && Math.abs(rates.z) > 0.001) {
            const y_arm = b / 4; // Mid-point of semi-span
            const r = rates.z; // Yaw rate
            
            // Tangential velocity difference
            // Left Wing (Positive Roll Side): V_left = V + r * y_arm
            // Right Wing (Negative Roll Side): V_right = V - r * y_arm
            // We approximate the Lift difference based on V squared
            
            // Delta V ratio = (r * y_arm) / V
            const dV_ratio = (r * y_arm) / V_airspeed;
            
            // Lift is proportional to V^2
            // L_left ~ (1 + dV_ratio)^2 ~ 1 + 2*dV_ratio
            // L_right ~ (1 - dV_ratio)^2 ~ 1 - 2*dV_ratio
            // Delta L ~ 4 * dV_ratio * BaseLift
            
            // Roll Moment = Delta L * y_arm
            // But we are working in Coefficients.
            // Delta Cl = Delta Moment / (q * S * b)
            // Delta Moment = (L_left - L_right) * y_arm
            // L_base = q * (S/2) * CL (per wing)
            // L_left = L_base * (1 + 2*dV_ratio)
            // L_right = L_base * (1 - 2*dV_ratio)
            // L_left - L_right = L_base * 4 * dV_ratio
            // Delta Moment = (q * S/2 * CL * 4 * dV_ratio) * y_arm
            //              = 2 * q * S * CL * dV_ratio * y_arm
            // Delta Cl = (2 * q * S * CL * dV_ratio * y_arm) / (q * S * b)
            //          = (2 * CL * dV_ratio * y_arm) / b
            //          = (2 * CL * (r * y_arm / V) * y_arm) / b
            // Substitute y_arm = b/4
            //          = (2 * CL * (r * b/4 / V) * b/4) / b
            //          = (2 * CL * r * b * b / 16 / V) / b
            //          = (CL * r * b / 8 / V)
            
            // Let's check units and sign.
            // Positive r (Nose Right) -> Left Wing Faster -> More Lift -> Right Roll (Positive Cl).
            // So sign is +CL.
            
            const dCl_yaw = (CL * r * b) / (8 * V_airspeed);
            
            Cl += dCl_yaw;
        }

        // Fuel imbalance roll torque: heavier wing rolls toward it
        const fuelTanks = this.systems?.fuel?.tanks;
        if (fuelTanks && fuelTanks.left !== undefined && fuelTanks.right !== undefined && q > 1) {
            const imbalanceKg = (fuelTanks.left - fuelTanks.right) * 0.8; // ~0.8 kg/L
            const S = this.aircraft.wingArea || 125;
            const b_span = this.aircraft.wingspan || 34;
            const rollMoment = imbalanceKg * 9.81 * (b_span * 0.25);
            Cl += rollMoment / (q * S * b_span);
        }

        return { CL, CD, CY, Cm, Cl, Cn };
    }

    calculateAerodynamicsAndGround(env, dt = 0) {
        // --- Velocity (Airspeed vs Ground Speed) ---
        // this.state.vel is V_ground_body (Ground Velocity in Body Frame)
        
        // Wind (Earth) -> Wind (Body)
        const q_inv = new Quaternion(this.state.quat.w, -this.state.quat.x, -this.state.quat.y, -this.state.quat.z);
        const V_wind_body = q_inv.rotate(env.wind || new Vector3(0,0,0));
        
        const rollCompressionDebug = this.rollCompressionDebug || { rollRate: 0, rollRateIntensity: 0, extraDragCoefficient: 0 };
        const rollBuffetTurbulence = this.onGround ? 0 : Math.min(0.35, rollCompressionDebug.rollRateIntensity * 0.18);
        const effectiveTurbulence = (env.turbulence || 0) + rollBuffetTurbulence;
        if (effectiveTurbulence > 0) {
            const turbScale = effectiveTurbulence * 5.0; // up to 5 m/s variation
            V_wind_body.x += (Math.random() - 0.5) * turbScale;
            V_wind_body.y += (Math.random() - 0.5) * turbScale;
            V_wind_body.z += (Math.random() - 0.5) * turbScale;
        }

        const V_air_body = this.state.vel.sub(V_wind_body); // V_air = V_ground - V_wind
        const V_airspeed = V_air_body.magnitude();
        
        // Dynamic Pressure (q)
        const q = 0.5 * env.density * V_airspeed * V_airspeed;

        // Angle of Attack (Alpha) & Sideslip (Beta)
        // alpha = atan2(w, u)
        // beta = asin(v / V)
        let alpha = 0;
        let beta = 0;
        // Fix for low speed instability: only calculate alpha/beta if airspeed > 3 knots (~1.5 m/s)
        // Below this speed, alpha/beta are undefined/unstable due to noise.
        if (V_airspeed > 1.5) {
            alpha = Math.atan2(V_air_body.z, V_air_body.x);
            beta = Math.asin(Math.max(-1, Math.min(1, V_air_body.y / V_airspeed)));
        }

        // --- Aerodynamic Coefficients ---
        const { CL, CD, CY, Cm, Cl, Cn } = this.calculateAerodynamicCoefficients(V_airspeed, alpha, beta, this.state.rates, q);

        // Dimensional Forces (Wind Axes -> Body Axes)
        // Lift acts perpendicular to relative wind, Drag parallel.
        // We approximate transformation for small beta:
        // F_lift = q * S * CL
        // F_drag = q * S * CD
        // F_side = q * S * CY
        
        const S = this.aircraft.wingArea;
        const b = this.aircraft.wingSpan;
        const c = this.aircraft.chord;

        this.structuralLimits.update({ loadFactor: q * S * CL / (this.state.mass * this.CONSTANTS.G),
            dynamicPressure: q, mach: V_airspeed / env.speedOfSound, onGround: this.onGround, dt },
            damage => this.applyComponentDamage(damage));
        const F_lift = q * S * CL * this.structuralLimits.health.wing;
        const F_drag = q * S * CD;
        const F_side = q * S * CY;

        // Transform Wind to Body (Rotation by -alpha around Y)
        // Fx = -Drag * cos(a) + Lift * sin(a)
        // Fz = -Drag * sin(a) - Lift * cos(a)
        const cosA = Math.cos(alpha);
        const sinA = Math.sin(alpha);
        
        const Fx_aero = -F_drag * cosA + F_lift * sinA;
        let Fy_aero = F_side;
        const Fz_aero = -F_drag * sinA - F_lift * cosA;

        // Dimensional Moments
        let Mx_aero = q * S * b * Cl;
        let My_aero = q * S * c * Cm;
        let Mz_aero = q * S * b * Cn;

        // --- Runway Stabilizer (User Request) ---
        // Rookie: Rail mode (Applied inside method via state override).
        // Others: Gentle pull forces.
        const stabilizer = this.applyRunwayStabilizer();
        if (stabilizer) {
            Fy_aero += stabilizer.Fy;
            Mz_aero += stabilizer.Mz;
        }
        
        let nosewheelSteeringAngle = 0;
        let nosewheelSteeringAuthority = 0;
        let noseGearContactForce = 0;
        
        // --- Thrust ---
        let F_thrust_body = new Vector3(0, 0, 0);
        let M_thrust_body = new Vector3(0, 0, 0);

        this.engines.forEach((engine, index) => {
            const thrustMag = engine.state.thrust;
            // Assume thrust vector is along X axis (Forward)
            // Ideally, we could have a thrust vector direction per engine, but X is standard.
            const F_eng = new Vector3(thrustMag, 0, 0);
            
            // Position
            const pos = this.aircraft.enginePositions[index] || new Vector3(0, 0, 0);
            
            // Moment = r x F (Position x Force)
            const M_eng = pos.cross(F_eng);
            
            F_thrust_body = F_thrust_body.add(F_eng);
            M_thrust_body = M_thrust_body.add(M_eng);
        });

        const Fx_thrust = F_thrust_body.x;
        // Fy and Fz from thrust are usually negligible unless vectoring or significant tilt, 
        // but we can include them if we want to be precise (here they are 0)
        
        // --- Gravity ---
        // Gravity in Earth Frame is (0, 0, mg)
        // Rotate to Body Frame: Fg_body = Q_inv * Fg_earth
        // Or using rotation matrix derived from Quaternion/Euler.
        // Using quaternion rotate: Conjugate of q rotates Earth->Body
        const gravityEarth = new Vector3(0, 0, this.state.mass * this.CONSTANTS.G);
        // Inverse rotation (Earth to Body)
        // To rotate frame A to B, we use q_AB. To rotate vector in A to B, we use q_AB*.
        // this.state.quat represents Body -> Earth rotation.
        // So we need inverse to take Gravity (Earth) -> Body.
        // q_inv is already calculated above
        const gravityBody = q_inv.rotate(gravityEarth);

        // --- Ground Interaction (Multi-Point Gear) ---
        // Simulating 3-point landing gear for realistic ground handling and rotation
        let F_ground = new Vector3(0, 0, 0);
        let M_ground = new Vector3(0, 0, 0);
        
        // Gear Definitions (Position relative to CG in Body Frame)
        // x: Forward, y: Right, z: Down (CG at 0,0,0)
        // Tuned for stability: Softer springs, higher damping
        const gears = this.groundInteractionService.getContactPoints(
            this.aircraft.gearHeight, this.controls.gear > 0.5, this.aircraft.gearStiffness
        );
        
        let onGroundAny = false;

        gears.forEach(gear => {
            // 1. Calculate Gear Position in Earth Frame (Z-Down)
            const P_body = gear.pos;
            const P_offset_earth = this.state.quat.rotate(P_body);
            const P_world_z = this.state.pos.z + P_offset_earth.z;
            
            // Check against current ground height (NED Z)
            // Treat exact contact as on-ground so the first substep doesn't free-fall through the support model.
            if (P_world_z >= this.currentGroundZ) {
                onGroundAny = true;
                const depth = P_world_z - this.currentGroundZ;
                
                // 2. Velocity at Contact Point (Body Frame -> Earth Frame Z)
                const V_point_body = this.state.vel.add(this.state.rates.cross(P_body));
                const V_point_earth = this.state.quat.rotate(V_point_body);
                const v_vertical = V_point_earth.z; // Positive = Moving Down
                
                // 3. Normal Force (Spring + Damper)
                let F_n = -(gear.k * depth + gear.c * v_vertical);
                if (F_n > 0) F_n = 0; // Don't pull ground
                
                // Clamp Normal Force to prevent explosion (max 4G per gear approx)
                const maxForce = this.state.mass * 9.81 * 4;
                if (Math.abs(F_n) > maxForce) F_n = -maxForce;

                // 4. Friction (Anisotropic: Rolling vs Lateral)
                // Calculate in Body Frame for correct orientation relative to wheels
                
                // Steering Angle (Nose Gear only)
                let steeringAngle = 0;
                if (gear.name === 'nose') {
                    const rudderInput = Math.max(-1, Math.min(1, Number.isFinite(this.controls.rudder) ? this.controls.rudder : 0));
                    const groundSpeed = Math.max(0, this.state.vel.magnitude());
                    const speedAuthority = Math.max(0, Math.min(1, 1 - (groundSpeed / 55)));
                    const loadAuthority = Math.max(0, Math.min(1, Math.abs(F_n) / (this.state.mass * this.CONSTANTS.G * 0.18)));
                    const surfaceAuthority = this.groundStatus?.status === 'GRASS' ? 0.55 : 1;
                    nosewheelSteeringAuthority = speedAuthority * loadAuthority * surfaceAuthority;
                    steeringAngle = rudderInput * nosewheelSteeringAuthority * 70 * Math.PI / 180;
                    nosewheelSteeringAngle = steeringAngle;
                    noseGearContactForce = Math.abs(F_n);
                }

                // Velocity at wheel in Body Frame
                // V_point_body includes aircraft vel + rotation effect
                // We assume ground is flat, so we care about X and Y in body frame (approx)
                // For exactness on sloped ground, we should project V_point_earth onto surface tangent,
                // but Body XY is close enough for flat runway.
                
                // Rotate velocity into Wheel Frame (if steered)
                const cosS = Math.cos(steeringAngle);
                const sinS = Math.sin(steeringAngle);
                
                const vx_wheel = V_point_body.x * cosS + V_point_body.y * sinS;
                const vy_wheel = -V_point_body.x * sinS + V_point_body.y * cosS;
                
                // Friction Coefficients
                const isBraking = this.controls.wheelBrakes > 0.1 && gear.name.includes('main');
                let mu_roll = isBraking ? this.aircraft.brakingFriction : this.aircraft.frictionCoeff; // 0.8 or 0.02
                let mu_slide = 0.9; // High lateral friction (0.9 for dry tarmac)
                const brakingData = this.groundStatus && this.groundStatus.status === 'RUNWAY'
                    ? this.getRunwayBrakingData()
                    : null;
                
                if (this.failureParams.friction_increase > 0) {
                    mu_roll += this.failureParams.friction_increase;
                    mu_slide += this.failureParams.friction_increase * 0.5;
                }

                if (isBraking && this.systems?.resourceNetwork?.capabilities) {
                    mu_roll *= this.systems.resourceNetwork.capabilities.brakes;
                }

                if (brakingData) {
                    const rollScale = isBraking ? brakingData.brakeScale : Math.max(0.6, brakingData.gripScale);
                    mu_roll *= rollScale;
                    mu_slide *= brakingData.gripScale;
                } else if (this.environment && this.environment.precipitation > 0) {
                    const rainFactor = Math.min(this.environment.precipitation, 10) / 10;
                    mu_roll *= (1 - 0.4 * rainFactor);
                    mu_slide *= (1 - 0.4 * rainFactor);
                }

                if (this.groundStatus && this.groundStatus.status === 'GRASS') {
                    mu_roll = 0.08;
                    mu_slide = 0.5;
                    if (this.state.vel.magnitude() > 1) {
                        const noise = (Math.random() - 0.5) * 0.2;
                        F_n *= (1 + noise);
                    }
                }
                
                // Friction Forces (Wheel Frame)
                // Use a "stiction" zone for low speeds to prevent oscillation
                const v_threshold = 0.1;
                
                let Fx_wheel = 0;
                let Fy_wheel = 0;
                
                const F_normal_mag = Math.abs(F_n);
                
                // Longitudinal (Rolling)
                if (Math.abs(vx_wheel) < v_threshold) {
                     Fx_wheel = -vx_wheel * F_normal_mag * 50; // Linear damping at stop
                } else {
                     Fx_wheel = -Math.sign(vx_wheel) * F_normal_mag * mu_roll;
                }
                
                // Lateral (Sliding) - Critical for wind resistance
                // High stiffness for cornering
                if (Math.abs(vy_wheel) < v_threshold) {
                     // Reduced from 200 to 30 to prevent ejection, clamped to slide limit
                     let stiffForce = -vy_wheel * F_normal_mag * 30;
                     const maxStiff = F_normal_mag * mu_slide;
                     if (Math.abs(stiffForce) > maxStiff) stiffForce = Math.sign(stiffForce) * maxStiff;
                     Fy_wheel = stiffForce;
                } else {
                     Fy_wheel = -Math.sign(vy_wheel) * F_normal_mag * mu_slide;
                }
                
                // Rotate Forces back to Body Frame
                const Fx_body_fric = Fx_wheel * cosS - Fy_wheel * sinS;
                const Fy_body_fric = Fx_wheel * sinS + Fy_wheel * cosS;
                
                // Total Gear Force in Body Frame
                // Z component is Normal Force (Approximate, assuming Body Z is roughly Earth Z)
                // To be precise: F_n is Earth Z. We need to rotate (0,0,F_n) from Earth to Body.
                // q_inv.rotate(0,0,F_n)
                const F_normal_body = q_inv.rotate(new Vector3(0, 0, F_n));
                
                const F_gear_body = new Vector3(
                    Fx_body_fric + F_normal_body.x,
                    Fy_body_fric + F_normal_body.y,
                    F_normal_body.z
                );
                
                // Store force magnitude for pivot logic
                gear.forceMag = F_n; // F_n is negative (upward force on plane), so magnitude is abs(F_n)
                if (F_n < 0) gear.forceMag = Math.abs(F_n);
                else gear.forceMag = 0;

                // 6. Accumulate
                F_ground = F_ground.add(F_gear_body);
                M_ground = M_ground.add(P_body.cross(F_gear_body));
            } else {
                gear.forceMag = 0;
            }
        });

        this.onGround = onGroundAny;

        if (this.onGround) {
            const weightGround = this.state.mass * this.CONSTANTS.G;
            const gravityArm = this.aircraft.groundGravityArm || (this.aircraft.chord || 5) * 0.15;
            const liftArm = this.aircraft.groundLiftArm || (this.aircraft.chord || 5) * 0.2;
            const My_gravity = -weightGround * gravityArm;
            const My_lift_ground = F_lift * liftArm;
            My_aero += My_gravity + My_lift_ground;
        }

        // --- Main-Gear Pivot Logic (User Request) ---
        // Ensure rotation happens around main wheels, not CG.
        // Rotation Phase: Nose is light/off (Force ~ 0), Mains are heavy
        const noseGear = gears[0]; 
        const mainGears = [gears[1], gears[2]];
        
        // Threshold: Nose < 10% of weight, Mains > 50% of weight
        // Mass * 9.81 = Weight. 
        const weight = this.state.mass * 9.81;
        
        if (this.onGround && noseGear.forceMag < weight * 0.1 && (mainGears[0].forceMag + mainGears[1].forceMag) > weight * 0.5) {
             // We are rotating!
             // Calculate pivot point (midpoint of main wheels in Body Frame)
             const pivotPos = mainGears[0].pos.add(mainGears[1].pos).scale(0.5);
             
             // Calculate Vertical Velocity at Pivot Point (Body Frame Z)
             // V_pivot_z = V_cg_z + (q * pivot_x) - (p * pivot_y is 0)
             // Positive Z is down.
             // w x r = (0, q, 0) x (x, 0, 0) = (0, 0, -qx)
             // So v_z component from rotation is -q*x
             const v_pivot_z = this.state.vel.z - (this.state.rates.y * pivotPos.x);
             
             // Apply constraint force to keep pivot attached to ground (V_z ~ 0)
             // High damping gain to kill vertical velocity at pivot
             const pivotDamping = 100000; // N/(m/s)
             const F_constraint_z = -v_pivot_z * pivotDamping;
             
             // Apply this force at the Pivot Point
             // Force vector (Body Frame): (0, 0, F_constraint_z)
             // Moment = r x F = (pivot_x, pivot_y, pivot_z) x (0, 0, F)
             // My = pivot_x * 0 - 0 * F = 0 ??? No.
             // Cross Product:
             // x: y*Fz - z*Fy
             // y: z*Fx - x*Fz  <-- Pitch Moment
             // z: x*Fy - y*Fx
             
             // My_constraint = -pivotPos.x * F_constraint_z
             const My_constraint = -pivotPos.x * F_constraint_z;
             
             // Add to totals
             F_ground.z += F_constraint_z;
             M_ground.y += My_constraint;
             
             // Debug
             // if (Math.random() < 0.01) console.log(`Pivot Active: V_p=${v_pivot_z.toFixed(3)}, F=${F_constraint_z.toFixed(0)}, M=${My_constraint.toFixed(0)}`);
        }

        // --- Low Altitude Stability Assistant (User Request) ---
        // Rigidly suppress roll/yaw aero forces near ground to prevent wind drift/flipping
        const heightAGL = this.currentGroundZ - this.state.pos.z;
        const cutoffHeight = 6.1; // 20 ft
        
        if (heightAGL < cutoffHeight || this.onGround) {
            // Linear fade: 0.0 on ground -> 1.0 at 20ft
            let stabilityFactor = Math.max(0, Math.min(1, heightAGL / cutoffHeight));
            
            // If firmly on ground, allow 20% authority for crosswind correction
            if (this.onGround) stabilityFactor = 0.2;
            
            // Apply suppression to Aerodynamic Moments (Wind + Control Surfaces)
            // We keep Pitch (My) active for rotation/flare
            Mx_aero *= stabilityFactor; 
            // Keep commanded rudder authority while damping wind-driven yaw near the ground.
            const rudderDeflection = this.controls.rudder * (this.controlEffectiveness.rudder ?? 1);
            const commandedRudderMoment = q * S * b * this.aircraft.Cdr * rudderDeflection;
            Mz_aero = commandedRudderMoment + (Mz_aero - commandedRudderMoment) * stabilityFactor;
        }

        // --- Ground Stabilizer (Inertia-Based Damping & Roll Clamp) ---
        // Uses Inertia Tensor to provide consistent damping regardless of aircraft mass
        if (this.onGround) {
             const Ix = this.aircraft.Ix || 1000000;
             const Iy = this.aircraft.Iy || 2000000;
             const Iz = this.aircraft.Iz || 3000000;
             
             // Pitch/Yaw Damping (Keep existing logic)
             const pitchYawDamping = 5.0; 
             M_ground.y -= this.state.rates.y * (Iy * pitchYawDamping);
             M_ground.z -= this.state.rates.z * (Iz * pitchYawDamping);

             // Roll Control: Clamp roll using gear height logic
             // User Request: "Use ground/air logic and gear height to clamp roll instead of adding a massive damp"
             
             const euler = this.state.quat.toEuler();
             const phi = euler.phi;

             // Spring force to keep wings level (phi -> 0)
             // Reduced damping to avoid overshoot, added spring stiffness
             const rollStiffness = 4000000; 
             const rollDamping = 1000000; // Reduced from ~5M (Ix * 5)
             
             M_ground.x -= (phi * rollStiffness) + (this.state.rates.x * rollDamping);
             
             // Vertical Damping (Mass-based)
             // Global damper to stop bouncing/jitter at low speeds
             // INCREASED: 5.0 -> 10.0
             if (Math.abs(this.state.vel.z) < 1.0) {
                  F_ground.z -= this.state.vel.z * (this.state.mass * 10.0); 
             }
        }

        // --- Totals ---
        const totalForces = new Vector3(
            Fx_aero + Fx_thrust + gravityBody.x + F_ground.x,
            Fy_aero + gravityBody.y + F_ground.y,
            Fz_aero + gravityBody.z + F_ground.z
        );

        const totalMoments = new Vector3(
            Mx_aero + M_ground.x + M_thrust_body.x,
            My_aero + M_ground.y + M_thrust_body.y,
            Mz_aero + M_ground.z + M_thrust_body.z
        );

        return { 
            forces: totalForces, 
            moments: totalMoments,
            aeroForces: new Vector3(Fx_aero, Fy_aero, Fz_aero),
            thrustForces: new Vector3(Fx_thrust, 0, 0),
            gravityForces: gravityBody,
            groundForces: F_ground,
            debug: {
                alpha, beta, q, 
                CL, CD, Cm, Cl, Cn,
                lift: F_lift, drag: F_drag, side: F_side,
                rollCompressionDrag: rollCompressionDebug.extraDragCoefficient,
                rollRateIntensity: rollCompressionDebug.rollRateIntensity,
                effectiveTurbulence,
                pitchMoment: My_aero,
                groundMomentY: M_ground.y,
                yawMoment: Mz_aero,
                nosewheelSteeringAngle,
                nosewheelSteeringAuthority,
                noseGearContactForce,
                thrustMomentYaw: M_thrust_body.z,
                thrustMomentPitch: M_thrust_body.y
            }
        };
    }

    integrate(forces, moments, dt) {
        // Linear Acceleration (Body Frame)
        // F = m * (dv/dt + w x v)
        // dv/dt = F/m - w x v
        const accel = forces.scale(1 / this.state.mass).sub(this.state.rates.cross(this.state.vel));
        
        this.state.vel = this.state.vel.add(accel.scale(dt));

        // Angular Acceleration (Body Frame)
        // M = I * dw/dt + w x (I * w)
        // dw/dt = I_inv * (M - w x (I * w))
        // Assuming diagonal Inertia Tensor for simplicity
        const Ix = this.aircraft.Ix || 1000000;
        const Iy = this.aircraft.Iy || 2000000;
        const Iz = this.aircraft.Iz || 3000000;
        
        const p = this.state.rates.x;
        const q = this.state.rates.y;
        const r = this.state.rates.z;

        const p_dot = (moments.x - (Iz - Iy) * q * r) / Ix;
        const q_dot = (moments.y - (Ix - Iz) * p * r) / Iy;
        const r_dot = (moments.z - (Iy - Ix) * p * q) / Iz;

        this.state.rates = this.state.rates.add(new Vector3(p_dot, q_dot, r_dot).scale(dt));

        // Kinematics (Position & Orientation)
        // Position dot (Earth) = R_body_to_earth * V_body
        const v_earth = this.state.quat.rotate(this.state.vel);
        this.state.pos = this.state.pos.add(v_earth.scale(dt));
        
        // Quaternion dot = 0.5 * q * w (quaternion multiplication)
        // q_dot = 0.5 * q * qw
        
        const currentQ = this.state.quat;
        const q_deriv = new Quaternion(
            0.5 * (-currentQ.x*p - currentQ.y*q - currentQ.z*r),
            0.5 * (currentQ.w*p + currentQ.y*r - currentQ.z*q),
            0.5 * (currentQ.w*q - currentQ.x*r + currentQ.z*p),
            0.5 * (currentQ.w*r + currentQ.x*q - currentQ.y*p)
        );

        this.state.quat.w += q_deriv.w * dt;
        this.state.quat.x += q_deriv.x * dt;
        this.state.quat.y += q_deriv.y * dt;
        this.state.quat.z += q_deriv.z * dt;
        this.state.quat.normalize();

        // Hard Stop for Low Speed Ground Stability
        const brakingToHold = this.controls.wheelBrakes > 0.1 || this.systems?.brakes?.parkingBrake === true;
        if (this.onGround && brakingToHold && this.state.vel.magnitude() < 0.5 && this.controls.throttle < 0.1) {
            this.state.vel = new Vector3(0, 0, 0);
            this.state.rates = new Vector3(0, 0, 0);
        }
    }

    checkConstraints(dt = 1 / 60) {
        const contact = this.groundInteractionService.resolveSurfaceContact(
            this.state, this.currentGroundZ, this.aircraft.gearHeight, this.controls.gear > 0.5
        );
        this.onGround = contact.contact;
        if (contact.contact && contact.sinkRate > 10 && !this.crashed) {
            this.crashed = true;
            this.crashReason = 'Hard Landing / Crash';
        }
        // Crash Detection
        // Altitude AGL (Above Ground Level)
        const altitude = this.currentGroundZ - this.state.pos.z; 
        
        // 2. Obstacle Collision Check (New Safety Rules)
        // Rule: Safe at 0ft only on RUNWAY or GRASS. Unsafe (< 10ft) elsewhere.
        if (!this.crashed && altitude < 3.05) { // < 10 ft
            const groundStatus = this.groundStatus?.status;
            const speed = typeof this.state.vel?.magnitude === 'function' ? this.state.vel.magnitude() : 0;
            const groundedTaxiLike = this.onGround && speed < 80;
            let validApproachCorridor = false;

            if (this.runwayGeometry?.thresholdStart && Number.isFinite(this.state.geo?.lat) && Number.isFinite(this.state.geo?.lon)) {
                const { thresholdStart, heading, length, width } = this.runwayGeometry;
                const latRad = thresholdStart.latitude * Math.PI / 180;
                const metersPerLat = 111132.92;
                const metersPerLon = 111412.84 * Math.cos(latRad);
                const dx = (this.state.geo.lat - thresholdStart.latitude) * metersPerLat;
                const dy = (this.state.geo.lon - thresholdStart.longitude) * metersPerLon;
                const headingRad = heading * Math.PI / 180;
                const along = dx * Math.cos(headingRad) + dy * Math.sin(headingRad);
                const cross = -dx * Math.sin(headingRad) + dy * Math.cos(headingRad);
                const euler = this.state.quat?.toEuler?.() || { psi: 0 };
                const headingDeg = (euler.psi * 180 / Math.PI + 360) % 360;
                let headingError = Math.abs(((headingDeg - heading + 540) % 360) - 180);
                if (headingError > 180) headingError = 360 - headingError;
                const descending = (this.state.vel?.z || 0) > -1.5;
                validApproachCorridor = !this.onGround
                    && along >= -1200
                    && along <= length + 300
                    && Math.abs(cross) <= Math.max(width * 1.5, 90)
                    && headingError <= 20
                    && descending;
            }

            if (groundStatus === 'OBJECTS' && !groundedTaxiLike && !validApproachCorridor) {
                this.objectCollisionTimer += dt;
                if (this.objectCollisionTimer >= 0.5) {
                    this.crashed = true;
                    this.crashReason = "Collision with Ground Objects";
                    console.log("CRASH: Collision with objects at altitude " + altitude.toFixed(2) + "m");
                }
            } else {
                this.objectCollisionTimer = 0;
            }
        } else {
            this.objectCollisionTimer = 0;
        }
    }

    getSerializableState() {
        const autopilotStatus = this.getAutopilotStatus ? this.getAutopilotStatus() : { engaged: false, mode: 'OFF', targets: {} };

        return {
            position: {
                x: this.state.pos.x,
                y: this.state.pos.y,
                z: -this.state.pos.z,
                latitude: this.state.geo.lat,
                longitude: this.state.geo.lon
            },
            velocity: {
                x: this.state.vel.x,
                y: this.state.vel.y,
                z: this.state.vel.z
            },
            orientation: {
                w: this.state.quat.w,
                x: this.state.quat.x,
                y: this.state.quat.y,
                z: this.state.quat.z
            },
            rates: {
                x: this.state.rates.x,
                y: this.state.rates.y,
                z: this.state.rates.z
            },
            controls: {
                ...this.controls,
                throttles: Array.isArray(this.controls.engineThrottles) ? [...this.controls.engineThrottles] : []
            },
            engineParams: {
                n1: this.engines.map((engine) => engine.state.n1),
                n2: this.engines.map((engine) => engine.state.n2),
                egt: this.engines.map((engine) => engine.state.egt),
                fuelFlow: this.engines.map((engine) => engine.state.fuelFlow),
                oilPressure: this.engines.map((engine) => engine.state.oilPressure),
                vibration: this.engines.map((engine) => engine.state.vibration),
                epr: this.engines.map((engine) => 1.0 + Math.pow(Math.max(0, engine.state.n1) / 100, 2) * 0.5),
                fadecMode: this.getFADECMode(),
                maxN1: this.aircraft.maxN1 || 102,
                egtYellow: this.aircraft.egtYellow || 750,
                egtRed: this.aircraft.egtRed || 850,
                startValveOpen:  Object.values(this.systems?.engines || {}).map(e => e.startSwitch === 'GRD'),
                oilFilterBypass: this.engines.map(e => e.state.running && e.state.oilPressure < 13 && e.state.oilPressure > 0),
                lowOilPressure:  this.engines.map(e => e.state.running && e.state.oilPressure < 13),
            },
            autopilot: {
                engaged: autopilotStatus.engaged,
                mode: autopilotStatus.mode,
                targets: autopilotStatus.targets,
                vnavArmed: autopilotStatus.vnavArmed,
                autothrottleArmed: autopilotStatus.autothrottleArmed
            },
            autopilotTargets: autopilotStatus.targets,
            systems: this.systems,
            fuel: this.state.fuel,
            runwayGeometry: this.runwayGeometry,
            groundStatus: this.groundStatus,
            navigationPath: this.navigationPath,
            currentWaypointIndex: this.currentWaypointIndex || 0
        };
    }

    getOutputState() {
        // Convert internal physics state to the App's expected format
        const euler = this.state.quat.toEuler(); // Rads
        const headingDeg = (euler.psi * 180 / Math.PI + 360) % 360;
        const altitude = -this.state.pos.z; // Altitude relative to Origin (usually Runway)
        const altitudeAMSL = altitude + (this.airportElevation || 0);
        const altitudeAGL = this.currentGroundZ - this.state.pos.z;
        
        // Vertical Speed (Earth Z dot, inverted)
        // v_earth = q * v_body * q_inv
        const v_earth = this.state.quat.rotate(this.state.vel);
        const vs = -v_earth.z;

        const airspeeds = this.calculateAirspeeds();

        const autopilotStatus = this.getAutopilotStatus ? this.getAutopilotStatus() : { engaged: false, targets: {} };
        
        const integrity = this.failureParams.data_integrity;
        const applyNoise = (val) => {
            if (integrity >= 1.0 || !Number.isFinite(val)) return val;
            const noiseFactor = (1 - integrity) * 0.1; 
            return val * (1 + (Math.random() - 0.5) * noiseFactor);
        };

        const outputState = {
            structural: this.structuralLimits.getSnapshot(),
            groundTrack: Math.atan2(this.state.quat.rotate(this.state.vel).y,
                this.state.quat.rotate(this.state.vel).x) * 180 / Math.PI,
            position: {
                x: this.state.pos.x, // North
                y: this.state.pos.y, // East
                z: applyNoise(altitude),         // Altitude (Relative Up)
                latitude: this.state.geo.lat,
                longitude: this.state.geo.lon
            },
            velocity: {
                u: this.state.vel.x,
                v: this.state.vel.y,
                w: this.state.vel.z
            },
            orientation: {
                phi: applyNoise(euler.phi),
                theta: applyNoise(euler.theta),
                psi: applyNoise(euler.psi)
            },
            angularRates: {
                p: applyNoise(this.state.rates.x),
                q: applyNoise(this.state.rates.y),
                r: applyNoise(this.state.rates.z)
            },
            controls: {
                throttle: this.controls.throttle,
                throttles: Array.isArray(this.controls.engineThrottles) ? [...this.controls.engineThrottles] : [],
                pitch: this.controls.elevator,
                roll: this.controls.aileron,
                yaw: this.controls.rudder,
                trim: this.controls.trim
            },
            engineThrottles: Array.isArray(this.controls.engineThrottles) ? [...this.controls.engineThrottles] : [],
            flaps: this.controls.flaps,
            gear: this.controls.gear > 0.5,
            airBrakes: this.controls.airBrakes,
            wheelBrakes: this.controls.wheelBrakes,
            verticalSpeed: applyNoise(vs * 196.85), // m/s -> ft/min
            hasCrashed: this.crashed,
            crashWarning: this.crashReason,
            trueAirspeed: airspeeds.trueAirspeed,
            indicatedAirspeed: airspeeds.indicatedAirspeed,
            groundSpeed: airspeeds.groundSpeed,
            heading: applyNoise(headingDeg),
            autopilot: autopilotStatus,
            autopilotTargets: autopilotStatus.targets,
            autopilotDebug: this.autopilot.debugState,
            engineParams: {
                n1: this.engines.map(e => applyNoise(e.state.n1)),
                n2: this.engines.map(e => applyNoise(e.state.n2)),
                egt: this.engines.map(e => applyNoise(e.state.egt)),
                fuelFlow: this.engines.map(e => applyNoise(e.state.fuelFlow)),
                oilPressure: this.engines.map(e => applyNoise(e.state.oilPressure)),
                vibration: this.engines.map(e => applyNoise(e.state.vibration)),
                epr: this.engines.map(e => applyNoise(1.0 + Math.pow(Math.max(0, e.state.n1) / 100, 2) * 0.5)),
            },
            systems: this.systems,
            fuel: this.state.fuel,
            currentWaypointIndex: this.currentWaypointIndex || 0,
            navigationPath: this.navigationPath,
            environment: {
                windSpeed: this.environment?.windSpeed || 0,
                windDirection: this.environment?.windDirection || 0,
                windGust: this.environment?.windGust || 0,
                windShear: this.environment?.windShear || 0,
                gustStrength: this.environment?.gustStrength || 0,
                shearStrength: this.environment?.shearStrength || 0,
                turbulence: this.environment?.turbulence || 0,
                precipitation: this.environment?.precipitation || 0,
                cloudCover: this.environment?.cloudCover || 0,
                temperature: this.environment?.temperature ?? null
            },
            thrust: Number.isFinite(this.thrustForces?.x) ? this.thrustForces.x : 0,
            drag: Number.isFinite(this.aeroForces?.x) ? Math.abs(this.aeroForces.x) : 0,
            derived: {
                altitude_ft: altitudeAMSL * 3.28084, // Display AMSL
                altitude: altitudeAMSL * 3.28084,
                altitude_agl_ft: altitudeAGL * 3.28084,
                terrain_elevation_ft: (this.terrainElevation || 0) * 3.28084,
                airport_elevation_ft: (this.airportElevation || 0) * 3.28084,
                airspeed: airspeeds.trueAirspeed,
                indicatedAirspeed: airspeeds.indicatedAirspeed,
                groundSpeed: airspeeds.groundSpeed,
                heading: headingDeg
            },
            
            debugPhysics: {
                theta: euler.theta,
                phi: euler.phi,
                psi: euler.psi,
                dynamicPressure_q: this.debugData?.q || 0,
                pitchMoment_y: this.debugData?.pitchMoment || 0,
                pitchRate_q: this.state.rates.y,
                altitude_z: altitude,
                altitude_amsl: altitudeAMSL,
                altitude_agl: altitudeAGL,
                ground_z_ned: this.currentGroundZ,
                isOnGround: this.onGround,
                lift: this.debugData?.lift || 0,
                pitchTorque: this.debugData?.pitchMoment || 0,
                yawMoment_n: this.debugData?.yawMoment || 0,
                steeringMoment_n: this.debugData?.steeringMoment || 0,
                
                // Extended Debugging
                alpha: this.debugData?.alpha || 0,
                beta: this.debugData?.beta || 0,
                Cm: this.debugData?.Cm || 0,
                CL: this.debugData?.CL || 0,
                elevator: this.controls.elevator,
                trim: this.controls.trim
            },
            runwayGeometry: this.runwayGeometry,
            groundStatus: this.groundStatus
        };

        if (this.warningSystem) {
             outputState.activeWarnings = this.warningSystem.update(outputState, 0.016);
        }

        return outputState;
    }
    
    // Interface methods required by the hook
    setFlaps(val) { this.controls.flaps = val; }
    setGear(val) {
        if (this.onGround && !val) {
            return;
        }
        this.controls.gear = val ? 1 : 0;
    }
    setAirBrakes(val) { this.controls.airBrakes = val; }
    setWheelBrakes(val) { this.controls.wheelBrakes = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0)); }
    setToeBrakes(val) {
        const pressure = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0));
        this.toeBrakePressure = pressure;
        this.setWheelBrakes(this.systems?.brakes?.parkingBrake ? 1 : pressure);
    }
    setTrim(val) { this.controls.trim = val; }
    setAutopilot(engaged, targets) {
        if (this.aircraft?.scenarioRestrictions?.autopilotForbidden && engaged) {
            console.warn('Autopilot engagement blocked by active challenge restrictions.');
            this.autopilot?.setEngaged?.(false, this.state);
            return false;
        }
        const explicitTargets = targets ? { ...targets } : null;
        if (targets) {
            this.autopilot.setTargets(targets);
        }
        if (typeof engaged === 'boolean') {
            const v_earth = this.state.quat.rotate(this.state.vel);
            const airspeeds = this.calculateAirspeeds();
            const euler = this.state.quat.toEuler();
            const currentState = {
                airspeed: airspeeds.indicatedAirspeed,
                verticalSpeed: -v_earth.z * 196.85,
                pitch: euler.theta,
                roll: euler.phi,
                altitude: this.getOutputState().derived?.altitude ?? ((-this.state.pos.z + (this.airportElevation || 0)) * 3.28084),
                heading: (euler.psi * 180 / Math.PI + 360) % 360,
                beta: this.debugData?.beta || 0,
                throttle: this.controls.throttle,
                elevator: this.controls.elevator,
                aileron: this.controls.aileron,
                rudder: this.controls.rudder,
                trim: this.controls.trim
            };

            this.autopilot.setEngaged(engaged, currentState, { explicitTargets });
        }
    }

    performSystemAction(system, action, value) {
        if (!this.systems[system]) {
            console.warn(`System ${system} not found`);
            return;
        }

        // Handle Toggle Logic (if value is undefined)
        const toggle = (current) => {
            if (value !== undefined) return value;
            if (typeof current === 'boolean') return !current;
            return current; // No change if not boolean and no value
        };

        // Canonicalize 737-specific action aliases before dispatch
        if (system === 'ice' && action === 'engAntiIce') {
            const next = toggle(this.systems.ice.eng1AntiIce);
            this.systems.ice.eng1AntiIce = next;
            this.systems.ice.eng2AntiIce = next;
            return;
        }

        // Special System Handling
        if (system === 'hydraulics') {
            if (action.includes('.')) {
                const [sysName, field] = action.split('.');
                const sys = this.systems.hydraulics[sysName];
                if (sys && Object.prototype.hasOwnProperty.call(sys, field)) {
                    sys[field] = toggle(sys[field]);
                } else {
                    console.warn(`Hydraulics nested action ${action} not found`);
                }
            } else {
                if (action === 'eng1Pump' && this.systems.hydraulics.sysA) this.systems.hydraulics.sysA.engPump = toggle(this.systems.hydraulics.sysA.engPump);
                else if (action === 'elec1Pump' && this.systems.hydraulics.sysA) this.systems.hydraulics.sysA.elecPump = toggle(this.systems.hydraulics.sysA.elecPump);
                else if (action === 'eng2Pump' && this.systems.hydraulics.sysB) this.systems.hydraulics.sysB.engPump = toggle(this.systems.hydraulics.sysB.engPump);
                else if (action === 'elec2Pump' && this.systems.hydraulics.sysB) this.systems.hydraulics.sysB.elecPump = toggle(this.systems.hydraulics.sysB.elecPump);
                else console.warn(`Hydraulics action ${action} not found`);
            }
        } 
        else if (system === 'apu') {
            if (action === 'bleed') {
                this.systems.apu.bleed = toggle(this.systems.apu.bleed);
            } else if (action === 'start') {
                this.systems.apu.start = value !== undefined ? !!value : true;
            } else if (this.systems.apu[action] !== undefined) {
                this.systems.apu[action] = toggle(this.systems.apu[action]);
            } else {
                console.warn(`APU action ${action} not found`);
            }
        }
        else if (system === 'engines') {
             const setStartSwitch = (engineKey) => {
                 const engine = this.systems.engines?.[engineKey];
                 if (!engine) return;
                 const states = ['OFF', 'GRD', 'FLT'];
                 const current = states.includes(engine.startSwitch) ? engine.startSwitch : 'OFF';
                 engine.startSwitch = value !== undefined ? value : states[(states.indexOf(current) + 1) % states.length];
             };

             const setFuelControl = (engineKey) => {
                 const engine = this.systems.engines?.[engineKey];
                 if (!engine) return;
                 engine.fuelControl = value !== undefined ? !!value : !engine.fuelControl;
             };

             if (action === 'eng1_start_toggle') setStartSwitch('eng1');
             else if (action === 'eng2_start_toggle') setStartSwitch('eng2');
             else if (action === 'eng3_start_toggle') setStartSwitch('eng3');
             else if (action === 'eng4_start_toggle') setStartSwitch('eng4');
             else if (action === 'eng1_start') setStartSwitch('eng1');
             else if (action === 'eng2_start') setStartSwitch('eng2');
             else if (action === 'eng3_start') setStartSwitch('eng3');
             else if (action === 'eng4_start') setStartSwitch('eng4');
             else if (action === 'eng1_fuel' || action === 'eng1_run') setFuelControl('eng1');
             else if (action === 'eng2_fuel' || action === 'eng2_run') setFuelControl('eng2');
             else if (action === 'eng3_fuel' || action === 'eng3_run') setFuelControl('eng3');
             else if (action === 'eng4_fuel' || action === 'eng4_run') setFuelControl('eng4');
        }
        else if (system === 'electrical') {
            if (action === 'batterySelector') {
                const states = ['BAT', 'OFF', 'AUTO'];
                const current = this.systems.electrical.batterySelector || (this.systems.electrical.battery ? 'AUTO' : 'OFF');
                const nextState = value !== undefined ? value : states[(states.indexOf(current) + 1 + states.length) % states.length];
                this.systems.electrical.batterySelector = nextState;
                this.systems.electrical.battery = nextState !== 'OFF';
                this.systems.electrical.stbyPower = nextState !== 'OFF';
            } else if (action === 'apuGen1') {
                this.systems.electrical.apuGen1 = toggle(this.systems.electrical.apuGen1);
            } else if (action === 'apuGen2') {
                this.systems.electrical.apuGen2 = toggle(this.systems.electrical.apuGen2);
            } else if (action === 'apuGen') {
                const nextValue = value !== undefined ? !!value : !(this.systems.electrical.apuGen1 || this.systems.electrical.apuGen2);
                this.systems.electrical.apuGen1 = nextValue;
                this.systems.electrical.apuGen2 = nextValue;
                this.systems.electrical.apuGen = nextValue;
            } else if (this.systems.electrical[action] !== undefined) {
                this.systems.electrical[action] = toggle(this.systems.electrical[action]);
            } else {
                console.warn(`Electrical action ${action} not found`);
            }
        }
        else if (system === 'fire') {
            const normalizedAction = String(action)
                .replace(/Handle$/, '_handle')
                .replace(/^eng(\d+)Handle$/, 'eng$1_handle')
                .replace(/^apuHandle$/, 'apu_handle')
                .replace(/^bottle(\d+)_discharge$/, 'eng1_bottle$1');

            // Fire Handles
            if (normalizedAction === 'eng1_handle') this.systems.fire.eng1Handle = toggle(this.systems.fire.eng1Handle);
            else if (normalizedAction === 'eng2_handle') this.systems.fire.eng2Handle = toggle(this.systems.fire.eng2Handle);
            else if (normalizedAction === 'apu_handle') this.systems.fire.apuHandle = toggle(this.systems.fire.apuHandle);

            // Bottle Discharge (Requires handle pulled usually, but we check in logic)
            else if (normalizedAction === 'eng1_bottle1') this.systems.fire.bottle1_discharge = true; // Momentary
            else if (normalizedAction === 'eng1_bottle2') this.systems.fire.bottle2_discharge = true;
            else if (normalizedAction === 'eng2_bottle1') this.systems.fire.bottle1_discharge = true;
            else if (normalizedAction === 'eng2_bottle2') this.systems.fire.bottle2_discharge = true;
            else if (normalizedAction === 'apu_bottle1') this.systems.fire.bottle1_discharge = true;
            else if (normalizedAction === 'apu_bottle2') this.systems.fire.bottle2_discharge = true;
        }
        else if (system === 'brakes') {
            if (action === 'parkingBrake') {
                const nextValue = value !== undefined ? !!value : !this.systems.brakes.parkingBrake;
                this.systems.brakes.parkingBrake = nextValue;
                this.controls.wheelBrakes = nextValue ? 1 : (this.toeBrakePressure ?? 0);
            } else if (action === 'autobrake') {
                this.systems.brakes.autobrake = value ?? this.systems.brakes.autobrake;
            } else {
                console.warn(`Brakes action ${action} not found`);
            }
        }
        else if (system === 'transponder') {
            // Transponder has specific fields
            if (action === 'code') this.systems.transponder.code = value;
            else if (action === 'mode') this.systems.transponder.mode = value;
            else if (action === 'ident') this.systems.transponder.ident = value;
        }
        else if (system === 'comms') {
            // VHF Logic
            if (action.startsWith('swap_')) {
                const radio = action.replace('swap_', ''); // vhf1, vhf2
                if (this.systems.comms[radio]) {
                    const temp = this.systems.comms[radio].active;
                    this.systems.comms[radio].active = this.systems.comms[radio].stby;
                    this.systems.comms[radio].stby = temp;
                }
            } else if (action.startsWith('set_stby_')) {
                const radio = action.replace('set_stby_', '');
                if (this.systems.comms[radio]) {
                    this.systems.comms[radio].stby = value;
                }
            } else if (action.startsWith('set_code_')) { // Direct code set (if we use numpad)
                const radio = action.replace('set_code_', '');
                 if (this.systems.comms[radio]) {
                    this.systems.comms[radio].stby = value;
                }
            }
        }
        else {
            // Generic Handling
            if (this.systems[system][action] !== undefined) {
                this.systems[system][action] = toggle(this.systems[system][action]);
            } else {
                console.warn(`Action ${action} not found on system ${system}`);
            }
        }

        console.log(`Physics Service: System Action ${system}.${action} -> ${value === undefined ? 'TOGGLE' : value}`);

        // Side effects
        // const newValue = this.systems[system][action]; 
        // this.updateSystemLogic(system, action, newValue);
    }

    /**
     * Handle Radio Tuning Event
     * Automatically sets ILS/Runway Geometry if a tower/approach frequency is tuned.
     * @param {number} frequency - Tuned frequency in MHz
     * @param {Object} flightPlan - Current flight plan object
     */
    handleRadioTuning(frequency, flightPlan) {
        if (!frequency) return;
        
        // console.log(`Physics: Radio tuned to ${frequency.toFixed(3)} MHz`);
        
        const airport = airportService.getAirportByFrequency(frequency);
        
        if (airport) {
            const airportCode = airport.iata || airport.icao;
            // console.log(`Physics: Identified airport ${airportCode} for frequency ${frequency}`);
            
            // Determine which runway to use
            let runwayName = null;
            
            // 1. Check Flight Plan (Arrival)
            if (flightPlan && flightPlan.arrival && (flightPlan.arrival.iata === airportCode || flightPlan.arrival.icao === airportCode)) {
                // If this is the arrival airport, check for selected runway
                // Note: flightPlan.arrival.runways is usually an array of available runways, not necessarily the selected one.
                // However, in this sim, usually the first one is picked or we need to check routeDetails.
                // But let's look at waypoints first as they are more editable.
            }
            
            // 2. Check Flight Plan Waypoints (Specific Waypoint Selection)
            // This is the most reliable source for user selection in F-Comp
            if (flightPlan && flightPlan.waypoints) {
                 const wp = flightPlan.waypoints.find(w => w.type === 'airport' && (w.label === airport.iata || w.label === airport.icao));
                 if (wp && wp.selectedRunway) {
                     runwayName = wp.selectedRunway;
                 }
            }
            
            // 3. Fallback to Arrival default if listed
            if (!runwayName && flightPlan && flightPlan.arrival && (flightPlan.arrival.iata === airportCode || flightPlan.arrival.icao === airportCode)) {
                 if (flightPlan.arrival.runways && flightPlan.arrival.runways.length > 0) {
                     runwayName = flightPlan.arrival.runways[0].name;
                 }
            }

            // 4. Fallback to first runway if no specific selection
            if (!runwayName) {
                if (airport.runways && airport.runways.length > 0) {
                    runwayName = airport.runways[0].name.split('/')[0].trim();
                } else if (airport.runway) {
                    runwayName = airport.runway.split('/')[0].trim();
                } else {
                    runwayName = "09"; 
                }
                console.log(`Physics: No specific runway selected for ${airportCode}, defaulting to ${runwayName}`);
            }
            
            // 5. Smart Runway Selection (Auto-Align)
            // If the selected/default runway is "behind" us (Reciprocal), swap to the other end.
            if (runwayName) {
                // Collect all available runway ends
                let options = [];
                if (airport.runways) {
                    options = airport.runways.flatMap(r => r.name.split('/').map(p => p.trim()));
                } else if (airport.runway) {
                    options = airport.runway.split('/').map(p => p.trim());
                } else {
                    options = ["09", "27"];
                }

                const aircraftHeading = this.state.heading || 0;
                
                // Parse current selection heading
                // Handle "09L" -> 09 -> 90
                const getHeading = (name) => {
                    const match = name.match(/^(\d{2})/);
                    return match ? parseInt(match[1]) * 10 : 0;
                };

                const currentRunwayH = getHeading(runwayName);
                
                // Calculate alignment
                let diff = Math.abs(aircraftHeading - currentRunwayH);
                if (diff > 180) diff = 360 - diff;
                
                // If misalignment is > 90 degrees (Reciprocal Approach), try to find a better end
                if (diff > 90) {
                    const betterOption = options.find(opt => {
                        const optH = getHeading(opt);
                        let d = Math.abs(aircraftHeading - optH);
                        if (d > 180) d = 360 - d;
                        return d <= 90; // Found one facing us
                    });
                    
                    if (betterOption) {
                        console.log(`Physics: Auto-switching runway from ${runwayName} to ${betterOption} based on approach heading (Hdg: ${aircraftHeading.toFixed(0)} vs Rwy: ${currentRunwayH})`);
                        runwayName = betterOption;
                    }
                }
            }
            
            if (runwayName) {
                const geom = airportService.getRunwayGeometry(airportCode, runwayName);
                if (geom) {
                    this.setRunwayGeometry(geom);
                    console.log(`Physics: ILS tuned to ${airportCode} RWY ${runwayName}`);
                    
                    // Optional: Engage ILS mode if close enough? No, let pilot do that.
                    // But we ensure the geometry is ready.
                }
            }
        }
    }

    setRunwayGeometry(geometry) {
        this.runwayGeometry = geometry;
        if (this.autopilot && typeof this.autopilot.setRunwayGeometry === 'function') {
            this.autopilot.setRunwayGeometry(geometry);
        }
        console.log("Physics Service: Runway Geometry Set", geometry);
    }

    updateGroundStatus() {
        const result = this.groundInteractionService.updateGroundStatus(
            this.state,
            this.runwayGeometry,
            this.terrainElevation,
            this.airportElevation
        );
        this.groundStatus = result.groundStatus;
        this.currentGroundZ = result.currentGroundZ;
    }

    applyRunwayStabilizer() {
        return this.groundInteractionService.applyRunwayStabilizer(
            this.state,
            this.runwayGeometry,
            this.onGround,
            this.groundStatus,
            this.difficulty,
            this.controls.rudder
        );
    }

    /**
     * Set systems to Cold & Dark state
     */
    setColdStart() {
        console.log("❄️ Physics Service: Applying Cold & Dark Configuration");
        
        // Electrical
        this.systems.electrical = {
            ...this.systems.electrical,
            batterySelector: 'OFF',
            battery: false,
            stbyPower: false,
            gen1: false,
            gen2: false,
            apuGen: false,
            apuGen1: false,
            apuGen2: false,
            busTie: true,
            dcVolts: 0,
            acVolts: 0,
            acFreq: 0,
            acAmps: 0,
            sourceOff1: true,
            sourceOff2: true,
            apuGenOff: true
        };

        // Fuel (Pumps Off)
        this.systems.fuel = {
            ...this.systems.fuel,
            leftPumps: false,
            rightPumps: false,
            centerPumps: false,
            crossfeed: false,
            pressL: 0,
            pressR: 0,
            pressC: 0
        };

        // APU Off
        this.systems.apu = {
            ...this.systems.apu,
            master: false,
            start: false,
            running: false,
            starting: false,
            bleed: false,
            egt: 0,
            n2: 0,
            state: 'OFF'
        };

        // Hydraulics Off
        this.systems.hydraulics.sysA.engPump = false; 
        this.systems.hydraulics.sysA.elecPump = false;
        this.systems.hydraulics.sysB.engPump = false;
        this.systems.hydraulics.sysB.elecPump = false;
        this.systems.hydraulics.sysA.pressure = 0;
        this.systems.hydraulics.sysB.pressure = 0;

        // Pressurization / Packs Off
        this.systems.pressurization = {
            ...this.systems.pressurization,
            packL: false,
            packR: false,
            bleed1: false,
            bleed2: false,
            isolationValve: true,
            ductPressL: 0,
            ductPressR: 0
        };

        // Lighting Off
        this.systems.lighting = {
            landing: false,
            taxi: false,
            nav: false,
            beacon: false,
            strobe: false,
            logo: false,
            wing: false,
            powered: false
        };
        
        // Reset Engines (Systems & Physics)
        if (this.systems.engines) {
            Object.keys(this.systems.engines).forEach(key => {
                this.systems.engines[key].startSwitch = 'OFF';
                this.systems.engines[key].fuelControl = false;
                this.systems.engines[key].n2 = 0;
                this.systems.engines[key].egt = 20;
            });
        }

        // Reset Engines (Physics Models)
        this.engines.forEach(e => {
            e.state.n1 = 0;
            e.state.n2 = 0;
            e.state.egt = 20; // Cold EGT
            e.state.fuelFlow = 0;
            e.state.oilPressure = 0;
            e.state.running = false;
        });
    }

    /**
     * Set initial flight conditions
     */
    setInitialConditions(conditions) {
        if (!conditions) return;
        this.toeBrakePressure = 0;

        const hasKinematicResetFields = Boolean(
            conditions.position !== undefined ||
            conditions.velocity !== undefined ||
            conditions.orientation !== undefined ||
            conditions.latitude !== undefined ||
            conditions.longitude !== undefined ||
            conditions.altitude !== undefined ||
            conditions.speed !== undefined
        );

        // Position
        if (conditions.latitude !== undefined) this.state.geo.lat = conditions.latitude;
        if (conditions.longitude !== undefined) this.state.geo.lon = conditions.longitude;
        if (conditions.altitude !== undefined) {
            this.state.pos.z = -conditions.altitude / 3.28084;
            if (conditions.altitude > 100) {
                this.onGround = false;
            }
        }
        if (conditions.speed !== undefined) {
            const speedMs = conditions.speed * 0.514444;
            this.state.vel.x = speedMs;
        }

        // Orientation (psi = yaw in radians)
        if (conditions.orientation && conditions.orientation.psi !== undefined) {
            this.state.quat = Quaternion.fromEuler(0, 0, conditions.orientation.psi);
        } else if (conditions.heading !== undefined) {
            const psi = conditions.heading * Math.PI / 180;
            this.state.quat = Quaternion.fromEuler(0, 0, psi);
        }

        // Difficulty
        if (conditions.difficulty) {
            this.difficulty = conditions.difficulty;
        } else {
            this.difficulty = 'rookie'; // Default
        }

        // Apply Cold Start if Professional or higher, unless a scenario explicitly launches hot
        const forceHotStart = this.aircraft?.scenarioMode && this.aircraft?.scenarioRestrictions?.hotStart !== false;
        if (!forceHotStart && ['pro', 'professional', 'survival', 'devil'].includes(this.difficulty)) {
            this.setColdStart();
        } else if (conditions.coldStart) {
            // Explicit override
            this.setColdStart();
        }

        // Tutorial airborne spawn: start engines and set cruise throttle
        if (conditions.altitude > 100 && conditions.speed !== undefined) {
            this.engines.forEach(engine => {
                engine.n1 = 85;
                engine.n2 = 90;
                engine.egt = 650;
                engine.running = true;
            });
            this.controls.throttle = 0.65;
            this.controls.engineThrottles.fill(0.65);
            this.controls.gear = 0;
            this.controls.flaps = 0;
            this.controls.airBrakes = 0;
            this.controls.wheelBrakes = 0;
            if (this.systems?.brakes) {
                this.systems.brakes.parkingBrake = false;
            }
        }

        // Flight Plan
        if (conditions.flightPlan) {
            this.flightPlan = conditions.flightPlan;
            this.currentWaypointIndex = 0;
        }

        // Altitude
        if (conditions.position && conditions.position.z !== undefined) {
            this.state.pos.z = -conditions.position.z; // NED uses Z-down
        }

        // Controls
        if (conditions.throttle !== undefined) {
            this.controls.throttle = conditions.throttle;
            // Apply to engines as well
            if (this.controls.engineThrottles) {
                this.controls.engineThrottles.fill(conditions.throttle);
            }
            this.engines.forEach(e => e.setThrottle(conditions.throttle));
        }
        if (conditions.brakes !== undefined) {
            this.controls.wheelBrakes = Math.max(0, Math.min(1, conditions.brakes));
            if (this.systems?.brakes) {
                this.systems.brakes.parkingBrake = conditions.brakes > 0.1;
            }
        }
        if (conditions.airBrakes !== undefined) {
            this.controls.airBrakes = conditions.airBrakes;
        }
        if (conditions.gear !== undefined) {
            this.controls.gear = conditions.gear ? 1 : 0;
        }

        const initialVelocity = this.state.vel.clone ? this.state.vel.clone() : new Vector3(this.state.vel.x, this.state.vel.y, this.state.vel.z);

        // Reset velocities and rates only for true kinematic reinitialization
        this.state.vel = new Vector3(initialVelocity.x, initialVelocity.y, initialVelocity.z);
        if (hasKinematicResetFields) {
            this.state.rates = new Vector3(0, 0, 0);
        }
        
        // Update autopilot targets if available
        if (conditions.orientation && conditions.orientation.psi !== undefined) {
            const headingDeg = (conditions.orientation.psi * 180 / Math.PI + 360) % 360;
            this.autopilot.setTargets({ heading: headingDeg === 0 ? 360 : headingDeg });
        }
        
        // Failure System Config
        if (this.failureSystem) {
            // Re-initialize failure system with new config if provided
            const failureConfig = { engineCount: this.aircraft.engineCount };
            if (conditions.difficulty) failureConfig.difficulty = conditions.difficulty;
            
            // Only re-create if we have new config, otherwise just reset
            if (conditions.difficulty) {
                this.failureSystem = new FailureHandler(failureConfig);
            } else {
                this.failureSystem.reset();
            }
        }
    }
    
    updateAutopilotTargets(targets) {
        this.autopilot.setTargets(targets);
        return this.getAutopilotStatus();
    }
    
    updateFlightPlan(newFlightPlan) {
        console.log('🔄 Updating Flight Plan:', newFlightPlan);

        let newWaypoints = [];
        if (Array.isArray(newFlightPlan)) {
            newWaypoints = newFlightPlan;
        } else if (newFlightPlan && Array.isArray(newFlightPlan.waypoints)) {
            newWaypoints = newFlightPlan.waypoints;
        } else {
            console.warn('⚠️ Invalid flight plan format provided to physics service');
            this.flightPlan = [];
            return;
        }

        const incomingIndex = Number.isInteger(newFlightPlan?.currentWaypointIndex)
          ? newFlightPlan.currentWaypointIndex
          : null;
        const preserveIndex = (this.flightPlan && this.flightPlan.length === newWaypoints.length && incomingIndex === null);
        const oldIndex = this.currentWaypointIndex;

        this.flightPlan = newWaypoints;

        if (incomingIndex !== null) {
            this.currentWaypointIndex = incomingIndex;
        } else if (preserveIndex) {
            this.currentWaypointIndex = oldIndex;
        } else {
            this.currentWaypointIndex = 0;
        }

        if (this.currentWaypointIndex >= this.flightPlan.length) {
            this.currentWaypointIndex = Math.max(0, this.flightPlan.length - 1);
        }
    }

    loadFlightState(data) {
        if (!data) return;
        
        // console.log('🔄 Loading flight state...', data);

        // 1. Restore Physics State
        if (data.physicsState) {
            const ps = data.physicsState;
            
            // Position
            if (ps.position) {
                // Restore Geo Position
                if (ps.position.latitude !== undefined) this.state.geo.lat = ps.position.latitude;
                if (ps.position.longitude !== undefined) this.state.geo.lon = ps.position.longitude;
                
                // Restore Local Position (NED)
                // Note: ps.position.z is Altitude (Positive Up), but state.pos.z is NED (Positive Down)
                // If saved z was altitude, we negate it.
                // We check if z seems to be altitude (>0 usually)
                this.state.pos = new Vector3(
                    ps.position.x, 
                    ps.position.y, 
                    -Math.abs(ps.position.z) // Ensure Z is negative (Up in NED)
                );
            }
            
            // Velocity
            if (ps.velocity) {
                // Check if saved as u,v,w (OutputState format) or x,y,z (Direct serialization)
                if (ps.velocity.u !== undefined) {
                    this.state.vel = new Vector3(ps.velocity.u, ps.velocity.v, ps.velocity.w);
                } else {
                    this.state.vel = new Vector3(ps.velocity.x, ps.velocity.y, ps.velocity.z);
                }
            }
            
            // Orientation (Quaternion)
            if (ps.orientation) {
                // Check if we have quaternion components directly
                if (ps.orientation.w !== undefined) {
                    this.state.quat = new Quaternion(ps.orientation.w, ps.orientation.x, ps.orientation.y, ps.orientation.z);
                } 
                // Fallback to Euler if only theta/phi/psi available (from view model)
                else if (ps.orientation.theta !== undefined) {
                     this.state.quat = Quaternion.fromEuler(ps.orientation.phi, ps.orientation.theta, ps.orientation.psi);
                }
            }
            
            // Angular Rates
            if (ps.angularRates) {
                this.state.rates = new Vector3(ps.angularRates.p, ps.angularRates.q, ps.angularRates.r);
            } else if (ps.rates) {
                this.state.rates = new Vector3(ps.rates.x, ps.rates.y, ps.rates.z);
            } else {
                this.state.rates = new Vector3(0, 0, 0);
            }

            // Controls
            if (ps.controls) {
                this.controls = { ...this.controls, ...ps.controls };
                
                // Ensure engineThrottles array exists and is populated
                if (!this.controls.engineThrottles || this.controls.engineThrottles.length !== this.aircraft.engineCount) {
                     this.controls.engineThrottles = Array(this.aircraft.engineCount).fill(this.controls.throttle);
                     // If we have legacy throttles in ps.controls, try to recover
                     if (ps.controls.throttles && Array.isArray(ps.controls.throttles)) {
                         ps.controls.throttles.forEach((val, i) => {
                             if (i < this.controls.engineThrottles.length) this.controls.engineThrottles[i] = val;
                         });
                     }
                }
            }

            // Engines (Restore Internal State)
            if (ps.engineParams) {
                this.engines.forEach((e, i) => {
                    if (ps.engineParams.n1 && ps.engineParams.n1[i] !== undefined) e.state.n1 = ps.engineParams.n1[i];
                    if (ps.engineParams.n2 && ps.engineParams.n2[i] !== undefined) e.state.n2 = ps.engineParams.n2[i];
                    if (ps.engineParams.egt && ps.engineParams.egt[i] !== undefined) e.state.egt = ps.engineParams.egt[i];
                    if (ps.engineParams.fuelFlow && ps.engineParams.fuelFlow[i] !== undefined) e.state.fuelFlow = ps.engineParams.fuelFlow[i];
                    
                    // Ensure engine running state matches N2
                    e.running = e.state.n2 > 20;
                    
                    // Restore internal throttle command if available, otherwise sync from controls
                    if (this.controls.engineThrottles[i] !== undefined) {
                        e.setThrottle(this.controls.engineThrottles[i]);
                    }
                });
                
                // Set commanded throttle (Legacy Global Fallback removed, relying on loop above)
            }
            
            // Autopilot
            if (ps.autopilot) {
                this.autopilot.setEngaged(ps.autopilot.engaged);
                if (ps.autopilot.mode) this.autopilot.setTargets({ mode: ps.autopilot.mode });
                // If targets are nested in ps.autopilot.targets or directly in ps.autopilotTargets
                const targets = ps.autopilot.targets || data.physicsState.autopilotTargets;
                if (targets) this.autopilot.setTargets(targets);
                
                // Restore PID states if available (ps.autopilotDebug might contain them?)
                // For now, resetting is safer than restoring partial state
                // this.autopilot.reset(); // Maybe too aggressive?
            }
            
            // Systems
            if (ps.systems) {
                this.systems = { ...this.systems, ...ps.systems };
            }
            
            // Fuel
            if (data.flightData && data.flightData.fuel !== undefined) {
                this.state.fuel = data.flightData.fuel;
            }
        }
        // Fallback: Restore from Flight Data (View Model)
        else if (data.flightData) {
            const fd = data.flightData;
            
            if (fd.position) {
                this.state.pos = new Vector3(fd.position.x, fd.position.y, fd.position.z);
            }
            
            // Estimate orientation from Euler
            const pitch = (fd.pitch || 0) * Math.PI / 180;
            const roll = (fd.roll || 0) * Math.PI / 180;
            const heading = (fd.heading || 0) * Math.PI / 180;
            this.state.quat = Quaternion.fromEuler(roll, pitch, heading);
            
            // Estimate velocity from airspeed/heading
            // This is lossy but better than nothing
            const tasMs = (fd.airspeed || 0) * 0.514444;
            // Assuming level flight aligned with heading
            const vx = tasMs * Math.cos(pitch) * Math.cos(heading);
            const vy = tasMs * Math.cos(pitch) * Math.sin(heading);
            const vz = -tasMs * Math.sin(pitch); // Approximate
            // We need velocity in Body frame or NED? 
            // state.vel is Body Frame (FRD).
            // V_body = [TAS, 0, 0] approx if no slip/AoA
            this.state.vel = new Vector3(tasMs, 0, 0);
            
            this.state.rates = new Vector3(0, 0, 0);
        }

        // 2. Restore Flight Plan
        if (data.flightPlan) {
            this.flightPlan = data.flightPlan;
            // Try to find nearest waypoint index?
            // For now reset to 0 or use saved index if available
            this.currentWaypointIndex = data.flightData?.currentWaypointIndex || 0;
        }

        // 3. Reset Crash State & Re-validate Ground Status
        this.crashed = false;
        this.crashReason = "";
        this.objectCollisionTimer = 0;
        this.time = data.flightData?.frame ? (data.flightData.frame * 0.016) : 0; // Approximate time
        
        // Ensure altitude is safe if we just loaded
        // If we are "on ground", ensure we aren't underground
        // groundStatus logic will run next frame, but we need to prevent immediate crash
        
        // Recalculate derived state to ensure consistency
        if (this.state.pos.z > 0) {
            // NED z is positive down. So positive Z means underground (if ground is 0).
            // But we treat ground as negative usually? 
            // Wait, standard NED: Z is Down. Altitude is -Z.
            // If Altitude is positive, Z is negative.
            // If Z is positive, we are below sea level (or whatever 0 reference is).
            // Ground Z is stored in currentGroundZ (NED).
            // If Z > currentGroundZ, we are underground.
        }

        // Force ground status update if we have runway geometry
        // Note: We might be restoring to a point where we don't have the geometry loaded yet?
        // Ideally we should save runwayGeometry too.
        if (data.runwayGeometry) {
            this.runwayGeometry = data.runwayGeometry;
        }
        
        // Reset ground status to avoid immediate "unsafe altitude" trigger
        // We'll let the next update loop figure out the real status
        // But if we are low, we must ensure we don't crash instantly.
        const altitude = -this.state.pos.z;
        if (altitude < 100) { // If low altitude
             // Check if we assume on ground?
             // If velocity is low, assume on ground
             if (this.state.vel.magnitude() < 40) {
                 this.onGround = true;
             } else {
                 this.onGround = false;
             }
        } else {
            this.onGround = false;
        }
        
        // Explicitly clear ground status to force re-evaluation without carrying over 'unsafe' state
        this.groundStatus = { status: 'UNKNOWN', remainingLength: 0 };
        
        console.log('✅ Flight state loaded. Crash state reset.');
    }

    getFlapIncrements() {
        const profile = this.aircraft.flapProfile;
        if (!profile || !profile.positions || profile.positions.length === 0) {
            return { cl: 0, cd: 0 };
        }

        let flapInput = this.controls.flaps; // Interpreted as Index (0 to MaxIndex)
        const positions = profile.positions;
        const numPositions = positions.length;
        const maxIndex = numPositions - 1;

        // Clamp input to valid range
        if (flapInput < 0) flapInput = 0;
        if (flapInput > maxIndex) flapInput = maxIndex;

        // Linear interpolation between profile positions
        const idx1 = Math.floor(flapInput);
        const idx2 = Math.min(idx1 + 1, maxIndex);
        const frac = flapInput - idx1;

        const pos1 = positions[idx1];
        const pos2 = positions[idx2];

        // Safely access increments
        const cl1 = pos1.clIncrement || 0;
        const cd1 = pos1.cdIncrement || 0;
        const cl2 = pos2.clIncrement || 0;
        const cd2 = pos2.cdIncrement || 0;

        const cl = cl1 + (cl2 - cl1) * frac;
        const cd = cd1 + (cd2 - cd1) * frac;

        return { cl, cd };
    }

    getAirbrakeIncrements() {
        const profile = this.aircraft.airbrakeProfile;
        
        // Calculate Effectiveness (Hydraulics)
        const effectiveness = this.controlEffectiveness.spoilers !== undefined ? this.controlEffectiveness.spoilers : 1.0;
        
        // Handle legacy profile structure (fallback)
        if (profile && profile.airPosition && !profile.positions) {
            const brakeInput = this.controls.airBrakes;
            
            if (profile.hasTwoTier) {
                // Map indices to legacy behavior roughly
                // 0=RET, 1=ARM(0%), 2=FLT(Air), 3=GND(Ground)
                if (brakeInput <= 1) return { cl: 0, cd: 0 };
                if (brakeInput === 2) {
                     return { 
                        cl: (profile.airPosition.liftDecrement || 0) * effectiveness, 
                        cd: (profile.airPosition.dragIncrement || 0) * effectiveness
                    };
                }
                if (brakeInput >= 3) {
                     return { 
                        cl: (profile.groundPosition.liftDecrement || 0) * effectiveness, 
                        cd: (profile.groundPosition.dragIncrement || 0) * effectiveness
                    };
                }
                return { cl: 0, cd: 0 };
            } else {
                 // Simple 0-1 extension
                 if (this.onGround) {
                    return { 
                        cl: (profile.groundPosition.liftDecrement || 0) * brakeInput * effectiveness, 
                        cd: (profile.groundPosition.dragIncrement || 0) * brakeInput * effectiveness
                    };
                } else {
                    return { 
                        cl: (profile.airPosition.liftDecrement || 0) * brakeInput * effectiveness, 
                        cd: (profile.airPosition.dragIncrement || 0) * brakeInput * effectiveness
                    };
                }
            }
        }

        if (!profile || !profile.positions || profile.positions.length === 0) {
            return { cl: 0, cd: 0 };
        }

        let brakeInput = this.controls.airBrakes;
        const positions = profile.positions;
        const numPositions = positions.length;
        const maxIndex = numPositions - 1;

        // Clamp input
        if (brakeInput < 0) brakeInput = 0;
        if (brakeInput > maxIndex) brakeInput = maxIndex;

        // Linear interpolation
        const idx1 = Math.floor(brakeInput);
        const idx2 = Math.min(idx1 + 1, maxIndex);
        const frac = brakeInput - idx1;
        
        const pos1 = positions[idx1];
        const pos2 = positions[idx2];

        const cl1 = pos1.liftDecrement || 0;
        const cd1 = pos1.dragIncrement || 0;
        const cl2 = pos2.liftDecrement || 0;
        const cd2 = pos2.dragIncrement || 0;

        const cl = (cl1 + (cl2 - cl1) * frac) * effectiveness;
        const cd = (cd1 + (cd2 - cd1) * frac) * effectiveness;

        return { cl, cd };
    }
    
    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        if (this.failureSystem) {
            this.failureSystem.difficulty = difficulty;
            this.failureSystem.settings = this.failureSystem.getDifficultySettings(difficulty);
        }
    }

    setGroundMode(enabled) {
        this.groundMode = enabled;
    }

    setAutopilotMode(mode) {
        this.autopilot.setTargets({ mode: mode });
    }

    setVNAVArmed(armed) {
        this.autopilot.setVNAVArmed(armed);
        return this.getAutopilotStatus();
    }

    setAutothrottleArmed(armed) {
        this.autopilot.setAutothrottleArmed(armed);
        return this.getAutopilotStatus();
    }

    getAutopilotStatus() {
        return {
            engaged: this.autopilot.engaged,
            mode: this.autopilot.mode,
            targets: this.autopilot.targets,
            vnavArmed: this.autopilot.vnavArmed,
            autothrottleArmed: this.autopilot.autothrottleArmed,
            fma: this.autopilot.fmaStatus || null,
            altitudeMode: this.autopilot.altitudeMode,
            userVsTarget: this.autopilot.userVsTarget
        };
    }

    setEngineThrottle(index, value) {
        if (this.controls.engineThrottles && index >= 0 && index < this.controls.engineThrottles.length) {
            this.controls.engineThrottles[index] = value;
            // Also update the engine directly if needed, but updateEngines loop handles it
            if (this.engines[index]) {
                this.engines[index].setThrottle(value);
            }
        }
    }

    /** Set FLEX temperature for derated Airbus takeoff (°C). No-op on Boeing. */
    setFlexTemp(temp) {
        if (this.fadec) this.fadec.setFlexTemp(temp);
    }

    /** Returns current FADEC mode string (IDLE/CLB/FLEX/MCT/TOGA) or null for Boeing. */
    getFADECMode() {
        return this.fadec ? this.fadec.getMode() : null;
    }

    reset() {
        this.toeBrakePressure = 0;
        const gearHeight = this.aircraft.gearHeight || 2;
        // Z is relative to Airport Elevation (Origin), so we just want to be gearHeight above 0
        const initialZ = -gearHeight;
        this.state.pos = new Vector3(0, 0, initialZ);
        this.currentGroundZ = 0; // Reset ground level to airport level (Relative Z = 0)
        
        this.state.vel = new Vector3(0, 0, 0);
        this.state.rates = new Vector3(0, 0, 0);
        this.state.quat = new Quaternion();
        this.crashed = false;
        this.objectCollisionTimer = 0;
        this.currentWaypointIndex = 0;
        
        // Reset Controls
        this.controls.throttle = 0;
        this.controls.engineThrottles.fill(0);
        this.controls.aileron = 0;
        this.controls.elevator = 0;
        this.controls.rudder = 0;
        this.controls.airBrakes = 0;
        this.controls.wheelBrakes = 0;

        // Reset Engines
        this.engines.forEach(e => { 
            e.state.n1 = 0; 
            e.state.n2 = 0;
            e.state.thrust = 0; 
            e.setThrottle(0);
            e.setFailed(false); // Reset failure state
        });

        // Reset Sensors
        this.sensors = { pitotBlocked: false };

        // Reset Critical System States (Flags that might be stuck)
        if (this.systems) {
            this.initializeSystems(this.difficulty);
        }

        // Reset Failure System
        if (this.failureSystem) {
            this.failureSystem.reset();
        }
    }
    resetFailureState() {
        this.controlLag = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0 };
        this.controlEffectiveness = { aileron: 1.0, elevator: 1.0, rudder: 1.0, gear: 1.0 };
        this.vibrationLevel = 0;
        // Note: We do NOT reset engine failure flags or system states (pressure, generators) here.
        // Those are persistent state changes managed by the failure instances or system logic.
        // We only reset the *modifiers* that are re-applied every frame by active failures.
    }

    calculateAirspeeds() {
        const wind = this.environment?.wind || new Vector3(0, 0, 0);
        
        // Transform Wind to Body Frame
        const q_inv = new Quaternion(this.state.quat.w, -this.state.quat.x, -this.state.quat.y, -this.state.quat.z);
        const V_wind_body = q_inv.rotate(wind);
        
        // V_air = V_ground - V_wind
        const V_air_body = this.state.vel.sub(V_wind_body);
        
        const tas = V_air_body.magnitude() * 1.94384; // knots
        
        // Simple IAS approx
        const rho = this.calculateEnvironment(this.state.pos.z).density;
        const ias = tas * Math.sqrt(rho / 1.225);
        
        const gs = this.state.vel.magnitude() * 1.94384; // Ground Speed in knots

        return { trueAirspeed: tas, indicatedAirspeed: ias, groundSpeed: gs };
    }
}

export default RealisticFlightPhysicsService;
