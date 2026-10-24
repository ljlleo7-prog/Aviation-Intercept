/**
 * Realistic Autopilot Service
 * 
 * A separated autopilot system for the RealisticFlightPhysicsService.
 * Controls: Control Surfaces (Elevator, Aileron, Rudder, Trim) and Throttle.
 * Focus: Smooth Speed and Vertical Speed (VS) control.
 */

import FMAService from './autoflight/FMAService.js';
import { isNavFrequency } from '../utils/approachReference.js';

class PIDController {
    constructor(kp, ki, kd, min, max, smoothing = 1.0) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
        this.min = min;
        this.max = max;
        this.smoothing = smoothing; // 1.0 = No smoothing, 0.1 = Heavy smoothing

        this.integral = 0;
        this.prevError = 0;
        this.prevDerivative = 0;
    }

    reset() {
        this.integral = 0;
        this.prevError = 0;
        this.prevDerivative = 0;
    }

    initialize(output, setpoint = 0, measured = setpoint) {
        const safeOutput = Number.isFinite(output) ? output : 0;
        const safeSetpoint = Number.isFinite(setpoint) ? setpoint : 0;
        const safeMeasured = Number.isFinite(measured) ? measured : safeSetpoint;
        const error = safeSetpoint - safeMeasured;
        const proportional = this.kp * error;
        const derivative = 0;
        const remaining = safeOutput - proportional - (this.kd * derivative);

        if (this.ki !== 0) {
            this.integral = remaining / this.ki;
        } else {
            this.integral = 0;
        }

        const maxIntegral = this.ki !== 0 ? Math.max(this.min / this.ki, this.max / this.ki) : 0;
        const minIntegral = this.ki !== 0 ? Math.min(this.min / this.ki, this.max / this.ki) : 0;
        if (this.ki !== 0) {
            if (this.integral > maxIntegral) this.integral = maxIntegral;
            if (this.integral < minIntegral) this.integral = minIntegral;
        }

        this.prevError = error;
        this.prevDerivative = derivative;
    }

    update(setpoint, measured, dt) {
        if (dt <= 0) return 0;

        const error = setpoint - measured;
        
        // Integral with anti-windup
        this.integral += error * dt;
        const integralTerm = this.ki * this.integral;
        // Clamp integral term to output limits to prevent windup
        if (integralTerm > this.max) this.integral = this.max / this.ki;
        else if (integralTerm < this.min) this.integral = this.min / this.ki;

        // Derivative with Low Pass Filter (Smoothing)
        const rawDerivative = (error - this.prevError) / dt;
        const derivative = this.smoothing * rawDerivative + (1 - this.smoothing) * this.prevDerivative;
        
        this.prevError = error;
        this.prevDerivative = derivative;

        let output = (this.kp * error) + (this.ki * this.integral) + (this.kd * derivative);
        
        // Clamp output
        if (output > this.max) output = this.max;
        if (output < this.min) output = this.min;

        return output;
    }
}

class RealisticAutopilotService {
    constructor() {
        // --- PID Configurations ---
        
        // Auto-Throttle
        this.speedPID = new PIDController(0.06, 0.0135, 0.025, 0.0, 1.0, 0.45); // Smooth but authoritative speed hold

        // Vertical Speed (VS -> Pitch)
        // Softer outer-loop pitch target prevents step changes from becoming elevator snaps.
        this.vsPID = new PIDController(0.000075, 0.000025, 0.000025, -14 * Math.PI/180, 18 * Math.PI/180, 0.45);

        // Independent altitude-to-pitch loop; V/S does not own pitch in HOLD.
        this.holdPID = new PIDController(0.003, 0.0002, 0.008, -14 * Math.PI / 180, 18 * Math.PI / 180, 0.2);
        this.altitudeRecoveryActive = false;

        // Pitch Attitude (Target Pitch -> Elevator)
        // Inner loop remains responsive, but derivative smoothing and lower gains avoid jerky reversals.
        this.pitchPID = new PIDController(-1.55, -0.35, -0.45, -0.85, 0.85, 0.35);

        // Roll Hold (Roll -> Aileron)
        this.rollPID = new PIDController(0.88, 0.07, 0.12, -0.68, 0.68, 0.24);

        // Heading Hold (Heading -> Roll)
        // Outer loop permits a larger steady bank target while keeping soft buildup via roll-rate limiting.
        this.headingPID = new PIDController(0.58, 0.005, 0.08, -24 * Math.PI / 180, 24 * Math.PI / 180, 0.24);

        // Turn Coordination
        this.rudderPID = new PIDController(0.28, 0.035, 0.16, -0.65, 0.65, 0.3);

        // --- ILS PID Configurations ---

        // Glideslope (Altitude Error -> Target VS)
        this.glideslopePID = new PIDController(4.0, 0.04, 0.9, -1500, 1100, 0.35);

        // Localizer (Angular Deviation -> Target Heading Adjustment)
        this.localizerPID = new PIDController(8.0, 0.18, 6.0, -35, 35, 0.3); // Output limited to +/- 35 deg correction

        this.engaged = false;
        this.flightDirectorEnabled = false;
        this.modeSelected = false;
        this.couplingMode = 'CMD';
        this.pendingGuidanceCapture = false;
        this.activeWaypointAltitude = undefined;
        this.mode = 'HDG'; // Default mode
        this.vnavArmed = false;
        this.autothrottleArmed = true;
        this.runwayGeometry = null;
        this.nav1Frequency = 0; // Currently tuned NAV1 Frequency
        this.prevTargetRoll = 0;
        this.maxRollRate = 10.0 * Math.PI / 180;
        this.normalBankLimit = 25.0 * Math.PI / 180;

        this.targets = {
            speed: 0, // Knots
            vs: 0,    // ft/min
            altitude: 0, // ft (Optional)
            heading: 0 // degrees
        };
        this.userVsTarget = 0; // User's commanded VS — never overwritten by AP internal logic
        this.lnavVS = null; // LNAV VNAV computed VS
        
        this.debugState = {
            headingError: 0,
            targetRoll: 0,
            pitchError: 0,
            targetPitch: 0,
            speedError: 0,
            throttleCmd: 0,
            vsError: 0,
            ilsMessage: ''
        };
        
        this.navPlan = null;
        this.pathGuidanceHeading = null;
        this.navState = { preTurnEngaged: false };
        this.filteredState = null;
        this.outputState = null;
        this.targetSteps = {
            speed: 5,
            vs: 100,
            altitude: 100
        };
        this.altitudeMode = 'idle';
        this.altitudeRecoveryActive = false;
        this.lastAltitudeError = null;
        this.speedControlState = {
            shapedTarget: null,
            prevAirspeed: null,
            prevThrottle: null
        };
        this.inputFilterTau = 0.45;
        this.outputRateLimits = {
            throttle: 0.35,
            elevator: 0.55,
            aileron: 0.42,
            rudder: 0.55
        };
        this.engagementBlendDuration = 0.3;
        this.engagementBlendRemaining = 0;
        this.fmaService = new FMAService();
        this.fmaStatus = this.fmaService.buildStatus({
            engaged: this.engaged,
            autopilotMode: this.mode,
            autopilotDebug: this.debugState,
            targets: this.targets,
            vnavArmed: this.vnavArmed,
            vnavPathAvailable: false,
            autothrottleArmed: this.autothrottleArmed
        });
    }

