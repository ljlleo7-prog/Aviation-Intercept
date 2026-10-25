
/**
 * Engine Physics Service
 * 
 * Simulates a Turbofan engine's performance characteristics.
 * Handles N1/N2 spool-up dynamics, EGT, Fuel Flow, and Thrust generation
 * based on altitude, Mach number, and throttle input.
 */
class EnginePhysicsService {
    constructor(config = {}) {
        this.config = {
            maxThrust: config.maxThrust || 120000, // Newtons
            bypassRatio: config.bypassRatio || 5.0,
            tsfc: config.specificFuelConsumption || 0.000011, // kg/(N*s) base at SL
            idleN1: 20, // %
            maxN1: 102, // structural / absolute ceiling
            operationalMaxN1: config.operationalMaxN1 || 98.4, // normal max commanded N1
            emergencyMaxN1: config.emergencyMaxN1 || config.maxN1 || 102, // OEI / emergency ceiling
            egtYellow: 750, // °C yellow arc
            egtRed: 850,    // °C red line
            spoolUpRate: 15,  // restored — normal throttle response
            spoolDownRate: 20,
            responsiveness: config.responsiveness || 1.0, // Multiplier for spool rate (0.95-1.05)
            // reverseCapable: true by default; set false per-engine for A380 outer engines
            reverseCapable: config.reverseCapable !== undefined ? config.reverseCapable : true,
            ...config
        };
        
        // Correct TSFC if it's likely in the wrong units (e.g., kg/N/h instead of kg/N/s)
        // Typical TSFC is around 0.3-0.6 lb/lbf/hr or ~1.1e-5 to 1.7e-5 kg/N/s
        if (this.config.tsfc > 0.001) {
            this.config.tsfc /= 3600;
        }

        this.state = {
            n1: 20, // Fan Speed % (Idle)
            n2: 22, // Core Speed %
            egt: 15, // Exhaust Gas Temp (C) - starts at ambient
            thrust: 0, // Newtons
            fuelFlow: 0, // kg/s
            oilPressure: 45, // psi
            vibration: 0, // 0 to 10 scale
            running: true, // Default to running for immediate gameplay
            failed: false,
            throttleCommand: 0, // Last commanded throttle
            isReverse: false,
            starterEngaged: false,
            pneumaticPressure: false,
            fuelAvailable: false,
            ignition: false,
            fireHeatInput: 0,
            egtOffset: 0, // Heat input from non-fire thermal faults
            emergencyBoostAllowed: false
        };
        
        this._prevFuelFlow = 0;
        this._fuelUnavailableTime = 0;
        this._lightoffN2Threshold = 20;

        // Failure Parameters
        this.failureParams = {
            thrust_efficiency: 1.0,
            fuel_flow_efficiency: 1.0,
            n1_decel: null, // If set, overrides default spool down
            egt_rate: 0,
            vibration_level: 0
        };
    }

    setFailureParams(params) {
        this.failureParams = { ...this.failureParams, ...params };
        if (params.vibration_level !== undefined) this.state.vibration = params.vibration_level;
        if (params.failed !== undefined) this.state.failed = params.failed;
    }

    /**
     * Set target throttle for this engine
     * @param {number} val - Throttle value (-1.0 to 1.0)
     */
    setThrottle(val) {
        this.state.throttleCommand = val;
    }

    /**
     * Set Startup Configuration
     */
    setStartupState(starterEngaged, pneumaticPressure, fuelAvailable, ignition) {
        this.state.starterEngaged = starterEngaged;
        this.state.pneumaticPressure = pneumaticPressure;
        this.state.fuelAvailable = fuelAvailable;
        this.state.ignition = ignition;
    }

    setEmergencyBoostAllowed(allowed) {
        this.state.emergencyBoostAllowed = allowed === true;
    }

