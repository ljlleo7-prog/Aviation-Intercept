import fs from 'fs';
import path from 'path';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import eventBus from '../src/services/eventBus.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { terrainService } from '../src/services/TerrainService.js';

const toDeg = (rad) => rad * 57.2958;
const normalizeAngleDeg = (deg) => {
    const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
    return wrapped === -180 ? 180 : wrapped;
};
const normalizeHeadingDeg = (deg) => {
    const wrapped = ((deg % 360) + 360) % 360;
    return wrapped === 360 ? 0 : wrapped;
};

class FlightRecorder {
    constructor() {
        this.history = [];
        this.events = [];
    }

    recordFrame(time, physics, output = null) {
        const state = output || physics.getOutputState();
        const vEarth = physics.state.quat.rotate(physics.state.vel);
        const airspeedKts = state?.derived?.airspeed ?? (physics.state.vel.magnitude() * 1.94384);
        const groundSpeedKts = state?.derived?.groundSpeed ?? Math.hypot(vEarth.x, vEarth.y) * 1.94384;
        const altitudeFt = state?.derived?.altitude_ft ?? (-physics.state.pos.z / 0.3048);
        const verticalSpeedFpm = state?.verticalSpeed ?? (-vEarth.z * 196.85);
        const pitchDeg = state?.orientation?.theta !== undefined ? normalizeAngleDeg(toDeg(state.orientation.theta)) : 0;
        const rollDeg = state?.orientation?.phi !== undefined ? normalizeAngleDeg(toDeg(state.orientation.phi)) : 0;
        const yawDeg = state?.derived?.heading !== undefined ? normalizeHeadingDeg(state.derived.heading) : 0;
        const onGround = state?.debugPhysics?.isOnGround ?? physics.onGround;
        const alphaDeg = state?.debugPhysics?.alpha !== undefined ? toDeg(state.debugPhysics.alpha) : 0;
        const stallAlphaDeg = physics.warningSystem?.thresholds?.stallAlpha ?? 15;
        const stallSpeedKts = physics.aircraft?.stallSpeed ?? null;
        const stallByAlpha = !onGround && alphaDeg > stallAlphaDeg;
        const stallBySpeed = !onGround && stallSpeedKts !== null && airspeedKts < stallSpeedKts;
        const stallWarning = Array.isArray(state?.activeWarnings) && state.activeWarnings.some(w => w.id === 'STALL');
        const stall = stallWarning || stallByAlpha || stallBySpeed;

        this.history.push({
            time,
            airspeed: airspeedKts,
            groundSpeed: groundSpeedKts,
            altitude: altitudeFt,
            verticalSpeed: verticalSpeedFpm,
            pitch: pitchDeg,
            roll: rollDeg,
            yaw: yawDeg,
            alpha: alphaDeg,
            stallAlpha: stallAlphaDeg,
            stallSpeed: stallSpeedKts,
            stallWarning,
            stall,
            eng1_n1: physics.engines[0]?.state.n1 || 0,
            eng2_n1: physics.engines[1]?.state.n1 || 0,
            eng1_egt: physics.engines[0]?.state.egt || 0,
            eng2_egt: physics.engines[1]?.state.egt || 0,
            hydPress: physics.systems.hydraulics?.sysA?.pressure || 0,
            elecVolts: physics.systems.electrical?.acVolts || 0,
            onGround
        });
    }

    logEvent(time, type, message) {
        this.events.push({ time, type, message });
    }
}

const getDefaultOutPaths = (scenarioPath) => {
    const base = path.basename(scenarioPath, path.extname(scenarioPath));
    const dir = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    return {
        csv: path.resolve(dir, `${base}.csv`),
        report: path.resolve(dir, `${base}.report.json`)
    };
};

const parseArgs = (args) => {
    const options = {
        scenarioPath: null,
        outCsv: null,
        outReport: null
    };
    args.forEach(arg => {
        if (arg.startsWith('--out=')) options.outCsv = arg.split('=')[1];
        else if (arg.startsWith('--report=')) options.outReport = arg.split('=')[1];
        else if (!options.scenarioPath) options.scenarioPath = arg;
    });
    return options;
};

