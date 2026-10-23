import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { airportService } from '../src/services/airportService.js';

const R = 6371000;
const toDeg = 180 / Math.PI;
const toRad = Math.PI / 180;

const offsetLatLon = (lat, lon, northMeters, eastMeters) => {
  const dLat = (northMeters / R) * toDeg;
  const dLon = (eastMeters / (R * Math.cos(lat * toRad))) * toDeg;
  return { latitude: lat + dLat, longitude: lon + dLon };
};

const buildApproachState = (geom, distNm, offsetNm, altitudeOffsetFt = 0) => {
  const threshold = geom.thresholdStart;
  const runwayHeading = geom.heading;
  const approachDir = (runwayHeading + 180) % 360;
  const distM = distNm * 1852;
  const offsetM = offsetNm * 1852;
  const approachRad = approachDir * toRad;
  const base = offsetLatLon(
    threshold.latitude,
    threshold.longitude,
    distM * Math.cos(approachRad),
    distM * Math.sin(approachRad)
  );
  const offsetHeading = (runwayHeading + 90) % 360;
  const offsetRad = offsetHeading * toRad;
  const pos = offsetLatLon(
    base.latitude,
    base.longitude,
    offsetM * Math.cos(offsetRad),
    offsetM * Math.sin(offsetRad)
  );
  const distToThresholdFt = distM * 3.28084;
  const runwayElev = threshold.elevation || 0;
  const targetAltitude = runwayElev + 50 + (distToThresholdFt * Math.tan(3 * Math.PI / 180));
  return {
    latitude: pos.latitude,
    longitude: pos.longitude,
    altitude: targetAltitude + altitudeOffsetFt,
    heading: runwayHeading,
    track: runwayHeading
  };
};

const AIRCRAFT_MODEL = 'Boeing 737-800';
const SIM_DT = 0.05;
let cachedAircraft = null;
const DEFAULT_ENV = {
  windSpeed: 10,
  windGust: 16,
  windShear: 4,
  turbulence: 0.2,
  precipitation: 0,
  temperature: 15,
  cloudCover: 0.2
};

const ALL_AIRPORT_CASES = [
  { code: 'LAX' },
  { code: 'ORD' },
  { code: 'JFK' }
];

const ALL_AIRSPACE_PROFILES = [
  { name: 'standard', overrides: {} },
  { name: 'gusty', overrides: { windSpeed: 18, windGust: 28, windShear: 8, turbulence: 0.5 } }
];

const FAST_TEST_MODE = process.env.AP_FULL_MATRIX !== '1';
const AIRPORT_CASES = FAST_TEST_MODE ? [ALL_AIRPORT_CASES[0]] : ALL_AIRPORT_CASES;
const AIRSPACE_PROFILES = FAST_TEST_MODE ? [ALL_AIRSPACE_PROFILES[0]] : ALL_AIRSPACE_PROFILES;

const buildEnv = (heading, overrides = {}) => {
  const { windDirectionOffset, ...rest } = overrides;
  let windDirection = Number.isFinite(rest.windDirection) ? rest.windDirection : heading;
  if (Number.isFinite(windDirectionOffset)) {
    windDirection = (heading + windDirectionOffset + 360) % 360;
  }
  return {
    ...DEFAULT_ENV,
    ...rest,
    windDirection
  };
};

const CSV_OUT = process.env.AP_CSV_OUT || null;
const csvRows = [];
const csvColumns = new Set();
const baseCsvColumns = [
  'scenario',
  'airport',
  'runway',
  'airspace',
  'dt_s',
  'duration_s',
  'target_speed',
  'target_vs',
  'target_altitude',
  'target_heading',
  'windSpeed',
  'windDirection',
  'windGust',
  'windShear',
  'turbulence',
  'precipitation',
  'temperature',
  'cloudCover',
  'time_to_within_s',
  'time_within_s',
  'time_total_s',
  'capture_ratio'
];

const recordCsvRow = (row) => {
  if (!CSV_OUT) return;
  csvRows.push(row);
  Object.keys(row).forEach(key => csvColumns.add(key));
};

const toCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const flushCsv = () => {
  if (!CSV_OUT || !csvRows.length) return;
  const extraColumns = Array.from(csvColumns).filter(c => !baseCsvColumns.includes(c)).sort();
  const columns = [...baseCsvColumns, ...extraColumns];
  const header = columns.join(',');
  const lines = csvRows.map(row => columns.map(col => toCsvValue(row[col])).join(','));
  const output = [header, ...lines].join('\n') + '\n';
  fs.writeFileSync(CSV_OUT, output);
};

