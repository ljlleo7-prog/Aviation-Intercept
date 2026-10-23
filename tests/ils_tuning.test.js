import { test } from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { airportService } from '../src/services/airportService.js';

const R = 6371000;
const toDeg = 180 / Math.PI;
const toRad = Math.PI / 180;
const AIRCRAFT_MODEL = 'Boeing 737-800';
const SIM_DT = 0.05;
let cachedAircraft = null;

const offsetLatLon = (lat, lon, northMeters, eastMeters) => {
  const dLat = (northMeters / R) * toDeg;
  const dLon = (eastMeters / (R * Math.cos(lat * toRad))) * toDeg;
  return { latitude: lat + dLat, longitude: lon + dLon };
};

const getAircraft = async () => {
  if (cachedAircraft) return cachedAircraft;
  const aircraftDb = await loadAircraftData();
  const aircraftConfig = aircraftDb.find(a => a.model === AIRCRAFT_MODEL);
  if (!aircraftConfig) throw new Error(`Aircraft ${AIRCRAFT_MODEL} not found`);
  cachedAircraft = aircraftConfig;
  return cachedAircraft;
};

const buildPhysics = async ({ lat, lon, altitudeFt, heading, speedKts, runwayGeom, windSpeed = 0, windDirection = 0 }) => {
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
  physics.setEnvironment({
    windSpeed,
    windDirection,
    windGust: 0,
    windShear: 0,
    turbulence: 0,
    precipitation: 0,
    temperature: 15,
    cloudCover: 0
  });
  return physics;
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

const runUntil = (physics, inputs, maxDurationSec, stopFn) => {
  const steps = Math.round(maxDurationSec / SIM_DT);
  let state = null;
  for (let i = 0; i < steps; i += 1) {
    state = physics.update(inputs, SIM_DT);
    if (stopFn(state, i)) break;
  }
  return state;
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

const getHeadingDeg = (state) => {
  const psi = state.orientation?.psi ?? 0;
  return (psi * toDeg + 360) % 360;
};

const tuningResults = [];

test('ILS tuning: calm wind, on-axis', async () => {
  const geom = airportService.getRunwayGeometry('LAX', '24L');
  assert.ok(geom);

  const approach = buildApproachState(geom, 4, 0, 0);
  const physics = await buildPhysics({
    lat: approach.latitude,
    lon: approach.longitude,
    altitudeFt: approach.altitude,
    heading: approach.heading,
    speedKts: 145,
    runwayGeom: geom,
    windSpeed: 0,
    windDirection: 0
  });

  physics.autopilot.setNavFrequency(geom.ilsFrequency);
  physics.setAutopilot(true, { mode: 'ILS', speed: 145, heading: geom.heading, vs: 0, altitude: 3000 });

  // Check initial state
  const initialState = physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true }, 0.05);
  console.log(`Initial: AGL=${initialState.derived?.altitude_agl_ft?.toFixed(1)}ft Phase=${initialState.autopilotDebug?.ils?.phase} Active=${initialState.autopilotDebug?.ils?.active}`);

  let finalMetrics = null;
  let lastState = null;
  let stepCount = 0;
  runUntil(
    physics,
    { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
    120,
    (nextState) => {
      lastState = nextState;
      stepCount++;
      if (stepCount % 100 === 0) {
        const hdg = ((nextState.orientation?.psi ?? 0) * toDeg + 360) % 360;
        const locDev = nextState.autopilotDebug?.ils?.locDeviationDeg ?? 0;
        const cross = nextState.autopilotDebug?.ils?.distCross ?? 0;
        console.log(`  Step ${stepCount}: AGL=${nextState.derived?.altitude_agl_ft?.toFixed(1)}ft HDG=${hdg.toFixed(1)}° LOC=${locDev.toFixed(2)}° Cross=${cross.toFixed(0)}ft`);
      }
      if (nextState.hasCrashed) return true;
      if ((nextState.autopilotDebug?.ils?.phase === 'rollout' && nextState.derived?.altitude_agl_ft <= 50) || nextState.derived?.altitude_agl_ft <= 0.5) {
        const metrics = computeRunwayMetrics(geom, nextState);
        finalMetrics = {
          crossTrackFt: Math.abs(metrics.distCrossFt),
          altErrorFt: Math.abs(nextState.autopilotDebug?.ils?.altError ?? 0),
          headingErrorDeg: Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180),
          finalSpeedKts: nextState.derived?.airspeed ?? 0,
          flaps: nextState.flaps ?? 0,
          gear: nextState.gear ?? false
        };
        return true;
      }
      return false;
    }
  );

  if (!finalMetrics && lastState) {
    const metrics = computeRunwayMetrics(geom, lastState);
    finalMetrics = {
      crossTrackFt: Math.abs(metrics.distCrossFt),
      altErrorFt: Math.abs(lastState.autopilotDebug?.ils?.altError ?? 0),
      headingErrorDeg: Math.abs(((getHeadingDeg(lastState) - geom.heading + 540) % 360) - 180),
      finalSpeedKts: lastState.derived?.airspeed ?? 0,
      flaps: lastState.flaps ?? 0,
      gear: lastState.gear ?? false
    };
  }

  tuningResults.push({ scenario: 'calm_on_axis', ...finalMetrics });

  console.log(`✓ Calm/On-axis: Cross=${finalMetrics.crossTrackFt.toFixed(1)}ft Alt=${finalMetrics.altErrorFt.toFixed(1)}ft Hdg=${finalMetrics.headingErrorDeg.toFixed(2)}° Speed=${finalMetrics.finalSpeedKts.toFixed(1)}kts Flaps=${finalMetrics.flaps.toFixed(1)} Gear=${finalMetrics.gear}`);

  assert.ok(finalMetrics.headingErrorDeg <= 5.0, `Heading error ${finalMetrics.headingErrorDeg.toFixed(2)}° exceeds 5.0°`);
  assert.ok(finalMetrics.finalSpeedKts >= 100 && finalMetrics.finalSpeedKts <= 180, `Speed ${finalMetrics.finalSpeedKts.toFixed(1)}kts outside 100-180kts`);
});

