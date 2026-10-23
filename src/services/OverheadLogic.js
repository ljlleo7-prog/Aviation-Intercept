
/**
 * Advanced Overhead Logic Service
 * Simulates aircraft systems with high fidelity:
 * - Electrical: Bus-based distribution, load shedding, source isolation.
 * - Pneumatics: Bleed air pressures, isolation valves, pack logic.
 * - Fuel: Tank-to-engine flow, crossfeed, pump pressure logic.
 * - Hydraulics: Reservoir quantities, PTU/Electric/Engine pump logic.
 * - APU: Detailed start/stop cycle with N2/EGT simulation.
 */

class OverheadLogic {
    constructor() {
        this.CONSTANTS = {
            // Electrical
            BATTERY_VOLTAGE: 24.0,
            GEN_VOLTAGE: 115.0, // AC
            TR_VOLTAGE: 28.0,   // DC
            BATTERY_DRAIN_RATE: 0.01, // Volts per second under load

            // APU
            APU_START_TIME: 25.0,
            APU_COOLDOWN_TIME: 15.0,
            
            // Hydraulics
            HYD_MAX_PRESSURE: 3000,
            HYD_BUILD_RATE: 800,
            HYD_DECAY_RATE: 150,
            
            // Pneumatics
            BLEED_PRESSURE_IDLE: 30,
            BLEED_PRESSURE_THRUST: 45,
            
            // Environment
            STD_PRESSURE: 29.92
        };
    }

    /**
     * Main update loop for all systems
     */
    update(systems, context, dt) {
        if (!systems) return;

        // Initialize ADIRS if missing
        if (!systems.adirs) {
            systems.adirs = {
                ir1: 'OFF', // OFF, ALIGN, NAV
                ir2: 'OFF',
                ir3: 'OFF', // Optional (Widebody)
                alignState: 0, // 0 to 100%
                aligned: false,
                onBat: false
            };
        }

        // Initialize Ice & Rain
        if (!systems.ice) {
            systems.ice = {
                windowHeat: false,
                wingAntiIce: false,
                eng1AntiIce: false,
                eng2AntiIce: false,
                probeHeat: true // Default Auto/On
            };
        } else {
            if (systems.ice.windowHeat === undefined) systems.ice.windowHeat = false;
            if (systems.ice.eng1AntiIce === undefined) systems.ice.eng1AntiIce = systems.ice.engAntiIce ?? false;
            if (systems.ice.eng2AntiIce === undefined) systems.ice.eng2AntiIce = systems.ice.engAntiIce ?? false;
        }

        // Initialize Signs
        if (!systems.signs) {
            systems.signs = {
                seatBelts: true,
                noSmoking: true,
                attend: false,
                groundCall: false
            };
        } else {
            if (systems.signs.attend === undefined) systems.signs.attend = false;
            if (systems.signs.groundCall === undefined) systems.signs.groundCall = false;
        }

        // Initialize Lighting if missing
        if (!systems.lighting) {
            systems.lighting = {
                landing: false,
                taxi: false,
                strobe: false,
                beacon: false,
                nav: false,
                logo: false,
                wing: false,
                panel: false,
                background: false,
                flood: false,
                dome: false,
                emergencyLights: true // Armed
            };
        }

        systems.lighting.panel ??= false;
        systems.lighting.background ??= false;
        systems.lighting.flood ??= false;
        systems.lighting.dome ??= false;

        // Initialize Comms & Transponder
        if (!systems.comms) {
            systems.comms = {
                vhf1: { active: '118.500', stby: '121.500' },
                vhf2: { active: '121.900', stby: '119.100' },
                hf1: { active: '8888', stby: '2992' }
            };
        }
        if (!systems.transponder) {
            systems.transponder = {
                code: '1200',
                mode: 'STBY', // STBY, ALT, TA, RA
                ident: false
            };
        }

        // Dependency-driven order:
        // 1. electrical source state
        this.updateElectrical(systems, context, dt);
        // 2. apu runtime
        this.updateAPU(systems, context, dt);
        // 3. electrical again so APU generator can power buses on the same tick
        this.updateElectrical(systems, context, dt);
        // 4. bleed / pneumatics
        this.updatePneumatics(systems, context, dt);
        // 5. fuel feed
        this.updateFuel(systems, context, dt);
        // 6. hydraulics from electric and engine supply
        this.updateHydraulics(systems, context, dt);
        // 7. engine start / switch-side logic using resolved bleed and fuel state
        this.updateEngines(systems, context, dt);
        // 8. cabin / packs
        this.updatePressurization(systems, context, dt);
        // 9. secondary systems
        this.updateLighting(systems, context, dt);
        this.updateFireProtection(systems, context, dt);
        this.updateADIRS(systems, context, dt);
    }