    update(dt, throttleInput, mach, altitude, airDensityRatio, ambientTemp) {
        if (this.state.failed) {
            this.spoolDown(dt);
            this.updateTemperature(dt, ambientTemp);
            return this.getOutput();
        }

        // Use passed throttle input if provided (legacy/direct drive), otherwise use internal state
        const throttle = (throttleInput !== undefined) ? throttleInput : this.state.throttleCommand;
        this.state.throttleCommand = throttle;

        // Auto-Start Logic (Transition from Cranking/Windmilling to Running)
        // Requirements: Fuel, ignition, and sufficient N2 for lightoff/self-sustain.
        if (!this.state.running && this.state.fuelAvailable && this.state.ignition && this.state.n2 >= this._lightoffN2Threshold) {
             this.state.running = true;
             this.state.egt += 100; // Initial spike
        }

        // Shutdown Logic: If fuel is cut, engine stops running after a short grace period
        if (this.state.running && !this.state.fuelAvailable) {
            this._fuelUnavailableTime += dt;
            if (this._fuelUnavailableTime > 1.0) {
                this.state.running = false;
            }
        } else {
            this._fuelUnavailableTime = 0;
        }

        // Target N2 based on throttle (Core Speed drives the engine)
        // User Reference:
        // Start-Up: ~20-30% N2
        // Taxi: ~50-60% N2
        // Takeoff: ~90-100% N2
        
        let targetN2 = 0;
        let isReverse = false;

        if (this.state.running) {
            if (throttle >= 0) {
                // Forward Thrust
                // User Request: Throttle controls N1 directly (Linear).
                // Idle N1 = 20%, Max N1 = 102%.
                const idleN1 = this.config.idleN1;
                // Full forward lever commands the rated takeoff limit. The lower operational
                // limit applies to partial-power operation, not to TOGA authorization.
                const takeoffBlend = Math.max(0, Math.min(1, (throttle - 0.85) / 0.15));
                const normalMaxN1 = this.config.operationalMaxN1 + takeoffBlend * (this.config.maxN1 - this.config.operationalMaxN1);
                const emergencyMaxN1 = this.config.emergencyMaxN1;
                const emergencyRequested = this.state.emergencyBoostAllowed && throttle >= 0.93;
                const ambientC = Number.isFinite(ambientTemp) ? (ambientTemp > 150 ? ambientTemp - 273.15 : ambientTemp) : 15;
                const densityPenalty = Math.max(-0.03, Math.min(0.03, (airDensityRatio - 1) * 0.08));
                const tempPenalty = Math.max(-0.03, Math.min(0.03, -(ambientC - 15) * 0.0015));
                const environmentalAdjustment = densityPenalty + tempPenalty;
                const normalAvailableN1 = Math.max(idleN1, normalMaxN1 * (1 + environmentalAdjustment));
                const emergencyAvailableN1 = Math.max(normalAvailableN1, Math.min(emergencyMaxN1, this.config.maxN1));
                const maxN1 = emergencyRequested ? emergencyAvailableN1 : Math.min(this.config.maxN1, normalAvailableN1);

                // Linear N1 Target within commanded authority
                const targetN1 = idleN1 + throttle * (maxN1 - idleN1);
                
                // Drive N2 (Core) from Target N1 using inverse of N1-curve
                // Curve: N1 = N2^2 / 100  =>  N2 = 10 * sqrt(N1)
                targetN2 = 10 * Math.sqrt(Math.max(0, targetN1));
                
            } else {
                // Reverse Thrust — only if this engine has a reverser
                if (this.config.reverseCapable) {
                    isReverse = true;
                    const idleN2 = 45;
                    const maxReverseN2 = 75;
                    const reverseRatio = Math.min(1, Math.abs(throttle) / 0.7);
                    targetN2 = idleN2 + reverseRatio * (maxReverseN2 - idleN2);
                } else {
                    // No reverser — stay at idle
                    const idleN1 = this.config.idleN1;
                    targetN2 = 10 * Math.sqrt(Math.max(0, idleN1));
                }
            }
        } else {
            // Not running
            // Check pneumatic pressure (PSI) for starter effectiveness
            // If passed as boolean (legacy), assume 30 PSI if true
            let pressure = this.state.pneumaticPressure;
            if (pressure === true) pressure = 30; 
            if (pressure === false) pressure = 0;
            
            if (this.state.starterEngaged && pressure > 5) {
                // Starter Motoring Speed calculation
                // Nominal 30 PSI -> 25% N2
                // Low pressure -> Lower max motoring speed
                const efficiency = Math.min(1.2, Math.max(0, (pressure - 5) / 25));
                targetN2 = 25 * efficiency;
            } else {
                // Spool down
                targetN2 = 0;
            }
        }
        
        this.state.isReverse = isReverse;

        // N2 Dynamics (Core Lag)
        // Core speed follows throttle command with inertia
        const n2Diff = targetN2 - this.state.n2;
        
        // Asymmetric rates: Spool Up is slower than Spool Down (usually)
        // UNLESS it's the starter, which is quite slow to spool up
        let n2Rate = this.config.spoolUpRate;
        
        if (!this.state.running && this.state.starterEngaged) {
            // Starter torque depends on pressure
            let pressure = this.state.pneumaticPressure;
            if (pressure === true) pressure = 30; 
            if (pressure === false) pressure = 0;
            
            const efficiency = Math.min(1.2, Math.max(0, (pressure - 5) / 25));
            n2Rate = 1.5 * efficiency; // slow starter motor (~τ=17s, reaches 25% in ~10s)
            
        } else if (n2Diff < 0) {
            n2Rate = this.config.spoolDownRate;
        }

        // Apply responsiveness factor
        // N2 is the heavy core, takes time to spool
        this.state.n2 += n2Diff * n2Rate * dt * 0.04 * this.config.responsiveness;

        // Clamp N2
        if (this.state.n2 < 0) this.state.n2 = 0;

        // Calculate Target N1 from Current N2 (Non-linear relationship)
        // N1 (Fan) responds to N2 (Core)
        const targetN1 = this.calculateN1FromN2(this.state.n2);

        // N1 Dynamics (Fan Lag)
        // Fan has inertia but follows core airflow
        const n1Diff = targetN1 - this.state.n1;
        // Fan responds faster to core changes than core responds to fuel
        this.state.n1 += n1Diff * dt * 2.0; 

        // Clamp N1
        if (this.state.n1 < 0) this.state.n1 = 0;

        // Thrust Calculation
        // Thrust = MaxThrust * (N1_ratio)^2 * (Density_ratio)^0.7 * (1 - 0.2 * Mach)
        const n1Ratio = this.state.n1 / this.config.maxN1;
        
        // Thrust is negligible below idle N1
        // At Start-Up (N2=25%), N1 is ~5%.
        // We want almost zero thrust at 5% N1.
        let thrustFactor = 0;
        const thrustThresholdN1 = 5.0; // Start generating meaningful thrust above 5% N1
        
        if (this.state.n1 > thrustThresholdN1) {
            // Smooth ramp up from threshold
            const effectiveRatio = (this.state.n1 - thrustThresholdN1) / (this.config.maxN1 - thrustThresholdN1);
            thrustFactor = Math.pow(Math.max(0, effectiveRatio), 2.5); 
        }

        // Apply Reverse Thrust Logic
        if (isReverse && throttle < -0.01) { 
             // User requirement: -70% Thrust at Max Reverse (75% N1)
             const reverseScalar = 1.85; 
             thrustFactor = -1 * thrustFactor * reverseScalar;
        }

        const altitudeFactor = Math.pow(airDensityRatio, 0.7);
        const machFactor = Math.max(0, 1 - 0.2 * mach); 

        let finalThrust = this.config.maxThrust * thrustFactor * altitudeFactor * machFactor;
        
        // Apply Failure Efficiency
        if (this.failureParams.thrust_efficiency !== 1.0) {
            finalThrust *= this.failureParams.thrust_efficiency;
        }

        this.state.thrust = finalThrust;

        // Fuel Flow (N2 based mostly for core, but N1 is good proxy)
        // Using N1 for consistency with existing TSFC methods
        const tsfcEff = this.computeTSFC(this.config.tsfc, airDensityRatio, mach, this.state.n1);
        const idleFlow = this.computeIdleFuelFlow(this.config.tsfc, airDensityRatio, this.state.n1);
        
        const thrustDemandAbs = Math.abs(this.state.thrust);
        let rawFuelFlow = idleFlow + tsfcEff * thrustDemandAbs;
        
        // Apply Failure Efficiency
        if (this.failureParams.fuel_flow_efficiency !== 1.0) {
            rawFuelFlow *= this.failureParams.fuel_flow_efficiency;
        }

        const alpha = 0.35; 
        const smoothed = this._prevFuelFlow * (1 - alpha) + rawFuelFlow * alpha;
        this.state.fuelFlow = Math.max(idleFlow, smoothed);
        this._prevFuelFlow = this.state.fuelFlow;

        this.updateTemperature(dt, ambientTemp);

        // Accumulate EGT offset from failure — logarithmic rise (fast spike, slow sustained heat)
        if (this.failureParams.egt_rate !== 0) {
            const t = (this.state.egtOffset || 0) / this.failureParams.egt_rate;
            this.state.egtOffset = this.failureParams.egt_rate * Math.log1p(t + dt);
        }

        return this.getOutput();
    }