test('ILS tuning: 15kt crosswind from left', async () => {
  const geom = airportService.getRunwayGeometry('LAX', '24L');
  assert.ok(geom);

  const approach = buildApproachState(geom, 4, 0, 0);
  const physics = await buildPhysics({
    lat: approach.latitude,
    lon: approach.longitude,
    altitudeFt: approach.altitude,
    heading: approach.heading,
    speedKts: 145,
    runwayGeom: geom,
    windSpeed: 15,
    windDirection: (geom.heading - 90 + 360) % 360
  });

  physics.autopilot.setNavFrequency(geom.ilsFrequency);
  physics.setAutopilot(true, { mode: 'ILS', speed: 145, heading: geom.heading, vs: 0, altitude: 3000 });

  let finalMetrics = null;
  let lastState = null;
  runUntil(
    physics,
    { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
    120,
    (nextState) => {
      lastState = nextState;
      if (nextState.hasCrashed) return true;
      if ((nextState.autopilotDebug?.ils?.phase === 'rollout' && nextState.derived?.altitude_agl_ft <= 50) || nextState.derived?.altitude_agl_ft <= 0.5) {
        const metrics = computeRunwayMetrics(geom, nextState);
        finalMetrics = {
          crossTrackFt: Math.abs(metrics.distCrossFt),
          altErrorFt: Math.abs(nextState.autopilotDebug?.ils?.altError ?? 0),
          headingErrorDeg: Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180),
          finalSpeedKts: nextState.derived?.airspeed ?? 0,
          flaps: nextState.flaps ?? 0,
          gear: nextState.gear ?? false
        };
        return true;
      }
      return false;
    }
  );

  if (!finalMetrics && lastState) {
    const metrics = computeRunwayMetrics(geom, lastState);
    finalMetrics = {
      crossTrackFt: Math.abs(metrics.distCrossFt),
      altErrorFt: Math.abs(lastState.autopilotDebug?.ils?.altError ?? 0),
      headingErrorDeg: Math.abs(((getHeadingDeg(lastState) - geom.heading + 540) % 360) - 180),
      finalSpeedKts: lastState.derived?.airspeed ?? 0,
      flaps: lastState.flaps ?? 0,
      gear: lastState.gear ?? false
    };
  }

  tuningResults.push({ scenario: '15kt_crosswind', ...finalMetrics });

  console.log(`✓ 15kt X-wind: Cross=${finalMetrics.crossTrackFt.toFixed(1)}ft Alt=${finalMetrics.altErrorFt.toFixed(1)}ft Hdg=${finalMetrics.headingErrorDeg.toFixed(2)}° Speed=${finalMetrics.finalSpeedKts.toFixed(1)}kts`);

  assert.ok(finalMetrics.headingErrorDeg <= 5.0);
  assert.ok(finalMetrics.finalSpeedKts >= 100 && finalMetrics.finalSpeedKts <= 180);
});

