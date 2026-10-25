import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEnvironmentGateway } from '../supabase/functions/environment-api-gateway/handler.mjs';
import { createEnvironmentApiClient } from '../src/services/environmentApiClient.js';
import { getEffectiveRadarPreferences, setGuestApiAccess } from '../src/utils/apiAccessMode.js';

test('unsigned clients can request weather only, and offline mode still blocks weather', async () => {
  let calls = 0;
  const client = createEnvironmentApiClient({ offline: () => false, requestId: randomUUID, client: async () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async (_name, options) => {
      calls++;
      assert.equal(options.body.provider, 'open_meteo');
      assert.equal(options.headers.Authorization, '');
      return { data: { status: 'ok', data: { current: { cloud_cover: 80 } }, guest: true } };
    } }
  }) });
  assert.equal((await client('https://api.open-elevation.com/api/v1/lookup?locations=30,120')).status, 401);
  assert.equal(calls, 0);
  assert.equal((await client('https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=cloud_cover,precipitation')).status, 200);
  assert.equal(calls, 1);
  const offline = createEnvironmentApiClient({ offline: () => true, client: async () => assert.fail('Offline weather must not connect') });
  assert.equal((await offline('https://api.open-meteo.com/v1/forecast')).status, 503);
});

test('public gateway forces coarse weather coordinates and never invokes account credit reservations', async () => {
  const calls = [];
  const handler = createEnvironmentGateway({
    authenticate: async () => null,
    identifyGuest: async () => 'hashed-ip',
    reserve: async () => assert.fail('Guests cannot reserve account credits'),
    complete: async () => assert.fail('Guests cannot write account consumption'),
    reserveGuest: async () => ({ status: 'reserved', billing: { chargedTokens: 0, creditsConsumed: 0 } }),
    completeGuest: async (_key, _id, _fingerprint, result) => result,
    fetchImpl: async url => {
      calls.push(new URL(url));
      return new Response(JSON.stringify({ current: { temperature_2m: 20, relative_humidity_2m: 60,
        cloud_cover: 80, precipitation: 1, pressure_msl: 1013, wind_speed_10m: 10, wind_direction_10m: 90 } }));
    }
  });
  const request = (provider, operation) => new Request('https://test/gateway', { method: 'POST', body: JSON.stringify({
    provider, operation, requestId: randomUUID(), locations: [{ latitude: 30.001, longitude: 120.002 }]
  }) });
  const weather = await (await handler(request('open_meteo', 'weather_radar'))).json();
  assert.equal(weather.status, 'ok');
  assert.equal(calls[0].searchParams.get('latitude'), '30.125');
  assert.equal(calls[0].searchParams.get('longitude'), '120.125');
  assert.ok(calls[0].searchParams.get('current').includes('temperature_2m'));
  assert.equal((await handler(request('open_elevation', 'elevation'))).status, 401);
  assert.equal(calls.length, 1);
});

test('guest sampling ignores finer saved settings and restores preferences after login', () => {
  setGuestApiAccess(true);
  const guest = getEffectiveRadarPreferences();
  assert.equal(guest.weatherSpacing, 0.25);
  assert.equal(guest.weatherInterval, 60);
  assert.equal(guest.weatherRange, 20);
  setGuestApiAccess(false);
  assert.equal(getEffectiveRadarPreferences().weatherSpacing, 0.05);
});
