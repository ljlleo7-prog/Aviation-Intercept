import OverheadLogic from '../OverheadLogic.js';

export default class SystemsService {
    initializeSystems(aircraft, difficulty, stateFuel, engines) {
        const forceHotStart = aircraft?.scenarioMode && aircraft?.scenarioRestrictions?.hotStart !== false;
        const isColdDark = !forceHotStart && ['pro', 'devil', 'professional', 'survival'].includes(difficulty);
        const engineCount = aircraft.engineCount || 2;

        const enginesState = {};
        for (let i = 1; i <= engineCount; i++) {
            enginesState[`eng${i}`] = {
                startSwitch: 'OFF',
                fuelControl: !isColdDark,
                n2: isColdDark ? 0 : 20,
                egt: isColdDark ? 20 : 400
            };
        }

        if (engines) {
            engines.forEach(eng => {
                if (isColdDark) {
                    eng.state.running = false;
                    eng.state.n1 = 0;
                    eng.state.n2 = 0;
                    eng.state.egt = 15;
                    eng.state.ff = 0;
                } else {
                    eng.state.running = true;
                    eng.state.n1 = 5;
                    eng.state.n2 = 20;
                    eng.state.egt = 400;
                    eng.state.ff = 0.3;
                }
            });
        }

        const batterySelector = isColdDark ? 'OFF' : 'AUTO';
        const elecState = {
            batterySelector,
            battery: batterySelector !== 'OFF',
            batteryCharge: 100,
            stbyPower: batterySelector !== 'OFF',
            apuGen: false,
            apuGen1: false,
            apuGen2: false,
            busTie: true,
            dcVolts: isColdDark ? 0 : 28.0,
            acVolts: isColdDark ? 0 : 115,
            acFreq: isColdDark ? 0 : 400,
            acAmps: isColdDark ? 0 : 50,
            apuGenOff: true
        };

        for (let i = 1; i <= engineCount; i++) {
            elecState[`gen${i}`] = !isColdDark;
            elecState[`sourceOff${i}`] = isColdDark;
        }

        const pneuState = {
            packL: !isColdDark,
            packR: !isColdDark,
            isolationValve: true,
            cabinAlt: 0,
            diffPressure: 0,
            targetAlt: 35000,
            ductPressL: isColdDark ? 0 : 30,
            ductPressR: isColdDark ? 0 : 30,
            mode: 'AUTO'
        };

        for (let i = 1; i <= engineCount; i++) {
            pneuState[`bleed${i}`] = !isColdDark;
        }

        const totalFuel = stateFuel;
        const fuelState = {
            tanks: engineCount <= 2
                ? { left: totalFuel * 0.45, right: totalFuel * 0.45, center: totalFuel * 0.10 }
                : { left: totalFuel * 0.3, right: totalFuel * 0.3, center: totalFuel * 0.4 },
            leftPumps: !isColdDark,
            rightPumps: !isColdDark,
            centerPumps: !isColdDark,
            crossfeed: false,
            dump: false
        };

        const fireState = { apu: false, cargo: false, apuHandle: false, bottle1: 100, bottle2: 100, apuBottle: 100 };
        for (let i = 1; i <= engineCount; i++) {
            fireState[`eng${i}`] = false;
            fireState[`eng${i}Handle`] = false;
        }

        const hydraulicState = {};
        const hydraulicCount = aircraft.hydraulicCount || (engineCount > 2 ? 4 : 2);
        const sysNames = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < hydraulicCount; i++) {
            const name = i < sysNames.length ? `sys${sysNames[i]}` : `sys${i+1}`;
            hydraulicState[name] = {
                pressure: isColdDark ? 0 : 3000,
                engPump: !isColdDark,
                elecPump: !isColdDark,
                qty: 100
            };
        }

