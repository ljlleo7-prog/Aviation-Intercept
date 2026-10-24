import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmRouteSelection } from '../src/utils/confirmRouteSelection.js';
import { airportService } from '../src/services/airportService.js';
import { mergeFlightPlanWithRoute } from '../src/utils/routeDetails.js';
import { interceptPoint, localPoint } from '../src/utils/procedureEditor.js';
import NavigationService from '../src/services/physics/NavigationService.js';

const departure = airportService.getAirportByCode('ZSPD');
const arrival = airportService.getAirportByCode('ZBAA');
const endpoint = { name: 'FIRST', latitude: 32, longitude: 121.5 };
const delta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('confirming 35R preserves the reviewed runway and custom SID instead of default 17L', () => {
  const geometry = airportService.getRunwayGeometry('ZSPD', '35R');
  const intercept = interceptPoint(geometry.thresholdStart, geometry.heading, 8, 'departure');
  const edit = { airportCode: 'ZSPD', runwayName: '35R', origin: geometry.thresholdStart, endpoint, points: [intercept] };
  const previous = { selectedDeparture: departure, selectedArrival: arrival, routeDetails: { departureRunway: '17L' }, aircraftModel: 'B737-800' };
  const confirmed = confirmRouteSelection(previous, { departure, arrival, departureRunway: '35R', landingRunway: '36R', sid: 'FIRST1D', waypoints: [endpoint], departureProcedure: edit });
  assert.equal(confirmed.routeDetails.departureRunway, '35R');
  assert.equal(confirmed.routeDetails.landingRunway, '36R');
  assert.equal(confirmed.routeDetails.departureProcedure, edit);
  assert.equal(confirmed.aircraftModel, 'B737-800');
  assert.equal(previous.routeDetails.departureRunway, '17L');
  const plan = mergeFlightPlanWithRoute({ departure, arrival }, confirmed.routeDetails);
  assert.equal(plan.waypoints[0].name, '35R');
  assert.equal(plan.waypoints[0].latitude, geometry.thresholdStart.latitude);
  assert.equal(plan.waypoints[0].longitude, geometry.thresholdStart.longitude);
  const navigation = new NavigationService();
  navigation.updateFlightPlan(plan.waypoints, 0);
  const guidance = navigation.update({ ...geometry.thresholdStart, heading: geometry.heading, groundSpeed: 140 });
  assert.equal(guidance.activeWaypoint.name, 'SID-1');
  assert.ok(delta(guidance.targetHeading, geometry.heading) < 1, 'SID must continue along the selected outbound runway heading');
});

test('35R and 17L use opposite thresholds, reciprocal headings and matching departure intercepts', () => {
  const northbound = airportService.getRunwayGeometry('PVG', '35R');
  const southbound = airportService.getRunwayGeometry('ZSPD', '17L');
  assert.deepEqual(northbound.thresholdStart, southbound.thresholdEnd);
  assert.deepEqual(northbound.thresholdEnd, southbound.thresholdStart);
  assert.ok(delta(northbound.heading, southbound.heading) > 179.99);
  assert.ok(northbound.thresholdStart.latitude < southbound.thresholdStart.latitude);
  const departureIntercept = interceptPoint(northbound.thresholdStart, northbound.heading, 8, 'departure');
  const arrivalIntercept = interceptPoint(northbound.thresholdStart, northbound.heading, 12, 'arrival');
  const forward = localPoint(northbound.thresholdStart, departureIntercept);
  const approach = localPoint(northbound.thresholdStart, arrivalIntercept);
  assert.ok(forward.y > 0);
  assert.ok(approach.y < 0);
});
