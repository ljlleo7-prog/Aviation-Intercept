
/**
 * Warning System Service
 * 
 * Monitors aircraft state and triggers warnings for:
 * - GPWS (Ground Proximity Warning System)
 * - Stall
 * - Overspeed
 * - Bank Angle
 * - System Failures (Engine, Hydraulics, etc.)
 */

import { terrainRadarService } from './TerrainRadarService.js';

class WarningSystem {
    constructor() {
        this.activeWarnings = [];
        this.lastUpdate = 0;
        
        // Configuration Thresholds
        this.thresholds = {
            stallAlpha: 15, // Degrees
            bankAngleWarn: 40, // Degrees
            overspeedKnots: 340, // Knots (Vmo generic)
            sinkRateWarn: 2500, // ft/min
            sinkRatePullUp: 4000, // ft/min
            terrainClosureWarn: 2000, // ft/min closure rate
            gearWarningAlt: 500, // ft RA (Radio Altitude)
            flapsWarningAlt: 200, // ft RA
            
            // New Thresholds
            vle: 270, // Max Gear Extended Speed
            vlo: 250, // Max Gear Operation Speed
            vfe: [ // Max Flap Extended Speeds (Index 0 = Flaps 1, etc. - Simplified)
                250, // Flaps 1
                230, // Flaps 5
                210, // Flaps 15
                190, // Flaps 20
                180, // Flaps 25
                170  // Flaps 30
            ],
            tailStrikePitch: 10, // Degrees
            altitudeAlertDiff: 300 // ft
        };
        
        this.prevApEngaged = false;
    }

    /**
     * Update warnings based on current flight state
     * @param {Object} physicsState - The full state object from RealisticFlightPhysicsService
     * @param {number} dt - Time delta
     */
    update(physicsState, dt) {
        this.activeWarnings = [];
        this.onGround = physicsState?.debugPhysics?.isOnGround === true;

        if (!physicsState) return this.activeWarnings;

        // Skip flight warnings in ground mode (boarding, clearance, pushback)
        const groundMode = physicsState.groundMode || false;
        const groundSpeed = Math.sqrt((physicsState.vel?.x || 0)**2 + (physicsState.vel?.y || 0)**2) * 1.94384; // m/s to knots

        if (groundMode && groundSpeed < 10) {
            // Only check critical system warnings, skip flight warnings
            this.checkSystemWarnings(physicsState);
            return this.activeWarnings;
        }

        // Extract necessary data
        const {
            derived,
            controls,
            systems,
            debugPhysics,
            controls: { gear, flaps, throttle, airBrakes, brakes },
            verticalSpeed, // ft/min
            fuel,
            engineParams,
            groundStatus,
            autopilot,
            autopilotTargets
        } = physicsState;

        const altitudeAGL = derived.altitude_agl_ft;
        const altitudeMSL = derived.altitude_ft;
        const airspeed = derived.indicatedAirspeed || derived.airspeed; // Use IAS for structural limits
        
        // Roll is available in debugPhysics.phi (radians)
        const rollRad = physicsState.debugPhysics.phi || 0;
        const pitchRad = physicsState.debugPhysics.theta || 0;
        
        const rollDeg = rollRad * 180 / Math.PI;
        const pitchDeg = pitchRad * 180 / Math.PI;
        const alpha = debugPhysics.alpha * 180 / Math.PI;
        
        const structural = physicsState.structural;
        this.operatingSpeedLimit = structural?.vmo;
        if (structural?.overspeed) this.addWarning('OVERSPEED', 'OVERSPEED', 'CRITICAL', true);
        if (structural?.overload) this.addWarning('G_LIMIT', 'G LOAD LIMIT', 'CRITICAL', true);
        for (const event of structural?.events || []) this.addWarning(event.id, event.message, 'CRITICAL', true);

        // --- GPWS Checks ---
        this.checkGPWS(altitudeAGL, verticalSpeed, gear, flaps, airspeed, groundStatus, physicsState);

        // --- Flight Envelope Checks ---
        this.checkEnvelope(alpha, airspeed, rollDeg, pitchDeg, flaps, gear, groundStatus);

        // --- Configuration Checks ---
        this.checkConfiguration(flaps, gear, airBrakes, throttle, groundStatus, pitchDeg, brakes, altitudeAGL);

        // --- System Checks ---
        this.checkSystems(systems, fuel, engineParams, altitudeAGL, controls);
        
        // --- Autopilot/Nav Checks ---
        this.checkAutomation(autopilot, autopilotTargets, altitudeMSL);

        // Sort by priority (Critical first)
        this.activeWarnings.sort((a, b) => {
            const priorityOrder = { 'CRITICAL': 0, 'WARNING': 1, 'ADVISORY': 2 };
            return priorityOrder[a.level] - priorityOrder[b.level];
        });

        return this.activeWarnings;
    }

