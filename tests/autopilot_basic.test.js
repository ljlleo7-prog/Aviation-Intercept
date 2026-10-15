import { test } from 'node:test';
import assert from 'node:assert/strict';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';
import { Quaternion } from '../src/utils/flightMath.js';
import { installDeterministicRandom } from './support/deterministicRandom.js';

const SIM_DT = 0.05;
let cachedAircraft = null;

const getAircraft = async () => {
  if (cachedAircraft) return cachedAircraft;
  const aircraftDb = await loadAircraftData();
  cachedAircraft = aircraftDb.find(a => a.model === 'Boeing 737-800');
  return cachedAircraft;
};

const runSteps = (physics, inputs, steps) => {
  let state = null;
  for (let i = 0; i < steps; i++) {
    state = physics.update(inputs, SIM_DT);
  }
  return state;
};

const createPhysics = async ({ altitudeFt = 3000, heading = 90, speedKt = 150 } = {}) => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: altitudeFt * 0.3048 }, heading, fuel: 5000, coldStart: false });
  physics.state.vel.set(speedKt * 0.514444, 0, 0);
  physics.setMotionEnabled(true);
  return physics;
};

test('Runway wind produces TAS above GS when groundspeed is zero', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 0 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(0, 0, 0);
  physics.setMotionEnabled(false);
  physics.setEnvironment({ windSpeed: 20, windDirection: 90, windGust: 20, windShear: 0, turbulence: 0, temperature: 15, pressure: 1013.25 });

  const state = physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: true }, SIM_DT);

  const tas = state.trueAirspeed ?? state.derived?.airspeed ?? 0;
  const gs = state.groundSpeed ?? state.derived?.groundSpeed ?? 0;
  const ias = state.indicatedAirspeed ?? state.derived?.indicatedAirspeed ?? 0;

  assert.ok(gs < 0.5, `Groundspeed ${gs.toFixed(2)}kts should remain near zero on the runway`);
  assert.ok(tas > 15, `True airspeed ${tas.toFixed(2)}kts should reflect runway wind`);
  assert.ok(Math.abs(tas - gs) > 10, `TAS ${tas.toFixed(2)}kts should diverge from GS ${gs.toFixed(2)}kts under runway wind`);
  assert.ok(ias <= tas + 0.5, `IAS ${ias.toFixed(2)}kts should not exceed TAS ${tas.toFixed(2)}kts`);
});

test('Airborne wind keeps airspeed authoritative while groundspeed reflects wind drift', async () => {
  const physics = await createPhysics({ altitudeFt: 12000, heading: 90, speedKt: 180 });
  physics.setEnvironment({ windSpeed: 40, windDirection: 270, windGust: 40, windShear: 0, turbulence: 0, temperature: 15, pressure: 1013.25 });

  const state = physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);

  const tas = state.trueAirspeed ?? 0;
  const gs = state.groundSpeed ?? 0;
  const ias = state.indicatedAirspeed ?? 0;

  assert.ok(tas > 100, `Airborne TAS ${tas.toFixed(2)}kts should remain authoritative in flight`);
  assert.ok(gs > tas + 20, `Airborne GS ${gs.toFixed(2)}kts should reflect tailwind above TAS ${tas.toFixed(2)}kts`);
  assert.ok(ias < tas, `IAS ${ias.toFixed(2)}kts should remain below TAS ${tas.toFixed(2)}kts at altitude`);
});

test('Physics output exports authoritative IAS TAS and GS fields for downstream panels', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 0 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(0, 0, 0);
  physics.setMotionEnabled(false);
  physics.setEnvironment({ windSpeed: 18, windDirection: 90, windGust: 18, windShear: 0, turbulence: 0, temperature: 15, pressure: 1013.25 });

  const state = physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: true }, SIM_DT);

  assert.ok(Number.isFinite(state.trueAirspeed), 'Top-level trueAirspeed should be exported');
  assert.ok(Number.isFinite(state.indicatedAirspeed), 'Top-level indicatedAirspeed should be exported');
  assert.ok(Number.isFinite(state.groundSpeed), 'Top-level groundSpeed should be exported');
  assert.ok(Number.isFinite(state.derived?.indicatedAirspeed), 'Derived indicatedAirspeed should be exported');
  assert.ok(Math.abs((state.trueAirspeed ?? 0) - (state.groundSpeed ?? 0)) > 10, 'Exported TAS and GS should diverge under runway wind');
});