    updateADIRS(systems, context, dt) {
        if (!systems.adirs) return;
        
        const adirs = systems.adirs;
        const hasPower = systems.electrical.dcVolts > 20; // Need DC for alignment/bat check
        
        // Are IRS switches in NAV or ALIGN?
        const irsActive = (adirs.ir1 === 'NAV' || adirs.ir1 === 'ALIGN') &&
                          (adirs.ir2 === 'NAV' || adirs.ir2 === 'ALIGN');
                          
        if (irsActive && hasPower) {
             // Alignment Process
             if (!adirs.aligned) {
                 // Align rate: ~10 minutes normally. 
                 // Fast Align for Sim: 30 seconds
                 const alignRate = 100 / 30; 
                 
                 adirs.alignState += alignRate * dt;
                 
                 if (adirs.alignState >= 100) {
                     adirs.alignState = 100;
                     adirs.aligned = true;
                 }
             }
        } else {
            // Loss of power or switched OFF
            if (!hasPower && irsActive) {
                adirs.onBat = true;
                // Battery drain would happen here
            } else {
                adirs.onBat = false;
                adirs.alignState = 0;
                adirs.aligned = false;
            }
            
            if (adirs.ir1 === 'OFF' && adirs.ir2 === 'OFF') {
                 adirs.alignState = 0;
                 adirs.aligned = false;
            }
        }
    }

