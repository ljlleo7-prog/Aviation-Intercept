const isHard = (ctx) => ['advanced', 'pro', 'devil', 'survival'].includes(ctx.difficulty);

// Migrate the fire-owned offset in older saves once; leave unrelated thermal
// faults alone. New fires use their own heat channel from the first tick.
const prepareFireHeat = (engine, context) => {
    if (context.fireHeatSeparated) return;
    if (Number.isFinite(context.egtOffset) && context.egtOffset > 0 &&
        Math.abs((engine.state.egtOffset || 0) - Math.min(900, context.egtOffset)) < 1) {
        engine.state.egtOffset = 0;
    }
    context.fireHeatSeparated = true;
};

const EngineFailures = {
    ENGINE_FAILURE: {
        id: 'engine_failure',
        name: 'Engine Failure (Generic)',
        category: 'engine',
        stages: {
            inactive: { next: 'incipient' },
            incipient: {
                duration: (ctx) => isHard(ctx) ? 12.0 : 3.0,
                next: 'active',
                description: (ctx) => ({
                    text: isHard(ctx) ? `Engine ${ctx.engineIndex + 1} parameters fluctuating.` : `Engine ${ctx.engineIndex + 1} flameout imminent.`,
                    sound: "engine_sputter",
                    visual: "shake_minor"
                }),
                effect: (sys, intensity, ctx) => {
                    const eng = sys.engines[ctx.engineIndex];
                    if (eng) {
                        if (isHard(ctx)) {
                            const noise = (Math.random() - 0.5) * 2.0;
                            eng.state.n2 += noise;
                            eng.state.n1 += noise * 1.5;
                            eng.state.oilPressure *= 0.995;
                            eng.state.fuelFlow *= (1.0 + (Math.random() - 0.5) * 0.1);
                        } else {
                            eng.state.n1 = eng.state.n1 * 0.9 + Math.random() * 5.0;
                            eng.state.egt += 100;
                            eng.state.vibration = 5.0;
                        }
                    }
                }
            },
            active: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} failed.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} FAIL`,
                    sound: "engine_spindown",
                    visual: "shake_jolt"
                }),
                effect: (sys, intensity, ctx) => {
                    const eng = sys.engines[ctx.engineIndex];
                    if (eng && !eng.state.failed) {
                        eng.setFailed(true);
                    }
                }
            }
        }
    },
    
    ENGINE_FIRE: {
        id: 'engine_fire',
        name: 'Engine Fire',
        category: 'engine',
        stages: {
            inactive: { next: 'incipient' },
            incipient: {
                duration: (ctx) => isHard(ctx) ? 5.0 : 10.0,
                intensityTarget: 1.0,
                next: 'active',
                description: (ctx) => ({
                    text: isHard(ctx) ? `Engine ${ctx.engineIndex + 1} vibration high.` : `Engine ${ctx.engineIndex + 1} fire loop alert.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} VIB`,
                    visual: "shake_medium"
                }),
                effect: (sys, intensity, ctx) => {
                    const eng = sys.engines[ctx.engineIndex];
                    if (eng) {
                        prepareFireHeat(eng, ctx);
                        eng.state.vibration = 5.0 + (intensity * 2.0);
                        if (ctx.egtOffset === undefined) ctx.egtOffset = 0;
                        if (intensity > 0.1 && !ctx.hasSpiked) {
                             ctx.egtOffset += 50;
                             ctx.hasSpiked = true;
                        }
                        const riseRate = isHard(ctx) ? 3.0 : 2.0;
                        ctx.egtOffset += riseRate * intensity;
                        eng.state.fireHeatInput = ctx.egtOffset;
                    }
                }
            },
            active: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} Fire Detected.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} FIRE`,
                    sound: "fire_bell",
                    visual: "red_light_flash"
                }),
                effect: (sys, intensity, ctx) => {
                    const eng = sys.engines[ctx.engineIndex];
                    if (eng) {
                        prepareFireHeat(eng, ctx);
                        const fire = sys.systems?.fire;
                        const engineId = `eng${ctx.engineIndex + 1}`;
                        ctx.extinguishCount ??= fire?.extinguishCount?.[engineId] || 0;
                        if ((fire?.extinguishCount?.[engineId] || 0) > ctx.extinguishCount) {
                            eng.state.fireHeatInput = 0;
                            return;
                        }
                        if (!eng.state.failed && eng.state.fireHeatInput > 600 && Math.random() < 0.05) {
                            eng.setFailed(true, 'fire', 'critical');
                        }
                        if (fire) fire[engineId] = true;
                        if (ctx.egtOffset === undefined) ctx.egtOffset = 0;
                        ctx.egtOffset += 0.5;
                        if (ctx.egtOffset < 400) ctx.egtOffset = 400;
                        eng.state.fireHeatInput = ctx.egtOffset;
                        if (eng.state.fireHeatInput > 900) eng.state.fireHeatInput = 900;
                    }
                }
            }
        }
    },

    COMPRESSOR_STALL: {
        id: 'compressor_stall',
        name: 'Compressor Stall',
        category: 'engine',
        stages: {
            inactive: { next: 'surging' },
            surging: {
                duration: 15.0,
                next: 'recovered',
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} Compressor Stall. Loud bangs heard.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} STALL`,
                    sound: "bang_repetitive",
                    visual: "shake_violent"
                }),
                effect: (sys, intensity, ctx) => {
                    const eng = sys.engines[ctx.engineIndex];
                    if (eng) {
                        if (Math.random() > 0.7) eng.state.thrust *= 0.2;
                        eng.state.egt += 10;
                        eng.state.vibration = 8.0 * intensity;
                    }
                }
            },
            recovered: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} stabilized.`,
                    sound: "engine_spool_up"
                }),
                effect: (sys) => {}
            }
        }
    },

    VIBRATION_HIGH: {
        id: 'engine_vibration',
        name: 'High Engine Vibration',
        category: 'engine',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} N1 Rotor Unbalance.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} VIB`,
                    visual: "shake_constant"
                }),
                effect: (sys, intensity, ctx) => {
                     const eng = sys.engines[ctx.engineIndex];
                     eng.state.vibration = 4.5 + (intensity * 2.0);
                }
            }
        }
    },

    OIL_LEAK: {
        id: 'engine_oil_leak',
        name: 'Engine Oil Leak',
        category: 'engine',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} Oil Pressure Low.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} OIL PRESS`
                }),
                effect: (sys, intensity, ctx) => {
                     const eng = sys.engines[ctx.engineIndex];
                     eng.state.oilPressure -= 0.5 * intensity;
                     if (eng.state.oilPressure < 10) {
                         // Seize engine
                         if (Math.random() < 0.01) eng.setFailed(true);
                     }
                }
            }
        }
    },

    REVERSER_DEPLOY_IN_FLIGHT: {
        id: 'reverser_deploy',
        name: 'Reverser Deployment in Flight',
        category: 'engine',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: `CRITICAL: Engine ${ctx.engineIndex + 1} Reverser Deployed.`,
                    system_alert: `ENG ${ctx.engineIndex + 1} REV UNLOCKED`,
                    visual: "shake_violent",
                    sound: "rumble_loud"
                }),
                effect: (sys, intensity, ctx) => {
                     const eng = sys.engines[ctx.engineIndex];
                     eng.state.reverserDeployed = true;
                     // Physics will handle drag/yaw
                }
            }
        }
    },
    
    START_VALVE_OPEN: {
        id: 'start_valve_open',
        name: 'Start Valve Open',
        category: 'engine',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: `Engine ${ctx.engineIndex + 1} Start Valve Open light remains on.`,
                    system_alert: `START VALVE OPEN`
                }),
                effect: (sys) => {
                    // Bleed air loss
                }
            }
        }
    },
    
    DUAL_ENGINE_FAILURE: {
        id: 'dual_engine_failure',
        name: 'Dual Engine Flameout',
        category: 'engine',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "ALL ENGINES FLAMEOUT.",
                    system_alert: "ENG 1+2 FAIL",
                    sound: "power_down_whine",
                    visual: "cockpit_dark"
                }),
                effect: (sys) => {
                    sys.engines.forEach(e => e.setFailed(true));
                }
            }
        }
    }
};