    calculateN1FromN2(n2) {
        // Quadratic approximation: N1 = N2^2 / 100
        // Fits user reference:
        // Start-Up: 20% N2 -> 4% N1 (Ref: ~5-10%)
        // Taxi: 60% N2 -> 36% N1 (Ref: ~20-30% N1 from 50-60% N2)
        // Takeoff: 100% N2 -> 100% N1
        
        if (n2 <= 0) return 0;
        
        // Use a simple quadratic curve as requested
        let n1 = (n2 * n2) / 100;
        
        return n1;
    }
    
    computeTSFC(tsfc0, densityRatio, mach, n1) {
        const f_alt = 0.6 + 0.4 * Math.max(0, Math.min(1, densityRatio));
        const f_mach = 1 + 0.06 * Math.max(0, mach - 0.25);
        const f_n1 = 0.8 + 0.25 * Math.max(0, Math.min(1, n1 / this.config.maxN1));
        return tsfc0 * f_alt * f_mach * f_n1;
    }
    
    computeIdleFuelFlow(tsfc0, densityRatio, n1) {
        const idleRatio = Math.max(0.15, Math.min(0.4, n1 / this.config.maxN1));
        const c_idle = 0.7;
        return c_idle * tsfc0 * this.config.maxThrust * Math.pow(idleRatio, 1.8) * Math.max(0.5, densityRatio);
    }

