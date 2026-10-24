import test from 'node:test';
import assert from 'node:assert/strict';
import NavigationService from '../src/services/physics/NavigationService.js';
import Autopilot from '../src/services/RealisticAutopilotService.js';
import { buildFlyByTurn, projectFromLocalMeters, normalizeSignedHeadingDelta } from '../src/utils/flightMath.js';

const route = [{ latitude: 0, longitude: 0, name: 'START' }, { latitude: 0, longitude: 0.2, name: 'TURN' }, { latitude: 0.2, longitude: 0.2, name: 'NEXT' }];
const options = { flightPlan: route, turnRadiusMeters: 1852 };
const difference = (a, b) => Math.abs(normalizeSignedHeadingDelta(a - b));

test('near a missed fix guidance aims along the outbound path rather than back to turn entry', () => {
  const nav = new NavigationService();
  nav.updateFlightPlan(route, 1);
  const guidance = nav.update({ latitude: 0.002, longitude: 0.201, groundSpeed: 210 }, options);
  assert.ok(difference(guidance.targetHeading, 0) < 60, `Expected outbound capture, got ${guidance.targetHeading}`);
  const adjacent = nav.update({ latitude: 0.00205, longitude: 0.20105, groundSpeed: 210 }, options);
  assert.ok(difference(adjacent.targetHeading, guidance.targetHeading) < 2);
});

test('look-ahead guidance progresses smoothly along the predicted curve and sequences onto the next leg', () => {
  const turn = buildFlyByTurn(...route, options);
  const nav = new NavigationService();
  nav.updateFlightPlan(route, 1);
  let previous;
  for (let step = 0; step <= 20; step++) {
    const angle = turn.startAngle + turn.arcAngle * step / 20;
    const position = projectFromLocalMeters(turn.referenceLat, turn.referenceLon,
      turn.center.x + Math.cos(angle) * (turn.radiusMeters + 100), turn.center.y + Math.sin(angle) * (turn.radiusMeters + 100));
    const guidance = nav.update({ ...position, groundSpeed: 210 }, options);
    if (previous !== undefined) assert.ok(difference(guidance.targetHeading, previous) < 12);
    assert.ok(difference(guidance.targetHeading, 45) <= 55, 'curve must not command a turn back to entry');
    previous = guidance.targetHeading;
  }
  const beyond = projectFromLocalMeters(turn.exit.latitude, turn.exit.longitude, 200, 0);
  const guidance = nav.update({ ...beyond, groundSpeed: 210 }, options);
  assert.equal(guidance.activeWaypoint.name, 'NEXT');
  assert.ok(difference(guidance.targetHeading, 0) < 2);
});

test('short legs retain a consistent fly-by arc instead of abandoning turn prediction', () => {
  const points = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 }, { latitude: 0.01, longitude: 0.01 }];
  const turn = buildFlyByTurn(...points, { turnRadiusMeters: 4000 });
  assert.ok(turn);
  assert.ok(turn.radiusMeters < 600);
  assert.ok(turn.leadDistance < 600);
});

test('passing the final leg does not command an abrupt reversal toward its endpoint', () => {
  const nav = new NavigationService();
  const points = route.slice(0, 2);
  nav.updateFlightPlan(points, 1);
  const guidance = nav.update({ latitude: 0.001, longitude: 0.23, groundSpeed: 210 }, { flightPlan: points });
  assert.ok(difference(guidance.targetHeading, 90) < 15);
});

test('physics path guidance takes priority over a stale direct-to navigation plan', () => {
  const ap = new Autopilot();
  ap.setNavigationPlan({ fix: { latitude: 0, longitude: -1 }, inboundCourseDeg: 270 });
  ap.setTargets({ mode: 'LNAV', heading: 270, altitude: 5000, speed: 210 });
  ap.setEngaged(true);
  ap.setPathGuidance(30);
  ap.update({ latitude: 0, longitude: 0, heading: 30, track: 30, airspeed: 210, altitude: 5000, altitudeAGL: 5000, verticalSpeed: 0, pitch: 0, roll: 0 }, { throttle: 0.5, elevator: 0, aileron: 0, rudder: 0, trim: 0 }, 0.05);
  assert.ok(difference(ap.targets.heading, 30) < 1);
});

test('a bank-limited aircraft follows the curve and settles onto the outbound leg', () => {
  const nav = new NavigationService();
  nav.updateFlightPlan(route, 1);
  const speed = 210 * 0.514444;
  const radius = speed ** 2 / (9.80665 * Math.tan(25 * Math.PI / 180));
  const maxRate = speed / radius * 180 / Math.PI;
  let position = { latitude: 0, longitude: 0.05 };
  let heading = 90;
  for (let i = 0; i < 1800; i++) {
    const guidance = nav.update({ ...position, heading, groundSpeed: 210 }, { flightPlan: route, turnRadiusMeters: radius });
    const error = normalizeSignedHeadingDelta(guidance.targetHeading - heading);
    heading = (heading + Math.max(-maxRate * 0.25, Math.min(maxRate * 0.25, error)) + 360) % 360;
    position = projectFromLocalMeters(position.latitude, position.longitude,
      Math.cos(heading * Math.PI / 180) * speed * 0.25, Math.sin(heading * Math.PI / 180) * speed * 0.25);
  }
  assert.equal(nav.currentWaypointIndex, 2);
  assert.ok(difference(heading, 0) < 2);
  assert.ok(Math.abs(position.longitude - 0.2) * 111412.84 < 100);
  assert.ok(position.latitude > 0.2, 'continue outbound without reversing at the final fix');
});