    setRunwayGeometry(geometry) {
        this.runwayGeometry = geometry;
    }

    setFlightDirectorEnabled(enabled) {
        this.flightDirectorEnabled = Boolean(enabled);
        if (enabled && !this.modeSelected && !this.engaged) {
            this.mode = 'CWS';
            this.pendingGuidanceCapture = true;
        }
    }

    setCouplingMode(mode) {
        this.couplingMode = mode === 'CWS' ? 'CWS' : 'CMD';
        if (this.couplingMode === 'CWS') {
            this.setVNAVArmed(false);
            this.setTargets({ mode: 'CWS' });
            this.pendingGuidanceCapture = true;
        } else if (this.mode === 'CWS') {
            this.setTargets({ mode: 'HDG' });
        }
    }

    setNavFrequency(freq) {
        if (!isNavFrequency(freq)) return false;
        this.nav1Frequency = freq;
        this.debugState.nav1Frequency = freq;
        return true;
    }

    setVNAVArmed(armed) {
        this.vnavArmed = Boolean(armed);
        if (this.vnavArmed && this.mode === 'CWS') {
            this.setTargets({ mode: 'HDG' });
        }
        if (!this.vnavArmed) this.lnavVS = null;
    }

    setAutothrottleArmed(armed) {
        this.autothrottleArmed = Boolean(armed);
    }
    
    setNavigationPlan(plan) {
        // plan: { fix: { latitude, longitude }, inboundCourseDeg: number, leadBankDeg?: number }
        this.navPlan = {
            fix: plan.fix,
            inboundCourseDeg: plan.inboundCourseDeg,
            leadBankDeg: plan.leadBankDeg || 25
        };
        this.navState = { preTurnEngaged: false };
        this.pathGuidanceHeading = null;
    }