    addWarning(id, message, level, isFlashing = false) {
        // Prevent duplicates
        if (!this.activeWarnings.find(w => w.id === id)) {
            this.activeWarnings.push({ id, message, level, isFlashing });
        }
    }

    checkGPWS(agl, vs, gear, flaps, airspeed, groundStatus, physicsState) {
        const onGround = physicsState?.debugPhysics?.isOnGround === true;
        if (onGround || !Number.isFinite(agl) || agl < 0) return;
        const airportRegion = ['RUNWAY', 'GRASS'].includes(groundStatus?.status);
        const normalApproach = airportRegion && gear > 0.9 && flaps > 0.1 &&
            airspeed < 200 && vs >= -1000 && vs < 0;
        if (!normalApproach && vs < -1000 && agl > 0) {
            const impactTime = agl / (-vs / 60);
            if (impactTime < 10) this.addWarning('GPWS_PULL_UP', 'PULL UP', 'CRITICAL', true);
            else if (impactTime < 20) this.addWarning('GPWS_TERRAIN', 'TERRAIN', 'CRITICAL', true);
        }
        const derived = physicsState?.derived;
        const position = physicsState?.position;
        if (derived && position && derived.groundSpeed > 30 &&
            Number.isFinite(position.latitude) && Number.isFinite(position.longitude)) {
            // Follow ground track, including wind drift, and sample the entire path.
            const velocity = physicsState.velocity;
            const heading = velocity && Math.hypot(velocity.u, velocity.v) > 1
                ? (physicsState.groundTrack ?? derived.heading) : derived.heading;
            const headingRad = heading * Math.PI / 180;
            for (let seconds = 2; seconds <= 20; seconds += 2) {
                const distanceDegrees = derived.groundSpeed * seconds / 3600 / 60;
                const lat = position.latitude + distanceDegrees * Math.cos(headingRad);
                const lon = position.longitude + distanceDegrees * Math.sin(headingRad) /
                    Math.max(0.01, Math.abs(Math.cos(position.latitude * Math.PI / 180)));
                const terrain = terrainRadarService.getTerrainHeight(lat, lon);
                const predictedAltitude = derived.altitude_ft + vs * seconds / 60;
                // Normal approaches may intersect the runway; rising terrain remains protected.
                const approachSurface = normalApproach && terrain <= derived.airport_elevation_ft + 100;
                if (Number.isFinite(terrain) && !approachSurface && terrain >= predictedAltitude) {
                    this.addWarning(seconds <= 10 ? 'GPWS_PULL_UP' : 'GPWS_TERRAIN',
                        seconds <= 10 ? 'PULL UP' : 'TERRAIN', 'CRITICAL', true);
                    break;
                }
            }
        }
        if (vs < -300 && !normalApproach && agl < this.thresholds.gearWarningAlt && gear < 0.1 && airspeed < 180) {
            this.addWarning('GPWS_TOO_LOW_GEAR', 'TOO LOW GEAR', 'WARNING');
        }
    }

    checkEnvelope(alpha, airspeed, roll, pitch, flaps, gear, groundStatus) {
        const onGround = this.onGround === true;

        // Stall Warning (Disabled on Ground)
        if (!onGround && alpha > this.thresholds.stallAlpha) {
            this.addWarning('STALL', 'STALL', 'CRITICAL', true);
        }

        // Overspeed
        if (airspeed > (this.operatingSpeedLimit ?? this.thresholds.overspeedKnots)) {
            this.addWarning('OVERSPEED', 'OVERSPEED', 'CRITICAL', true);
        }

        // Bank Angle
        // Only trigger if AIRBORNE (not on ground) to prevent nuisance alarms during taxi/pushback
        if (!onGround && Math.abs(roll) > this.thresholds.bankAngleWarn) {
            this.addWarning('BANK_ANGLE', 'BANK ANGLE', 'WARNING', true);
        }
    }

