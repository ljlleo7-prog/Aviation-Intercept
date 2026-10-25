import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEnvironmentGateway, normalizeEnvironmentRequest, buildEnvironmentUrl } from '../supabase/functions/environment-api-gateway/handler.mjs';
import { createEnvironmentApiClient, environmentRequestFromUrl } from '../src/services/environmentApiClient.js';

const payload = overrides => ({ provider: 'open_elevation', operation: 'elevation', requestId: randomUUID(),
  locations: [{ latitude: 30, longitude: 120 }], ...overrides });
const request = body => new Request('https://example.test/functions/v1/environment-api-gateway', {
  method: 'POST', headers: { Authorization: 'Bearer verified-token' }, body: JSON.stringify(body)
});
function setup(overrides = {}) {
  const calls = [];
  const handler = createEnvironmentGateway({
    authenticate: async () => ({ id: 'verified-user' }),
    reserve: async (user, id, key, data) => { calls.push(['reserve', user, id, key, data]); return { status: 'reserved', billing: { chargedTokens: 0, creditsConsumed: 1 } }; },
    complete: async (user, id, result) => { calls.push(['complete', user, id, result]); return result; },
    fetchImpl: async (url, options) => { calls.push(['fetch', url, options]); return new Response(JSON.stringify({ results: [{ elevation: 123 }] })); },
    ...overrides
  });
  return { handler, calls };
}

test('gateway verifies identity and records credits before its only upstream call', async () => {
  const { handler, calls } = setup();
  const data = payload({ userId: 'forged-user', tokenCost: 0, url: 'http://localhost/private' });
  assert.equal((await (await handler(request(data))).json()).status, 'ok');
  assert.deepEqual(calls.map(row => row[0]), ['reserve', 'fetch', 'complete']);
  assert.equal(calls[0][1], 'verified-user');
  assert.equal(calls[0][4].tokenCost, undefined);
  assert.equal(new URL(calls[1][1]).hostname, 'api.open-elevation.com');
  assert.equal(calls[1][2].redirect, 'error');
});

test('unauthenticated, invalid, oversized, unconfigured and denied requests never reach providers', async () => {
  let providerCalls = 0;
  const fetchImpl = async () => { providerCalls++; throw new Error('Must not call provider'); };
  const { handler: unauthenticated } = setup({ fetchImpl, authenticate: async () => null });
  assert.equal((await unauthenticated(request(payload()))).status, 401);
  const { handler } = setup({ fetchImpl });
  for (const body of [payload({ provider: 'http://localhost' }), payload({ locations: Array(21).fill({ latitude: 0, longitude: 0 }) }),
    payload({ locations: [{ latitude: 91, longitude: 0 }] }), payload({ requestId: 'unsafe' }), payload({ extra: 'a'.repeat(17000) })]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  const { handler: unavailable } = setup({ fetchImpl, reserve: async () => { throw new Error('DB down'); } });
  assert.equal((await unavailable(request(payload()))).status, 503);
  for (const status of ['insufficient_tokens', 'budget_exhausted', 'user_limit_reached', 'daily_limit_reached', 'pending']) {
    const { handler: denied } = setup({ fetchImpl, reserve: async () => ({ status }) });
    assert.equal((await (await denied(request(payload()))).json()).status, status);
  }
  assert.equal(providerCalls, 0);
});

test('server cache hits and idempotent replay bypass upstream entirely', async () => {
  const { handler, calls } = setup({ reserve: async () => ({ status: 'ok', cached: true, data: { results: [] }, billing: { chargedTokens: 0 } }) });
  const response = await (await handler(request(payload()))).json();
  assert.equal(response.billing.chargedTokens, 0);
  assert.equal(calls.length, 0);
});

test('429 Retry-After and malformed upstream data are persisted as failures, with no free retry', async () => {
  const limited = setup({ fetchImpl: async () => new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }) });
  const response = await (await limited.handler(request(payload()))).json();
  assert.equal(response.status, 'provider_rate_limited');
  assert.equal(response.retryAfterSeconds, 120);
  const malformed = setup({ fetchImpl: async () => new Response(JSON.stringify({ results: [{ elevation: null }] })) });
  assert.equal((await (await malformed.handler(request(payload()))).json()).status, 'provider_failed');
  assert.equal(malformed.calls.filter(row => row[0] === 'complete').length, 1);
});

test('weather endpoints and sample counts are allowlisted on the server', () => {
  const data = normalizeEnvironmentRequest(payload({ provider: 'open_meteo', operation: 'weather_radar' }));
  const url = new URL(buildEnvironmentUrl(data));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('current'), 'cloud_cover,precipitation');
  assert.throws(() => normalizeEnvironmentRequest(payload({ provider: 'open_meteo', operation: 'elevation' })));
});

test('client fails closed without backend/auth, respects offline mode, and never fetches providers directly', async () => {
  const url = 'https://api.open-elevation.com/api/v1/lookup?locations=30,120';
  const unavailable = createEnvironmentApiClient({ client: async () => null, offline: () => false });
  assert.equal((await unavailable(url)).status, 503);
  let invokes = 0;
  const mock = { auth: { getSession: async () => ({ data: { session: null } }) }, functions: { invoke: async () => { invokes++; } } };
  const unauthenticated = createEnvironmentApiClient({ client: async () => mock, offline: () => false });
  assert.equal((await unauthenticated(url)).status, 401);
  assert.equal(invokes, 0);
  const offline = createEnvironmentApiClient({ client: async () => { throw new Error('Must not connect'); }, offline: () => true });
  assert.equal((await offline(url)).status, 503);
  assert.throws(() => environmentRequestFromUrl('https://attacker.test/private'));
});

test('authenticated client invokes only gateway and preserves billing denials as cooldown responses', async () => {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=cloud_cover,precipitation';
  let result = { status: 'ok', data: { current: { cloud_cover: 80, precipitation: 2 } } };
  const client = createEnvironmentApiClient({ offline: () => false, requestId: randomUUID, client: async () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) },
    functions: { invoke: async (name, options) => {
      assert.equal(name, 'environment-api-gateway');
      assert.equal(options.body.provider, 'open_meteo');
      assert.equal(options.body.operation, 'weather_radar');
      assert.ok(options.body.requestId);
      assert.equal(options.body.userId, undefined);
      return { data: result };
    } }
  }) });
  assert.equal((await (await client(url)).json()).current.precipitation, 2);
  result = { status: 'insufficient_tokens' };
  assert.equal((await client(url)).status, 402);
  result = { status: 'budget_exhausted', retryAfterSeconds: 300 };
  const response = await client(url);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '300');
  result = { status: 'daily_limit_reached', retryAfterSeconds: 3600 };
  const dailyLimit = await client(url);
  assert.equal(dailyLimit.status, 429);
  assert.equal(dailyLimit.headers.get('Retry-After'), '3600');
});