const loadScenario = (scenarioPath) => {
    const raw = fs.readFileSync(scenarioPath, 'utf-8');
    return JSON.parse(raw);
};

const applyInitialConditions = (physics, scenario) => {
    if (scenario.initial?.conditions) {
        physics.setInitialConditions(scenario.initial.conditions);
    }
    if (Number.isFinite(scenario.initial?.velocityKts)) {
        const velMs = scenario.initial.velocityKts * 0.514444;
        physics.state.vel.set(velMs, 0, 0);
    }
};

const applyInitialThrottle = (physics, scenario) => {
    const hasThrottle =
        Number.isFinite(scenario.initial?.conditions?.throttle) ||
        Number.isFinite(scenario.controls?.throttle);
    if (hasThrottle) return;
    const positionZ = scenario.initial?.conditions?.position?.z ?? 0;
    const velocityKts = scenario.initial?.velocityKts ?? 0;
    const inFlightStart = positionZ > 0 || velocityKts > 0;
    if (!inFlightStart) return;
    physics.controls.throttle = 1;
    if (Array.isArray(physics.controls.engineThrottles)) {
        physics.controls.engineThrottles = physics.controls.engineThrottles.map(() => 1);
    }
};

const resolveLatLon = (scenario) => {
    const lat = scenario.initial?.conditions?.latitude ?? scenario.environment?.latitude ?? 37.6188;
    const lon = scenario.initial?.conditions?.longitude ?? scenario.environment?.longitude ?? -122.3750;
    return { lat, lon };
};

const resolveWeather = (scenario, lat, lon) => {
    if (scenario.environment?.weather) return scenario.environment.weather;
    return {
        windSpeed: 5,
        windDirection: 0,
        turbulence: 0,
        precipitation: 0,
        season: scenario.environment?.season || 'summer',
        zuluTime: scenario.environment?.zuluTime || new Date().toISOString(),
        latitude: lat,
        longitude: lon
    };
};

const applyWeatherToPhysics = (physics, weather) => {
    if (!weather || typeof physics.setEnvironment !== 'function') return;
    physics.setEnvironment({
        windSpeed: weather.windSpeed || 0,
        windDirection: weather.windDirection || 0,
        windGust: weather.windGust || 0,
        windShear: weather.windShear || 0,
        turbulence: weather.turbulence || 0,
        precipitation: weather.precipitation || 0,
        temperature: weather.temperature,
        cloudCover: weather.cloudCover || 0,
        weatherCode: weather.weatherCode || 0
    });
};

const initEnvironment = async (physics, scenario) => {
    const { lat, lon } = resolveLatLon(scenario);
    if (scenario.initial?.conditions?.latitude === undefined) physics.state.geo.lat = lat;
    if (scenario.initial?.conditions?.longitude === undefined) physics.state.geo.lon = lon;
    let terrainElevationM = scenario.environment?.terrainElevationM;
    const useTerrainFetch = scenario.environment?.useTerrainFetch !== false;
    if (terrainElevationM === undefined && useTerrainFetch) {
        const fetched = await terrainService.getElevation(lat, lon);
        if (typeof fetched === 'number') terrainElevationM = fetched;
    }
    if (typeof terrainElevationM === 'number') {
        physics.terrainElevation = terrainElevationM;
        if (physics.airportElevation === 0) {
            physics.airportElevation = terrainElevationM;
        }
    }
    const weather = resolveWeather(scenario, lat, lon);
    applyWeatherToPhysics(physics, weather);
    return { lat, lon, weather, terrainElevationM: physics.terrainElevation ?? null };
};

