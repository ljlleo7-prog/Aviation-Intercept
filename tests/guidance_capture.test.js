import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticAutopilotService from '../src/services/RealisticAutopilotService.js';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { airportService } from '../src/services/airportService.js';
import { loadAircraftData } from '../src/services/aircraftService.js';

const controls = { throttle: .5, elevator: 0, aileron: 0, rudder: 0, trim: 0 };
const stateAt = (altitude, verticalSpeed = 0) => ({ airspeed: 210, verticalSpeed, pitch: 0, roll: 0, heading: 90, track: 90, altitude, altitudeAGL: altitude, latitude: 34, longitude: -118, groundSpeed: 210 });

for (const [altitude, verticalSpeed, direction] of [[7000, 1200, 1], [9000, -1200, -1]]) {
  test(`VNAV tapers and levels off from ${direction > 0 ? 'below' : 'above'} the target`, () => {
    const ap = new RealisticAutopilotService();
    ap.setTargets({ mode: 'LNAV', altitude: 8000, speed: 210, heading: 90 });
    ap.setNavigationPlan({ fix: { latitude: 35, longitude: -118, altitude: 8000 }, inboundCourseDeg: 90 });
    ap.setVNAVArmed(true);
    ap.setEngaged(true);
    ap.update(stateAt(altitude, verticalSpeed), controls, .05);
    const farVS = ap.targets.vs;
    assert.equal(Math.sign(farVS), direction);
    ap.update(stateAt(8000 - direction * 100, verticalSpeed / 2), controls, .05);
    assert.ok(Math.abs(ap.targets.vs) < Math.abs(farVS));
    for (const nearAltitude of [7990, 8000, 8010, 8000]) {
      ap.update(stateAt(nearAltitude, direction * 120), controls, .05);
      assert.equal(ap.targets.vs, 0);
    }
    assert.equal(ap.userVsTarget, 0, 'VNAV must not acquire the current vertical drift as a selected VS');
  });
}

test('ILS uses surveyed LAX true heading and reciprocal, not runway-number defaults', () => {
  const forward = airportService.getRunwayGeometry('LAX', '06R');
  const reverse = airportService.getRunwayGeometry('LAX', '24L');
  assert.equal(forward.geometrySource, 'local-aip');
  assert.equal(reverse.ilsFrequency, airportService.getRunwayGeometry('KLAX', '24L').ilsFrequency);
  assert.ok(forward.heading > 82 && forward.heading < 84);
  assert.ok(reverse.heading > 262 && reverse.heading < 264);
  assert.deepEqual(forward.thresholdStart, reverse.thresholdEnd);
  const ap = new RealisticAutopilotService();
  ap.setRunwayGeometry(reverse);
  ap.setNavFrequency(reverse.ilsFrequency);
  const theta = (reverse.heading + 180) * Math.PI / 180;
  const latitude = reverse.thresholdStart.latitude + 4 * 1852 * Math.cos(theta) / 111132.92;
  const longitude = reverse.thresholdStart.longitude + 4 * 1852 * Math.sin(theta) / (111412.84 * Math.cos(reverse.thresholdStart.latitude * Math.PI / 180));
  const { ilsDebug } = ap.updateIlsTelemetry({ ...stateAt(1500), latitude, longitude, heading: reverse.heading, track: reverse.heading });
  assert.equal(ilsDebug.active, true);
  assert.ok(Math.abs(ilsDebug.locDeviationDeg) < .001);
  ap.setRunwayGeometry({ ...reverse, headingSource: 'designator-estimate' });
  assert.equal(ap.updateIlsTelemetry({ ...stateAt(1500), latitude, longitude }).ilsDebug.active, false);
  assert.equal(airportService.getRunwayGeometry('LAX', '99'), null);
});

test('VNAV receives the active route waypoint altitude during actual physics updates', async () => {
  const aircraft = (await loadAircraftData()).find(item => item.model === 'Boeing 737-800');
  const physics = new RealisticFlightPhysicsService(aircraft, 34, -118, 'rookie');
  physics.setInitialConditions({ position: { z: 5000 * .3048 } });
  physics.state.vel.set(210 * .514444, 0, 0);
  physics.updateFlightPlan({ waypoints: [{ latitude: 35, longitude: -118, altitude: 8000 }] });
  physics.setAutopilot(true, { mode: 'LNAV', altitude: 5000, speed: 210 });
  physics.setVNAVArmed(true);
  physics.update({ throttle: .5, pitch: 0, roll: 0, yaw: 0, trim: 0 }, .05);
  assert.equal(physics.getAutopilotStatus().targets.altitude, 8000);
  assert.ok(physics.getAutopilotStatus().targets.vs > 0);
});

for (const direction of [1, -1]) {
  test(`selected altitude capture stays latched through ${direction > 0 ? 'climb' : 'descent'} overshoot`, () => {
    const ap = new RealisticAutopilotService();
    ap.setTargets({ mode: 'HDG', altitude: 8000, speed: 210, heading: 90, vs: direction * 1200 });
    ap.setEngaged(true);
    ap.update(stateAt(8000 - direction * 200, direction * 1200), controls, .05);
    assert.equal(ap.altitudeMode, 'capture');
    for (let i = 0; i < 80; i++) {
      ap.update(stateAt(8000 + direction * 100, direction * 400), controls, .05);
      assert.equal(ap.altitudeMode, 'capture', 'overshoot must not restore manual V/S');
      assert.ok(ap.targets.vs * direction <= 0, 'capture must command recovery toward the selected altitude');
    }
    for (let i = 0; i < 100; i++) ap.update(stateAt(8000, 0), controls, .05);
    assert.equal(ap.altitudeMode, 'hold');
    for (let i = 0; i < 80; i++) {
      ap.update(stateAt(8000 + direction * 200, direction * 200), controls, .05);
      assert.equal(ap.altitudeMode, 'hold', 'hold must correct drift without returning to manual V/S');
      assert.equal(Math.sign(ap.targets.vs), -direction);
    }
  });
}
