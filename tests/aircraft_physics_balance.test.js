import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';
import { installDeterministicRandom } from './support/deterministicRandom.js';

const aircraft = createRequire(import.meta.url)('../src/data/aircraftDatabase.json').aircraft;
const controls = { throttle: 0.5, pitch: 0, roll: 0, yaw: 0, trim: 0 };
const createPhysics = (data) => new RealisticFlightPhysicsService({
  ...data,
  fuelWeight: data.maxTakeoffWeight * 0.15,
  payloadWeight: data.maxTakeoffWeight * 0.1,
});

test('737 gear and inertia tuning remains unchanged', () => {
  const physics = createPhysics(aircraft[0]);
  assert.equal(physics.aircraft.gearStiffness, 3000000);
  assert.equal(physics.aircraft.Ix, aircraft[0].momentOfInertiaRoll);
  assert.equal(physics.aircraft.Iy, aircraft[0].momentOfInertiaPitch);
  const points = physics.groundInteractionService.getContactPoints(3.5, true, physics.aircraft.gearStiffness);
  assert.deepEqual(points.map(point => point.c), [35000, 150000, 150000]);
});

for (const data of aircraft.filter(entry => entry.icao !== 'B738')) {
  test(`${data.icao} gear supports design weight before reaching compression limit`, () => {
    const physics = createPhysics(data);
    const points = physics.groundInteractionService.getContactPoints(data.gearHeight, true, physics.aircraft.gearStiffness);
    const support = points.reduce((sum, point) => sum + point.k * 0.35, 0);
    assert.ok(support > data.maxTakeoffWeight * physics.CONSTANTS.G);
  });

  test(`${data.icao} parking brake holds against partial thrust and releases for taxi`, () => {
    const restoreRandom = installDeterministicRandom(744);
    try {
      const physics = createPhysics(data);
      physics.setMotionEnabled(true);
      physics.performSystemAction('brakes', 'parkingBrake', true);
      for (let frame = 0; frame < 300; frame++) physics.update(controls, 0.02);
      assert.equal(physics.crashed, false);
      assert.ok(Math.hypot(physics.state.vel.x, physics.state.vel.y) < 0.01);
      assert.ok(Math.hypot(physics.state.pos.x, physics.state.pos.y) < 0.1);
      physics.performSystemAction('brakes', 'parkingBrake', false);
      for (let frame = 0; frame < 100; frame++) physics.update(controls, 0.02);
      assert.ok(physics.state.vel.x > 0.1, 'Releasing the brake permits forward acceleration');
    } finally {
      restoreRandom();
    }
  });
}

test('747 brake hold yields when thrust exceeds available surface grip', () => {
  const physics = createPhysics(aircraft.find(entry => entry.icao === 'B744'));
  physics.performSystemAction('brakes', 'parkingBrake', true);
  physics.state.pos.z += 0.2;
  physics.aircraft.brakingFriction = 0.001;
  physics.engines.forEach(engine => { engine.state.thrust = 200000; });
  const result = physics.calculateAerodynamicsAndGround(physics.calculateEnvironment(physics.state.pos.z), 1 / 300);
  assert.equal(physics.groundBrakeCanHold, false);
  physics.integrate(result.forces, result.moments, 1 / 300);
  assert.ok(physics.state.vel.x > 0);
});
