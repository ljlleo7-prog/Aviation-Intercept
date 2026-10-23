import test from 'node:test';
import assert from 'node:assert/strict';
import AirportService from '../src/services/airportService.js';

test('selection includes every local airport type and prioritizes exact codes', () => {
  const service = new AirportService();
  service.allAirports = [
    { icao: 'OTHER', name: 'TEST vicinity', type: 'normal' },
    { icao: 'TEST', name: 'Emergency field', type: 'emergency' },
    { icao: 'TEST2', name: 'Scenery field', type: 'airport' }
  ];
  assert.deepEqual(service.searchAirports(' test ').map(a => a.icao), ['TEST', 'OTHER', 'TEST2']);
  assert.deepEqual(service.searchNormalAirports('test').map(a => a.icao), ['OTHER']);
  assert.equal(service.getAirportByCode(' test ').icao, 'TEST');
  assert.equal(service.getAirportByCode(''), undefined);
});

test('scenery airports without IATA codes remain distinct and selectable', () => {
  const service = new AirportService();
  service.allAirports = [{ icao: 'KEEP', name: 'Keep field' }];
  service.applySceneryReferences({ NEW: {
    airport: { icao: 'NEW', name: 'New field', type: 'normal' }, runways: []
  } });
  assert.equal(service.getAirportByCode('KEEP').name, 'Keep field');
  assert.equal(service.searchAirports('NEW')[0].icao, 'NEW');
});