        return {
            electrical: elecState,
            fuel: fuelState,
            apu: { master: false, start: false, running: false, starting: false, bleed: false, egt: 0, n2: 0, state: 'OFF' },
            hydraulics: hydraulicState,
            transponder: { code: 2000, mode: 'STBY', ident: false },
            pressurization: pneuState,
            oxygen: { masks: false, crewPressure: 1800, paxPressure: 1500 },
            lighting: { landing: false, taxi: false, nav: false, beacon: false, strobe: false, logo: false, wing: false, panel: false, background: false, flood: false, dome: false, powered: !isColdDark },
            nav: { irsL: !isColdDark, irsR: !isColdDark },
            engines: enginesState,
            fire: fireState,
            signs: { seatBelts: false, noSmoking: false, attend: false, groundCall: false },
            wipers: { left: false, right: false },
            brakes: { parkingBrake: true, autobrake: 'OFF', temp: [20, 20, 20, 20] },
            adirs: { ir1: 'OFF', ir2: 'OFF', ir3: 'OFF', alignState: 0, aligned: false, onBat: false },
            ice: { windowHeat: !isColdDark, probeHeat: !isColdDark, wingAntiIce: false, eng1AntiIce: false, eng2AntiIce: false, icingLevel: 0, deicingRequired: false }
        };
    }

    updateSystems(systems, engines, state, onGround, difficulty, failureParams, aircraft, payloadMass, dt, systemModel = null) {
        const context = {
            engineN2: engines.map(e => e.state.n2 || 0),
            altitude: -state.pos.z * 3.28084,
            onGround,
            airspeed: state.vel.magnitude() * 1.94384,
            difficulty
        };

        systemModel?.update(systems, engines);
        OverheadLogic.update(systems, context, dt);
        engines.forEach((engine, index) => {
            const count = systems.fire?.extinguishCount?.[`eng${index + 1}`] || 0;
            if (count > (engine.state.fireExtinguishCount || 0)) {
                engine.state.fireHeatInput = 0;
                engine.state.fireExtinguishCount = count;
            }
        });
        systemModel?.update(systems, engines);

        if (failureParams.quantity_rate) {
            const rates = failureParams.quantity_rate;

            if (rates.fuel && systems.fuel?.tanks) {
                const leak = rates.fuel * dt;
                const tanks = systems.fuel.tanks;
                const total = (tanks.left + tanks.right + tanks.center) || 1;
                if (tanks.left > 0) tanks.left = Math.max(0, tanks.left - leak * (tanks.left / total));
                if (tanks.right > 0) tanks.right = Math.max(0, tanks.right - leak * (tanks.right / total));
                if (tanks.center > 0) tanks.center = Math.max(0, tanks.center - leak * (tanks.center / total));
            }

            if (systems.hydraulics) {
                Object.keys(systems.hydraulics).forEach(sysName => {
                    let rate = rates.hydraulics || 0;
                    if (rates[sysName]) rate += rates[sysName];

                    if (rate > 0) {
                        const sys = systems.hydraulics[sysName];
                        if (sys && sys.qty > 0) {
                            sys.qty = Math.max(0, sys.qty - rate * dt);
                            if (sys.qty <= 0) {
                                sys.pressure = 0;
                                sys.engPump = false;
                                sys.elecPump = false;
                            }
                        }
                    }
                });
            }
        }

        if (systems.fuel?.tanks) {
            const totalFuel = Object.values(systems.fuel.tanks).reduce((a, b) => a + b, 0);
            state.fuel = totalFuel;
            state.mass = (aircraft.emptyWeight || 40000) + payloadMass + state.fuel;
        }
    }

    updateControlEffectiveness(systems) {
        if (systems.resourceNetwork?.capabilities) {
            const capabilities = systems.resourceNetwork.capabilities;
            return {
                aileron: capabilities.aileron,
                elevator: capabilities.elevator,
                rudder: capabilities.rudder,
                gear: capabilities.gear,
                spoilers: capabilities.spoilers
            };
        }
        if (!systems.hydraulics) return { aileron: 1.0, elevator: 1.0, rudder: 1.0 };

        const hydSystems = Object.values(systems.hydraulics);
        const totalSystems = hydSystems.length;
        if (totalSystems === 0) return { aileron: 0, elevator: 0, rudder: 0 };

        let activeSystems = 0;
        hydSystems.forEach(sys => {
            if (sys.pressure > 1500) activeSystems++;
        });

        let healthFactor = 0;
        if (activeSystems > 0) {
            healthFactor = 0.5 + 0.5 * (activeSystems / totalSystems);
        }

        return {
            aileron: healthFactor,
            elevator: healthFactor,
            rudder: healthFactor
        };
    }
}