process.on('exit', () => {
  flushCsv();
});

const getAircraft = async () => {
  if (cachedAircraft) return cachedAircraft;
  const aircraftDb = await loadAircraftData();
  const aircraftConfig = aircraftDb.find(a => a.model === AIRCRAFT_MODEL);
  if (!aircraftConfig) throw new Error(`Aircraft ${AIRCRAFT_MODEL} not found`);
  cachedAircraft = aircraftConfig;
  return cachedAircraft;
};

const applyEnvironment = async (physics, lat, lon, heading, overrides) => {
  const env = buildEnv(heading, overrides);
  physics.terrainElevation = null;
  if (physics.runwayGeometry?.thresholdStart?.elevation !== undefined) {
    physics.airportElevation = physics.runwayGeometry.thresholdStart.elevation * 0.3048;
  }
  physics.setEnvironment(env);
  return env;
};

const runUntil = (physics, inputs, maxDurationSec, stopFn) => {
  const steps = Math.round(maxDurationSec / SIM_DT);
  let state = null;
  for (let i = 0; i < steps; i += 1) {
    state = physics.update(inputs, SIM_DT);
    if (stopFn(state, i)) break;
  }
  return state;
};

const buildPhysics = async ({ lat, lon, altitudeFt, heading, speedKts, runwayGeom, envProfile }) => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, lat, lon, 'intermediate');
  physics.setInitialConditions({
    latitude: lat,
    longitude: lon,
    position: { z: altitudeFt * 0.3048 },
    heading: heading,
    fuel: 5000,
    coldStart: false
  });
  physics.state.geo.lat = lat;
  physics.state.geo.lon = lon;
  physics.state.vel.set(speedKts * 0.514444, 0, 0);
  if (runwayGeom) {
    physics.setRunwayGeometry(runwayGeom);
    physics.setApproachReference(runwayGeom);
  }
  physics.setMotionEnabled(true);
  physics.testEnvProfile = envProfile?.name ?? 'standard';
  physics.testEnv = await applyEnvironment(physics, lat, lon, heading, envProfile?.overrides);
  return physics;
};

const computeStats = (values) => {
  const data = values.filter(v => Number.isFinite(v));
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a - b);
  const sum = data.reduce((acc, v) => acc + v, 0);
  const mean = sum / data.length;
  const variance = data.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / data.length;
  const idx95 = Math.floor(0.95 * (sorted.length - 1));
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    stdev: Math.sqrt(variance),
    p95: sorted[idx95]
  };
};

const updateTimeWindow = (timeState, errors, thresholds) => {
  const keys = Object.keys(thresholds);
  if (!keys.length) return timeState;
  const within = keys.every(key => Number.isFinite(errors[key]) && Math.abs(errors[key]) <= thresholds[key]);
  if (within) {
    timeState.timeWithin += SIM_DT;
    if (timeState.timeToWithin === null) timeState.timeToWithin = timeState.time;
  }
  timeState.time += SIM_DT;
  return timeState;
};

const flattenStats = (stats, prefix) => {
  const output = {};
  Object.entries(stats).forEach(([key, value]) => {
    if (!value) return;
    output[`${prefix}${key}_min`] = value.min;
    output[`${prefix}${key}_max`] = value.max;
    output[`${prefix}${key}_mean`] = value.mean;
    output[`${prefix}${key}_stdev`] = value.stdev;
    output[`${prefix}${key}_p95`] = value.p95;
  });
  return output;
};