    checkSystems(systems, fuel, engines, agl, controls) {
        if (!systems) return;

        // Fire
        if (systems.fire.eng1) this.addWarning('FIRE_ENG1', 'ENGINE 1 FIRE', 'CRITICAL', true);
        if (systems.fire.eng2) this.addWarning('FIRE_ENG2', 'ENGINE 2 FIRE', 'CRITICAL', true);
        if (systems.fire.apu) this.addWarning('FIRE_APU', 'APU FIRE', 'CRITICAL', true);

        // Hydraulics
        if (systems.hydraulics.sysA.pressure < 1000) this.addWarning('HYD_A_LOW', 'HYD A PRESS LOW', 'WARNING');
        if (systems.hydraulics.sysB.pressure < 1000) this.addWarning('HYD_B_LOW', 'HYD B PRESS LOW', 'WARNING');

        // Electrical
        if (!systems.electrical.gen1 && !systems.electrical.gen2 && !systems.electrical.apuGen) {
             // If on battery only in air
             this.addWarning('ELEC_EMER', 'ELEC EMER CONFIG', 'WARNING');
        }

        // Pressurization
        if (systems.pressurization.cabinAlt > 10000) {
            this.addWarning('CABIN_ALT', 'CABIN ALTITUDE', 'CRITICAL', true);
        }

        if (systems.ice && systems.ice.deicingRequired) {
            this.addWarning('DEICE_REQUIRED', 'DE-ICE REQUIRED', 'ADVISORY');
        }
        
        // Fuel
        if (fuel < 500) { // Arbitrary low fuel mass
             this.addWarning('FUEL_LOW', 'LOW FUEL', 'WARNING');
        }

        // Engine Failure (In Air)
        // Check engineParams structure (arrays of values)
        const throttleDemand = typeof controls?.throttle === 'number' ? controls.throttle : 0;
        const fuelControls = systems.engines ? Object.values(systems.engines).map(eng => eng?.fuelControl !== false) : [];

        if (agl > 500 && engines && throttleDemand > 0.2) {
            if (Array.isArray(engines.n1)) {
                 engines.n1.forEach((n1Val, i) => {
                    const n2Val = Array.isArray(engines.n2) ? engines.n2[i] : undefined;
                    const fuelOn = fuelControls[i] !== false;
                    if (fuelOn && n1Val < 10 && (n2Val === undefined || n2Val < 25)) { 
                        this.addWarning(`ENG_${i+1}_FAIL`, `ENGINE ${i+1} FAIL`, 'CRITICAL', true);
                    }
                });
            } else if (Array.isArray(engines)) {
                // Fallback for legacy format if any
                 engines.forEach((eng, i) => {
                    const fuelOn = fuelControls[i] !== false;
                    if (fuelOn && eng.n1 < 10 && (eng.n2 === undefined || eng.n2 < 25)) {
                        this.addWarning(`ENG_${i+1}_FAIL`, `ENGINE ${i+1} FAIL`, 'CRITICAL', true);
                    }
                });
            }
        }
    }

    checkConfiguration(flaps, gear, airBrakes, throttle, groundStatus, pitch, brakes, altitudeAGL) {
        // 1. Takeoff Configuration
        // If on ground, high throttle, and flaps not set or brakes on
        const onGround = this.onGround === true;
        if (onGround && throttle > 0.7) {
            if (flaps < 0.1) {
                this.addWarning('CONFIG_FLAPS', 'CONFIG FLAPS', 'WARNING', true);
            }
            if (airBrakes > 0.1) {
                this.addWarning('CONFIG_SPOILERS', 'CONFIG SPOILERS', 'WARNING', true);
            }
            if (brakes > 0.1) {
                this.addWarning('CONFIG_BRAKES', 'CONFIG BRAKES', 'WARNING', true);
            }
        }

        // 2. Landing Configuration
        // If in air, low altitude, gear not down
        // (Covered partially by GPWS, but specific config warning here)

        // 3. Tail Strike Risk
        if (altitudeAGL <= 50 && pitch > this.thresholds.tailStrikePitch) {
            this.addWarning('TAIL_STRIKE', 'TAIL STRIKE RISK', 'CRITICAL', true);
        }
    }

    checkAutomation(autopilot, autopilotTargets, altitudeMSL) {
        if (!autopilot) return;

        // Altitude Alert
        if (autopilotTargets && typeof autopilotTargets.altitude === 'number') {
            const diff = Math.abs(altitudeMSL - autopilotTargets.altitude);

            // Approaching target? (Not implemented statefully yet)

            // Deviation alert (if we were supposed to be there)
            // For now, just a simple check if we are significantly off while in ALT HOLD mode?
            // Simplified: If diff > 300ft and AP is engaged, maybe just advisory if it persists?
            // Leaving out for now to avoid nuisance warnings during climb/descent
        }
    }

    checkSystemWarnings(physicsState) {
        const { systems, fuel } = physicsState;

        if (!systems) return;

        // Preserve the same fire IDs and detection during ground operations.
        for (const key of ['eng1', 'eng2', 'apu']) {
            if (systems.fire?.[key]) this.addWarning(`FIRE_${key.toUpperCase()}`, key === 'apu' ? 'APU FIRE' : `ENGINE ${key.slice(3)} FIRE`, 'CRITICAL', true);
        }

        // Fuel
        if (fuel < 500) this.addWarning('FUEL_LOW', 'LOW FUEL', 'WARNING');

        // Hydraulics
        if (systems.hydraulics?.sysA?.pressure < 1000) this.addWarning('HYD_A_LOW', 'HYD A PRESS LOW', 'WARNING');
        if (systems.hydraulics?.sysB?.pressure < 1000) this.addWarning('HYD_B_LOW', 'HYD B PRESS LOW', 'WARNING');
    }
}

export default WarningSystem;
