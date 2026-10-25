import test from 'node:test';
import assert from 'node:assert/strict';
let user = null; let requests = 0; let response = { status: 'ok', airports: [], billing: { chargedTokens: 0, creditsConsumed: 1 } };
globalThis.__mockCreateClient = () => ({
  auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }) },
  rpc: async () => { requests++; await new Promise(resolve => setTimeout(resolve, 5)); return { data: response }; }
});
const { callAipRpc } = await import('../src/services/aipRpcClient.js');

test('AIP cloud requests require authentication, preserve billing, coalesce and cache per user', async () => {
  assert.equal((await callAipRpc('search', {})).status, 'unauthenticated');
  assert.equal(requests, 0);
  user = 'first';
  const [first, shared] = await Promise.all([callAipRpc('search', {}), callAipRpc('search', {})]);
  assert.equal(requests, 1);
  assert.equal(first.billing.chargedTokens, 0);
  assert.equal(first.billing.creditsConsumed, 1);
  assert.equal(shared.billing.chargedTokens, 0);
  assert.equal(shared.billing.creditsConsumed, 0);
  assert.equal((await callAipRpc('search', {})).billing.chargedTokens, 0);
  user = 'second';
  await callAipRpc('search', {});
  assert.equal(requests, 2);
  response = { status: 'rate_limited', billing: { chargedTokens: 0 } };
  assert.equal((await callAipRpc('search', { query: 'new' })).status, 'rate_limited');
  assert.equal(requests, 3);
  response = { status: 'insufficient_tokens', billing: { chargedTokens: 0 } };
  assert.equal((await callAipRpc('search', { query: 'other' })).status, 'insufficient_tokens');
});