const summarizeMetrics = (label, params, thresholds, errorsSamples, controlSamples, timeState) => {
  const errorStats = Object.fromEntries(Object.entries(errorsSamples).map(([key, values]) => [key, computeStats(values)]));
  const controlStats = Object.fromEntries(Object.entries({ ...controlSamples, ...addControlRateStats(controlSamples) }).map(([key, values]) => [key, computeStats(values)]));
  console.log(`AP PARAMS ${label} ${JSON.stringify(params)}`);
  console.log(`AP THRESHOLDS ${label} ${JSON.stringify(thresholds)}`);
  console.log(`AP ERROR_STATS ${label} ${JSON.stringify(errorStats)}`);
  console.log(`AP CONTROL_STATS ${label} ${JSON.stringify(controlStats)}`);
  console.log(`AP TIME_STATS ${label} ${JSON.stringify(timeState)}`);
  const row = {
    scenario: label,
    airport: params.airport ?? '',
    runway: params.runway ?? '',
    airspace: params.profile ?? '',
    dt_s: params.dt_s,
    duration_s: params.duration_s,
    target_speed: params.targets?.speed ?? '',
    target_vs: params.targets?.vs ?? '',
    target_altitude: params.targets?.altitude ?? '',
    target_heading: params.targets?.heading ?? '',
    windSpeed: params.env?.windSpeed ?? '',
    windDirection: params.env?.windDirection ?? '',
    windGust: params.env?.windGust ?? '',
    windShear: params.env?.windShear ?? '',
    turbulence: params.env?.turbulence ?? '',
    precipitation: params.env?.precipitation ?? '',
    temperature: params.env?.temperature ?? '',
    cloudCover: params.env?.cloudCover ?? '',
    time_to_within_s: timeState.timeToWithin ?? '',
    time_within_s: timeState.timeWithin ?? '',
    time_total_s: timeState.time ?? '',
    capture_ratio: timeState.time ? timeState.timeWithin / timeState.time : ''
  };
  Object.entries(thresholds).forEach(([key, value]) => {
    row[`thresh_${key}`] = value;
  });
  Object.assign(row, flattenStats(errorStats, 'err_'));
  Object.assign(row, flattenStats(controlStats, 'ctl_'));
  recordCsvRow(row);
};

const getHeadingDeg = (state) => {
  const psi = state.orientation?.psi ?? 0;
  return (psi * toDeg + 360) % 360;
};

const computeRunwayMetrics = (geom, state) => {
  const lat = state.position?.latitude ?? 0;
  const lon = state.position?.longitude ?? 0;
  const threshold = geom.thresholdStart;
  const runwayHeading = geom.heading;
  const latRad = threshold.latitude * toRad;
  const metersPerLat = 111132.92;
  const metersPerLon = 111412.84 * Math.cos(latRad);
  const dx = (lat - threshold.latitude) * metersPerLat;
  const dy = (lon - threshold.longitude) * metersPerLon;
  const rH = runwayHeading * toRad;
  const ux = Math.cos(rH);
  const uy = Math.sin(rH);
  const along = dx * ux + dy * uy;
  const cross = -dx * uy + dy * ux;
  return {
    distAlongFt: along * 3.28084,
    distCrossFt: cross * 3.28084
  };
};

const extractControls = (state) => {
  const controls = state.controls || {};
  const elevator = Number.isFinite(controls.pitch) ? controls.pitch : 0;
  const aileron = Number.isFinite(controls.roll) ? controls.roll : 0;
  const rudder = Number.isFinite(controls.yaw) ? controls.yaw : 0;
  const trim = Number.isFinite(controls.trim) ? controls.trim : 0;
  const throttle = Number.isFinite(controls.throttle) ? controls.throttle : 0;
  const effort = Math.hypot(elevator, aileron, rudder, trim);
  return { throttle, elevator, aileron, rudder, trim, effort };
};

const computeRates = (series) => {
  const rates = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const next = series[i];
    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
    rates.push((next - prev) / SIM_DT);
  }
  return rates;
};

const buildControlSamples = () => ({
  effort: [], throttle: [], elevator: [], aileron: [], rudder: [], trim: []
});

const pushControlSample = (controlSamples, controls) => {
  controlSamples.effort.push(controls.effort);
  controlSamples.throttle.push(controls.throttle);
  controlSamples.elevator.push(controls.elevator);
  controlSamples.aileron.push(controls.aileron);
  controlSamples.rudder.push(controls.rudder);
  controlSamples.trim.push(controls.trim);
};

const addControlRateStats = (controlSamples) => {
  const rateStats = {};
  ['throttle', 'elevator', 'aileron', 'rudder', 'trim'].forEach((key) => {
    rateStats[`${key}_rate`] = computeRates(controlSamples[key]);
  });
  return rateStats;
};