const applyPoweredState = (physics, scenario) => {
    if (scenario.initial?.powered === false) return;
    const throttle = Number.isFinite(physics.controls?.throttle) ? physics.controls.throttle : 0.7;
    const n1 = 20 + Math.max(0, Math.min(1, throttle)) * 70;
    const n2 = 40 + Math.max(0, Math.min(1, throttle)) * 55;
    const egt = 420 + Math.max(0, Math.min(1, throttle)) * 320;
    if (typeof physics.setMotionEnabled === 'function') {
        physics.setMotionEnabled(true);
    }
    physics.systems.electrical.battery = true;
    physics.systems.electrical.gen1 = true;
    physics.systems.electrical.gen2 = true;
    physics.systems.electrical.stbyPower = true;
    physics.systems.electrical.acVolts = 115;
    physics.systems.electrical.dcVolts = 28;
    physics.systems.electrical.sourceOff1 = false;
    physics.systems.electrical.sourceOff2 = false;
    if (physics.systems.hydraulics.sysA) {
        physics.systems.hydraulics.sysA.engPump = true;
        physics.systems.hydraulics.sysA.elecPump = true;
        physics.systems.hydraulics.sysA.pressure = 3000;
    }
    if (physics.systems.hydraulics.sysB) {
        physics.systems.hydraulics.sysB.engPump = true;
        physics.systems.hydraulics.sysB.elecPump = true;
        physics.systems.hydraulics.sysB.pressure = 3000;
    }
    physics.systems.fuel.leftPumps = true;
    physics.systems.fuel.rightPumps = true;
    physics.systems.fuel.centerPumps = false;
    physics.systems.fuel.crossfeed = false;
    physics.systems.pressurization.packL = true;
    physics.systems.pressurization.packR = true;
    physics.systems.pressurization.bleed1 = true;
    physics.systems.pressurization.bleed2 = true;
    physics.systems.pressurization.isolationValve = true;
    physics.systems.lighting.nav = true;
    physics.systems.lighting.beacon = true;
    physics.systems.lighting.strobe = true;
    if (physics.systems.brakes) {
        physics.systems.brakes.parkingBrake = false;
    }
    physics.engines.forEach((eng, i) => {
        eng.state.running = true;
        eng.state.n1 = n1;
        eng.state.n2 = n2;
        eng.state.egt = egt;
        eng.state.oilPressure = 80;
        eng.state.fuelFlow = 1.2;
        eng.setThrottle(throttle);
        if (physics.systems.engines[`eng${i+1}`]) {
            physics.systems.engines[`eng${i+1}`].n2 = n2;
            physics.systems.engines[`eng${i+1}`].egt = egt;
            physics.systems.engines[`eng${i+1}`].fuelControl = true;
            physics.systems.engines[`eng${i+1}`].startSwitch = 'OFF';
        }
    });
};

const applyAutopilot = (physics, autopilot) => {
    if (!autopilot) return;
    if (autopilot.enabled) {
        physics.setAutopilot(true, autopilot.settings || {});
    } else {
        physics.setAutopilot(false);
    }
};

const computeStats = (history) => {
    const metrics = ['airspeed', 'groundSpeed', 'altitude', 'verticalSpeed', 'pitch', 'roll', 'yaw', 'alpha'];
    const stats = {};
    metrics.forEach(key => {
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let sumSq = 0;
        history.forEach(h => {
            const v = h[key];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            sumSq += v * v;
        });
        const count = history.length || 1;
        const mean = sum / count;
        const variance = Math.max(0, (sumSq / count) - mean * mean);
        const stdev = Math.sqrt(variance);
        stats[key] = { min, max, mean, stdev };
    });
    return stats;
};

