import test from 'node:test';
import assert from 'node:assert/strict';
import { planMissionFuel, recommendCruiseAltitude, takeoffThrustFraction } from '../src/services/flightPerformancePlanning.js';
import { FADECService } from '../src/services/FADECService.js';
import EnginePhysicsService from '../src/services/EnginePhysicsService.js';
import aircraft from '../src/data/aircraft/b738/static.json' with { type: 'json' };

test('heavy payload raises climb and block fuel at the same altitude, and reports overload', () => {
  const light = planMissionFuel(aircraft, 600, 10000, 0.05, { cruiseAltitude: 33000 });
  const heavy = planMissionFuel(aircraft, 600, 20000, 0.05, { cruiseAltitude: 33000 });
  assert.ok(heavy.climbFuel > light.climbFuel);
  assert.ok(heavy.totalFuel > light.totalFuel);
  assert.ok(heavy.warnings.some(w => w.includes('Payload')));
  assert.ok(Math.abs(heavy.totalFuel - heavy.taxiFuel - heavy.tripFuel - heavy.reserveFuel) < 0.01);
  assert.ok(heavy.finalReserveFuel > 0);
});

test('route altitude scales from local flying to long haul and respects ceiling', () => {
  assert.equal(recommendCruiseAltitude(0, aircraft).recommended, 3000);
  assert.equal(recommendCruiseAltitude(25, aircraft).recommended, 5000);
  assert.ok(recommendCruiseAltitude(280, aircraft).recommended <= 27000);
  assert.ok(recommendCruiseAltitude(1600, aircraft).recommended >= 35000);
  assert.ok(recommendCruiseAltitude(10000, aircraft).max <= 41000);
  assert.ok(recommendCruiseAltitude(10000, { ...aircraft, serviceCeiling: 30000 }).max <= 30000);
});

test('cruise selection changes fuel and local flights still carry reserves', () => {
  assert.notEqual(planMissionFuel(aircraft, 600, 15000, 0.05, { cruiseAltitude: 20000 }).totalFuel,
    planMissionFuel(aircraft, 600, 15000, 0.05, { cruiseAltitude: 35000 }).totalFuel);
  assert.ok(planMissionFuel(aircraft, 0, 15000).totalFuel > 1000);
  assert.equal(planMissionFuel(aircraft, 1000, 15000, 0.05, { cruiseAltitude: 50000 }).cruiseAltitude, 41000);
  assert.equal(planMissionFuel(aircraft, 10000, 20000).feasible, false);
});

test('FLEX reduction shrinks with mass and TOGA always restores full rating', () => {
  const context = { mass: 55000, maxTakeoffWeight: 79000, ambientTemperature: 30 };
  const light = takeoffThrustFraction({ ...context, assumedTemperature: 65 });
  const heavy = takeoffThrustFraction({ ...context, mass: 78000, assumedTemperature: 65 });
  assert.ok(heavy > light);
  assert.equal(heavy, 1);
  assert.equal(takeoffThrustFraction({ ...context, assumedTemperature: 25 }), 1);
  const fadec = new FADECService('A320');
  fadec.setPerformanceContext(context);
  fadec.setFlexTemp(65);
  assert.ok(fadec.targetN1(0.75, 102) < 102);
  assert.equal(fadec.targetN1(1, 102), 102);
  fadec.setPerformanceContext({ ...context, mass: 79000 });
  assert.equal(fadec.targetN1(0.75, 102), 102);
});


test('full forward lever reaches rated thrust without engine-out boost and accepts Kelvin', () => {
  const settle = temperature => {
    const engine = new EnginePhysicsService({ maxThrust: 120000, maxN1: 102.7, operationalMaxN1: 98.4 });
    engine.setStartupState(false, false, true, true);
    for (let i = 0; i < 1000; i++) engine.update(0.05, 1, 0, 0, 1, temperature);
    return engine.state;
  };
  const celsius = settle(15);
  const kelvin = settle(288.15);
  assert.ok(celsius.n1 > 102.5);
  assert.ok(celsius.thrust > 119000);
  assert.ok(celsius.thrust <= 120001);
  assert.ok(Math.abs(celsius.n1 - kelvin.n1) < 0.01);
});