test('At cruise altitude IAS falls well below TAS while AP receives IAS', async () => {
  const physics = await createPhysics({ altitudeFt: 35000, speedKt: 450 });
  const state = physics.getOutputState();
  assert.ok(state.indicatedAirspeed < state.trueAirspeed * 0.65,
    `Expected cruise IAS below TAS, got ${state.indicatedAirspeed} and ${state.trueAirspeed}`);
  assert.ok(Math.abs(state.groundSpeed - state.trueAirspeed) < 1,
    'Without wind, GS and TAS should be similar');

  let apInput;
  const updateAutopilot = physics.autopilot.update.bind(physics.autopilot);
  physics.autopilot.update = (input, controls, dt) => {
    apInput = input;
    return updateAutopilot(input, controls, dt);
  };
  physics.update({ throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
  assert.ok(Math.abs(apInput.airspeed - physics.calculateAirspeeds().indicatedAirspeed) < 5,
    'Autopilot must receive IAS in knots');
  assert.ok(apInput.airspeed < state.trueAirspeed * 0.65);
});

test('Warm-weather climb keeps IAS below TAS as density falls with altitude', async () => {
  const physics = await createPhysics({ altitudeFt: 0, speedKt: 250 });
  physics.setEnvironment({ temperature: 35, windSpeed: 0, windGust: 0, windShear: 0 });
  let previousIas = Infinity;
  for (const altitudeFt of [0, 1000, 3000, 5000, 10000]) {
    physics.setInitialConditions({ altitude: altitudeFt, speed: 250, coldStart: false });
    const { indicatedAirspeed: ias, trueAirspeed: tas } = physics.getOutputState();
    assert.ok(ias <= tas + 0.1, `IAS ${ias} exceeded TAS ${tas} at ${altitudeFt} ft`);
    assert.ok(ias <= previousIas + 0.1, `IAS rose during climb to ${altitudeFt} ft`);
    previousIas = ias;
  }
});

test('Autopilot engagement does not create a large first-frame bank or pitch jump', async () => {
  const physics = await createPhysics({ altitudeFt: 6000, heading: 90, speedKt: 180 });
  runSteps(physics, { throttle: 0.52, pitch: 0.06, roll: 0.04, yaw: 0, trim: 0.05, flaps: 0, gear: false }, 60);

  const before = {
    throttle: physics.controls.throttle,
    elevator: physics.controls.elevator,
    aileron: physics.controls.aileron,
    trim: physics.controls.trim
  };

  physics.setAutopilot(true, { mode: 'HDG', heading: 90, speed: 180, vs: 0, altitude: 6000 });
  const after = physics.update({ throttle: 0.52, pitch: 0.06, roll: 0.04, yaw: 0, trim: 0.05, flaps: 0, gear: false }, SIM_DT);

  const elevatorDelta = Math.abs(physics.controls.elevator - before.elevator);
  const aileronDelta = Math.abs(physics.controls.aileron - before.aileron);
  const throttleDelta = Math.abs(physics.controls.throttle - before.throttle);
  const trimDelta = Math.abs(physics.controls.trim - before.trim);

  assert.ok(elevatorDelta < 0.08, `First-frame elevator jump ${elevatorDelta.toFixed(3)} exceeds 0.08`);
  assert.ok(aileronDelta < 0.08, `First-frame aileron jump ${aileronDelta.toFixed(3)} exceeds 0.08`);
  assert.ok(throttleDelta < 0.08, `First-frame throttle jump ${throttleDelta.toFixed(3)} exceeds 0.08`);
  assert.ok(trimDelta < 0.08, `First-frame trim jump ${trimDelta.toFixed(3)} exceeds 0.08`);
  assert.ok(Math.abs(after.autopilotDebug?.targetRoll ?? 0) < 8, `First target roll ${(after.autopilotDebug?.targetRoll ?? 0).toFixed(2)}° exceeds 8°`);
  assert.ok(Math.abs(after.autopilotDebug?.targetPitch ?? 0) < 8, `First target pitch ${(after.autopilotDebug?.targetPitch ?? 0).toFixed(2)}° exceeds 8°`);
});



test('Autopilot engagement captures unspecified targets from current state instead of stale values', async () => {
  const physics = await createPhysics({ altitudeFt: 100, heading: 96, speedKt: 173 });
  physics.setAutopilot(false, { mode: 'HDG', speed: 220, heading: 140, vs: -1800, altitude: 7000 });
  physics.state.vel.set(173 * 0.514444, 0, 0);

  physics.setAutopilot(true, { mode: 'HDG', heading: 96 });
  const status = physics.getAutopilotStatus();

  assert.equal(status.targets.heading, 95);
  assert.equal(status.targets.speed, 175);
  assert.equal(status.targets.ias, 175);
  assert.equal(status.targets.vs, 0);
  assert.equal(status.targets.altitude, 100);
});

test('Autopilot HDG mode holds heading', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 3000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(150 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 150, heading: 90, vs: 0, altitude: 10000 });

  const state = runSteps(physics, { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 200);

  const heading = ((state.orientation?.psi ?? 0) * 180/Math.PI + 360) % 360;
  const headingError = Math.abs(((heading - 90 + 540) % 360) - 180);

  console.log(`HDG mode: Target=90° Actual=${heading.toFixed(1)}° Error=${headingError.toFixed(2)}°`);
  assert.ok(headingError < 3.0, `Heading error ${headingError.toFixed(2)}° exceeds 3°`);
});

test('Autopilot engagement seeds throttle from live control input during climb capture', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 3000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(150 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  const manualInputs = { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false };
  physics.setAutopilot(true, { mode: 'HDG', speed: 150, heading: 90, vs: 0, altitude: 10000 });
  physics.update(manualInputs, SIM_DT);

  assert.ok(physics.controls.throttle > 0.35, `Initial AP throttle ${physics.controls.throttle.toFixed(3)} should stay near live control input during climb capture`);
});

test('Autopilot ALT mode holds altitude', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 10000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(150 * 0.514444, 0, 0);
  // Start with ~3deg nose-up pitch (level flight trim at 10000ft/150kt)
  physics.state.quat = Quaternion.fromEuler(0, 3 * Math.PI / 180, Math.PI / 2);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 150, heading: 90, vs: 0, altitude: 10000 });

  const state = runSteps(physics, { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 200);

  const altError = Math.abs(state.derived?.altitude - 10000);

  console.log(`ALT hold: Target=10000ft Actual=${state.derived?.altitude.toFixed(0)}ft Error=${altError.toFixed(0)}ft`);
  assert.ok(altError < 220, `Altitude error ${altError.toFixed(0)}ft exceeds 220ft`);
});

