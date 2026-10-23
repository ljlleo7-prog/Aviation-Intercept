import test from 'node:test';
import assert from 'node:assert/strict';
import { getMapAirports, getMapAircraft, isAirportSuitableForMap } from '../src/services/airportMapData.js';

const medium = { takeoffDistance: 2000, landingDistance: 1500, maxTakeoffWeight: 79000, wingSpan: 35.8 };
const airport = (length = 8000, category = 'Medium', extra = {}) => ({
  icao: 'TEST', latitude: 0, longitude: 0, runways: [{ name: '09/27', length, category }], ...extra
});

test('map suitability requires a real runway with enough length and category on the same runway', () => {
  assert.equal(isAirportSuitableForMap(airport(), medium), true);
  for (const value of [null, {}, airport(0), airport(null), airport('unknown'), airport(5000), airport(9000, 'Light'), airport(9000, 'Heavy', { category: '3C' })]) {
    assert.equal(isAirportSuitableForMap(value, medium), false);
  }
  assert.equal(isAirportSuitableForMap(airport(2000 / 0.3048), medium), true);
  assert.equal(isAirportSuitableForMap(airport(9000, '', { category: '4C' }), medium), true);
  assert.equal(isAirportSuitableForMap(airport(9000, '', { category: '4B' }), medium), false);
  assert.equal(isAirportSuitableForMap(airport(9000, '', { category: '4E' }), { ...medium, wingSpan: 79.8 }), false);
  assert.equal(isAirportSuitableForMap(airport(9000, '', { category: '4F' }), { ...medium, wingSpan: 79.8 }), true);
  assert.equal(isAirportSuitableForMap({ ...airport(), runways: [airport(4000, 'Heavy').runways[0], airport(10000, 'Light').runways[0]] }, medium), false);
  assert.equal(isAirportSuitableForMap({ ...airport(), runways: [{ length: 10000, closed: true }] }, medium), false);
  assert.equal(isAirportSuitableForMap({ runway: '09', runwayLength: 9000, category: '4C' }, medium), true);
  assert.equal(getMapAircraft('Boeing 737-800').icao, 'B738');
});

test('map filtering changes with aircraft and uses metres for aircraft performance and feet for runways', () => {
  const field = airport(8000, 'Medium');
  assert.equal(isAirportSuitableForMap(field, 'B738'), true);
  assert.equal(isAirportSuitableForMap(field, 'A388'), false);
  assert.equal(isAirportSuitableForMap(airport(12000, 'Heavy', { category: '4F' }), 'A388'), true);
  assert.equal(isAirportSuitableForMap(airport(12000, 'Heavy', { category: '4E' }), 'A388'), false);
});

test('indexed map query handles dateline, poles, exact radius and nearest marker cap', () => {
  const fields = [airport(8000, '', { icao: 'NEAR', longitude: 179.99 }), airport(8000, '', { icao: 'ACROSS', longitude: -179.99 }), airport(8000, '', { icao: 'FAR', longitude: -179.8 })];
  assert.deepEqual(getMapAirports(fields, 0, 179.99, 2, medium).map(item => item.icao), ['NEAR', 'ACROSS']);
  assert.equal(getMapAirports(fields, 0, 179.99, 2, medium, 1)[0].icao, 'NEAR');
  assert.equal(getMapAirports(fields, NaN, 0, 20, medium).length, 0);
  const polar = [airport(8000, '', { latitude: 89.99, longitude: 170 })];
  assert.equal(getMapAirports(polar, 89.99, 0, 2, medium).length, 1);
  fields.push(airport(9000, '', { icao: 'ADDED', longitude: 179.99 }));
  assert.equal(getMapAirports(fields, 0, 179.99, 2, medium).length, 3);
});

test('map query only checks runway suitability in nearby spatial cells', () => {
  let distantRunwayReads = 0;
  const distant = Array.from({ length: 10000 }, () => ({ latitude: 40, longitude: 40, get runways() { distantRunwayReads++; return []; } }));
  const fields = [airport(), ...distant];
  for (let i = 0; i < 3; i++) assert.equal(getMapAirports(fields, i * 0.01, 0, 20, medium).length, 1);
  assert.equal(distantRunwayReads, 0);
});
