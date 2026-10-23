import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIALS_BY_ID } from '../src/data/tutorialCatalog.js';
import { CHALLENGES_BY_ID } from '../src/data/challengeCatalog.js';
import { normalizeVisibilityM } from '../src/utils/outsideVisibility.js';

test('radio lesson stays unavailable while its required ATC panel is absent', () => {
  const lesson = TUTORIALS_BY_ID['radio-communications'];
  assert.equal(lesson.available, false);
  assert.ok(lesson.unavailableReason);
});

test('instrument landing challenges render with at most 100 meters visibility', () => {
  for (const id of ['ils-landing-check', 'manual-instrument-landing']) {
    const config = CHALLENGES_BY_ID[id].launchConfig;
    assert.equal(config.restrictions.instrumentsOnly, true);
    assert.equal(normalizeVisibilityM(config.weatherData.visibility), 100);
  }
  assert.equal(CHALLENGES_BY_ID['manual-instrument-landing'].launchConfig.restrictions.autopilotForbidden, true);
});

test('outside visibility accepts low visibility in kilometers and meters', () => {
  assert.equal(normalizeVisibilityM(0.05), 50);
  assert.equal(normalizeVisibilityM(100), 100);
  assert.equal(normalizeVisibilityM(10), 10000);
  assert.equal(normalizeVisibilityM(undefined), 20000);
  assert.equal(normalizeVisibilityM(0), 1);
});


test('all engine failure uses bundled airports and valid runway selections', async () => {
  const { default: database } = await import('../src/data/airportDatabase.json', { with: { type: 'json' } });
  const scenario = CHALLENGES_BY_ID['all-engines-fail'];
  for (const [code, runway] of [[scenario.departureCode, scenario.launchConfig.routeDetails.departureRunway],
    [scenario.arrivalCode, scenario.launchConfig.routeDetails.landingRunway]]) {
    const airport = database.airports.find(airport => airport.icao === code);
    assert.ok(airport, code);
    assert.ok(airport.runways.some(entry => entry.name.split('/').includes(runway)), runway);
  }
});
