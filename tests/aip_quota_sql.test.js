import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const modulePath = process.env.AIP_TEST_PGLITE_MODULE;
test('AIP quota migration charges atomically and blocks access bypasses', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  try {
    await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table wallets(id uuid default gen_random_uuid(), user_id uuid, token_balance integer);
    create table ledger_entries(user_id uuid, amount integer,currency text, operation_type text,description text);
    create table skylinetragedy_aip_test(id integer);
    grant select on skylinetragedy_aip_test to anon,authenticated;
    `);
    await db.exec(readFileSync('supabase/migrations/20260519_route_api_limits.sql','utf8'));
    const signatures = [
    ['search_airports','text, integer, boolean'],['airports_within_radius','numeric,numeric,numeric,integer'],['airport_details','text'],['nearest_navaids','numeric,numeric,numeric,integer'],['nearest_suitable_airports','numeric,numeric,text,numeric,numeric,integer'],['search_aip_route','text,text,text,text,integer']];
    for (const [name,args] of signatures) await db.exec(`create function skylinetragedy_${name}(${args}) returns jsonb language sql as $$ select '{"status":"ok"}'::jsonb $$;`);
    await db.exec(readFileSync('supabase/migrations/20261021000000_meter_aip_rpc.sql','utf8'));
    const user='11111111-1111-1111-1111-111111111111';
    await db.exec(`insert into wallets(user_id,token_balance) values('${user}',20); set request.jwt.claim.sub='${user}'; set role authenticated;`);
    const calls = [
      `skylinetragedy_search_airports('JFK',5,true)`,
      `skylinetragedy_airports_within_radius(40,-73,100,5)`,
      `skylinetragedy_airport_details('KJFK')`,
      `skylinetragedy_nearest_navaids(40,-73,100,5)`,
      `skylinetragedy_nearest_suitable_airports(40,-73,'Medium',5000,150,5)`,
      `skylinetragedy_search_aip_route('KJFK','KLAX','*','2605',1)`
    ];
    for(let i=1;i<=10;i++) {
     const {rows:[{value}]}=await db.query(`select ${calls[(i - 1) % calls.length]} as value`);
     assert.equal(value.status,'ok'); assert.equal(value.billing.chargedTokens,1); assert.equal(value.billing.callCount,i);
    }
    let {rows:[{value}]}=await db.query(`select skylinetragedy_airport_details('KLAX') as value`);
    assert.equal(value.status,'rate_limited'); assert.equal(value.billing.chargedTokens,0);
    for(const sql of [`select reserve_route_api_call('${user}',1000,1,'bypass')`,`select * from skylinetragedy_aip_test`,`select aip_private.skylinetragedy_airport_details('KLAX')`]) await assert.rejects(db.query(sql),/permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query('select token_balance from wallets')).rows[0].token_balance,10);
    assert.equal((await db.query('select count(*)::int as count from ledger_entries')).rows[0].count,10);
    await db.exec(`delete from route_api_call_limits; update wallets set token_balance=0; set role authenticated;`);
    ({rows:[{value}]}=await db.query(`select skylinetragedy_airport_details('KLAX') as value`));
    assert.equal(value.status,'insufficient_tokens'); assert.equal(value.billing.chargedTokens,0);
    await db.exec(`reset role; update wallets set token_balance=5;
    create or replace function aip_private.skylinetragedy_airport_details(text) returns jsonb language plpgsql as $$ begin raise exception 'fixture lookup failure'; end; $$;
    set role authenticated;`);
    await assert.rejects(db.query(`select skylinetragedy_airport_details('KLAX')`), /fixture lookup failure/);
    await db.exec('reset role');
    assert.equal((await db.query('select token_balance from wallets')).rows[0].token_balance,5);
    assert.equal((await db.query('select count(*)::int as count from ledger_entries')).rows[0].count,10);
    await db.exec('set role anon');
    await assert.rejects(db.query(`select skylinetragedy_airport_details('KLAX')`),/permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query('select call_count from route_api_call_limits')).rows[0].call_count,0);
  } finally { await db.close(); }
});