    updateTemperature(dt, ambientTemp) {
        const ambient = Number.isFinite(ambientTemp)
            ? (ambientTemp > 150 ? ambientTemp - 273.15 : ambientTemp) : 15;
        const combustion = this.state.running ? 2.5 : 0;
        const cooling = 1 / 30;
        const target = ambient + Math.pow(Math.max(0, this.state.n2) / 100, .8) * 800;
        const heat = (this.state.egtOffset || 0) + (this.state.fireHeatInput || 0);
        const rate = combustion + cooling;
        const equilibrium = (combustion * target + cooling * ambient + heat) / rate;
        // Analytic integration keeps cooling stable across physics substeps.
        this.state.egt = Math.max(ambient, Math.min(1400,
            equilibrium + (this.state.egt - equilibrium) * Math.exp(-rate * Math.max(0, dt))));
    }

    spoolDown(dt) {
        // Use custom decel rate if available
        const rate = (this.failureParams.n1_decel !== null) ? Math.abs(this.failureParams.n1_decel) : 0.1;
        
        this.state.n1 *= (1 - rate * dt);
        this.state.n2 *= (1 - rate * dt);
        this.state.thrust = 0;
        this.state.fuelFlow = 0;
        this.state.running = false;
    }

    getOutput() {
        return { ...this.state };
    }
    
    setFailed(failed) {
        this.state.failed = failed;
    }
}

export default EnginePhysicsService;