    /**
     * ELECTRICAL SYSTEM
     * Simulates AC and DC Buses.
     * Logic: Gen -> Transfer Bus -> Main Bus -> TR -> DC Bus
     */
    updateElectrical(systems, context, dt) {
        const elec = systems.electrical;
        const damage = systems.damage || {};
        const activeComponents = new Set(systems.resourceNetwork?.activeComponents || []);
        const hasNetwork = !!systems.resourceNetwork?.topologyId;
        const fuel = systems.fuel || {};
        const hydraulics = systems.hydraulics || {};
        const pressurization = systems.pressurization || {};
        const lighting = systems.lighting || {};

        const batterySelector = elec.batterySelector || (elec.battery ? 'AUTO' : 'OFF');
        const batteryConnected = batterySelector !== 'OFF' && !damage.batteryFailed &&
            (!hasNetwork || activeComponents.has('electrical.battery'));
        elec.batterySelector = batterySelector;
        elec.battery = batteryConnected;
        elec.stbyPower = batteryConnected;

        let generatorsOn = false;
        let genPowerAvailable = false;
        let activeGens = 0;
        let bus1Powered = false;
        let bus2Powered = false;

        Object.keys(elec).forEach(key => {
            if (key.match(/^gen\d+$/)) {
                const index = parseInt(key.replace('gen', '')) - 1;
                const componentId = `electrical.generator.${index + 1}`;
                const genOn = elec[key] && !(index === 0 && damage.generator1Failed) &&
                    (!hasNetwork || activeComponents.has(componentId));
                const n2 = context.engineN2[index] || 0;
                const genReady = n2 > 25;

                if (genOn && genReady) {
                    genPowerAvailable = true;
                    activeGens++;
                    elec[`sourceOff${index + 1}`] = false;
                    if (index === 0) bus1Powered = true;
                    if (index === 1) bus2Powered = true;
                    generatorsOn = true;
                }
            }
        });

        const apuGenReady = systems.apu.running && systems.apu.n2 > 95;
        const apuGen1Selected = !!(elec.apuGen1 ?? elec.apuGen);
        const apuGen2Selected = !!(elec.apuGen2 ?? elec.apuGen);
        const apuGen1On = apuGenReady && apuGen1Selected &&
            (!hasNetwork || activeComponents.has('electrical.apu_generator.1'));
        const apuGen2On = apuGenReady && apuGen2Selected &&
            (!hasNetwork || activeComponents.has('electrical.apu_generator.2'));
        elec.apuGen1 = apuGen1Selected;
        elec.apuGen2 = apuGen2Selected;
        elec.apuGen = apuGen1Selected || apuGen2Selected;
        elec.apuGenOn = apuGen1On || apuGen2On;
        if (apuGen1On || apuGen2On) {
            genPowerAvailable = true;
            if (apuGen1On) bus1Powered = true;
            if (apuGen2On) bus2Powered = true;
            elec.apuGenOff = false;
            generatorsOn = true;
        } else {
            elec.apuGenOff = true;
        }

        if (batteryConnected) {
            if (!generatorsOn) {
                elec.batteryCharge = Math.max(0, (elec.batteryCharge || 100) - (0.05 * dt));
            } else {
                elec.batteryCharge = Math.min(100, (elec.batteryCharge || 100) + (0.1 * dt));
            }
            elec.dcVolts = (elec.batteryCharge / 100) * 24 + (Math.random() * 0.5);
        } else {
            elec.dcVolts = 0;
        }

        const grdPwrConnected = batteryConnected && !elec.sourceOff1 && context.onGround;
        if (grdPwrConnected) {
            genPowerAvailable = true;
            bus1Powered = true;
            bus2Powered = true;
        }

        if (batteryConnected && elec.busTie) {
            if (bus1Powered && !bus2Powered) bus2Powered = true;
            if (bus2Powered && !bus1Powered) bus1Powered = true;
        }

        elec.sourceOff1 = batteryConnected ? !bus1Powered : true;
        elec.sourceOff2 = batteryConnected ? !bus2Powered : true;

        let mainBusPowered = false;
        if (batteryConnected) {
            mainBusPowered = bus1Powered || bus2Powered;
        }

        if (mainBusPowered) {
            elec.acVolts = 115 + (Math.random() * 2 - 1);
            elec.acFreq = 400 + (Math.random() * 4 - 2);
            elec.dcVolts = 28.0 + (Math.random() * 0.5);
            elec.standbyPower = true;
        } else if (batteryConnected) {
            elec.acVolts = 0;
            elec.acFreq = 0;
            elec.standbyPower = true;
        } else {
            elec.acVolts = 0;
            elec.acFreq = 0;
            elec.dcVolts = 0;
            elec.standbyPower = false;
        }

        let load = 0;
        if (fuel.leftPumps) load += 10;
        if (fuel.rightPumps) load += 10;
        if (fuel.centerPumps) load += 10;

        Object.values(hydraulics).forEach(sys => {
            if (sys && sys.elecPump) load += 35;
        });

        if (lighting.landing) load += 40;
        if (pressurization.packL) load += 20;
        if (pressurization.packR) load += 20;

        elec.acAmps = mainBusPowered ? load : 0;

        if (damage.electricalMainBusFailed) {
            elec.acVolts = 0;
            elec.acFreq = 0;
            elec.acAmps = 0;
            elec.dcVolts = batteryConnected ? Math.min(elec.dcVolts, 24) : 0;
            elec.sourceOff1 = true;
            elec.sourceOff2 = true;
        }
    }