test('ILS tuning: 0.5nm left offset, waypoint intercept', async () => {
  const geom = airportService.getRunwayGeometry('LAX', '24L');
  assert.ok(geom);

  const approach = buildApproachState(geom, 7, -0.3, 1000);
  const interceptHeading = geom.heading;
  const physics = await buildPhysics({
    lat: approach.latitude,
    lon: approach.longitude,
    altitudeFt: approach.altitude,
    heading: interceptHeading,
    speedKts: 130,
    runwayGeom: geom,
    windSpeed: 0,
    windDirection: 0
  });

  physics.autopilot.setNavFrequency(geom.ilsFrequency);
  physics.setAutopilot(true, { mode: 'ILS', speed: 135, heading: geom.heading, vs: 0, altitude: 3000 });

  let finalMetrics = null;
  let lastState = null;
  let stepCount = 0;
  runUntil(
    physics,
    { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
    120,
    (nextState) => {
      lastState = nextState;
      stepCount += 1;
      if (stepCount % 100 === 0) {
        const hdg = ((nextState.orientation?.psi ?? 0) * toDeg + 360) % 360;
        const ils = nextState.autopilotDebug?.ils ?? {};
        const metrics = computeRunwayMetrics(geom, nextState);
        console.log(`  Offset step ${stepCount}: phase=${ils.phase} msg=${ils.message ?? ''} AGL=${nextState.derived?.altitude_agl_ft?.toFixed(1)}ft HDG=${hdg.toFixed(1)}° LOC=${(ils.locDeviationDeg ?? 0).toFixed(2)}° Cross=${Math.abs(metrics.distCrossFt).toFixed(0)}ft Spd=${(nextState.derived?.airspeed ?? 0).toFixed(1)}kts`);
      }
      if (nextState.hasCrashed) return true;
      if ((nextState.autopilotDebug?.ils?.phase === 'rollout' && nextState.derived?.altitude_agl_ft <= 50) || nextState.derived?.altitude_agl_ft <= 0.5) {
        const metrics = computeRunwayMetrics(geom, nextState);
        finalMetrics = {
          crossTrackFt: Math.abs(metrics.distCrossFt),
          altErrorFt: Math.abs(nextState.autopilotDebug?.ils?.altError ?? 0),
          headingErrorDeg: Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180),
          finalSpeedKts: nextState.derived?.airspeed ?? 0,
          flaps: nextState.flaps ?? 0,
          gear: nextState.gear ?? false
        };
        return true;
      }
      return false;
    }
  );

  if (!finalMetrics && lastState) {
    const metrics = computeRunwayMetrics(geom, lastState);
    finalMetrics = {
      crossTrackFt: Math.abs(metrics.distCrossFt),
      altErrorFt: Math.abs(lastState.autopilotDebug?.ils?.altError ?? 0),
      headingErrorDeg: Math.abs(((getHeadingDeg(lastState) - geom.heading + 540) % 360) - 180),
      finalSpeedKts: lastState.derived?.airspeed ?? 0,
      flaps: lastState.flaps ?? 0,
      gear: lastState.gear ?? false
    };
  }

  tuningResults.push({ scenario: 'offset_30deg', ...finalMetrics });

  console.log(`✓ 0.5nm offset 30°: Cross=${finalMetrics.crossTrackFt.toFixed(1)}ft Alt=${finalMetrics.altErrorFt.toFixed(1)}ft Hdg=${finalMetrics.headingErrorDeg.toFixed(2)}° Speed=${finalMetrics.finalSpeedKts.toFixed(1)}kts`);

  assert.ok(finalMetrics.headingErrorDeg <= 35.0, `Heading error ${finalMetrics.headingErrorDeg.toFixed(2)}° exceeds 35.0°`);
  assert.ok(finalMetrics.finalSpeedKts >= 100 && finalMetrics.finalSpeedKts <= 250, `Speed ${finalMetrics.finalSpeedKts.toFixed(1)}kts outside 100-250kts`);
});

