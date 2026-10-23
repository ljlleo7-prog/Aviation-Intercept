import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import GroundInteractionService from '../src/services/physics/GroundInteractionService.js';
import { airportSurfaceAt } from '../src/utils/airportGroundSurface.js';
import { unprojectGroundPoint } from '../src/utils/airportGroundCoordinates.js';
import { Vector3 } from '../src/utils/flightMath.js';

const aircraft = createRequire(import.meta.url)('../src/data/aircraftDatabase.json').aircraft;
const ring = (x, z, size) => [[[[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]]]];
const layout = {
  origin: { latitude: 0, longitude: 0 },
  visualAlignment: { x: 20, z: 30 },
  runways: [{ path: [[0, 0], [0, -1000]], width: 40 }],
  taxiways: [{ path: [[100, 0], [100, -1000]], width: 20 }],
  aprons: [{ area: ring(150, -500, 100) }],
  operatingArea: ring(-200, -1200, 1600),
};
const geoAt = (x, z) => {
  const point = unprojectGroundPoint([x + 20, z + 30], layout.origin);
  return { lat: point.latitude, lon: point.longitude };
};

test('airport surface lookup distinguishes pavement, grass, and outside the layout', () => {
  assert.equal(airportSurfaceAt(geoAt(0, -300), layout), 'PAVED');
  assert.equal(airportSurfaceAt(geoAt(100, -300), layout), 'TAXIWAY');
  assert.equal(airportSurfaceAt(geoAt(200, -450), layout), 'APRON');
  assert.equal(airportSurfaceAt(geoAt(70, -300), layout), 'GRASS');
  assert.equal(airportSurfaceAt(geoAt(2000, 0), layout), null);
});

test('mapped taxiways and aprons override runway-side grass and retain airport elevation', () => {
  const ground = new GroundInteractionService();
  ground.airportLayout = layout;
  const runway = { thresholdStart: { latitude: 0, longitude: 0, elevation: 100 }, heading: 0, length: 1000, width: 40 };
  for (const [x, z, expected] of [[100, -300, 'TAXIWAY'], [200, -450, 'APRON'], [70, -300, 'GRASS']]) {
    const state = { geo: geoAt(x, z), pos: new Vector3(0, 0, -3), vel: new Vector3(5, 0, 0) };
    const result = ground.updateGroundStatus(state, runway, 500, 30.48);
    assert.equal(result.groundStatus.status, expected);
    assert.ok(Math.abs(result.currentGroundZ) < 1e-10);
  }
});

for (const data of aircraft) {
  test(`${data.icao} rolls freely on pavement, with independent braking and grass resistance`, () => {
    const physics = new RealisticFlightPhysicsService(data);
    physics.performSystemAction('brakes', 'parkingBrake', false);
    physics.state.pos.z = -physics.aircraft.gearHeight + 0.2;
    physics.state.vel.set(5, 0, 0);
    const measure = (status, speed = 5, brakes = 0) => {
      physics.groundStatus = { status };
      physics.state.vel.x = speed;
      physics.setWheelBrakes(brakes);
      return physics.calculateAerodynamicsAndGround(physics.calculateEnvironment(physics.state.pos.z), 1 / 300).groundForces;
    };
    const paved = measure('RUNWAY');
    assert.ok(Math.abs(paved.x / paved.z - 0.004) < 1e-10);
    for (const status of ['TAXIWAY', 'APRON', 'PAVED']) {
      assert.ok(Math.abs(measure(status).x - paved.x) < 1e-8);
    }
    assert.ok(Math.abs(measure('RUNWAY', 0.01).x) <= Math.abs(paved.x), 'Creep damping cannot exceed rolling friction');
    assert.ok(Math.abs(measure('RUNWAY', 5, 1).x) > Math.abs(paved.x) * 100, 'Wheel braking remains effective');
    assert.ok(Math.abs(measure('GRASS').x) > Math.abs(paved.x) * 10, 'Grass retains high rolling resistance');
  });
}

test('physics loads procedural taxiway surfaces without mounting the outside view', async () => {
  const physics = new RealisticFlightPhysicsService(aircraft[0]);
  const geometry = {
    airportCode: 'TEST', runwayName: '36', heading: 0, length: 2000, width: 45,
    thresholdStart: { latitude: 0, longitude: 0 },
    thresholdEnd: { latitude: 2000 / 111320, longitude: 0 },
  };
  physics.runwayGeometry = geometry;
  await physics.loadGroundLayout(geometry);
  const generated = physics.groundInteractionService.airportLayout;
  assert.ok(generated?.taxiways.length);
  const taxiway = generated.taxiways[0];
  const midpoint = taxiway.path[0].map((value, index) => (value + taxiway.path[1][index]) / 2);
  const point = unprojectGroundPoint(midpoint, generated.origin);
  assert.equal(airportSurfaceAt({ lat: point.latitude, lon: point.longitude }, generated), 'TAXIWAY');
});