    /**
     * APU SYSTEM
     * Detailed state machine: OFF -> START -> RUN -> COOL -> OFF
     */
    updateAPU(systems, context, dt) {
        const apu = systems.apu;

        if (systems.damage?.apuFailed) {
            apu.running = false;
            apu.starting = false;
            apu.start = false;
            apu.n2 = 0;
            apu.state = 'FAILED';
            return;
        }
        
        // Ensure state variables exist
        if (apu.n2 === undefined) apu.n2 = 0;
        if (apu.state === undefined) apu.state = 'OFF'; // OFF, DOOR_OPEN, CRANK, IGNITION, RUNNING, COOLDOWN

        // Inputs
        const hasBat = systems.electrical.batterySelector ? systems.electrical.batterySelector !== 'OFF' : systems.electrical.battery;
        const hasGrdPwr = hasBat && !systems.electrical.sourceOff1 && context.onGround;
        const hasPower = hasBat || hasGrdPwr;
        const masterSw = apu.master;
        const startSw = apu.start;

        if (!hasPower) {
            apu.state = 'OFF';
            apu.running = false;
            apu.n2 = 0;
            apu.egt = 0;
            return;
        }

        switch (apu.state) {
            case 'OFF':
                apu.running = false;
                if (apu.n2 > 0) apu.n2 -= 5 * dt; // Spin down
                if (apu.egt > 20) apu.egt -= 10 * dt; // Cool down
                
                if (masterSw) {
                    apu.state = 'DOOR_OPEN';
                }
                break;

            case 'DOOR_OPEN':
                // Simulate inlet door opening time (3s)
                if (!apu.doorTimer) apu.doorTimer = 0;
                apu.doorTimer += dt;
                
                if (!masterSw) apu.state = 'OFF';
                else if (startSw) apu.state = 'CRANK'; // User hits start
                // Auto-transition if start switch was momentary
                else if (apu.starting) apu.state = 'CRANK';
                break;

            case 'CRANK':
                apu.starting = true;
                apu.n2 += 4 * dt; // ~5s to reach 20% N2

                if (!masterSw) apu.state = 'OFF';
                else if (apu.n2 >= 20) apu.state = 'IGNITION';
                break;

            case 'IGNITION':
                apu.n2 += 3.75 * dt; // ~20s from 20% to 95%
                apu.egt += 47 * dt;  // rises to ~700°C over ~15s

                if (apu.egt > 700) apu.egt = 700; // Peak
                if (apu.n2 >= 95) apu.state = 'RUNNING';
                if (!masterSw) apu.state = 'OFF';
                break;

            case 'RUNNING': {
                apu.running = true;
                apu.starting = false;
                apu.n2 = 100;
                // Stabilize EGT based on load
                let targetEgt = 350;
                if (systems.electrical.apuGenOn) targetEgt += 50;
                if (systems.apu.bleed) targetEgt += 100;
                
                // Smooth move to target
                apu.egt = apu.egt + (targetEgt - apu.egt) * 0.1;
                
                if (!masterSw) apu.state = 'COOLDOWN';
                break;
            }

            case 'COOLDOWN': {
                apu.running = true; // Still running, just cooling
                apu.n2 = 100;
                let targetEgt = 300;
                apu.egt = apu.egt + (targetEgt - apu.egt) * 0.1;
                
                if (!apu.cooldownTimer) apu.cooldownTimer = 0;
                apu.cooldownTimer += dt;
                
                if (apu.cooldownTimer > this.CONSTANTS.APU_COOLDOWN_TIME || (!hasBat && !hasGrdPwr)) {
                    apu.state = 'OFF';
                    apu.cooldownTimer = 0;
                }
                if (masterSw) apu.state = 'RUNNING'; // Abort shutdown
                break;
            }
        }
    }

