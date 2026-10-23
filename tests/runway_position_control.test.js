import test from 'node:test';
import assert from 'node:assert/strict';
import Physics from '../src/services/RealisticFlightPhysicsService.js';
import { airportService } from '../src/services/airportService.js';

for (const [airport, runway] of [['ZSPD', '17L'], ['EGLL', '09L']]) {
  for (const difficulty of ['rookie', 'professional', 'devil']) {
    test(`${airport} ${difficulty}: force calculation cannot recenter an offset aircraft`, () => {
      const geometry = airportService.getRunwayGeometry(airport, runway);
      const angle = geometry.heading * Math.PI / 180;
      const latitude = geometry.thresholdStart.latitude + (500 * Math.cos(angle) - 8 * Math.sin(angle)) / 111132.92;
      const longitude = geometry.thresholdStart.longitude + (500 * Math.sin(angle) + 8 * Math.cos(angle)) /
        (111412.84 * Math.cos(geometry.thresholdStart.latitude * Math.PI / 180));
      const physics = new Physics({ mass: 70000, engineCount: 2 }, latitude, longitude, difficulty);
      physics.setInitialConditions({ latitude, longitude, heading: geometry.heading + 5, difficulty, coldStart: false });
      physics.setRunwayGeometry(geometry);
      physics.updateGroundStatus();
      assert.equal(physics.groundStatus.status, 'RUNWAY');
      physics.state.pos.z = physics.currentGroundZ - physics.aircraft.gearHeight + 0.2;
      physics.state.vel.set(20, 0.5, 0);
      const before = { geo: { ...physics.state.geo }, quat: { ...physics.state.quat }, velocity: { ...physics.state.vel } };
      physics.calculateAerodynamicsAndGround(physics.calculateEnvironment(physics.state.pos.z), 1 / 300);
      assert.deepEqual(physics.state.geo, before.geo);
      assert.deepEqual({ ...physics.state.quat }, before.quat);
      assert.deepEqual({ ...physics.state.vel }, before.velocity);
      physics.setMotionEnabled(true);
      let previous = { ...physics.state.geo };
      for (let frame = 0; frame < 30; frame++) {
        physics.update({ throttle: 0, yaw: 0, pitch: 0, roll: 0 }, 1 / 60);
        const north = (physics.state.geo.lat - previous.lat) * 111132.92;
        const east = (physics.state.geo.lon - previous.lon) * 111412.84 * Math.cos(latitude * Math.PI / 180);
        assert.ok(Math.hypot(north, east) < 1, 'ground motion must be continuous, without a centerline teleport');
        assert.equal(physics.crashed, false);
        previous = { ...physics.state.geo };
      }
    });
  }
}
