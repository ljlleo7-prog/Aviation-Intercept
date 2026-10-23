import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGroundPackage } from '../src/services/airportGroundPackages.js';
import { airportService } from '../src/services/airportService.js';
import { getVisualRunwayGeometry, getSourcedRunwayNames } from '../src/data/visualRunwayCoordinates.js';
import { canonicalAirportCode } from '../src/utils/airportGroundCoordinates.js';
import sceneryRunways from '../src/data/sceneryRunways.js';

const airports = { LAX: 'KLAX', HKG: 'VHHH', PVG: 'ZSPD', CAN: 'ZGGG', PEK: 'ZBAA', ATL: 'KATL', LGA: 'KLGA', LHR: 'EGLL', SIN: 'WSSS', DXB: 'OMDB' };
for (const [iata, code] of Object.entries(airports)) {
  test(`${iata} publishes valid bounded sourced scenery and attributed extract`, async () => {
    const layout = JSON.parse(await readFile(new URL(`../public/scenery/airports/${code}.json`, import.meta.url), 'utf8'));
    const source = JSON.parse(await readFile(new URL(`../public/scenery/airports/sources/${code}.osm.json`, import.meta.url), 'utf8'));
    assert.ok(validateGroundPackage(layout, code));
    assert.equal(canonicalAirportCode(` ${iata.toLowerCase()} `), code);
    assert.equal(layout.provenance.licence, 'ODbL-1.0');
    assert.ok(layout.provenance.sourceTimestamp);
    assert.ok(source.elements.length > 0);
    assert.ok(layout.visualAlignment.maxResidualM <= 20);
    const names = getSourcedRunwayNames(code);
    assert.equal(new Set(names).size, names.length, 'no duplicate displaced-threshold strips');
    assert.equal(names.length, layout.qualityReport.runways);
    if (!sceneryRunways[code]) return;
    const airport = airportService.getAirportByCode(iata);
    assert.ok(airport, 'available for route selection and diversion search');
    assert.deepEqual(airport.runways.map(runway => runway.name), names);
    for (const pair of names) {
      const [first, second] = pair.split('/');
      const forward = getVisualRunwayGeometry(iata, first, null);
      const reverse = getVisualRunwayGeometry(code, second, null);
      assert.deepEqual(forward.thresholdStart, reverse.thresholdEnd);
      assert.deepEqual(forward.thresholdEnd, reverse.thresholdStart);
      const labelError = Math.abs(((forward.heading - Number(first.slice(0, 2)) * 10 + 540) % 360) - 180);
      assert.ok(labelError < 45, 'runway end must face its labelled direction');
      assert.deepEqual(airportService.getRunwayGeometry(iata, first).thresholdStart, forward.thresholdStart,
        'physics spawn and scenery use the same coordinates');
      assert.equal(forward.thresholdStart.elevation, airport.elevation);
      assert.ok(forward.width >= 15 && forward.width <= 100, 'width units must be meters');
    }
  });
}
