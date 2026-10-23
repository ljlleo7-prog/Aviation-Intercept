import test from 'node:test';
import assert from 'node:assert/strict';
import AirportService, { airportService } from '../src/services/airportService.js';
import Physics from '../src/services/RealisticFlightPhysicsService.js';
import aircraftService from '../src/services/aircraftService.js';

const flightPlan = {
  departure: airportService.getAirportByCode('EGLL'),
  arrival: airportService.getAirportByCode('KLAX'),
  waypoints: []
};

async function heathrow(runwayName = '27R') {
  const runway = airportService.getRunwayGeometry('EGLL', runwayName);
  const aircraft = await aircraftService.getAircraftByModel('Boeing 737-800');
  const physics = new Physics({ ...aircraft, airportElevation: 83 }, runway.thresholdStart.latitude, runway.thresholdStart.longitude, 'rookie');
  physics.loadGroundLayout = async () => {};
  physics.setInitialConditions({ heading: runway.heading });
  physics.setRunwayGeometry(runway);
  physics.updateGroundStatus();
  physics.setMotionEnabled(true);
  return { physics, runway };
}

test('shared ground frequency 121.900 resolves Heathrow near Heathrow, Atlanta near Atlanta', () => {
  const london = airportService.getAirportByFrequency(121.9, { latitude: 51.47, longitude: -.46 });
  const atlanta = airportService.getAirportByFrequency(121.9, { latitude: 33.64, longitude: -84.43 });
  assert.equal(london?.icao, 'EGLL');
  assert.equal(atlanta?.icao, 'KATL');
});

test('frequency lookup rejects distant stations and ambiguous lookups without a location', () => {
  const service = new AirportService();
  service.allAirports = [
    { icao: 'ONE', latitude: 51, longitude: 0, frequencies: [{ frequency: 121.9 }] },
    { icao: 'TWO', latitude: 33, longitude: -84, frequencies: [{ frequency: 121.9 }] }
  ];
  assert.equal(service.getAirportByFrequency(121.9, { latitude: 0, longitude: 100 }), undefined);
  assert.equal(service.getAirportByFrequency(121.9), undefined);
  assert.equal(service.getAirportByFrequency(NaN, { latitude: 51, longitude: 0 }), undefined);
});

for (const runwayName of ['09L', '09R', '27L', '27R']) {
  test(`${runwayName}: radio changes cannot replace the runway or create a 500m collision floor`, async () => {
    const { physics, runway } = await heathrow(runwayName);
    const layout = { origin: { latitude: 51.47, longitude: -.46 } };
    physics.groundInteractionService.airportLayout = layout;
    physics.terrainElevation = 500;
    for (const frequency of [121.9, 118.5, 128.075, 121.5]) {
      physics.handleRadioTuning(frequency, flightPlan);
      assert.equal(physics.runwayGeometry, runway, 'radio must not mutate the supporting runway');
      assert.equal(physics.groundInteractionService.airportLayout, layout, 'radio must not evict the ground layout');
      physics.updateGroundStatus();
      assert.ok(Math.abs(physics.airportElevation - physics.currentGroundZ - 83 * .3048) < 1e-9);
      if (frequency !== 121.5) {
        assert.equal(physics.autopilot.runwayGeometry?.airportCode, 'EGLL');
        assert.equal(physics.autopilot.runwayGeometry?.runwayName, runwayName);
      }
    }
    // Keep checking after the previous five-second workaround would have expired.
    for (let frame = 0; frame < 420; frame++) {
      if (frame === 360) physics.handleRadioTuning(121.9, flightPlan);
      const output = physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: 0 }, 1 / 60);
      assert.ok(output.derived.altitude_ft < 100, 'no late snap to 1640ft terrain');
      assert.equal(physics.crashed, false);
    }
  });
}

test('a landing above Heathrow has no invisible collision plane at 500m after tuning ground', async () => {
  const { physics } = await heathrow('09L');
  physics.terrainElevation = 500;
  physics.handleRadioTuning(121.9, flightPlan);
  physics.state.pos.z = -(500 - physics.airportElevation);
  physics.state.vel.set(60, 0, 2);
  physics.onGround = false;
  physics.updateGroundStatus();
  physics.checkConstraints(1 / 60);
  assert.equal(physics.onGround, false, '500m AMSL is airborne over the actual runway');
  assert.equal(physics.crashed, false);
  assert.ok(Math.abs(physics.getOutputState().derived.altitude_ft - 500 / .3048) < .001);
});

function routeToLosAngeles(physics) {
  const arrival = flightPlan.arrival;
  physics.updateFlightPlan([{ type: 'airport', label: 'KLAX', details: arrival,
    selectedRunway: '25R', latitude: arrival.latitude, longitude: arrival.longitude }]);
}

test('an airborne FMS destination thousands of miles away cannot replace Heathrow ground', async () => {
  const { physics, runway } = await heathrow('09L');
  routeToLosAngeles(physics);
  physics.terrainElevation = 500;
  physics.state.pos.z = -20;
  physics.onGround = false;
  physics.state.vel.set(60, 0, 0);
  const output = physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: 0 }, 1 / 60);
  assert.equal(physics.runwayGeometry, runway);
  assert.ok(output.derived.altitude_ft < 200);
  assert.equal(physics.crashed, false);
});

test('FMS destination can become the physical runway once the aircraft actually reaches that airport', async () => {
  const { physics } = await heathrow('09L');
  routeToLosAngeles(physics);
  const destination = airportService.getRunwayGeometry('KLAX', '25R');
  physics.state.geo = { lat: destination.thresholdStart.latitude, lon: destination.thresholdStart.longitude };
  physics.state.pos.z = -(destination.thresholdStart.elevation * .3048 - physics.airportElevation + 100);
  physics.terrainElevation = 500;
  physics.onGround = false;
  physics.state.vel.set(60, 0, 0);
  physics.update({ throttle: 0, pitch: 0, roll: 0, yaw: 0 }, 1 / 60);
  assert.equal(physics.runwayGeometry.airportCode, 'KLAX');
  assert.equal(physics.runwayGeometry.runwayName, '25R');
  assert.ok(Math.abs(physics.airportElevation - physics.currentGroundZ - destination.thresholdStart.elevation * .3048) < 1e-9);
});