test('Autopilot normalizes target settings', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 3000 * 0.3048 }, heading: 93, fuel: 5000, coldStart: false });
  physics.state.vel.set(173 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 173, heading: 93, vs: 355, altitude: 12345 });

  const status = physics.getAutopilotStatus();

  assert.equal(status.targets.speed, 175);
  assert.equal(status.targets.ias, 175);
  assert.equal(status.targets.vs, 400);
  assert.equal(status.targets.altitude, 12300);
  assert.equal(status.targets.heading, 95);
});

test('Autopilot commands stronger recovery while below selected altitude and still descending', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 9700 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(180 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 1500, altitude: 10000 });
  const state = runSteps(physics, { throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 120);

  assert.ok((state.derived?.altitude ?? 0) < 9800, `Altitude ${(state.derived?.altitude ?? 0).toFixed(0)}ft should still be meaningfully below target in this recovery scenario`);
  assert.ok((state.verticalSpeed ?? 0) < 0, `Vertical speed ${(state.verticalSpeed ?? 0).toFixed(0)}fpm should still show descending momentum before recovery`);
  assert.ok((state.autopilotTargets?.vs ?? 0) >= 1200, `Target VS ${(state.autopilotTargets?.vs ?? 0).toFixed(0)}fpm should command stronger recovery while diverging below target`);
});

