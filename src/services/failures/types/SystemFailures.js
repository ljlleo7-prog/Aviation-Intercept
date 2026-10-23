import { hasManualReversion } from '../../physics/controlTransmission.js';
const applyTotalHydraulicLoss = (sys) => {
    sys.systems.damage ??= {};
    sys.systems.damage.hydraulicsFailed = true;
    Object.entries(sys.systems.hydraulics || {}).forEach(([, circuit], index) => {
        sys.applyComponentDamage?.({ componentId: `hydraulic.circuit.${String.fromCharCode(65 + index)}`, type: 'rupture', severity: 1 });
        circuit.pressure = 0;
        circuit.qty = 0;
    });
    if (!hasManualReversion(sys.aircraft, 'aileron')) sys.controls.aileron *= 0.1;
    if (!hasManualReversion(sys.aircraft, 'elevator')) sys.controls.elevator *= 0.1;
    sys.controls.rudder *= 0.1;
};

const SystemFailures = {
    // --- HYDRAULICS ---
    HYDRAULIC_FAILURE: {
        id: 'hydraulic_failure',
        name: 'Hydraulic System Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Hydraulic pressure loss detected.",
                    system_alert: "HYD SYS PRESS",
                    sound: "master_caution"
                }),
                effect: (sys, intensity) => {
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.A', type: 'pressure_loss', severity: 1 });
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.B', type: 'pressure_loss', severity: 1 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.hydraulicsFailed = true;
                    const limit = 1.0 - (intensity * 0.8);
                    if (!hasManualReversion(sys.aircraft, 'aileron')) sys.controls.aileron *= limit;
                    if (!hasManualReversion(sys.aircraft, 'elevator')) sys.controls.elevator *= limit;
                    sys.controls.rudder *= limit;
                    if (sys.systems.hydraulics) {
                        sys.systems.hydraulics.sysA.pressure = 0;
                        sys.systems.hydraulics.sysB.pressure = 0;
                    }
                }
            }
        }
    },

    HYDRAULIC_LEAK: {
        id: 'hydraulic_leak',
        name: 'Hydraulic Leak',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: 'Hydraulic quantity decreasing rapidly.',
                    system_alert: 'HYD LOW QTY',
                    visual: 'shake_minor'
                }),
                effect: (sys, intensity) => {
                    // Gradual pressure loss
                    sys.systems.hydraulics.sysA.qty -= 0.1 * intensity;
                    if (sys.systems.hydraulics.sysA.qty < 10) {
                         sys.systems.hydraulics.sysA.pressure *= 0.9;
                    }
                }
            }
        }
    },

    MAJOR_HYDRAULIC_FAILURE: {
        id: 'major_hydraulic_failure',
        name: 'Major Hydraulic Damage',
        category: 'systems',
        stages: {
            inactive: { next: 'degraded' },
            degraded: {
                duration: 6.0,
                next: 'active',
                description: (ctx) => ({
                    text: ctx.reason === 'debris_damage'
                        ? 'Hydraulic pressure collapsing after debris severed a main line.'
                        : 'Hydraulic pressure decaying. Primary flight controls becoming heavy.',
                    system_alert: 'HYD SYS A+B',
                    sound: 'master_caution',
                    visual: 'buffet_minor'
                }),
                effect: (sys, intensity, context = {}) => {
                    if (context.totalHydraulicLoss) {
                        applyTotalHydraulicLoss(sys);
                        return;
                    }
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.A', type: 'rupture', severity: 1 });
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.B', type: 'rupture', severity: 0.9 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.hydraulicsFailed = true;
                    const controlLimit = 0.75 - (intensity * 0.2);
                    if (!hasManualReversion(sys.aircraft, 'aileron')) sys.controls.aileron *= Math.max(0.45, controlLimit);
                    if (!hasManualReversion(sys.aircraft, 'elevator')) sys.controls.elevator *= Math.max(0.5, controlLimit);
                    sys.controls.rudder *= Math.max(0.4, controlLimit);
                    if (sys.systems.hydraulics?.sysA) {
                        sys.systems.hydraulics.sysA.pressure = Math.max(0, sys.systems.hydraulics.sysA.pressure - 600);
                    }
                    if (sys.systems.hydraulics?.sysB) {
                        sys.systems.hydraulics.sysB.pressure = Math.max(0, sys.systems.hydraulics.sysB.pressure - 450);
                    }
                }
            },
            active: {
                description: (ctx) => ({
                    text: 'Hydraulic power nearly exhausted. Flight control response severely degraded.',
                    system_alert: 'HYD PRESS LOW',
                    sound: 'hydraulic_whine',
                    visual: 'controls_stiff'
                }),
                effect: (sys, intensity, context = {}) => {
                    if (context.totalHydraulicLoss) {
                        applyTotalHydraulicLoss(sys);
                        return;
                    }
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.A', type: 'rupture', severity: 1 });
                    sys.applyComponentDamage?.({ componentId: 'hydraulic.circuit.B', type: 'rupture', severity: 0.9 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.hydraulicsFailed = true;
                    const limit = Math.max(0.1, 0.3 - (intensity * 0.15));
                    if (!hasManualReversion(sys.aircraft, 'aileron')) sys.controls.aileron *= limit;
                    if (!hasManualReversion(sys.aircraft, 'elevator')) sys.controls.elevator *= limit;
                    sys.controls.rudder *= limit;
                    if (sys.systems.hydraulics?.sysA) {
                        sys.systems.hydraulics.sysA.pressure = 0;
                    }
                    if (sys.systems.hydraulics?.sysB) {
                        sys.systems.hydraulics.sysB.pressure = Math.min(sys.systems.hydraulics.sysB.pressure, 400);
                    }
                }
            }
        }
    },

    // --- ELECTRICAL ---
    ELECTRICAL_BUS_FAILURE: {
        id: 'electrical_bus_failure',
        name: 'Electrical Bus Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Main AC Bus Lost. Multiple systems offline.",
                    visual: "cockpit_lights_flicker",
                    sound: "electrical_snap",
                    system_alert: "ELEC BUS 1 OFF"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'electrical.ac_bus.1', type: 'bus_fault', severity: 1 });
                    sys.applyComponentDamage?.({ componentId: 'electrical.ac_bus.2', type: 'bus_fault', severity: 1 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.electricalMainBusFailed = true;
                    sys.systems.electrical.gen1 = false;
                    sys.systems.electrical.gen2 = false;
                    sys.systems.electrical.dcVolts = 0;
                }
            }
        }
    },

    GENERATOR_DRIVE_DISCONNECT: {
        id: 'generator_drive_disconnect',
        name: 'IDG Disconnect',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Integrated Drive Generator disconnected. Oil temp high.",
                    system_alert: "IDG 1 DISC",
                    sound: "thump"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'electrical.generator.1', type: 'mechanical_disconnect', severity: 1 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.generator1Failed = true;
                    sys.systems.electrical.gen1 = false;
                    // Cannot be reset in flight
                }
            }
        }
    },

    CIRCUIT_ARC: {
        id: 'circuit_arc',
        name: 'Circuit Arcing',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Sparks and smoke from overhead panel.",
                    smell: "burning_ozone",
                    visual: "smoke_cockpit",
                    sound: "electrical_spark"
                }),
                effect: (sys) => {
                    // Random breaker pop
                    // Potential fire trigger
                    if (Math.random() < 0.08 && typeof sys.triggerFailure === 'function') {
                        sys.triggerFailure('electrical_fire');
                    }
                }
            }
        }
    },
    
    BATTERY_OVERHEAT: {
        id: 'battery_overheat',
        name: 'Battery Thermal Runaway',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Battery temperature critical. Smoke in electronics bay.",
                    system_alert: "BAT TEMP",
                    smell: "chemical_fumes"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'electrical.battery', type: 'thermal_runaway', severity: 1 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.batteryFailed = true;
                    sys.systems.electrical.battery = false;
                }
            }
        }
    },

    // --- PNEUMATICS / AIR ---
    PACK_FAIL: {
        id: 'pack_failure',
        name: 'Air Conditioning Pack Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Pack 1 Overheat/Trip.",
                    system_alert: "PACK L TRIP",
                    sound: "hissing_stop"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'pneumatic.pack.L', type: 'pack_trip', severity: 1 });
                    sys.systems.pressurization.packL = false;
                    // Cabin altitude climbs slowly
                }
            }
        }
    },

    CABIN_ALT_AUTO_FAIL: {
        id: 'cabin_pressure_controller_fail',
        name: 'Cabin Pressure Controller Fail',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Pressurization Auto Mode Failed. Switch to Manual.",
                    system_alert: "AUTO FAIL",
                    sound: "horn_intermittent"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'pressurization.controller', type: 'controller_fault', severity: 1 });
                }
            }
        }
    },

    // --- ICE & RAIN ---
    WINDSHIELD_HEAT_FAIL: {
        id: 'windshield_heat_fail',
        name: 'Window Heat Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Window heat controller fault. Icing risk.",
                    system_alert: "WINDOW HEAT L",
                    visual: "window_fog"
                }),
                effect: (sys) => {
                    // Visual obstruction logic
                }
            }
        }
    },

    DEICING_FAIL: {
        id: 'wing_anti_ice_fail',
        name: 'Wing Anti-Ice Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Wing Anti-Ice Valve stuck closed.",
                    system_alert: "WING A-ICE VALVE",
                    visual: "ice_buildup_wing"
                }),
                effect: (sys) => {
                    // Drag increase in icing conditions
                }
            }
        }
    },

    // --- FUEL ---
    FUEL_PUMP_FAIL: {
        id: 'fuel_pump_fail',
        name: 'Fuel Pump Low Pressure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Fuel pump output pressure low.",
                    system_alert: "FUEL PUMP L AFT",
                    sound: "chime_single"
                }),
                effect: (sys) => {
                    sys.applyComponentDamage?.({ componentId: 'fuel.pump.left', type: 'pump_failure', severity: 1 });
                }
            }
        }
    },

    FUEL_HEAT_FAIL: {
        id: 'fuel_heat_fail',
        name: 'Fuel Heater Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Fuel filter icing detected.",
                    system_alert: "FUEL FILTER BYPASS",
                    sound: "engine_roughness"
                }),
                effect: (sys) => {
                    // Potential engine hesitation
                }
            }
        }
    },

    // --- FIRE ---
    CARGO_FIRE: {
        id: 'cargo_fire',
        name: 'Cargo Bay Fire',
        category: 'systems',
        stages: {
            inactive: { next: 'incipient' },
            incipient: {
                duration: 10.0,
                next: 'active',
                description: (ctx) => ({
                    text: "Smoke detector activation in FWD Cargo.",
                    system_alert: "FWD CARGO SMOKE",
                    sound: "fire_bell",
                    visual: "red_light_flash"
                }),
                effect: (sys) => {
                    sys.systems.fire.cargo = true;
                }
            },
            active: {
                description: (ctx) => ({
                    text: "Fire suppressing agent discharging.",
                    system_alert: "BOTTLE DISCH"
                }),
                effect: (sys) => {
                    // If bottle not discharged, fire grows
                }
            }
        }
    },

    APU_FIRE: {
        id: 'apu_fire',
        name: 'APU Fire',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "APU Fire Loop Alert. Auto-shutdown initiated.",
                    system_alert: "APU FIRE",
                    sound: "fire_bell",
                    visual: "red_light_flash"
                }),
                effect: (sys, intensity, ctx) => {
                    const fire = sys.systems.fire;
                    ctx.extinguishCount ??= fire.extinguishCount?.apu || 0;
                    if ((fire.extinguishCount?.apu || 0) > ctx.extinguishCount) return;
                    sys.applyComponentDamage?.({ componentId: 'apu', type: 'fire_damage', severity: 1 });
                    sys.systems.damage ??= {};
                    sys.systems.damage.apuFailed = true;
                    sys.systems.fire.apu = true;
                    sys.systems.apu.running = false;
                }
            }
        }
    },

    ELECTRICAL_FIRE: {
        id: 'electrical_fire',
        name: 'Electrical Fire',
        category: 'systems',
        stages: {
            inactive: { next: 'incipient' },
            incipient: {
                duration: 12.0,
                next: 'active',
                description: (ctx) => ({
                    text: "Electrical smoke reported from cabin ceiling panels.",
                    system_alert: "ELEC SMOKE",
                    smell: "burning_ozone",
                    visual: "smoke_cockpit",
                    sound: "electrical_spark"
                })
            },
            active: {
                description: (ctx) => ({
                    text: "Electrical fire spreading along service wiring.",
                    system_alert: "ELEC FIRE",
                    smell: "burning_plastic",
                    visual: "smoke_cockpit",
                    sound: "fire_bell"
                }),
                effect: (sys, intensity) => {
                    const scale = 1.0 - (intensity * 0.6);
                    sys.systems.electrical.acVolts *= scale;
                    sys.systems.electrical.dcVolts *= scale;
                    sys.systems.electrical.acAmps *= scale;
                    if (Math.random() < 0.05) {
                        sys.systems.electrical.gen1 = false;
                    }
                    if (Math.random() < 0.05) {
                        sys.systems.electrical.gen2 = false;
                    }
                }
            }
        }
    },

    AVIONICS_OVERHEAT: {
        id: 'avionics_overheat',
        name: 'Avionics Cooling Failure',
        category: 'systems',
        stages: {
            inactive: { next: 'active' },
            active: {
                description: (ctx) => ({
                    text: "Equipment cooling airflow low. Display units overheating.",
                    system_alert: "EQUIP COOLING",
                    sound: "fan_noise_stop",
                    smell: "hot_dust"
                }),
                effect: (sys) => {
                    // Screen failures eventually
                }
            }
        }
    }
};