    setPathGuidance(heading) {
        this.pathGuidanceHeading = Number.isFinite(heading) ? heading : null;
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    snapValue(value, step) {
        if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
        const snapped = Math.round(value / step) * step;
        return Object.is(snapped, -0) ? 0 : snapped;
    }

    normalizeHeading(value, fallback = 0) {
        if (!Number.isFinite(value)) return fallback;
        const snapped = this.snapValue(value, 5);
        const normalized = ((snapped % 360) + 360) % 360;
        return normalized === 0 ? 360 : normalized;
    }

    normalizeSpeedTarget(value, fallback = 0) {
        if (!Number.isFinite(value)) return fallback;
        return this.clamp(this.snapValue(value, this.targetSteps.speed), 120, 350);
    }

    normalizeVerticalSpeedTarget(value, fallback = 0) {
        if (!Number.isFinite(value)) return fallback;
        return this.clamp(this.snapValue(value, this.targetSteps.vs), -4000, 4000);
    }

    normalizeAltitudeTarget(value, fallback = 0) {
        if (!Number.isFinite(value)) return fallback;
        return this.clamp(this.snapValue(value, this.targetSteps.altitude), 0, 45000);
    }

    normalizeTargets(rawTargets = {}) {
        const normalized = { ...rawTargets };

        if (rawTargets.ias !== undefined || rawTargets.speed !== undefined) {
            const speedValue = rawTargets.ias !== undefined ? rawTargets.ias : rawTargets.speed;
            normalized.speed = this.normalizeSpeedTarget(speedValue, this.targets.speed || 0);
            normalized.ias = normalized.speed;
        }

        if (rawTargets.vs !== undefined) {
            normalized.vs = this.normalizeVerticalSpeedTarget(rawTargets.vs, this.targets.vs || 0);
            this.userVsTarget = normalized.vs;
        }

        if (rawTargets.altitude !== undefined) {
            normalized.altitude = this.normalizeAltitudeTarget(rawTargets.altitude, this.targets.altitude || 0);
        }

        if (rawTargets.heading !== undefined) {
            normalized.heading = this.normalizeHeading(rawTargets.heading, this.targets.heading || 360);
        }

        return normalized;
    }

    resetAltitudeCapture() {
        this.altitudeMode = 'idle';
        this.altitudeRecoveryActive = false;
        this.lastAltitudeError = null;
    }

    armAltitudeCapture() {
        this.altitudeMode = 'armed';
        this.altitudeRecoveryActive = false;
        this.lastAltitudeError = null;
    }

    setTargets(targets, options = {}) {
        const prevTargets = { ...this.targets };
        const normalizedTargets = this.normalizeTargets(targets);
        const preserveExisting = options.preserveExisting === true;

        if (normalizedTargets.mode) {
            this.mode = normalizedTargets.mode;
            this.modeSelected = normalizedTargets.mode !== 'CWS';
            this.couplingMode = normalizedTargets.mode === 'CWS' ? 'CWS' : 'CMD';
            if (normalizedTargets.mode !== 'CWS') this.pendingGuidanceCapture = false;
        }

        this.targets = preserveExisting
            ? { ...normalizedTargets, ...this.targets }
            : { ...this.targets, ...normalizedTargets };

        if (normalizedTargets.speed !== undefined && normalizedTargets.ias === undefined) {
            this.targets.ias = normalizedTargets.speed;
        }
        if (normalizedTargets.ias !== undefined && normalizedTargets.speed === undefined) {
            this.targets.speed = normalizedTargets.ias;
        }

        const altitudeProvided = Object.prototype.hasOwnProperty.call(normalizedTargets, 'altitude');
        const vsProvided = Object.prototype.hasOwnProperty.call(normalizedTargets, 'vs');
        const nextAltitude = altitudeProvided ? normalizedTargets.altitude : this.targets.altitude;
        const altitudeChanged = altitudeProvided && nextAltitude !== prevTargets.altitude;

        if (altitudeProvided && nextAltitude <= 0) {
            this.resetAltitudeCapture();
        } else if (nextAltitude > 0 && (altitudeChanged || (vsProvided && normalizedTargets.vs !== 0))) {
            this.armAltitudeCapture();
        }
    }

    setEngaged(engaged, currentState = null, options = {}) {
        if (engaged && !this.engaged) {
            this.speedPID.reset();
            this.vsPID.reset();
            this.pitchPID.reset();
            this.rollPID.reset();
            this.headingPID.reset();
            this.glideslopePID.reset();
            this.localizerPID.reset();
            this.rudderPID.reset();
            this.finalApproachDrift = null;
            this.filteredState = null;
            this.outputState = null;
            this.speedControlState = {
                shapedTarget: null,
                prevAirspeed: null,
                prevThrottle: null
            };
            this.resetAltitudeCapture();

            const explicitTargets = options.explicitTargets || {};
            const captureTargets = {};
            if (currentState) {
                if (explicitTargets.speed === undefined && explicitTargets.ias === undefined) {
                    captureTargets.speed = this.normalizeSpeedTarget(currentState.airspeed, this.targets.speed || 150);
                    captureTargets.ias = captureTargets.speed;
                }
                if (explicitTargets.vs === undefined) {
                    captureTargets.vs = this.normalizeVerticalSpeedTarget(currentState.verticalSpeed, 0);
                }
                if (explicitTargets.altitude === undefined) {
                    captureTargets.altitude = this.normalizeAltitudeTarget(currentState.altitude, 0);
                }
                if (explicitTargets.heading === undefined) {
                    captureTargets.heading = this.normalizeHeading(currentState.heading, 360);
                }
                this.setTargets(captureTargets);

                const targetSpeed = Number.isFinite(this.targets.speed) ? this.targets.speed : captureTargets.speed ?? 150;
                const targetVS = Number.isFinite(this.targets.vs) ? this.targets.vs : captureTargets.vs ?? 0;
                const targetHeading = Number.isFinite(this.targets.heading) ? this.targets.heading : captureTargets.heading ?? 360;

                this.speedPID.initialize(currentState.throttle, targetSpeed, currentState.airspeed);
                this.vsPID.initialize(currentState.pitch, targetVS, currentState.verticalSpeed);
                this.pitchPID.initialize(currentState.elevator, currentState.pitch, currentState.pitch);

                const headingError = ((targetHeading - currentState.heading + 540) % 360) - 180;
                this.headingPID.initialize(currentState.roll, headingError * Math.PI / 180, 0);
                this.rollPID.initialize(currentState.aileron, currentState.roll, currentState.roll);
                this.rudderPID.initialize(currentState.rudder ?? 0, currentState.beta || 0, 0);

                this.prevTargetRoll = Number.isFinite(currentState.roll)
                    ? this.clamp(currentState.roll, -8 * Math.PI / 180, 8 * Math.PI / 180)
                    : 0;
                // Seed outputState.throttle from base throttle at current speed so the rate limiter
                // starts from a realistic value rather than controls.throttle (which may be 0 at init).
                const seedSpeed = Number.isFinite(currentState.airspeed) ? currentState.airspeed : 150;
                const seedTargetSpeed = Number.isFinite(this.targets.speed) ? this.targets.speed : seedSpeed;
                const seedThrottle = this.clamp(
                    0.5 + ((seedTargetSpeed - 220) * 0.0035),
                    0.35, 0.9
                );
                this.outputState = {
                    throttle: seedThrottle,
                    elevator: Number.isFinite(currentState.elevator) ? currentState.elevator : 0,
                    aileron: Number.isFinite(currentState.aileron) ? currentState.aileron : 0,
                    rudder: Number.isFinite(currentState.rudder) ? currentState.rudder : 0
                };
                this.speedControlState.prevThrottle = this.outputState.throttle;
            } else {
                this.prevTargetRoll = 0;
            }

            this.engagementBlendRemaining = this.engagementBlendDuration;
            if (this.targets.altitude > 0) {
                this.armAltitudeCapture();
            }
        } else if (!engaged) {
            this.engagementBlendRemaining = 0;
        }
        this.engaged = engaged;
    }

    smoothValue(prev, next, dt, tau) {
        if (!isFinite(next)) return prev ?? 0;
        if (prev === null || prev === undefined) return next;
        const alpha = dt / (tau + dt);
        return prev + (next - prev) * alpha;
    }

    smoothAngle(prev, next, dt, tau) {
        if (!isFinite(next)) return prev ?? 0;
        if (prev === null || prev === undefined) return (next + 360) % 360;
        const alpha = dt / (tau + dt);
        let delta = ((next - prev + 540) % 360) - 180;
        return (prev + delta * alpha + 360) % 360;
    }

    rateLimit(prev, next, rate, dt) {
        if (prev === null || prev === undefined) return next;
        const maxDelta = rate * dt;
        let delta = next - prev;
        if (delta > maxDelta) delta = maxDelta;
        if (delta < -maxDelta) delta = -maxDelta;
        return prev + delta;
    }

    applyRollEnvelope(targetRoll, headingErrorDeg, isShortFinal) {
        const errorMagnitude = Math.abs(Number.isFinite(headingErrorDeg) ? headingErrorDeg : 0);
        const authorityScale = this.clamp(0.65 + (errorMagnitude / 60), 0.65, 1.0);
        let limitedRoll = targetRoll * authorityScale;
        const normalLimit = this.normalBankLimit;

        if (limitedRoll > normalLimit) limitedRoll = normalLimit;
        if (limitedRoll < -normalLimit) limitedRoll = -normalLimit;

        if (isShortFinal) {
            const shortFinalLimit = 8.0 * Math.PI / 180;
            if (limitedRoll > shortFinalLimit) limitedRoll = shortFinalLimit;
            if (limitedRoll < -shortFinalLimit) limitedRoll = -shortFinalLimit;
        }

        return limitedRoll;
    }

    computePredictiveThrottle(targetSpeed, currentSpeed, targetVS, dt) {
        const prevState = this.speedControlState;
        const speedTrend = Number.isFinite(prevState.prevAirspeed) && dt > 0
            ? (currentSpeed - prevState.prevAirspeed) / dt
            : 0;
        const targetDeltaLimit = 7;
        const shapedTarget = prevState.shapedTarget === null
            ? targetSpeed
            : this.rateLimit(prevState.shapedTarget, targetSpeed, targetDeltaLimit, dt);
        const speedError = shapedTarget - currentSpeed;
        const verticalDemand = Number.isFinite(targetVS) ? targetVS : 0;
        const baseThrottle = this.clamp(
            0.5
            + ((shapedTarget - 220) * 0.0035)
            + (this.clamp(verticalDemand, -1800, 1800) / 15000),
            0.35,
            0.9
        );
        const correction = this.speedPID.update(shapedTarget, currentSpeed, dt);
        const predictiveDamping = this.clamp(speedTrend * 0.04, -0.18, 0.18);
        const throttleCmd = this.clamp(baseThrottle + (correction * 0.95) - predictiveDamping, 0.0, 1.0);

        this.speedControlState = {
            shapedTarget,
            prevAirspeed: currentSpeed,
            prevThrottle: throttleCmd
        };

        return {
            throttleCmd,
            shapedTarget,
            speedTrend,
            baseThrottle,
            correction,
            predictiveDamping
        };
    }

    applyThrottleEnvelope(rawThrottle, targetSpeed, currentSpeed, targetVS, altitudeMode, altError) {
        const speedError = targetSpeed - currentSpeed;
        const verticalDemand = Number.isFinite(targetVS) ? targetVS : 0;
        const climbBias = this.clamp(verticalDemand / 8000, 0, 0.1);
        let minThrottle = verticalDemand > 500 ? 0.5 : (verticalDemand > 100 ? 0.42 : 0.32);
        let maxThrottle = 0.8 + climbBias;

        if (speedError < -10) {
            const overspeedFactor = this.clamp((-speedError - 10) / 50, 0, 1);
            minThrottle = this.clamp(0.5 - overspeedFactor * 0.5, 0.0, 0.5);
            maxThrottle = this.clamp(0.8 - overspeedFactor * 0.8, 0.0, 0.8);
        } else if (speedError > 25) {
            const lowEnergyFactor = this.clamp((speedError - 25) / 55, 0, 1);
            maxThrottle = this.clamp(maxThrottle + lowEnergyFactor * 0.2, 0.8, 1.0);
        }

        // When altitude hold/capture is active and aircraft is below target or sinking,
        // enforce a recovery floor so the speed controller cannot cut thrust during descent recovery.
        const altRecoveryActive = (altitudeMode === 'hold' || altitudeMode === 'capture')
            && Number.isFinite(altError) && altError > 120
            && verticalDemand > 100;
        if (altRecoveryActive) {
            minThrottle = Math.max(minThrottle, 0.42);
        }

        return {
            throttleCmd: this.clamp(rawThrottle, minThrottle, maxThrottle),
            rawThrottle: speedError < -10 ? Math.min(rawThrottle, minThrottle - 0.02) : rawThrottle,
            minThrottle,
            maxThrottle,
            speedError
        };
    }

    filterState(state, dt) {
        if (!this.filteredState) {
            this.filteredState = {
                airspeed: state.airspeed,
                verticalSpeed: state.verticalSpeed,
                pitch: state.pitch,
                roll: state.roll,
                heading: state.heading,
                track: state.track,
                beta: state.beta || 0
            };
            return this.filteredState;
        }
        const prev = this.filteredState;
        const next = {
            airspeed: this.smoothValue(prev.airspeed, state.airspeed, dt, this.inputFilterTau),
            verticalSpeed: this.smoothValue(prev.verticalSpeed, state.verticalSpeed, dt, this.inputFilterTau),
            pitch: this.smoothValue(prev.pitch, state.pitch, dt, this.inputFilterTau),
            roll: this.smoothValue(prev.roll, state.roll, dt, this.inputFilterTau),
            heading: this.smoothAngle(prev.heading, state.heading, dt, this.inputFilterTau),
            track: this.smoothAngle(prev.track, state.track, dt, this.inputFilterTau),
            beta: this.smoothValue(prev.beta, state.beta || 0, dt, this.inputFilterTau)
        };
        this.filteredState = next;
        return next;
    }

    updateIlsTelemetry(state) {
        const { airspeed, groundSpeed, verticalSpeed, heading, track, latitude, longitude, altitude, altitudeAGL, onGround } = state;
        const beta = state.beta || 0;

        let ilsDebug = {
            active: false,
            distAlong: 0,
            distCross: 0,
            altError: 0,
            targetAltitude: 0,
            message: ''
        };

        let isShortFinal = false;

        if (!this.runwayGeometry) {
            ilsDebug.message = 'No approach runway selected';
            this.debugState.ils = ilsDebug;
            return { ilsDebug, isShortFinal };
        }

        if (this.runwayGeometry?.headingSource === 'designator-estimate'
            || (this.runwayGeometry && !Number.isFinite(this.runwayGeometry.heading))) {
            ilsDebug.message = 'ILS unavailable: verified runway heading required';
            this.debugState.ils = ilsDebug;
            return { ilsDebug, isShortFinal };
        }

        if (this.runwayGeometry && typeof latitude === 'number' && typeof longitude === 'number') {
            const requiredFreq = this.runwayGeometry.ilsFrequency;
            let freqMatch = true;
            if (!isNavFrequency(requiredFreq) || Math.abs(this.nav1Frequency - requiredFreq) > 0.005) {
                freqMatch = false;
            }

            if (!freqMatch) {
                ilsDebug.message = `Wrong Freq: ${this.nav1Frequency} vs ${requiredFreq}`;
            } else {
                const { thresholdStart, heading: runwayHeading } = this.runwayGeometry;
                const latRad = thresholdStart.latitude * Math.PI / 180;
                const metersPerLat = 111132.92;
                const metersPerLon = 111412.84 * Math.cos(latRad);

                const dx = (latitude - thresholdStart.latitude) * metersPerLat;
                const dy = (longitude - thresholdStart.longitude) * metersPerLon;

                const rH = runwayHeading * Math.PI / 180;
                const ux = Math.cos(rH);
                const uy = Math.sin(rH);

                const distAlong = dx * ux + dy * uy;
                const distCross = -dx * uy + dy * ux;
                const distToThresholdFt = -distAlong * 3.28084;

                let targetAltitude = altitude;
                const runwayElev = thresholdStart.elevation || 0;
                const heightAglFt = Number.isFinite(altitudeAGL) ? altitudeAGL : Math.max(0, altitude - runwayElev);
                const sinkRateFpm = Number.isFinite(verticalSpeed) ? verticalSpeed : 0;
                const inFlareWindow = distToThresholdFt <= 900 && distToThresholdFt > -1800;
                const inRollout = onGround || (distToThresholdFt <= 1800 && heightAglFt <= 6);
                let ilsPhase = 'approach';
                if (inRollout) ilsPhase = 'rollout';
                else if (inFlareWindow || heightAglFt <= 80) ilsPhase = 'flare';

                const thresholdCrossingHeightFt = 92;
                const touchdownZoneFt = 1200;
                const shortFinalFloorFt = 66;
                const flareStartAglFt = 35;

                if (distToThresholdFt > 1500 && distToThresholdFt < 300000) {
                    targetAltitude = runwayElev + thresholdCrossingHeightFt + (distToThresholdFt * Math.tan(3 * Math.PI / 180));
                } else if (distToThresholdFt > 0) {
                    const shortFinalStartFt = 1500;
                    const decayWindowFt = 220;
                    const protectedDistanceFt = Math.max(0, distToThresholdFt - (shortFinalStartFt - decayWindowFt));
                    const thresholdBlend = Math.min(1, Math.max(0, protectedDistanceFt / decayWindowFt));
                    const thresholdReferenceAltitude = shortFinalFloorFt + ((thresholdCrossingHeightFt - shortFinalFloorFt) * thresholdBlend);
                    targetAltitude = runwayElev + thresholdReferenceAltitude;
                } else if (distToThresholdFt > -touchdownZoneFt) {
                    const touchDownWindowFt = Math.max(700, touchdownZoneFt - 150);
                    const touchdownBlend = Math.min(1, Math.max(0, (-distToThresholdFt) / touchDownWindowFt));
                    const touchdownReferenceAltitude = Math.max(0, shortFinalFloorFt * (1 - touchdownBlend));
                    targetAltitude = runwayElev + touchdownReferenceAltitude;
                }
                if (distToThresholdFt <= -touchdownZoneFt) {
                    targetAltitude = runwayElev;
                }

                const altError = targetAltitude - altitude;
                let ilsVS = 0;
                let glideActive = false;
                let driftAngle = 0;
                let headingCorrection = 0;
                let deviationDeg = 0;
                const referenceGroundSpeedKts = Number.isFinite(groundSpeed) && groundSpeed > 30
                    ? groundSpeed
                    : (Number.isFinite(airspeed) ? airspeed : 0);
                const nominalGlideslopeVs = -referenceGroundSpeedKts * 5.2;
                const shortFinalDescentVs = Math.min(nominalGlideslopeVs, -420);

                if (altError > 60 && distToThresholdFt > 1200) {
                    ilsVS = nominalGlideslopeVs;
                } else {
                    const vsCorrection = this.glideslopePID.update(altError, 0, 0.016);
                    let baseDescentRate = distToThresholdFt > 1200 ? nominalGlideslopeVs : shortFinalDescentVs;
                    if (distToThresholdFt <= -touchdownZoneFt || onGround) {
                        baseDescentRate = 0;
                    }
                    ilsVS = baseDescentRate + vsCorrection;
                }

                if (ilsPhase === 'flare') {
                    if (distToThresholdFt > 0) {
                        ilsVS = Math.max(-520, Math.min(-180, ilsVS * 0.22));
                    } else {
                        ilsVS = Math.max(-620, Math.min(-160, ilsVS * 0.5));
                    }
                }
                if (ilsPhase === 'flare' && heightAglFt <= flareStartAglFt) {
                    ilsVS = Math.max(ilsVS, -560);
                }
                ilsVS = Math.max(-4500, Math.min(1000, ilsVS));

                if (distAlong > 3700) {
                    const reciprocal = (runwayHeading + 180) % 360;
                    ilsDebug.message = `ILS: Behind threshold (${(distAlong / 1852).toFixed(1)}nm past) — turning to ${reciprocal.toFixed(0)}°`;
                    ilsDebug.distAlong = distAlong * 3.28084;
                    ilsDebug.distCross = distCross * 3.28084;
                } else {
                    const distToThresholdMeters = -distAlong;
                    const effectiveDist = Math.max(distToThresholdMeters, 500);
                    const distNm = effectiveDist / 1852;
                    const dynamicKp = 6.0 + (distNm * 1.5);
                    this.localizerPID.kp = Math.min(dynamicKp, 30.0);

                    deviationDeg = Math.atan2(distCross, effectiveDist) * 180 / Math.PI;

                    if (typeof track === 'number') {
                        let rawDrift = track - heading;
                        if (rawDrift > 180) rawDrift -= 360;
                        if (rawDrift < -180) rawDrift += 360;
                        driftAngle = rawDrift - (beta * 180 / Math.PI);
                    }

                    const distNM = distToThresholdFt / 6076.12;
                    const maxIntercept = 28;
                    let desiredInterceptAngle = 0;
                    if (Math.abs(deviationDeg) > 1.5) {
                        let correction = -deviationDeg * 4.5;
                        if (correction > maxIntercept) correction = maxIntercept;
                        if (correction < -maxIntercept) correction = -maxIntercept;
                        desiredInterceptAngle = correction;
                    } else {
                        let correction = this.localizerPID.update(0, deviationDeg, 0.016);
                        if (correction > maxIntercept) correction = maxIntercept;
                        if (correction < -maxIntercept) correction = -maxIntercept;
                        desiredInterceptAngle = correction;
                    }

                    headingCorrection = desiredInterceptAngle - driftAngle;
                    if (headingCorrection > 60) headingCorrection = 60;
                    if (headingCorrection < -60) headingCorrection = -60;

                    glideActive = (distNM <= 50.0) && (Math.abs(deviationDeg) < 70.0);
                    if (distNM < 1.0) {
                        isShortFinal = true;
                        const limit = ilsPhase === 'flare' ? 3.0 : 5.0;
                        if (headingCorrection > limit) headingCorrection = limit;
                        if (headingCorrection < -limit) headingCorrection = -limit;
                    }

                    ilsDebug.message = `ILS Tracking (Dev: ${deviationDeg.toFixed(2)}°)`;
                    ilsDebug = {
                        active: true,
                        runway: this.runwayGeometry.runwayName,
                        distAlong: distAlong * 3.28084,
                        distCross: distCross * 3.28084,
                        altError,
                        targetAltitude,
                        driftAngle,
                        message: ilsDebug.message,
                        locCaptured: Math.abs(deviationDeg) <= 2.0,
                        gsCaptured: glideActive,
                        locDeviationDeg: deviationDeg,
                        gsDeviationDeg: glideActive ? 0 : (altError / (distToThresholdFt || 1)) * 57.29,
                        phase: ilsPhase,
                        runwayEntryHeightFt: Math.abs(distToThresholdFt) <= 600 ? heightAglFt : null,
                        sinkRateFpm,
                        thresholdCrossingHeightFt,
                        touchdownZoneFt,
                        shortFinalFloorFt,
                        flareStartAglFt,
                        headingTarget: (runwayHeading + headingCorrection + 360) % 360,
                        vsTarget: glideActive ? ilsVS : 0,
                    };

                    if (distToThresholdMeters > 0) {
                        const currentAngleRad = Math.atan2(altitude - this.runwayGeometry.thresholdStart.elevation, distToThresholdMeters);
                        const currentAngleDeg = currentAngleRad * 180 / Math.PI;
                        ilsDebug.gsDeviationDeg = currentAngleDeg - 3.0;
                    } else {
                        ilsDebug.gsDeviationDeg = 0;
                    }
                }
            }
        }

        this.debugState.ils = ilsDebug;
        if (ilsDebug.message) this.debugState.ilsMessage = ilsDebug.message;
        return { ilsDebug, isShortFinal };
    }

    /**
     * Calculate Control Outputs
     * @param {Object} state - Current aircraft state { airspeed (kts), verticalSpeed (ft/min), pitch (rad), roll (rad), altitude (ft), heading (deg), latitude, longitude }
     * @param {Object} currentControls - Current control inputs { throttle, elevator, trim, aileron } (for trim offloading)
     * @param {number} dt - Time step
     * @returns {Object} New control inputs { throttle, elevator, trim, aileron } or null if not engaged
     */
    update(state, currentControls, dt) {
        const { ilsDebug: passiveIlsDebug } = this.updateIlsTelemetry(state);
        if (!this.engaged && !this.flightDirectorEnabled) {
            this.debugState = {
                ...this.debugState,
                mode: this.mode,
                engaged: this.engaged,
                nav1Frequency: this.nav1Frequency,
                ils: passiveIlsDebug,
                lnav: this.debugState.lnav,
                lnavMessage: this.debugState.lnavMessage || ''
            };
            return null;
        }

        const { airspeed, verticalSpeed, pitch, roll, heading, track, latitude, longitude, altitude } = state;
        if (this.pendingGuidanceCapture) {
            this.setTargets({ heading, altitude, vs: verticalSpeed, speed: airspeed });
            this.pendingGuidanceCapture = false;
        }
        const altitudeAGL = state.altitudeAGL;
        const onGround = state.onGround === true;
        const beta = state.beta || 0;
        const filtered = this.filterState({ airspeed, verticalSpeed, pitch, roll, heading, track, beta }, dt);
        const fAirspeed = filtered.airspeed;
        const fVerticalSpeed = filtered.verticalSpeed;
        const fPitch = filtered.pitch;
        const fRoll = filtered.roll;
        const fHeading = filtered.heading;
        const fTrack = filtered.track;
        const fBeta = filtered.beta;
        
        // Ensure targets are initialized if they were somehow left at 0
        if (this.targets.speed === 0) {
            this.targets.speed = this.normalizeSpeedTarget(fAirspeed, 150);
            this.targets.ias = this.targets.speed;
        } else if (this.targets.ias === undefined) {
             this.targets.ias = this.targets.speed;
        }
        // Preserve the existing manual-VS acquisition away from capture. VNAV
        // owns its vertical path and must never acquire a drifting climb rate.
        if (!this.vnavArmed && this.targets.vs === 0 && Math.abs(fVerticalSpeed) > 100
            && this.altitudeMode !== 'hold' && this.altitudeMode !== 'capture') {
            this.targets.vs = this.normalizeVerticalSpeedTarget(fVerticalSpeed, 0);
            this.userVsTarget = this.targets.vs;
        }
        if (this.targets.heading === 0) {
            this.targets.heading = this.normalizeHeading(fHeading, 360);
        }

        // --- LNAV with Pre-Turn Logic ---
        if (this.mode === 'LNAV' && !Number.isFinite(this.pathGuidanceHeading) && this.navPlan && typeof latitude === 'number' && typeof longitude === 'number') {
            const { fix, inboundCourseDeg, leadBankDeg } = this.navPlan;
            const hasRunway = this.runwayGeometry && this.runwayGeometry.thresholdStart;
            const refLat = hasRunway ? this.runwayGeometry.thresholdStart.latitude : fix.latitude;
            const refLon = hasRunway ? this.runwayGeometry.thresholdStart.longitude : fix.longitude;
            const latRad = refLat * Math.PI / 180;
            const metersPerLat = 111132.92;
            const metersPerLon = 111412.84 * Math.cos(latRad);
            const dx = (latitude - refLat) * metersPerLat;
            const dy = (longitude - refLon) * metersPerLon;
            const rH = inboundCourseDeg * Math.PI / 180;
            const ux = Math.cos(rH);
            const uy = Math.sin(rH);
            const distAlong = dx * ux + dy * uy;
            const distCross = -dx * uy + dy * ux;
            const effectiveDist = Math.max(Math.abs(distAlong), 500);
            const deviationDeg = Math.atan2(distCross, effectiveDist) * 180 / Math.PI;
            let deltaTrack = inboundCourseDeg - (typeof fTrack === 'number' ? fTrack : fHeading);
            if (deltaTrack > 180) deltaTrack -= 360;
            if (deltaTrack < -180) deltaTrack += 360;
            const g = 9.80665;
            const bankRad = (leadBankDeg || 25) * Math.PI / 180;
            const v_ms = fAirspeed * 0.514444;
            const turnRadius = (v_ms * v_ms) / (g * Math.tan(bankRad));
            const crossLead = Math.max(300, Math.min(4000, turnRadius));
            const fixLatRad = fix.latitude * Math.PI / 180;
            const mPerLonFix = 111412.84 * Math.cos(fixLatRad);
            const dxF = (latitude - fix.latitude) * metersPerLat;
            const dyF = (longitude - fix.longitude) * mPerLonFix;
            const distFix = Math.sqrt(dxF*dxF + dyF*dyF);
            const bearingFixRad = Math.atan2(dyF, dxF);
            let bearingFixDeg = (bearingFixRad * 180 / Math.PI + 360) % 360;
            let deltaFix = inboundCourseDeg - bearingFixDeg;
            if (deltaFix > 180) deltaFix -= 360;
            if (deltaFix < -180) deltaFix += 360;

            // Calculate turn execution duration for dynamic buffer
            // turnRate (rad/s) = (g * tan(bank)) / v
            const turnRate = (g * Math.tan(bankRad)) / Math.max(v_ms, 1.0);
            const turnDuration = (Math.abs(deltaFix) * Math.PI / 180) / turnRate;
            // Dynamic buffer: 25% of turn duration (e.g. 5s for 20s turn), min 3.0s
            const latencyBuffer = Math.max(3.0, turnDuration * 0.25);

            const leadDistance = Math.max(300, Math.min(4000, turnRadius * Math.tan(Math.abs(deltaFix) * Math.PI / 180 / 2))) + (v_ms * latencyBuffer);
            let headingCorrection = 0;
            let preTurn = false;
            const interceptLimit = 45;
            let targetHdg = inboundCourseDeg;
            if (distFix <= leadDistance && Math.abs(deltaFix) > 1.0) {
                preTurn = true;
                this.navState.preTurnEngaged = true;
                headingCorrection = 0;
                targetHdg = inboundCourseDeg;
            } else {
                // Smooth LNAV Intercept Logic
                // Use proportional control for intercept angle based on deviation
                // Clamp to interceptLimit (45 deg)
                // Gain 8.0: 5 deg error -> 40 deg correction.
                
                let correction = -deviationDeg * 8.0;
                
                // Cross-track error compensation (optional, but helps for parallel offsets)
                // If distCross is large, add bias? No, deviationDeg covers it.
                
                if (correction > interceptLimit) correction = interceptLimit;
                if (correction < -interceptLimit) correction = -interceptLimit;
                
                // If we are very close to course (< 0.5 deg), blend to bearingFixDeg?
                // Actually, just adding correction to inboundCourseDeg is "Homing to Course"
                // "Direct-to Fix" (bearingFixDeg) is "Homing to Fix".
                // We want "Homing to Course" (Intercept) until we are close, then "Homing to Fix" is fine if we are on track.
                // But usually LNAV follows the path, not just the fix.
                // So "Course + Correction" is the correct logic for Path Following.
                
                headingCorrection = correction;
                targetHdg = inboundCourseDeg + headingCorrection;
            }
            if (typeof fTrack === 'number' && typeof fHeading === 'number') {
                let drift = fTrack - fHeading;
                if (drift > 180) drift -= 360;
                if (drift < -180) drift += 360;
                targetHdg = targetHdg + drift;
            }
            this.targets.heading = (targetHdg + 360) % 360;
            this.debugState.lnavMessage = preTurn ? `Pre-turn align ${Math.round(inboundCourseDeg)}°` : (targetHdg === inboundCourseDeg + headingCorrection ? `Intercept ${Math.round(inboundCourseDeg)}° (dev ${deviationDeg.toFixed(1)}°)` : `Direct-to fix (brg ${Math.round(bearingFixDeg)}°)`);
            this.debugState.lnav = {
                dist_m: distFix,
                inbound: inboundCourseDeg,
                delta: deltaTrack,
                distAlong_m: distAlong,
                distCross_m: distCross,
                dev_deg: deviationDeg,
                lead_m: leadDistance,
                preTurn: preTurn,
                turnDur_s: turnDuration ? turnDuration.toFixed(1) : '0.0'
            };

            // Set Altitude Target from Fix if available
            // Vertical path selection is controlled independently by VNAV.
        }
        
        if (this.mode === 'LNAV' && Number.isFinite(this.pathGuidanceHeading)) {
            const drift = Number.isFinite(fTrack) ? this.clamp(((fHeading - fTrack + 540) % 360) - 180, -30, 30) : 0;
            this.targets.heading = (this.pathGuidanceHeading + drift + 360) % 360;
            this.debugState.lnavMessage = 'Following predicted route curve';
        }

        // --- ILS Logic ---
        let ilsDebug = this.debugState.ils || {
            active: false,
            distAlong: 0,
            distCross: 0,
            altError: 0,
            targetAltitude: 0,
            message: ''
        };

        let isShortFinal = Boolean(this.mode === 'ILS' && ilsDebug?.active && Math.abs(ilsDebug?.distAlong || 0) < 6076);

        if (this.mode === 'ILS' && ilsDebug.active) {
            this.targets.vs = Number.isFinite(ilsDebug.vsTarget) ? ilsDebug.vsTarget : 0;
            this.targets.heading = Number.isFinite(ilsDebug.headingTarget) ? ilsDebug.headingTarget : this.targets.heading;
            isShortFinal = ilsDebug.phase === 'flare' || ilsDebug.phase === 'rollout' || isShortFinal;
        }
        
        // Expose debug info
        this.debugState.ils = ilsDebug;
        if (ilsDebug.message) this.debugState.ilsMessage = ilsDebug.message;

        // Altitude Hold Logic (When not on Glideslope AND not in LNAV VNAV)
        const approachTracking = this.mode === 'ILS' && ilsDebug.active;
        const pathAltitude = this.activeWaypointAltitude !== undefined
            ? this.activeWaypointAltitude : this.navPlan?.fix?.altitude;
        const vnavFixAltitude = !approachTracking && this.vnavArmed && Number.isFinite(pathAltitude)
            ? pathAltitude : null;
        if (vnavFixAltitude !== null) {
            this.targets.altitude = vnavFixAltitude;
        }
        this.lnavVS = null;
        const lnavHandlingVS = vnavFixAltitude !== null;
        const altitudeControlActive = !approachTracking && (this.mode !== 'CWS' || this.vnavArmed)
            && Number.isFinite(this.targets.altitude)
            && (this.targets.altitude > 0 || (lnavHandlingVS && this.targets.altitude === 0));

        // ILS/LNAV already computed their VS; pick up the right source
        let effectiveVS = approachTracking
            ? this.targets.vs
            : (lnavHandlingVS && this.lnavVS !== null ? this.lnavVS : this.userVsTarget);

        if (!altitudeControlActive) {
            this.resetAltitudeCapture();
            if (!approachTracking) {
                this.targets.vs = lnavHandlingVS && Number.isFinite(effectiveVS)
                    ? this.normalizeVerticalSpeedTarget(effectiveVS, this.userVsTarget)
                    : this.userVsTarget;
            }
        } else {
            const altError = this.targets.altitude - altitude;
            const verticalTrend = Number.isFinite(fVerticalSpeed) ? fVerticalSpeed : 0;
            const wasHolding = this.altitudeMode === 'hold';
            if (this.altitudeMode === 'idle') this.armAltitudeCapture();

            // A large excursion leaves HOLD and acquires a gentle V/S toward
            // the selected altitude, regardless of the previous climb direction.
            const recoveryLimit = 600;
            if (wasHolding && Math.abs(altError) > recoveryLimit) {
                this.armAltitudeCapture();
                this.altitudeRecoveryActive = true;
                this.userVsTarget = Math.sign(altError) * 200;
                this.targets.vs = this.userVsTarget;
                this.vsPID.initialize(fPitch, this.userVsTarget, verticalTrend);
            }

            const movingToward = verticalTrend * altError > 0;
            const secondsToTarget = movingToward && Math.abs(verticalTrend) > 50
                ? Math.abs(altError / verticalTrend) * 60 : Infinity;
            if (this.altitudeMode === 'armed'
                && (Math.abs(altError) <= 350 || secondsToTarget <= 12)) {
                this.altitudeMode = 'hold';
                this.altitudeRecoveryActive = false;
                const flightPath = Math.atan2(verticalTrend * 0.00508, Math.max(1, fAirspeed * 0.514444));
                const levelPitch = Math.max(3 * Math.PI / 180, fPitch - flightPath);
                this.holdPID.initialize(levelPitch, altitude, altitude);
                this.holdPID.prevError = altError;
            }
            if (this.altitudeMode === 'capture' || this.altitudeMode === 'hold') {
                // Zero V/S selection: pitch is controlled directly by altitude.
                effectiveVS = 0;
                this.targets.vs = 0;
            } else {
                if (!lnavHandlingVS && this.userVsTarget === 0) {
                    this.userVsTarget = Math.sign(altError) * 200;
                }
                effectiveVS = lnavHandlingVS && !this.altitudeRecoveryActive
                    ? this.clamp(altError * 2, -2500, 2500) : this.userVsTarget;
                this.targets.vs = Math.round(effectiveVS);
            }
            this.lastAltitudeError = altError;
        }

        const { speed: targetSpeed, heading: targetHeading } = this.targets;
        let targetVS = effectiveVS;
        let targetPitchBias = 0;

        if (this.mode === 'ILS' && ilsDebug.active) {
            const heightAglFt = Number.isFinite(state.altitudeAGL) ? state.altitudeAGL : Infinity;
            if (ilsDebug.phase === 'flare' && heightAglFt <= 30) {
                const flareBlend = this.clamp((30 - heightAglFt) / 30, 0, 1);
                targetPitchBias = flareBlend * (1.2 * Math.PI / 180);
            }
        }

        const altitudeOwnsPitch = altitudeControlActive && this.altitudeMode === 'hold';
        const energyVS = altitudeOwnsPitch ? fVerticalSpeed : targetVS;

        // 1. Auto-Throttle (Predictive Speed Control)
        const speedControl = this.computePredictiveThrottle(targetSpeed, fAirspeed, energyVS, dt);
        const rawThrottleCmd = speedControl.throttleCmd;
        const throttleEnvelope = this.applyThrottleEnvelope(rawThrottleCmd, targetSpeed, fAirspeed, energyVS, this.altitudeMode, altitudeControlActive ? (this.targets.altitude - altitude) : null);
        const throttleCmd = throttleEnvelope.throttleCmd;

        // 2. Vertical Speed Control (VS -> Pitch -> Trim)
        const targetPitchRaw = altitudeOwnsPitch
            ? this.holdPID.update(this.targets.altitude, altitude, dt)
            : this.vsPID.update(targetVS, fVerticalSpeed, dt);
        const postEngagementPitchLimitDeg = this.altitudeMode === 'capture' ? 20 : 18;
        const engagementPitchLimitDeg = this.engagementBlendRemaining > 0
            ? 7.5
            : postEngagementPitchLimitDeg;
        const targetPitch = this.clamp(
            targetPitchRaw + targetPitchBias,
            -(engagementPitchLimitDeg * Math.PI / 180),
            engagementPitchLimitDeg * Math.PI / 180
        );
        const pitchCmd = this.pitchPID.update(targetPitch, fPitch, dt);
        
        // Trim Logic:
        // "Make the trim wheel rotate faster" - User Request
        // Increased trim rate from 0.1 to 0.5 to offload elevator faster.
        const trimRate = 0.25;
        // Robustness: Handle undefined currentControls.trim
        const currentTrim = typeof currentControls.trim === 'number' ? currentControls.trim : 0;
        let newTrim = currentTrim + (pitchCmd * trimRate * dt);
        
        // Clamp Trim
        const maxTrim = 0.8; // Reduced from 1.0 for safety (Original 0.2)
        if (newTrim > maxTrim) newTrim = maxTrim;
        if (newTrim < -maxTrim) newTrim = -maxTrim;
        
        // Elevator Logic:
        // Elevator provides immediate authority (Transient), Trim provides steady state.
        // As trim increases, pitchCmd (PID output) will naturally decrease as error reduces.
        const elevatorCmd = pitchCmd;

        // 3. Directional Control (Heading/LNAV/ILS -> Roll -> Aileron)
        let targetRoll = 0;
        let headingError = 0;
        if (this.mode === 'HDG' || this.mode === 'CWS' || this.mode === 'LNAV' || this.mode === 'ILS') {
            // Calculate heading error with wrap-around
            headingError = targetHeading - fHeading;
            if (headingError > 180) headingError -= 360;
            if (headingError < -180) headingError += 360;
            
            // Convert to Radians for PID (Output is Target Roll in Radians)
            const headingErrorRad = headingError * Math.PI / 180;
            const safeErrorRad = isFinite(headingErrorRad) ? headingErrorRad : 0;

            const isILS = this.mode === 'ILS';
            const maxBank = isILS ? 18 : 25;
            // Nonlinear schedule: stays near max bank until error is small,
            // then tapers only inside the last ~8 degrees to avoid early leveling.
            const absErr = Math.abs(headingError);
            const linearPart = absErr * (isILS ? 0.38 : 0.62);
            const scheduledRollMag = absErr > 8
                ? this.clamp(linearPart, 0, maxBank)
                : this.clamp(Math.pow(absErr / 8, 0.55) * maxBank * 0.88, 0, maxBank);
            const scheduledRollDeg = scheduledRollMag * Math.sign(headingError || 0);
            const scheduledRollRad = scheduledRollDeg * Math.PI / 180;
            const pidRollRad = this.headingPID.update(safeErrorRad, 0, dt);
            const engagementLimitDeg = this.engagementBlendRemaining > 0
                ? 8 + (17 * this.clamp(1 - (this.engagementBlendRemaining / this.engagementBlendDuration), 0, 1))
                : 25;
            const engagementLimitRad = engagementLimitDeg * Math.PI / 180;

            targetRoll = this.clamp(
                scheduledRollRad * 0.88 + pidRollRad * 0.12,
                -engagementLimitRad,
                engagementLimitRad
            );

            // Safety check for NaN/Inf
            if (!isFinite(targetRoll)) targetRoll = 0;
            targetRoll = this.applyRollEnvelope(targetRoll, headingError, isShortFinal);

            const maxDelta = this.maxRollRate * dt;
            const delta = targetRoll - this.prevTargetRoll;
            // Rate-limit in both directions to prevent bank-angle overflow
            if (delta > maxDelta) targetRoll = this.prevTargetRoll + maxDelta;
            if (delta < -maxDelta) targetRoll = this.prevTargetRoll - maxDelta;
            this.prevTargetRoll = targetRoll;
            
            // Clamp Target Roll on Short Final to prevent violent maneuvers
            if (isShortFinal) {
                // Limit to 8 degrees bank (approx 0.14 rad)
                const rollLimit = 8.0 * Math.PI / 180;
                if (targetRoll > rollLimit) targetRoll = rollLimit;
                if (targetRoll < -rollLimit) targetRoll = -rollLimit;
            }
        }

        const aileronRaw = this.rollPID.update(targetRoll, fRoll, dt);
        // Roll-rate damping: resist fast bank changes to prevent overshoot → violent counter-action
        const rollRate = dt > 0 ? (fRoll - (this._prevRoll ?? fRoll)) / dt : 0;
        this._prevRoll = fRoll;
        const aileronCmd = aileronRaw - 0.18 * rollRate;

        // 5. Beta -> Rudder (Turn Coordination)
        // We want Beta to be 0.
        // If Beta > 0 (Wind from right/Nose left of velocity), we need Right Rudder (+).
        // So Setpoint = 0, Measured = Beta. Error = 0 - Beta = -Beta.
        // Output should be positive when Beta is positive?
        // Wait, if Beta is positive, we want Rudder to be positive.
        // PID logic: output = Kp * error.
        // If error = -Beta, then output is negative.
        // So we should feed (Beta, 0) -> Error = Beta - 0 = Beta.
        // Then Output = Kp * Beta. Positive Beta -> Positive Rudder.
        const rudderCmd = this.rudderPID.update(fBeta, 0, dt);

        const limitedThrottle = this.rateLimit(this.outputState?.throttle, throttleCmd, this.outputRateLimits.throttle, dt);
        const limitedElevator = this.rateLimit(this.outputState?.elevator, elevatorCmd, this.outputRateLimits.elevator, dt);
        const limitedAileron = this.rateLimit(this.outputState?.aileron, aileronCmd, this.outputRateLimits.aileron, dt);
        const limitedRudder = this.rateLimit(this.outputState?.rudder, rudderCmd, this.outputRateLimits.rudder, dt);

        this.outputState = {
            throttle: limitedThrottle,
            elevator: limitedElevator,
            aileron: limitedAileron,
            rudder: limitedRudder
        };

        const blendAlpha = this.engagementBlendRemaining > 0
            ? this.clamp(1 - (this.engagementBlendRemaining / this.engagementBlendDuration), 0, 1)
            : 1;
        this.engagementBlendRemaining = Math.max(0, this.engagementBlendRemaining - dt);

        const currentTrimCommand = Number.isFinite(currentControls.trim) ? currentControls.trim : 0;
        const blendedThrottle = currentControls.throttle + ((limitedThrottle - currentControls.throttle) * blendAlpha);
        // Elevator and trim get full authority immediately — pitch blend causes altitude loss during engagement
        const blendedElevator = limitedElevator;
        const blendedAileron = currentControls.aileron + ((limitedAileron - currentControls.aileron) * blendAlpha);
        const blendedRudder = currentControls.rudder + ((limitedRudder - currentControls.rudder) * blendAlpha);
        const blendedTrim = newTrim;

        // Update Debug State
        this.debugState = {
            headingError,
            altitudeRecoveryActive: this.altitudeRecoveryActive,
            verticalControl: altitudeOwnsPitch ? 'altitude' : 'vs',
            nav1Frequency: this.nav1Frequency,
            targetRoll: targetRoll * 180 / Math.PI, // Convert to deg for display
            pitchError: (targetPitch - fPitch) * 180 / Math.PI,
            targetPitch: targetPitch * 180 / Math.PI,
            speedError: targetSpeed - fAirspeed,
            throttleCmd: blendedThrottle,
            throttleRawCommand: throttleEnvelope.rawThrottle,
            throttleEnvelopeMin: throttleEnvelope.minThrottle,
            throttleEnvelopeMax: throttleEnvelope.maxThrottle,
            shapedSpeedTarget: speedControl.shapedTarget,
            speedTrend: speedControl.speedTrend,
            throttleFeedForward: speedControl.baseThrottle,
            throttleCorrection: speedControl.correction,
            throttlePredictiveDamping: speedControl.predictiveDamping,
            vsError: targetVS - fVerticalSpeed,
            aileronCmd: blendedAileron,
            elevatorCmd: blendedElevator,
            rudderCmd: blendedRudder,
            beta: fBeta,
            mode: this.mode,
            engaged: this.engaged,
            altitudeMode: this.altitudeMode,
            normalizedTargets: { ...this.targets },
            ils: ilsDebug,
            lnav: this.debugState.lnav,
            lnavMessage: this.debugState.lnavMessage || ''
        };
        this.fmaStatus = this.fmaService.buildStatus({
            engaged: this.engaged,
            autopilotMode: this.mode,
            autopilotDebug: this.debugState,
            targets: this.targets,
            vnavArmed: this.vnavArmed,
            vnavPathAvailable: Number.isFinite(pathAltitude),
            autothrottleArmed: this.autothrottleArmed
        });

        // FD computes the same pitch/roll guidance without moving the controls.
        if (!this.engaged) return null;
        return {
            throttle: isFinite(blendedThrottle) ? blendedThrottle : 0,
            elevator: isFinite(blendedElevator) ? blendedElevator : 0,
            trim: isFinite(blendedTrim) ? blendedTrim : 0,
            aileron: isFinite(blendedAileron) ? blendedAileron : 0,
            rudder: isFinite(blendedRudder) ? blendedRudder : 0
        };
    }
}

export default RealisticAutopilotService;