test('LNAV intercepts course with heading correction', async () => {
  for (const airportCase of AIRPORT_CASES) {
    const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
    assert.ok(geom);
    for (const profile of AIRSPACE_PROFILES) {
      const approach = buildApproachState(geom, 12, 2, 400);
      const physics = await buildPhysics({
        lat: approach.latitude,
        lon: approach.longitude,
        altitudeFt: approach.altitude,
        heading: (geom.heading + 40) % 360,
        speedKts: 210,
        runwayGeom: geom,
        envProfile: profile
      });
      physics.autopilot.setNavigationPlan({
        fix: { latitude: geom.thresholdStart.latitude, longitude: geom.thresholdStart.longitude, altitude: 3000 },
        inboundCourseDeg: geom.heading,
        leadBankDeg: 25
      });
      physics.setAutopilot(true, { mode: 'LNAV', speed: 210, altitude: 3000, heading: (geom.heading + 40) % 360 });
      const durationSec = 8;
      const thresholds = { cross_ft: 2000, heading_err_deg: 15 };
      const errorsSamples = { cross_ft: [], heading_err_deg: [] };
      const controlSamples = buildControlSamples();
      const timeState = { time: 0, timeWithin: 0, timeToWithin: null };
      const state = runUntil(
        physics,
        { throttle: 0.6, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0.3, gear: false },
        durationSec,
        (nextState) => {
          const metrics = computeRunwayMetrics(geom, nextState);
          const headingErr = Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180);
          const errors = { cross_ft: metrics.distCrossFt, heading_err_deg: headingErr };
          errorsSamples.cross_ft.push(errors.cross_ft);
          errorsSamples.heading_err_deg.push(errors.heading_err_deg);
          pushControlSample(controlSamples, extractControls(nextState));
          updateTimeWindow(timeState, errors, thresholds);
          return nextState.hasCrashed;
        }
      );
      const lnav = state.autopilotDebug?.lnav;
      assert.ok(lnav);
      const headingDelta = Math.abs(((state.autopilotTargets.heading - geom.heading + 540) % 360) - 180);
      assert.ok(headingDelta > 0.1);
      summarizeMetrics(
        'lnav_intercept',
        {
          dt_s: SIM_DT,
          duration_s: durationSec,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        thresholds,
        errorsSamples,
        controlSamples,
        timeState
      );
    }
  }
});