const createSupplementalSystemFailure = (id, name, systemAlert, effect = () => {}) => ({
    id,
    name,
    category: 'systems',
    stages: {
        inactive: { next: 'active' },
        active: {
            description: () => ({
                text: name,
                system_alert: systemAlert
            }),
            effect
        }
    }
});

const SupplementalSystemFailures = {
    BUS_TIE_STUCK: createSupplementalSystemFailure('bus_tie_stuck', 'Bus Tie Stuck', 'BUS TIE'),
    TRANSFORMER_RECTIFIER_FAIL: createSupplementalSystemFailure('transformer_rectifier_fail', 'Transformer Rectifier Failure', 'TR UNIT'),
    STANDBY_POWER_FAIL: createSupplementalSystemFailure('standby_power_fail', 'Standby Power Failure', 'STBY PWR'),
    CABIN_FAN_FAIL: createSupplementalSystemFailure('cabin_fan_fail', 'Cabin Ventilation Fan Failure', 'CAB FAN'),
    BLEED_LEAK: createSupplementalSystemFailure('bleed_leak', 'Bleed Duct Leak', 'BLEED DUCT', sys => {
        sys.applyComponentDamage?.({ componentId: 'pneumatic.duct.L', type: 'duct_rupture', severity: 1 });
    }),
    ISOLATION_VALVE_FAIL: createSupplementalSystemFailure('isolation_valve_fail', 'Isolation Valve Failure', 'ISOL VALVE', sys => {
        sys.applyComponentDamage?.({ componentId: 'pneumatic.isolation.L_to_R', type: 'valve_failure', severity: 1 });
        sys.applyComponentDamage?.({ componentId: 'pneumatic.isolation.R_to_L', type: 'valve_failure', severity: 1 });
    }),
    PACK_OVERHEAT: createSupplementalSystemFailure('pack_overheat', 'Air Conditioning Pack Overheat', 'PACK OVHT', sys => {
        sys.applyComponentDamage?.({ componentId: 'pneumatic.pack.L', type: 'overheat_trip', severity: 1 });
    }),
    FUEL_CROSSFEED_STUCK: createSupplementalSystemFailure('fuel_crossfeed_stuck', 'Crossfeed Valve Stuck', 'X FEED'),
    CENTER_TANK_PUMP_FAIL: createSupplementalSystemFailure('center_tank_pump_fail', 'Center Tank Pump Failure', 'CTR TK PUMP', sys => {
        sys.applyComponentDamage?.({ componentId: 'fuel.pump.center', type: 'pump_failure', severity: 1 });
    }),
    BRAKE_ACCUMULATOR_LOW: createSupplementalSystemFailure('brake_accumulator_low', 'Brake Accumulator Low', 'BRAKE ACCUM'),
    ANTI_SKID_FAIL: createSupplementalSystemFailure('anti_skid_fail', 'Anti-Skid Failure', 'ANTI SKID'),
    CARGO_SMOKE_LOOP_FAIL: createSupplementalSystemFailure('cargo_smoke_loop_fail', 'Cargo Smoke Loop Failure', 'CARGO SMOKE'),
    LAVATORY_SMOKE: createSupplementalSystemFailure('lavatory_smoke', 'Lavatory Smoke Detection', 'LAV SMOKE'),
    EMERGENCY_LIGHTS_FAIL: createSupplementalSystemFailure('emergency_lights_fail', 'Emergency Lights Failure', 'EMER LIGHTS')
};

export default {
    ...SystemFailures,
    ...SupplementalSystemFailures
};