    /**
     * PNEUMATICS SYSTEM
     * Bleed Air -> Packs -> Mix Manifold
     * User Request: Simulate pressure drops from loads (Packs, Starters) and limited source capacity.
     */
    updatePneumatics(systems, context, dt) {
        const pneu = systems.pressurization;
        const apu = systems.apu;
        const electrical = systems.electrical;
        const activeComponents = new Set(systems.resourceNetwork?.activeComponents || []);
        const hasNetwork = !!systems.resourceNetwork?.topologyId;
        
        // 1. Bleed Sources (Potential Pressure)
        let sourcePressL = 0;
        let sourcePressR = 0;
        
        const engineCount = context.engineN2.length;
        const splitPoint = Math.ceil(engineCount / 2);

        // Engines
        for (let i = 0; i < engineCount; i++) {
            const bleedSw = pneu[`bleed${i+1}`];
            const n2 = context.engineN2[i];
            
            const componentId = `pneumatic.engine_bleed.${i + 1}`;
            if (bleedSw && n2 > 10 && (!hasNetwork || activeComponents.has(componentId))) {
                // Pressure curve based on N2
                // Idle (20%) -> ~25 PSI
                // Cruise/Max -> ~45 PSI
                let pressure = 0;
                if (n2 >= 50) {
                    pressure = 35 + ((n2-50)/50) * 15;
                } else {
                    pressure = (n2 / 50) * 35;
                }
                
                if (i < splitPoint) {
                    if (pressure > sourcePressL) sourcePressL = pressure;
                } else {
                    if (pressure > sourcePressR) sourcePressR = pressure;
                }
            }
        }
        
        // APU (Feeds Left Duct typically)
        // APU Bleed Valve must be OPEN and APU running
        const apuBleedPressure = (apu.bleed && apu.running && apu.n2 > 90 &&
            (!hasNetwork || activeComponents.has('pneumatic.apu_bleed'))) ? 45 : 0;
        
        // APU usually feeds the manifold. If Isolation Valve is closed, it might only feed Left.
        // If Open, feeds both.
        // We'll assume APU taps into the Left side ducting for this model.
        if (apuBleedPressure > sourcePressL) sourcePressL = apuBleedPressure;

        // 2. Calculate Loads (Pressure Drops)
        // Each active consumer reduces the available pressure in the manifold
        let dropL = 0;
        let dropR = 0;

        // Packs (Heavy Load)
        if (pneu.packL) dropL += 12;
        if (pneu.packR) dropR += 12;

        // Wing Anti-Ice (Medium Load)
        // Assuming we have switches for these
        if (systems.ice && systems.ice.wingAntiIce) {
            dropL += 4;
            dropR += 4;
        }

        // Starters (Very Heavy Load)
        // We need to know which starters are engaged.
        // Currently, we don't track "start switch" here easily, but we can check if engines are cranking.
        // Actually, we need to PREDICT the drop to pass to the engine.
        // The EngineService logic calls THIS logic to get pressure.
        // So we need to check the switches from the system state.
        
        // Check Engine Start Switches (GRD position)
        if (systems.engines) {
            for (let i = 0; i < engineCount; i++) {
                const engId = `eng${i+1}`;
                const eng = systems.engines[engId];
                
                // If switch is in GRD (Start), it consumes huge air
                if (eng && eng.startSwitch === 'GRD') {
                    if (i < splitPoint) dropL += 15;
                    else dropR += 15;
                }
            }
        }

        // 3. Isolation Valve & Final Pressure
        if (pneu.isolationValve === undefined) pneu.isolationValve = true;

        let finalPressL = 0;
        let finalPressR = 0;

        if (pneu.isolationValve) {
            // OPEN: Manifolds connected.
            // Pressure equalizes to the highest source.
            // Loads are summed.
            // Cross-bleed penalty (friction).
            
            const maxSource = Math.max(sourcePressL, sourcePressR);
            const totalDrop = dropL + dropR + 2; // +2 PSI for cross-bleed friction/inefficiency
            
            const commonPress = Math.max(0, maxSource - totalDrop);
            
            finalPressL = commonPress;
            finalPressR = commonPress;
            
        } else {
            // CLOSED: Independent systems.
            finalPressL = Math.max(0, sourcePressL - dropL);
            finalPressR = Math.max(0, sourcePressR - dropR);
        }

        // 4. Update State
        pneu.ductPressL = finalPressL;
        pneu.ductPressR = finalPressR;
        
        // 5. Update Pack Flow status based on new pressures
        // Packs cut out if pressure is too low (< 15 PSI)
        pneu.packLFlow = (pneu.packL && pneu.ductPressL > 15 &&
            (!hasNetwork || activeComponents.has('pneumatic.pack.L')));
        pneu.packRFlow = (pneu.packR && pneu.ductPressR > 15 &&
            (!hasNetwork || activeComponents.has('pneumatic.pack.R')));
    }

