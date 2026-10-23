import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const timeout = setTimeout(() => {
  console.error('AIP Supabase RPC smoke test timed out after 30s');
  process.exit(1);
}, 30_000);
timeout.unref?.();

dotenv.config({ path: path.join(rootDir, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.log('Skipping AIP Supabase RPC smoke test: Supabase env vars are not configured.');
  process.exit(0);
}

const anonymous = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonymousCheck = await anonymous.rpc('skylinetragedy_airport_details', { p_airport_code: 'KJFK' });
if (anonymousCheck.error?.code !== '42501' && anonymousCheck.data?.status !== 'unauthenticated') {
  throw new Error('Anonymous AIP access was not denied. Apply the AIP quota migration first.');
}
console.log('Anonymous AIP access denied.');
if (!process.env.AIP_TEST_ACCESS_TOKEN) {
  console.log('Skipping paid calls: AIP_TEST_ACCESS_TOKEN is not configured.');
  process.exit(0);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${process.env.AIP_TEST_ACCESS_TOKEN}` } }
});

const callRpc = async (name, params) => {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  if (!['ok', 'unavailable', 'rate_limited', 'insufficient_tokens'].includes(data?.status)) throw new Error(`${name}: unexpected status`);
  const charged = ['rate_limited', 'insufficient_tokens'].includes(data.status) ? 0 : 1;
  if (data.billing?.chargedTokens !== charged) throw new Error(`${name}: missing or incorrect billing`);
  console.log(`${name}: status=${data.status}, charged=${charged}`);
  return data;
};

await callRpc('skylinetragedy_search_aip_route', {
  p_departure_code: 'KJFK',
  p_arrival_code: 'KLAX',
  p_region_code: '*',
  p_aip_cycle: '2605',
  p_limit: 1
});

await callRpc('skylinetragedy_search_airports', {
  p_query: 'JFK',
  p_limit: 5,
  p_include_emergency: true
});

await callRpc('skylinetragedy_airports_within_radius', {
  p_latitude: 40.6413,
  p_longitude: -73.7781,
  p_radius_nm: 100,
  p_limit: 5
});

await callRpc('skylinetragedy_nearest_suitable_airports', {
  p_latitude: 40.6413,
  p_longitude: -73.7781,
  p_aircraft_category: 'Medium',
  p_min_runway_length_ft: 5000,
  p_radius_nm: 150,
  p_limit: 5
});

console.log('AIP Supabase RPC smoke test completed.');