const evaluateScenario = (history) => {
    if (!history.length) {
        return { stability: 'unknown', control: 'unknown', notes: ['no data'] };
    }
    const start = history[0];
    const end = history[history.length - 1];
    let maxRoll = 0;
    let maxPitch = 0;
    let maxAlpha = 0;
    let stallFrames = 0;
    history.forEach(h => {
        if (Math.abs(h.roll) > maxRoll) maxRoll = Math.abs(h.roll);
        if (Math.abs(h.pitch) > maxPitch) maxPitch = Math.abs(h.pitch);
        if (Math.abs(h.alpha) > maxAlpha) maxAlpha = Math.abs(h.alpha);
        if (h.stall) stallFrames += 1;
    });
    const altitudeChange = end.altitude - start.altitude;
    const lossOfControl = maxRoll > 60 || maxPitch > 45;
    const unstable = maxRoll > 45 || maxPitch > 30;
    const stability = lossOfControl ? 'loss_of_control' : unstable ? 'unstable' : 'stable';
    const dt = history.length > 1 ? (history[1].time - history[0].time) : 0;
    const stallTime = stallFrames * dt;
    const notes = [];
    notes.push(`max_roll_deg:${maxRoll.toFixed(1)}`);
    notes.push(`max_pitch_deg:${maxPitch.toFixed(1)}`);
    notes.push(`max_alpha_deg:${maxAlpha.toFixed(1)}`);
    notes.push(`stall_time_s:${stallTime.toFixed(2)}`);
    notes.push(`altitude_change_ft:${altitudeChange.toFixed(1)}`);
    return { stability, control: stability, notes };
};

const writeCsv = (pathOut, recorder) => {
    const header = [
        'time_s',
        'airspeed_kts',
        'groundSpeed_kts',
        'altitude_ft',
        'verticalSpeed_fpm',
        'pitch_deg',
        'roll_deg',
        'yaw_deg',
        'alpha_deg',
        'stallAlpha_deg',
        'stallSpeed_kts',
        'stallWarning',
        'stall',
        'eng1_n1',
        'eng2_n1',
        'eng1_egt',
        'eng2_egt',
        'hydPress_psi',
        'elecVolts',
        'onGround'
    ].join(',');
    const rows = recorder.history.map(h => [
        h.time.toFixed(2),
        h.airspeed.toFixed(1),
        h.groundSpeed.toFixed(1),
        h.altitude.toFixed(1),
        h.verticalSpeed.toFixed(0),
        h.pitch.toFixed(2),
        h.roll.toFixed(2),
        h.yaw.toFixed(2),
        h.alpha.toFixed(2),
        h.stallAlpha.toFixed(1),
        h.stallSpeed === null ? '' : h.stallSpeed.toFixed(1),
        h.stallWarning ? 1 : 0,
        h.stall ? 1 : 0,
        h.eng1_n1.toFixed(1),
        h.eng2_n1.toFixed(1),
        h.eng1_egt.toFixed(0),
        h.eng2_egt.toFixed(0),
        h.hydPress.toFixed(0),
        h.elecVolts.toFixed(0),
        h.onGround ? 1 : 0
    ].join(','));
    const csv = [header, ...rows].join('\n');
    fs.writeFileSync(pathOut, csv, 'utf-8');
};

const writeReport = (pathOut, scenario, recorder) => {
    const stats = computeStats(recorder.history);
    const evaluation = evaluateScenario(recorder.history);
    const report = {
        scenario: {
            name: scenario.name || 'scenario',
            aircraftModel: scenario.aircraftModel,
            duration: scenario.duration,
            dt: scenario.dt
        },
        environment: scenario.environment || {},
        evaluation,
        statistics: stats,
        events: recorder.events
    };
    fs.writeFileSync(pathOut, JSON.stringify(report, null, 2), 'utf-8');
    return report;
};

const applyAction = (physics, recorder, action, time, currentInputs) => {
    if (action.type === 'controls') {
        return { ...currentInputs, ...action.inputs };
    }
    if (action.type === 'autopilot') {
        applyAutopilot(physics, action);
        recorder.logEvent(time, 'AUTOPILOT', action.enabled ? 'enabled' : 'disabled');
        return currentInputs;
    }
    if (action.type === 'failure') {
        if (physics.failureSystem) {
            const ctx = action.context || {};
            physics.failureSystem.triggerFailure(action.failureId, ctx);
            const failure = physics.failureSystem.activeFailures?.get(action.failureId);
            const stage = action.stage || (action.forceActive ? 'active' : null);
            if (failure && stage && failure.stages?.[stage]) {
                failure.transitionTo(stage);
            }
            recorder.logEvent(time, 'FAILURE', `triggered:${action.failureId}`);
        }
        return currentInputs;
    }
    if (action.type === 'event') {
        recorder.logEvent(time, action.level || 'EVENT', action.message || 'event');
        return currentInputs;
    }
    return currentInputs;
};

