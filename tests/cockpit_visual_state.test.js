import test from 'node:test';
import assert from 'node:assert/strict';
import { cockpitVisualState, daylightFactor, parseZuluTime } from '../src/utils/cockpitVisualState.js';

const switches = { taxi: true, landing: true, beacon: true, nav: true, strobe: true, panel: true, dome: true };
test('power loss blanks displays and stops lights and wipers despite switch positions', () => {
  const state = cockpitVisualState({ electrical: { dcVolts: 0, acVolts: 0 }, lighting: switches, wipers: { left: true, right: true } });
  for (const key of ['displaysPowered', ...Object.keys(switches), 'leftWiper', 'rightWiper']) assert.equal(state[key], false, key);
});
test('DC power supports displays and cabin lights; AC supplies exterior beams and wipers', () => {
  const systems = { electrical: { dcVolts: 28, acVolts: 0 }, lighting: switches, wipers: { left: 'HIGH', right: 'OFF' } };
  const dc = cockpitVisualState(systems);
  assert.equal(dc.displaysPowered, true);
  assert.equal(dc.beacon, true);
  assert.equal(dc.panel, true);
  assert.equal(dc.taxi, false);
  assert.equal(dc.leftWiper, false);
  const ac = cockpitVisualState({ ...systems, electrical: { dcVolts: 28, acVolts: 115 } });
  assert.equal(ac.taxi, true);
  assert.equal(ac.landing, true);
  assert.equal(ac.leftWiper, true);
  assert.equal(ac.rightWiper, false);
});
test('precipitation limits visibility with heavier snow causing more obstruction', () => {
  assert.equal(cockpitVisualState({}, {}).intensity, 0);
  assert.equal(cockpitVisualState({}, {}).visibilityLimit, Infinity);
  const rain = cockpitVisualState({}, { weatherCode: 63, precipitation: 3 });
  const snow = cockpitVisualState({}, { weatherCode: 75, precipitation: 5 });
  assert.ok(rain.intensity > 0);
  assert.equal(snow.snow, true);
  assert.ok(snow.visibilityLimit < rain.visibilityLimit);
});
test('local solar time accounts for longitude and Zulu selection', () => {
  const noon = new Date('2026-03-21T12:00:00Z');
  assert.equal(daylightFactor(noon, 0, 0), 1);
  assert.equal(daylightFactor(noon, 0, 180), 0);
  assert.equal(parseZuluTime('08:30Z').getUTCHours(), 8);
  assert.equal(parseZuluTime('08:30Z').getUTCMinutes(), 30);
});