const createSupplementalEngineFailure = (id, name, systemAlert) => ({
    id,
    name,
    category: 'engine',
    stages: {
        inactive: { next: 'active' },
        active: {
            description: (ctx = {}) => ({
                text: ctx.engineIndex !== undefined ? `Engine ${ctx.engineIndex + 1} ${name.toLowerCase()}.` : name,
                system_alert: systemAlert
            }),
            effect: () => {}
        }
    }
});

const SupplementalEngineFailures = {
    ENGINE_OIL_FILTER_BYPASS: createSupplementalEngineFailure('engine_oil_filter_bypass', 'Oil Filter Bypass', 'ENG OIL FILTER'),
    ENGINE_FUEL_NOZZLE_CLOG: createSupplementalEngineFailure('engine_fuel_nozzle_clog', 'Fuel Nozzle Clog', 'ENG FUEL NOZZLE'),
    ENGINE_STARTER_FAILURE: createSupplementalEngineFailure('engine_starter_failure', 'Starter Failure', 'ENG STARTER'),
    ENGINE_BLEED_LEAK: createSupplementalEngineFailure('engine_bleed_leak', 'Bleed Air Leak', 'ENG BLEED'),
    ENGINE_OVERSPEED: createSupplementalEngineFailure('engine_overspeed', 'Core Overspeed', 'ENG OVERSPEED'),
    ENGINE_FADEC_FAIL: createSupplementalEngineFailure('engine_fadec_fail', 'FADEC Failure', 'ENG FADEC'),
    ENGINE_IGNITION_FAULT: createSupplementalEngineFailure('engine_ignition_fault', 'Ignition Fault', 'ENG IGN'),
    ENGINE_FAN_BLADE_DAMAGE: createSupplementalEngineFailure('engine_fan_blade_damage', 'Fan Blade Damage', 'ENG FAN DAMAGE'),
    ENGINE_CORE_OVERHEAT: createSupplementalEngineFailure('engine_core_overheat', 'Core Overheat', 'ENG CORE HOT'),
    ENGINE_TURBINE_DAMAGE: createSupplementalEngineFailure('engine_turbine_damage', 'Turbine Damage', 'ENG TURBINE'),
    ENGINE_THRUST_IMBALANCE: createSupplementalEngineFailure('engine_thrust_imbalance', 'Thrust Imbalance', 'THRUST ASYM'),
    ENGINE_VIBRATION_SENSOR_FAIL: createSupplementalEngineFailure('engine_vibration_sensor_fail', 'Vibration Sensor Failure', 'ENG VIB MON'),
    ENGINE_FUEL_METER_FAIL: createSupplementalEngineFailure('engine_fuel_meter_fail', 'Fuel Metering Failure', 'ENG FUEL METER')
};

export default {
    ...EngineFailures,
    ...SupplementalEngineFailures
};