const runScenario = async (scenarioPath, options) => {
    const scenario = loadScenario(scenarioPath);
    const aircraftDb = await loadAircraftData();
    const aircraftConfig = aircraftDb.find(a => a.model === scenario.aircraftModel);
    if (!aircraftConfig) {
        console.error(`Aircraft not found: ${scenario.aircraftModel}`);
        process.exit(1);
    }

    const dt = scenario.dt || 0.05;
    const duration = scenario.duration || 20;
    const difficulty = scenario.difficulty || 'REALISTIC';

    const physics = new RealisticFlightPhysicsService(aircraftConfig, 0, 0, difficulty);
    applyInitialConditions(physics, scenario);
    if (scenario.controls) {
        physics.controls = { ...physics.controls, ...scenario.controls };
    }
    applyInitialThrottle(physics, scenario);
    const envMeta = await initEnvironment(physics, scenario);
    applyPoweredState(physics, scenario);
    applyAutopilot(physics, scenario.autopilot);

    const recorder = new FlightRecorder();
    const actions = Array.isArray(scenario.actions) ? scenario.actions.slice().sort((a, b) => a.time - b.time) : [];
    let actionIndex = 0;
    let currentInputs = { ...physics.controls };
    let weatherState = envMeta.weather;

    const unsubFailure = eventBus.subscribe(eventBus.Types.FAILURE_OCCURRED, (payload) => {
        recorder.logEvent(physics.time || 0, 'FAILURE', `occurred:${payload.type}`);
    });
    const unsubMsg = eventBus.subscribe(eventBus.Types.CRITICAL_MESSAGE, (payload) => {
        recorder.logEvent(physics.time || 0, 'WARNING', payload.content);
    });

    const steps = Math.floor(duration / dt);
    for (let step = 0; step <= steps; step++) {
        const time = step * dt;
        physics.time = time;

        while (actionIndex < actions.length && actions[actionIndex].time <= time + 1e-9) {
            currentInputs = applyAction(physics, recorder, actions[actionIndex], time, currentInputs);
            actionIndex += 1;
        }

        if (weatherState) {
            applyWeatherToPhysics(physics, weatherState);
        }

        physics.update(currentInputs, dt);
        const output = physics.getOutputState();
        recorder.recordFrame(time, physics, output);
        if (scenario.terminateOnCrash !== false && output?.hasCrashed) {
            recorder.logEvent(time, 'TERMINATE', output.crashWarning || 'crashed');
            break;
        }
    }

    const { csv, report } = getDefaultOutPaths(scenarioPath);
    const outCsv = options.outCsv || csv;
    const outReport = options.outReport || report;
    writeCsv(outCsv, recorder);
    const reportData = writeReport(outReport, {
        ...scenario,
        environment: {
            ...scenario.environment,
            latitude: envMeta.lat,
            longitude: envMeta.lon,
            terrainElevationM: envMeta.terrainElevationM,
            terrainElevationFt: envMeta.terrainElevationM !== null ? envMeta.terrainElevationM * 3.28084 : null,
            airportElevationFt: physics.airportElevation * 3.28084,
            weather: weatherState
        }
    }, recorder);

    unsubFailure();
    unsubMsg();

    console.log(`CSV: ${outCsv}`);
    console.log(`REPORT: ${outReport}`);
    console.log(`EVAL: ${reportData.evaluation.stability}`);
};

const args = process.argv.slice(2);
const options = parseArgs(args);
if (!options.scenarioPath) {
    console.error('Usage: node scripts/run_scenario.js <scenario.json> [--out=path.csv] [--report=path.json]');
    process.exit(1);
}
runScenario(options.scenarioPath, options).catch(err => {
    console.error(err);
    process.exit(1);
});