test('VNAV drives climb to altitude constraint in LNAV', async () => {
  for (const airportCase of AIRPORT_CASES) {
    const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
    assert.ok(geom);
    for (const profile of AIRSPACE_PROFILES) {
      const approach = buildApproachState(geom, 15, 1, -500);
      const physics = await buildPhysics({
        lat: approach.latitude,
        lon: approach.longitude,
        altitudeFt: approach.altitude,
        heading: (geom.heading + 20) % 360,
        speedKts: 220,
        runwayGeom: geom,
        envProfile: profile
      });
      physics.autopilot.setNavigationPlan({
        fix: { latitude: geom.thresholdStart.latitude, longitude: geom.thresholdStart.longitude, altitude: 8000 },
        inboundCourseDeg: geom.heading,
        leadBankDeg: 25
      });
      physics.setAutopilot(true, { mode: 'LNAV', speed: 220, altitude: 8000, heading: (geom.heading + 20) % 360 });
      physics.setVNAVArmed(true);
      const durationSec = 6;
      const thresholds = { alt_err_ft: 300, vs_err_fpm: 200 };
      const errorsSamples = { alt_err_ft: [], vs_err_fpm: [] };
      const controlSamples = buildControlSamples();
      const timeState = { time: 0, timeWithin: 0, timeToWithin: null };
      const state = runUntil(
        physics,
        { throttle: 0.7, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0.2, gear: false },
        durationSec,
        (nextState) => {
          const altErr = 8000 - (nextState.position?.z ?? 0);
          const vsErr = (nextState.verticalSpeed ?? 0) - (nextState.autopilotTargets?.vs ?? 0);
          const errors = { alt_err_ft: altErr, vs_err_fpm: vsErr };
          errorsSamples.alt_err_ft.push(errors.alt_err_ft);
          errorsSamples.vs_err_fpm.push(errors.vs_err_fpm);
          pushControlSample(controlSamples, extractControls(nextState));
          updateTimeWindow(timeState, errors, thresholds);
          return nextState.hasCrashed || Math.abs(vsErr) > 6000;
        }
      );
      assert.ok(state.autopilotTargets.vs > 0);
      summarizeMetrics(
        'vnav_climb',
        {
          dt_s: SIM_DT,
          duration_s: durationSec,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        thresholds,
        errorsSamples,
        controlSamples,
        timeState
      );
    }
  }
});

test('Climb and descent commands produce expected vertical speed sign', async () => {
  for (const airportCase of AIRPORT_CASES) {
    const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
    assert.ok(geom);
    for (const profile of AIRSPACE_PROFILES) {
      const approach = buildApproachState(geom, 20, 0, 1000);
      const physics = await buildPhysics({
        lat: approach.latitude,
        lon: approach.longitude,
        altitudeFt: approach.altitude,
        heading: geom.heading,
        speedKts: 240,
        runwayGeom: geom,
        envProfile: profile
      });
      physics.setAutopilot(true, { mode: 'HDG', speed: 240, heading: geom.heading, vs: 1500, altitude: approach.altitude + 2000 });
      let totalVs = 0;
      let samples = 0;
      const climbThresholds = { vs_err_fpm: 200 };
      const climbErrors = { vs_err_fpm: [] };
      const climbControls = buildControlSamples();
      const climbTime = { time: 0, timeWithin: 0, timeToWithin: null };
      let state = runUntil(
        physics,
        { throttle: 0.8, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0.1, gear: false },
        20,
        (nextState) => {
          totalVs += nextState.verticalSpeed;
          samples += 1;
          const vsErr = (nextState.verticalSpeed ?? 0) - (nextState.autopilotTargets?.vs ?? 0);
          climbErrors.vs_err_fpm.push(vsErr);
          pushControlSample(climbControls, extractControls(nextState));
          updateTimeWindow(climbTime, { vs_err_fpm: vsErr }, climbThresholds);
          return nextState.hasCrashed || Math.abs(vsErr) > 15000;
        }
      );
      const meanVsClimb = totalVs / samples;
      console.log(`ILS METRIC climb_vs_mean_fpm=${meanVsClimb.toFixed(1)} end_vs_fpm=${state.verticalSpeed.toFixed(1)} target_vs_fpm=${state.autopilotTargets.vs}`);
      assert.ok(meanVsClimb > 100);
      summarizeMetrics(
        'climb_vs',
        {
          dt_s: SIM_DT,
          duration_s: 20,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        climbThresholds,
        climbErrors,
        climbControls,
        climbTime
      );
      const descendAltitude = Math.max(1000, approach.altitude - 2000);
      physics.setAutopilot(true, { mode: 'HDG', speed: 230, heading: geom.heading, vs: -1500, altitude: descendAltitude });
      totalVs = 0;
      samples = 0;
      const descThresholds = { vs_err_fpm: 200 };
      const descErrors = { vs_err_fpm: [] };
      const descControls = buildControlSamples();
      const descTime = { time: 0, timeWithin: 0, timeToWithin: null };
      state = runUntil(
        physics,
        { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0.1, gear: false },
        20,
        (nextState) => {
          totalVs += nextState.verticalSpeed;
          samples += 1;
          const vsErr = (nextState.verticalSpeed ?? 0) - (nextState.autopilotTargets?.vs ?? 0);
          descErrors.vs_err_fpm.push(vsErr);
          pushControlSample(descControls, extractControls(nextState));
          updateTimeWindow(descTime, { vs_err_fpm: vsErr }, descThresholds);
          return nextState.hasCrashed || Math.abs(vsErr) > 35000;
        }
      );
      const meanVsDescend = totalVs / samples;
      console.log(`ILS METRIC descend_vs_mean_fpm=${meanVsDescend.toFixed(1)} end_vs_fpm=${state.verticalSpeed.toFixed(1)} target_vs_fpm=${state.autopilotTargets.vs}`);
      assert.ok(meanVsDescend < -100);
      summarizeMetrics(
        'descent_vs',
        {
          dt_s: SIM_DT,
          duration_s: 20,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        descThresholds,
        descErrors,
        descControls,
        descTime
      );
    }
  }
});

test('Cruise altitude hold stays near zero vertical speed', async () => {
  for (const airportCase of AIRPORT_CASES) {
    const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
    assert.ok(geom);
    for (const profile of AIRSPACE_PROFILES) {
      const approach = buildApproachState(geom, 25, 0, 2000);
      const physics = await buildPhysics({
        lat: approach.latitude,
        lon: approach.longitude,
        altitudeFt: 12000,
        heading: geom.heading,
        speedKts: 260,
        runwayGeom: geom,
        envProfile: profile
      });
      physics.setAutopilot(true, { mode: 'HDG', speed: 260, heading: geom.heading, vs: 0, altitude: 12000 });
      const durationSec = 15;
      const thresholds = { alt_err_ft: 100, vs_fpm: 200 };
      const errorsSamples = { alt_err_ft: [], vs_fpm: [] };
      const controlSamples = buildControlSamples();
      const timeState = { time: 0, timeWithin: 0, timeToWithin: null };
      const state = runUntil(
        physics,
        { throttle: 0.6, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false },
        durationSec,
        (nextState) => {
          const altErr = 12000 - (nextState.position?.z ?? 0);
          const errors = { alt_err_ft: altErr, vs_fpm: nextState.verticalSpeed ?? 0 };
          errorsSamples.alt_err_ft.push(errors.alt_err_ft);
          errorsSamples.vs_fpm.push(errors.vs_fpm);
          pushControlSample(controlSamples, extractControls(nextState));
          updateTimeWindow(timeState, errors, thresholds);
          return nextState.hasCrashed || Math.abs(nextState.verticalSpeed ?? 0) > 4000;
        }
      );
      assert.ok(Math.abs(state.verticalSpeed) <= 800);
      summarizeMetrics(
        'cruise_hold',
        {
          dt_s: SIM_DT,
          duration_s: durationSec,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        thresholds,
        errorsSamples,
        controlSamples,
        timeState
      );
    }
  }
});

test('ILS approach commands descent and captures localizer', async () => {
  for (const airportCase of AIRPORT_CASES) {
    const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
    assert.ok(geom);
    for (const profile of AIRSPACE_PROFILES) {
      const approach = buildApproachState(geom, 8, 0.05, 200);
      const physics = await buildPhysics({
        lat: approach.latitude,
        lon: approach.longitude,
        altitudeFt: approach.altitude,
        heading: approach.heading,
        speedKts: 145,
        runwayGeom: geom,
        envProfile: profile
      });
      physics.autopilot.setNavFrequency(geom.ilsFrequency);
      physics.setAutopilot(true, { mode: 'ILS', speed: 145, heading: geom.heading, vs: 0, altitude: 3000 });
      if (geom.headingSource === 'designator-estimate') {
        const state = physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1, gear: true }, SIM_DT);
        assert.equal(state.autopilotDebug?.ils?.active, false, 'estimated runway labels must not provide a valid ILS signal');
        assert.match(state.autopilotDebug?.ils?.message || '', /verified runway heading required/);
        continue;
      }
      const durationSec = 12;
      const thresholds = { loc_deg: 1.5, gs_deg: 1.5, cross_ft: 120, alt_err_ft: 60, heading_err_deg: 2, vs_err_fpm: 200 };
      const errorsSamples = { loc_deg: [], gs_deg: [], cross_ft: [], alt_err_ft: [], heading_err_deg: [], vs_err_fpm: [] };
      const controlSamples = buildControlSamples();
      const timeState = { time: 0, timeWithin: 0, timeToWithin: null };
      let descentCommandSeen = false;
      let locCaptureSeen = false;
      const state = runUntil(
        physics,
        { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
        durationSec,
        (nextState, stepIndex) => {
          const ilsStep = nextState.autopilotDebug?.ils || {};
          const headingErr = Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180);
          const vsErr = (nextState.verticalSpeed ?? 0) - (nextState.autopilotTargets?.vs ?? 0);
          const errors = {
            loc_deg: ilsStep.locDeviationDeg ?? null,
            gs_deg: ilsStep.gsDeviationDeg ?? null,
            cross_ft: ilsStep.distCross ?? null,
            alt_err_ft: ilsStep.altError ?? null,
            heading_err_deg: headingErr,
            vs_err_fpm: vsErr
          };
          Object.entries(errors).forEach(([key, value]) => errorsSamples[key].push(value));
          pushControlSample(controlSamples, extractControls(nextState));
          updateTimeWindow(timeState, errors, thresholds);
          if ((nextState.autopilotTargets?.vs ?? 0) < 0 || (ilsStep.gsDeviationDeg ?? Infinity) > 1) descentCommandSeen = true;
          if (ilsStep.locCaptured === true) locCaptureSeen = true;
          return nextState.hasCrashed || nextState.autopilotDebug?.ils?.phase === 'rollout' || stepIndex >= Math.round(durationSec / SIM_DT) - 1;
        }
      );
      const ils = state.autopilotDebug?.ils || {};
      const distNm = Number.isFinite(ils.distAlong) ? ils.distAlong / 6076 : null;
      console.log(
        `ILS METRIC approach_loc_deg=${Number.isFinite(ils.locDeviationDeg) ? ils.locDeviationDeg.toFixed(3) : 'null'} ` +
        `gs_deg=${Number.isFinite(ils.gsDeviationDeg) ? ils.gsDeviationDeg.toFixed(3) : 'null'} ` +
        `cross_ft=${Number.isFinite(ils.distCross) ? ils.distCross.toFixed(1) : 'null'} ` +
        `alt_err_ft=${Number.isFinite(ils.altError) ? ils.altError.toFixed(1) : 'null'} ` +
        `dist_nm=${distNm !== null ? distNm.toFixed(3) : 'null'} ` +
        `vs_fpm=${state.verticalSpeed.toFixed(1)} target_vs_fpm=${state.autopilotTargets.vs}`
      );
      assert.ok(state.autopilotDebug?.ils?.active);
      assert.ok(descentCommandSeen);
      assert.ok(locCaptureSeen || state.autopilotDebug.ils.locCaptured === true);
      summarizeMetrics(
        'ils_approach',
        {
          dt_s: SIM_DT,
          duration_s: durationSec,
          targets: state.autopilotTargets,
          env: physics.testEnv,
          airport: airportCase.code,
          runway: geom.runwayName,
          profile: physics.testEnvProfile
        },
        thresholds,
        errorsSamples,
        controlSamples,
        timeState
      );
    }
  }
});

test('ILS calm-wind landing hits runway gate and touchdown precision targets', async () => {
  const airportCase = AIRPORT_CASES[0];
  const geom = airportService.getRunwayGeometry(airportCase.code, airportCase.runway);
  assert.ok(geom);

  const final = buildApproachState(geom, 0.15, 0.0005, -176);
  const physics = await buildPhysics({
    lat: final.latitude,
    lon: final.longitude,
    altitudeFt: final.altitude,
    heading: final.heading,
    speedKts: 132,
    runwayGeom: geom,
    envProfile: { name: 'calm', overrides: { windSpeed: 0, windGust: 0, windShear: 0, turbulence: 0, precipitation: 0 } }
  });
  physics.autopilot.setNavFrequency(geom.ilsFrequency);
  physics.setAutopilot(true, { mode: 'ILS', speed: 132, heading: geom.heading, vs: 0, altitude: 1800 });

  const durationSec = 20;
  const thresholds = {
    loc_deg: 1.0,
    gs_deg: 8.0,
    cross_ft: 80,
    runway_entry_height_ft: 70,
    touchdown_cross_ft: 5,
    sink_rate_fpm: 600,
    elevator_rate: 2.5,
    aileron_rate: 3.0,
    throttle_rate: 1.8
  };
  const errorsSamples = {
    loc_deg: [],
    gs_deg: [],
    cross_ft: [],
    runway_entry_height_ft: [],
    sink_rate_fpm: [],
    touchdown_cross_ft: []
  };
  const controlSamples = buildControlSamples();
  const timeState = { time: 0, timeWithin: 0, timeToWithin: null };

  let state = null;
  let touchdownCrossFt = null;
  let runwayEntryHeightFt = null;
  let touchdownSinkRateFpm = null;

  const initialState = physics.getOutputState();
  const initialMetrics = computeRunwayMetrics(geom, initialState);
  if (
    Number.isFinite(initialMetrics.distAlongFt) &&
    Math.abs(initialMetrics.distAlongFt) <= 1000 &&
    Number.isFinite(initialState.derived?.altitude_agl_ft)
  ) {
    runwayEntryHeightFt = initialState.derived.altitude_agl_ft;
    errorsSamples.runway_entry_height_ft.push(runwayEntryHeightFt);
  }

  state = runUntil(
    physics,
    { throttle: 0.38, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
    durationSec,
    (nextState) => {
      const metrics = computeRunwayMetrics(geom, nextState);
      const ilsStep = nextState.autopilotDebug?.ils || {};
      const controls = extractControls(nextState);
      pushControlSample(controlSamples, controls);

      if (
        runwayEntryHeightFt === null &&
        Number.isFinite(ilsStep.runwayEntryHeightFt)
      ) {
        runwayEntryHeightFt = ilsStep.runwayEntryHeightFt;
        errorsSamples.runway_entry_height_ft.push(runwayEntryHeightFt);
      } else if (
        runwayEntryHeightFt === null &&
        Number.isFinite(metrics.distAlongFt) &&
        Math.abs(metrics.distAlongFt) <= 600 &&
        Number.isFinite(nextState.derived?.altitude_agl_ft)
      ) {
        runwayEntryHeightFt = nextState.derived.altitude_agl_ft;
        errorsSamples.runway_entry_height_ft.push(runwayEntryHeightFt);
      }

      if (Number.isFinite(ilsStep.locDeviationDeg)) errorsSamples.loc_deg.push(ilsStep.locDeviationDeg);
      if (Number.isFinite(ilsStep.gsDeviationDeg)) errorsSamples.gs_deg.push(ilsStep.gsDeviationDeg);
      if (Number.isFinite(ilsStep.distCross)) errorsSamples.cross_ft.push(ilsStep.distCross);
      if (Number.isFinite(ilsStep.sinkRateFpm)) errorsSamples.sink_rate_fpm.push(Math.abs(ilsStep.sinkRateFpm));

      const timeErrors = {
        loc_deg: ilsStep.locDeviationDeg ?? null,
        gs_deg: ilsStep.gsDeviationDeg ?? null,
        cross_ft: ilsStep.distCross ?? null
      };
      updateTimeWindow(timeState, timeErrors, { loc_deg: thresholds.loc_deg, gs_deg: thresholds.gs_deg, cross_ft: thresholds.cross_ft });

      if (nextState.hasCrashed) return true;
      if (nextState.autopilotDebug?.ils?.phase === 'rollout' || nextState.derived?.altitude_agl_ft <= 0.5) {
        touchdownCrossFt = Math.abs(metrics.distCrossFt);
        touchdownSinkRateFpm = Math.abs(nextState.verticalSpeed ?? 0);
        errorsSamples.touchdown_cross_ft.push(touchdownCrossFt);
        return true;
      }
      return false;
    }
  );


  const controlStats = Object.fromEntries(Object.entries(addControlRateStats(controlSamples)).map(([key, values]) => [key, computeStats(values)]));
  const elevatorRateP95 = controlStats.elevator_rate?.p95 ?? 0;
  const aileronRateP95 = controlStats.aileron_rate?.p95 ?? 0;
  const throttleRateP95 = controlStats.throttle_rate?.p95 ?? 0;

  console.log(
    `ILS METRIC landing_touchdown_cross_ft=${Number.isFinite(touchdownCrossFt) ? touchdownCrossFt.toFixed(2) : 'null'} ` +
    `runway_entry_height_ft=${Number.isFinite(runwayEntryHeightFt) ? runwayEntryHeightFt.toFixed(2) : 'null'} ` +
    `touchdown_sink_rate_fpm=${Number.isFinite(touchdownSinkRateFpm) ? touchdownSinkRateFpm.toFixed(1) : 'null'} ` +
    `elevator_rate_p95=${Number.isFinite(elevatorRateP95) ? elevatorRateP95.toFixed(3) : 'null'} ` +
    `aileron_rate_p95=${Number.isFinite(aileronRateP95) ? aileronRateP95.toFixed(3) : 'null'} ` +
    `throttle_rate_p95=${Number.isFinite(throttleRateP95) ? throttleRateP95.toFixed(3) : 'null'}`
  );

  assert.equal(state?.hasCrashed, false);
  assert.ok(Number.isFinite(runwayEntryHeightFt));
  assert.ok(runwayEntryHeightFt >= 30 && runwayEntryHeightFt <= 70);
  assert.ok(Number.isFinite(touchdownCrossFt));
  assert.ok(touchdownCrossFt <= 5);
  assert.ok(Number.isFinite(touchdownSinkRateFpm));
  assert.ok(touchdownSinkRateFpm <= 600);
  assert.ok(elevatorRateP95 <= thresholds.elevator_rate);
  assert.ok(aileronRateP95 <= thresholds.aileron_rate);
  assert.ok(throttleRateP95 <= thresholds.throttle_rate);

  summarizeMetrics(
    'ils_calm_landing',
    {
      dt_s: SIM_DT,
      duration_s: durationSec,
      targets: state?.autopilotTargets,
      env: physics.testEnv,
      airport: airportCase.code,
      runway: geom.runwayName,
      profile: physics.testEnvProfile,
      runway_entry_height_ft: runwayEntryHeightFt,
      touchdown_cross_ft: touchdownCrossFt,
      touchdown_sink_rate_fpm: touchdownSinkRateFpm
    },
    thresholds,
    errorsSamples,
    controlSamples,
    timeState
  );
});