    /**
     * HYDRAULICS SYSTEM
     * Sys A/B, Standby, Pressure building
     */
    updateHydraulics(systems, context, dt) {
        const hydKeys = Object.keys(systems.hydraulics);
        const engineCount = context.engineN2.length;
        const resources = new Set(systems.resourceNetwork?.resources || []);
        const hasNetwork = !!systems.resourceNetwork?.topologyId;

        hydKeys.forEach((sysName, sysIdx) => {
            const sys = systems.hydraulics[sysName];
            if (systems.damage?.hydraulicsFailed) {
                sys.pressure = 0;
                return;
            }
            const circuitResource = `hydraulic_${String.fromCharCode(65 + sysIdx)}`;
            if (hasNetwork && !resources.has(circuitResource)) {
                sys.pressure = Math.max(0, sys.pressure - this.CONSTANTS.HYD_DECAY_RATE * dt);
                return;
            }
            if (!sys.qty && sys.qty !== 0) sys.qty = 100;

            let drivingEngineIndices = [];

            if (sysIdx < engineCount) {
                drivingEngineIndices.push(sysIdx);
            }

            if (engineCount === 4 && hydKeys.length === 2) {
                if (sysIdx === 0) drivingEngineIndices = [0, 1];
                if (sysIdx === 1) drivingEngineIndices = [2, 3];
            }

            let maxEnginePressure = 0;
            drivingEngineIndices.forEach(idx => {
                const engN2 = context.engineN2[idx];
                if (engN2 > 0) {
                    const p = (engN2 >= 40) ? this.CONSTANTS.HYD_MAX_PRESSURE : (engN2 / 40) * this.CONSTANTS.HYD_MAX_PRESSURE;
                    if (p > maxEnginePressure) maxEnginePressure = p;
                }
            });

            if (!(sys.engPump && maxEnginePressure > 0)) {
                const anyEngineRunning = context.engineN2.some(n2 => n2 > 40);
                if (sys.engPump && anyEngineRunning) {
                    maxEnginePressure = this.CONSTANTS.HYD_MAX_PRESSURE;
                }
            }

            const acAvail = systems.electrical.acVolts > 100;
            const hasFluid = sys.qty > 0;
            const elecPressure = (sys.elecPump && acAvail && hasFluid) ? this.CONSTANTS.HYD_MAX_PRESSURE : 0;
            const enginePressure = (sys.engPump && hasFluid) ? maxEnginePressure : 0;
            const target = Math.max(enginePressure, elecPressure);

            if (sys.pressure < target) {
                sys.pressure = Math.min(target, sys.pressure + this.CONSTANTS.HYD_BUILD_RATE * dt);
            } else if (sys.pressure > target) {
                sys.pressure = Math.max(target, sys.pressure - this.CONSTANTS.HYD_DECAY_RATE * dt);
            }
        });
    }

    /**
     * FUEL SYSTEM
     * Tank quantities, Pumps, Crossfeed
     */
    updateFuel(systems, context, dt) {
        const fuel = systems.fuel;
        const activeComponents = new Set(systems.resourceNetwork?.activeComponents || []);
        const hasNetwork = !!systems.resourceNetwork?.topologyId;
        
        // Initialize if missing
        if (!fuel.tanks) {
            fuel.tanks = {
                left: 5000,
                right: 5000,
                center: 2000
            };
        }

        // Pumps Output Pressure
        // Pressure drops if tank is empty (cavitation/air)
        fuel.pressL = (fuel.leftPumps && systems.electrical.acVolts > 100 && fuel.tanks.left > 0 &&
            (!hasNetwork || activeComponents.has('fuel.pump.left'))) ? 35 : 0;
        fuel.pressR = (fuel.rightPumps && systems.electrical.acVolts > 100 && fuel.tanks.right > 0 &&
            (!hasNetwork || activeComponents.has('fuel.pump.right'))) ? 35 : 0;
        fuel.pressC = (fuel.centerPumps && systems.electrical.acVolts > 100 && fuel.tanks.center > 0 &&
            (!hasNetwork || activeComponents.has('fuel.pump.center'))) ? 35 : 0;

        // Consumption Logic (Drain from tanks based on pump config)
        const apuBurn = (systems.apu.running) ? 0.2 * dt : 0;
        
        // APU Feed (Usually Left side)
        // Check for Left Pump pressure or Suction Feed
        // APU usually has its own DC pump or suction, but for simplicity:
        if (systems.apu.running && fuel.tanks.left > 0) {
             fuel.tanks.left -= apuBurn;
        }

        // NOTE: Engine fuel burn is now handled in RealisticFlightPhysicsService.js
        // to ensure synchronization with physics fuel flow and mass.

        // Crossfeed balancing: when valve open, equalize left/right tanks quickly
        if (fuel.crossfeed && fuel.tanks.left !== undefined && fuel.tanks.right !== undefined) {
            const diff = fuel.tanks.left - fuel.tanks.right;
            const transfer = diff * Math.min(1, 2.0 * dt); // ~0.5s to equalize
            fuel.tanks.left -= transfer;
            fuel.tanks.right += transfer;
        }
    }