test('Autopilot enters capture mode before selected altitude overshoot band', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 9700 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(180 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 1500, altitude: 10000 });
  const state = runSteps(physics, { throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 320);

  assert.ok((state.derived?.altitude ?? 0) > 9700, `Altitude ${(state.derived?.altitude ?? 0).toFixed(0)}ft did not approach capture band`);
  assert.notEqual(state.autopilotDebug?.altitudeMode, 'armed', `Altitude mode remained ${state.autopilotDebug?.altitudeMode} too close to selected altitude`);
  assert.ok(Math.abs(state.autopilotTargets?.vs ?? 0) < 500, `Target VS ${(state.autopilotTargets?.vs ?? 0).toFixed(0)}fpm stayed too high near selected altitude`);
});

test('Autopilot levels off after capturing selected altitude', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 9700 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(180 * 0.514444, 0, 0);
  // ~5deg nose-up for 1500fpm climb at 180kt
  physics.state.quat = Quaternion.fromEuler(0, 5 * Math.PI / 180, Math.PI / 2);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 1500, altitude: 10000 });

  const state = runSteps(physics, { throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 320);
  const status = physics.getAutopilotStatus();

  const altError = Math.abs((state.derived?.altitude ?? 0) - 10000);
  const targetVs = status.targets.vs;

  assert.ok(altError < 200, `Altitude error ${altError.toFixed(0)}ft exceeds 200ft`);
  assert.ok(Math.abs(targetVs) <= 200, `Target VS ${targetVs}fpm did not return near level flight`);
});

test('Autopilot SPD mode holds speed', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 3000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(150 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 0, altitude: 10000 });

  const state = runSteps(physics, { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 400);

  const speedError = Math.abs(state.derived?.airspeed - 180);

  console.log(`SPD hold: Target=180kts Actual=${state.derived?.airspeed.toFixed(1)}kts Error=${speedError.toFixed(1)}kts`);
  assert.ok(speedError < 10, `Speed error ${speedError.toFixed(1)}kts exceeds 10kts`);
});

