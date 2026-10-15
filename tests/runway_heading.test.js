import test from 'node:test';
import assert from 'node:assert/strict';
import AirportService from '../src/services/airportService.js';

const createService = (runways) => {
  const service = new AirportService();
  service.allAirports = [{ icao: 'TEST', iata: 'TST', latitude: 30, longitude: 120, runways }];
  return service;
};

for (const storedGeometry of [false, true]) {
  test(`authoritative bearings survive primary and reciprocal selection (${storedGeometry ? 'stored' : 'generated'} endpoints)`, () => {
    const endpoints = storedGeometry ? {
      startLatitude: 30, startLongitude: 120,
      endLatitude: 30.01, endLongitude: 120.02
    } : {};
    const service = createService([
      { name: '06/24', bearing: '64.7', length: 10000, ...endpoints },
      { name: '07/25', bearing: 64.7, length: 10000, ...endpoints }
    ]);
    for (const [primary, reciprocal] of [['06', '24'], ['07', '25']]) {
      const forward = service.getRunwayGeometry('TEST', primary);
      const reverse = service.getRunwayGeometry('TEST', reciprocal);
      assert.ok(Math.abs(forward.heading - 64.7) < 1e-10);
      assert.ok(Math.abs(reverse.heading - 244.7) < 1e-10);
      assert.deepEqual(forward.thresholdStart, reverse.thresholdEnd);
      assert.deepEqual(forward.thresholdEnd, reverse.thresholdStart);
    }
  });
}

test('missing or invalid bearings fall back to designators; zero is authoritative', () => {
  for (const bearing of [undefined, null, '', 'invalid']) {
    const service = createService([{ name: '07/25', bearing }]);
    assert.equal(service.getRunwayGeometry('TEST', '07').heading, 70);
    assert.equal(service.getRunwayGeometry('TEST', '25').heading, 250);
  }
  const service = createService([{ name: '01/19', bearing: 0 }]);
  assert.equal(service.getRunwayGeometry('TEST', '01').heading, 0);
  assert.equal(service.getRunwayGeometry('TEST', '19').heading, 180);
});