test('ILS tuning: 200ft high, on-axis', async () => {
  const geom = airportService.getRunwayGeometry('LAX', '24L');
  assert.ok(geom);

  const approach = buildApproachState(geom, 4, 0, 200);
  const physics = await buildPhysics({
    lat: approach.latitude,
    lon: approach.longitude,
    altitudeFt: approach.altitude,
    heading: approach.heading,
    speedKts: 145,
    runwayGeom: geom,
    windSpeed: 0,
    windDirection: 0
  });

  physics.autopilot.setNavFrequency(geom.ilsFrequency);
  physics.setAutopilot(true, { mode: 'ILS', speed: 145, heading: geom.heading, vs: 0, altitude: 3000 });

  let finalMetrics = null;
  let lastState = null;
  runUntil(
    physics,
    { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1.0, gear: true },
    120,
    (nextState) => {
      lastState = nextState;
      if (nextState.hasCrashed) return true;
      if ((nextState.autopilotDebug?.ils?.phase === 'rollout' && nextState.derived?.altitude_agl_ft <= 50) || nextState.derived?.altitude_agl_ft <= 0.5) {
        const metrics = computeRunwayMetrics(geom, nextState);
        finalMetrics = {
          crossTrackFt: Math.abs(metrics.distCrossFt),
          altErrorFt: Math.abs(nextState.autopilotDebug?.ils?.altError ?? 0),
          headingErrorDeg: Math.abs(((getHeadingDeg(nextState) - geom.heading + 540) % 360) - 180),
          finalSpeedKts: nextState.derived?.airspeed ?? 0,
          flaps: nextState.flaps ?? 0,
          gear: nextState.gear ?? false
        };
        return true;
      }
      return false;
    }
  );

  if (!finalMetrics && lastState) {
    const metrics = computeRunwayMetrics(geom, lastState);
    finalMetrics = {
      crossTrackFt: Math.abs(metrics.distCrossFt),
      altErrorFt: Math.abs(lastState.autopilotDebug?.ils?.altError ?? 0),
      headingErrorDeg: Math.abs(((getHeadingDeg(lastState) - geom.heading + 540) % 360) - 180),
      finalSpeedKts: lastState.derived?.airspeed ?? 0,
      flaps: lastState.flaps ?? 0,
      gear: lastState.gear ?? false
    };
  }

  tuningResults.push({ scenario: '200ft_high', ...finalMetrics });

  console.log(`✓ 200ft high: Cross=${finalMetrics.crossTrackFt.toFixed(1)}ft Alt=${finalMetrics.altErrorFt.toFixed(1)}ft Hdg=${finalMetrics.headingErrorDeg.toFixed(2)}° Speed=${finalMetrics.finalSpeedKts.toFixed(1)}kts`);

  assert.ok(finalMetrics.headingErrorDeg <= 5.0);
  assert.ok(finalMetrics.finalSpeedKts >= 100 && finalMetrics.finalSpeedKts <= 180);
});