test('Autopilot predictive throttle limits speed overshoot after a step change', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 12000 * 0.3048 }, heading: 90, fuel: 5000, coldStart: false });
  physics.state.vel.set(170 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);

  physics.setAutopilot(true, { mode: 'HDG', speed: 170, heading: 90, vs: 0, altitude: 12000 });
  runSteps(physics, { throttle: 0.45, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, 80);
  physics.updateAutopilotTargets({ speed: 210 });

  let maxSpeed = -Infinity;
  let finalState = null;
  for (let i = 0; i < 280; i += 1) {
    finalState = physics.update({ throttle: 0.45, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
    const speed = finalState?.derived?.airspeed ?? 0;
    if (speed > maxSpeed) maxSpeed = speed;
  }

  const finalSpeed = finalState?.derived?.airspeed ?? 0;
  const overshoot = maxSpeed - 210;
  assert.ok(overshoot < 12, `Speed overshoot ${overshoot.toFixed(1)}kts exceeds 12kts`);
  assert.ok(Math.abs(finalSpeed - 210) < 10, `Final speed error ${Math.abs(finalSpeed - 210).toFixed(1)}kts exceeds 10kts`);
});

test('Autopilot heading intercept builds stronger bank authority without a sharp first-frame snap', async () => {
  const physics = await createPhysics({ altitudeFt: 8000, heading: 90, speedKt: 200 });
  runSteps(physics, { throttle: 0.56, pitch: 0.02, roll: 0.01, yaw: 0, trim: 0.03, flaps: 0, gear: false }, 80);

  const beforeAileron = physics.controls.aileron;
  physics.setAutopilot(true, { mode: 'HDG', heading: 130, speed: 200, vs: 0, altitude: 8000 });

  let maxTargetRoll = 0;
  let maxObservedRoll = 0;
  let firstFrameAileronDelta = 0;
  let peakAileronStepDelta = 0;
  let previousAileron = beforeAileron;

  for (let i = 0; i < 80; i += 1) {
    const state = physics.update({ throttle: 0.56, pitch: 0.02, roll: 0.01, yaw: 0, trim: 0.03, flaps: 0, gear: false }, SIM_DT);
    const targetRoll = Math.abs(state.autopilotDebug?.targetRoll ?? 0);
    const observedRoll = Math.abs((state.orientation?.phi ?? 0) * 180 / Math.PI);
    const aileron = physics.controls.aileron;
    const stepDelta = Math.abs(aileron - previousAileron);

    if (i === 0) {
      firstFrameAileronDelta = Math.abs(aileron - beforeAileron);
    }

    if (targetRoll > maxTargetRoll) maxTargetRoll = targetRoll;
    if (observedRoll > maxObservedRoll) maxObservedRoll = observedRoll;
    if (stepDelta > peakAileronStepDelta) peakAileronStepDelta = stepDelta;
    previousAileron = aileron;
  }

  assert.ok(firstFrameAileronDelta < 0.08, `First-frame aileron jump ${firstFrameAileronDelta.toFixed(3)} exceeds 0.08`);
  assert.ok(peakAileronStepDelta < 0.05, `Peak aileron step delta ${peakAileronStepDelta.toFixed(3)} exceeds 0.05`);
  assert.ok(maxTargetRoll > 20, `Target roll ${maxTargetRoll.toFixed(2)}° did not build beyond 20°`);
  assert.ok(maxObservedRoll > 12, `Observed bank ${maxObservedRoll.toFixed(2)}° did not build beyond 12°`);
});

test('Autopilot preserves conservative bank on short final ILS', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.0, longitude: -118.0, position: { z: 800 * 0.3048 }, heading: 95, fuel: 5000, coldStart: false });
  physics.state.vel.set(145 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);
  physics.setEnvironment({ windSpeed: 0, windDirection: 0, windGust: 0, windShear: 0, turbulence: 0, temperature: 15, pressure: 1013.25 });
  physics.autopilot.setRunwayGeometry({
    runwayName: '27',
    heading: 90,
    ilsFrequency: 110.3,
    thresholdStart: { latitude: 34.0, longitude: -118.01, elevation: 100 }
  });

  physics.setAutopilot(true, { mode: 'ILS', speed: 145, heading: 90, vs: -700, altitude: 800 });

  let maxTargetRoll = 0;
  for (let i = 0; i < 25; i += 1) {
    const state = physics.update({ throttle: 0.45, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1, gear: true }, SIM_DT);
    maxTargetRoll = Math.max(maxTargetRoll, Math.abs(state.autopilotDebug?.targetRoll ?? 0));
  }

  assert.ok(maxTargetRoll <= 8.1, `Short-final ILS target roll ${maxTargetRoll.toFixed(2)}° exceeds 8° limit`);
});