    /**
     * PRESSURIZATION & ENV
     */
    updatePressurization(systems, context, dt) {
        const pneu = systems.pressurization;
        
        // Flow available?
        const networkAllowsControl = !systems.resourceNetwork?.topologyId ||
            systems.resourceNetwork.resources.includes('cabin_pressure_control');
        const flow = networkAllowsControl && (pneu.packLFlow || pneu.packRFlow) && !pneu.breach;
        
        const aircraftAlt = context.altitude;
        const targetAlt = pneu.targetAlt || 35000;
        const landingAlt = 0; // Simplified
        
        // Calculate Target Cabin Alt (Schedule)
        // Rule of thumb: diff limit 8.6 psi
        // If flow exists, we control pressure.
        
        if (flow) {
            // Normal Auto Logic
            // Aim for Landing Alt until Diff Limit reached
            // Simplified: Aim for 6000ft
            let desired = 6000;
            if (aircraftAlt < 6000) desired = aircraftAlt;
            
            // Rate limit
            const rate = 500 * dt / 60; // 500 fpm
            if (pneu.cabinAlt < desired) pneu.cabinAlt += rate;
            else if (pneu.cabinAlt > desired) pneu.cabinAlt -= rate;
            
        } else {
            // Leak to outside
            const leakRate = 1000 * dt / 60;
            if (Math.abs(pneu.cabinAlt - aircraftAlt) < leakRate) pneu.cabinAlt = aircraftAlt;
            else if (pneu.cabinAlt < aircraftAlt) pneu.cabinAlt += leakRate;
            else pneu.cabinAlt -= leakRate;
        }
        
        // Calculate Diff Pressure (PSI)
        // 1 PSI ~ 2000ft approx at sea level, but let's use standard atmos formula roughly
        // Diff = Cabin Pressure - Ambient Pressure
        // Using simplified linear approx for display
        const cabinP = 14.7 - (pneu.cabinAlt * 0.0003); // Rough approx
        const ambP = 14.7 - (aircraftAlt * 0.0003);
        pneu.diffPressure = Math.max(0, cabinP - ambP);
    }

    updateLighting(systems, context, dt) {
        // Just power check
        const hasPower = systems.electrical.dcVolts > 20;
        systems.lighting.powered = hasPower;
    }

    /**
     * ENGINE START SYSTEM
     * Simulates N2 spool up, EGT rise, and starter cutout.
     */
    updateEngines(systems, context, dt) {
        if (!systems.engines) return;

        Object.keys(systems.engines).forEach((engId) => {
            // Extract index from 'eng1', 'eng2', etc.
            const index = parseInt(engId.replace('eng', '')) - 1;
            const eng = systems.engines[engId];
            const pneu = systems.pressurization;
            const fuel = systems.fuel;
            
            // Engine Side Logic (Left vs Right)
            const engineCount = Object.keys(systems.engines).length;
            const splitPoint = Math.ceil(engineCount / 2);
            const isLeft = index < splitPoint;
            
            // Check Fuel Pressure Availability
            let hasFuelPressure = false;
            
            // Allow Suction Feed on Ground or at lower altitudes (e.g. < 20,000 ft)
            // Realistically, gravity/suction works unless lines are broken or altitude is too high (vapor lock).
            // We also check if altitude is defined (default to 0/ground if missing)
            const currentAlt = context.altitude || 0;
            const suctionAvailable = context.onGround || (currentAlt < 20000);

            if (fuel.pressC > 10) hasFuelPressure = true;
            else if (isLeft) {
                 if (fuel.pressL > 10 || (suctionAvailable && fuel.tanks.left > 0)) hasFuelPressure = true;
                 else if (fuel.crossfeed && fuel.pressR > 10) hasFuelPressure = true;
            } else {
                 if (fuel.pressR > 10 || (suctionAvailable && fuel.tanks.right > 0)) hasFuelPressure = true;
                 else if (fuel.crossfeed && fuel.pressL > 10) hasFuelPressure = true;
            }
            
            // Pneumatic pressure available for start?
            // Need > 30 PSI (approx)
            // Left side engines (1,2) need ductL, Right side (3,4) need ductR
            const ductPress = (index < splitPoint) ? pneu.ductPressL : pneu.ductPressR;
            const pressureAvailable = ductPress > 20;

            // State Machine for Start
            const isRookie = ['rookie', 'student'].includes(context.difficulty);
            const isPro = ['pro', 'devil', 'survival'].includes(context.difficulty);

            // NOTE: Actual N2/EGT Physics is now handled in RealisticFlightPhysicsService -> EnginePhysicsService.
            // OverheadLogic only manages the switches and valve logic.

            if (eng.startSwitch === 'GRD') {
                // Monitor for Starter Cutout
                if (eng.n2 >= 50) {
                    eng.startSwitch = 'OFF';
                }
            }
            
            // Legacy/Fallback Logic cleanup:
            // We no longer manually integrate N2/EGT here to avoid conflict with Physics Service.
        });
    }

    /**
     * FIRE PROTECTION SYSTEM
     * Handles, Bottles, and System Cutoffs.
     */
    updateFireProtection(systems, context, dt) {
        if (!systems.fire) return;

        // Iterate through fire handles
        Object.keys(systems.fire).forEach(key => {
            if (key.match(/^eng\d+Handle$/)) {
                if (systems.fire[key]) {
                    // Handle Pulled
                    const engId = key.replace('Handle', ''); // eng1, eng2...
                    const index = parseInt(engId.replace('eng', '')) - 1;
                    
                    // Cutoff Systems
                    systems.engines[engId].fuelControl = false;
                    systems.pressurization[`bleed${index + 1}`] = false;
                    systems.electrical[`gen${index+1}`] = false;
                    
                    // Cutoff Hydraulics?
                    // Map engines to hydraulic systems using same logic as updateHydraulics
                    const hydKeys = Object.keys(systems.hydraulics);
                    const engineCount = Object.keys(systems.engines).length;
                    
                    hydKeys.forEach((sysName, sysIdx) => {
                        let drivingEngineIndices = [];
                        
                        // Default 1:1 mapping
                        if (sysIdx < engineCount) {
                            drivingEngineIndices.push(sysIdx);
                        }
                        
                        // Special 4-Engine/2-System Logic (A380 style)
                        if (engineCount === 4 && hydKeys.length === 2) {
                            if (sysIdx === 0) drivingEngineIndices = [0, 1]; // Sys A driven by Eng 1 or 2
                            if (sysIdx === 1) drivingEngineIndices = [2, 3]; // Sys B driven by Eng 3 or 4
                        }
                        
                        // If the fire engine drives this system, cut the pump
                        if (drivingEngineIndices.includes(index)) {
                            systems.hydraulics[sysName].engPump = false;
                        }
                    });
                }
            }
        });

        // APU
        if (systems.fire.apuHandle) {
            systems.apu.master = false;
            systems.apu.bleed = false;
            systems.electrical.apuGen = false;
        }

        const fire = systems.fire;
        fire.apuBottle ??= 100; // Older saves predate the dedicated APU bottle.
        const dischargeRate = 50 * dt;
        for (const bottle of ['bottle1', 'bottle2', 'apuBottle']) {
            if (!fire[`${bottle}_discharge`]) continue;
            const target = fire[`${bottle}_target`];
            if (!target || !(fire[bottle] > 0)) {
                fire[`${bottle}_discharge`] = false;
                continue;
            }
            fire[bottle] = Math.max(0, fire[bottle] - dischargeRate);
            if (dt > 0 && fire[`${target}Handle`] && fire[target]) {
                fire[target] = false;
                fire.extinguishCount ??= {};
                fire.extinguishCount[target] = (fire.extinguishCount[target] || 0) + 1;
            }
            if (fire[bottle] === 0) fire[`${bottle}_discharge`] = false;
        }
    }
}

export default new OverheadLogic();