test('Autothrottle reduces thrust during overspeed climb instead of holding climb power', async () => {
  const physics = await createPhysics({ altitudeFt: 9000, heading: 90, speedKt: 280 });
  physics.setAutopilot(true, { mode: 'HDG', speed: 210, heading: 90, vs: 1800, altitude: 14000 });

  let minThrottleCommand = 1;
  let finalState = null;
  for (let i = 0; i < 80; i += 1) {
    finalState = physics.update({ throttle: 0.76, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
    minThrottleCommand = Math.min(minThrottleCommand, finalState.autopilotDebug?.throttleRawCommand ?? 1);
  }

  assert.ok(minThrottleCommand < 0.5, `Overspeed climb throttle command ${minThrottleCommand.toFixed(3)} did not reduce below normal lower envelope`);
});

test('Autothrottle can exceed normal thrust envelope during low-energy recovery', async () => {
  const physics = await createPhysics({ altitudeFt: 9000, heading: 90, speedKt: 135 });
  physics.setAutopilot(true, { mode: 'HDG', speed: 210, heading: 90, vs: 1000, altitude: 12000 });

  let maxThrottleCommand = 0;
  let finalState = null;
  for (let i = 0; i < 80; i += 1) {
    finalState = physics.update({ throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
    maxThrottleCommand = Math.max(maxThrottleCommand, finalState.autopilotDebug?.throttleRawCommand ?? 0);
  }

  assert.ok(maxThrottleCommand > 0.8, `Low-energy throttle command ${maxThrottleCommand.toFixed(3)} did not exceed normal upper envelope`);
});

test('Autopilot heading intercept respects 25 degree normal bank limit while avoiding sharp aileron kick', async () => {
  const physics = await createPhysics({ altitudeFt: 8000, heading: 90, speedKt: 200 });
  runSteps(physics, { throttle: 0.56, pitch: 0.02, roll: 0.01, yaw: 0, trim: 0.03, flaps: 0, gear: false }, 80);

  const beforeAileron = physics.controls.aileron;
  physics.setAutopilot(true, { mode: 'HDG', heading: 160, speed: 200, vs: 0, altitude: 8000 });

  let maxTargetRoll = 0;
  let firstFrameAileronDelta = 0;
  let peakAileronStepDelta = 0;
  let previousAileron = beforeAileron;

  for (let i = 0; i < 100; i += 1) {
    const state = physics.update({ throttle: 0.56, pitch: 0.02, roll: 0.01, yaw: 0, trim: 0.03, flaps: 0, gear: false }, SIM_DT);
    const targetRoll = Math.abs(state.autopilotDebug?.targetRoll ?? 0);
    const aileron = physics.controls.aileron;
    const stepDelta = Math.abs(aileron - previousAileron);

    if (i === 0) {
      firstFrameAileronDelta = Math.abs(aileron - beforeAileron);
    }

    if (targetRoll > maxTargetRoll) maxTargetRoll = targetRoll;
    if (stepDelta > peakAileronStepDelta) peakAileronStepDelta = stepDelta;
    previousAileron = aileron;
  }

  assert.ok(firstFrameAileronDelta < 0.06, `First-frame aileron jump ${firstFrameAileronDelta.toFixed(3)} exceeds 0.06`);
  assert.ok(peakAileronStepDelta < 0.045, `Peak aileron step delta ${peakAileronStepDelta.toFixed(3)} exceeds 0.045`);
  assert.ok(maxTargetRoll <= 25.1, `Target roll ${maxTargetRoll.toFixed(2)}° exceeds 25° normal bank limit`);
  assert.ok(maxTargetRoll >= 18, `Target roll ${maxTargetRoll.toFixed(2)}° is too weak to recover decisively`);
});

test('Autopilot stabilizes VS altitude and IAS under wind with low signed average drift', async (t) => {
  t.after(installDeterministicRandom(737801));
  const physics = await createPhysics({ altitudeFt: 9800, heading: 90, speedKt: 178 });
  physics.state.quat = Quaternion.fromEuler(0, 3 * Math.PI / 180, Math.PI / 2);
  physics.setEnvironment({ windSpeed: 18, windDirection: 230, windGust: 24, windShear: 0.06, turbulence: 0.12, temperature: 15, pressure: 1013.25 });
  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 800, altitude: 10000 });

  const samples = [];
  for (let i = 0; i < 2600; i += 1) {
    const state = physics.update({ throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
    if (i >= 2200) {
      samples.push({
        vsFps: ((state.verticalSpeed ?? 0) - (state.autopilotTargets?.vs ?? 0)) / 60,
        alt: (state.derived?.altitude ?? 0) - 10000,
        ias: (state.indicatedAirspeed ?? 0) - 180
      });
    }
  }

  const avg = (key) => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  const avgVsDrift = avg('vsFps');
  const avgAltDrift = avg('alt');
  const avgIasDrift = avg('ias');

  assert.ok(Math.abs(avgVsDrift) <= 10, `Average VS drift ${avgVsDrift.toFixed(2)}ft/s exceeds 10ft/s`);
  assert.ok(Math.abs(avgAltDrift) <= 20, `Average altitude drift ${avgAltDrift.toFixed(2)}ft exceeds 20ft`);
  assert.ok(Math.abs(avgIasDrift) <= 1, `Average IAS drift ${avgIasDrift.toFixed(2)}kts exceeds 1kt`);
});

test('ILS exposes debug info and reduces localizer deviation during intercept', async () => {
  const aircraft = await getAircraft();
  const physics = new RealisticFlightPhysicsService(aircraft, 34.0, -118.0, 'intermediate');
  physics.setInitialConditions({ latitude: 34.002, longitude: -118.05, position: { z: 2500 * 0.3048 }, heading: 100, fuel: 5000, coldStart: false });
  physics.state.vel.set(160 * 0.514444, 0, 0);
  physics.setMotionEnabled(true);
  physics.setEnvironment({ windSpeed: 12, windDirection: 210, windGust: 16, windShear: 0, turbulence: 0.05, temperature: 15, pressure: 1013.25 });
  physics.setRunwayGeometry({
    runwayName: '27',
    heading: 90,
    ilsFrequency: 110.3,
    thresholdStart: { latitude: 34.0, longitude: -118.01, elevation: 100 }
  });
  physics.autopilot.setNavFrequency(110.3);
  physics.setAutopilot(true, { mode: 'ILS', speed: 160, heading: 90, vs: -700, altitude: 2500 });

  let initialDev = null;
  let finalDev = null;
  let sawIlsDebug = false;
  for (let i = 0; i < 240; i += 1) {
    const state = physics.update({ throttle: 0.52, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 1, gear: true }, SIM_DT);
    const dev = Math.abs(state.autopilotDebug?.ils?.locDeviationDeg ?? 0);
    if (i === 0) initialDev = dev;
    finalDev = dev;
    if (state.autopilotDebug?.ils?.active && state.autopilotDebug?.ils?.message) sawIlsDebug = true;
  }

  assert.ok(sawIlsDebug, 'ILS debug info never became active');
  assert.ok((finalDev ?? Infinity) < (initialDev ?? 0), `Localizer deviation did not improve: initial ${(initialDev ?? 0).toFixed(2)}° final ${(finalDev ?? 0).toFixed(2)}°`);
});

test('Autopilot stabilizes under stronger gusting crosswind with low signed average drift', async (t) => {
  t.after(installDeterministicRandom(737800));
  const physics = await createPhysics({ altitudeFt: 9800, heading: 90, speedKt: 178 });
  physics.state.quat = Quaternion.fromEuler(0, 3 * Math.PI / 180, Math.PI / 2);
  physics.setEnvironment({ windSpeed: 21, windDirection: 230, windGust: 30, windShear: 0.07, turbulence: 0.14, temperature: 15, pressure: 1013.25 });
  physics.setAutopilot(true, { mode: 'HDG', speed: 180, heading: 90, vs: 800, altitude: 10000 });

  const samples = [];
  for (let i = 0; i < 3000; i += 1) {
    const state = physics.update({ throttle: 0.55, pitch: 0, roll: 0, yaw: 0, trim: 0, flaps: 0, gear: false }, SIM_DT);
    if (i >= 2600) {
      samples.push({
        vsFps: ((state.verticalSpeed ?? 0) - (state.autopilotTargets?.vs ?? 0)) / 60,
        alt: (state.derived?.altitude ?? 0) - 10000,
        ias: (state.indicatedAirspeed ?? 0) - 180
      });
    }
  }

  const avg = (key) => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  const avgVsDrift = avg('vsFps');
  const avgAltDrift = avg('alt');
  const avgIasDrift = avg('ias');

  assert.ok(Math.abs(avgVsDrift) <= 10, `Strong-wind average VS drift ${avgVsDrift.toFixed(2)}ft/s exceeds 10ft/s`);
  assert.ok(Math.abs(avgAltDrift) <= 20, `Strong-wind average altitude drift ${avgAltDrift.toFixed(2)}ft exceeds 20ft`);
  assert.ok(Math.abs(avgIasDrift) <= 1, `Strong-wind average IAS drift ${avgIasDrift.toFixed(2)}kts exceeds 1kt`);
});
