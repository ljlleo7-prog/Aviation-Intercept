import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDailyApiUsage } from '../src/utils/dailyApiUsage.js';
import { getOnlineMode, isOfflineMode, setOnlineMode, subscribeOnlineMode } from '../src/utils/appNetworkMode.js';

const now = Date.UTC(2026, 9, 25, 12);
const plan = { used: 1000, limit: 2000, resetsAt: '2026-10-26T00:00:00Z' };
test('daily FPS usage displays real allowance percentages without early rounding to full', () => {
  assert.equal(formatDailyApiUsage(plan, now).label, '50% daily');
  assert.equal(formatDailyApiUsage({ ...plan, used: 0 }, now).label, '0% daily');
  assert.equal(formatDailyApiUsage({ ...plan, used: 1999 }, now).label, '99.9% daily');
  assert.equal(formatDailyApiUsage({ ...plan, used: 1999 }, now).exhausted, false);
  assert.equal(formatDailyApiUsage({ ...plan, used: 2000 }, now).label, '100% daily');
  assert.equal(formatDailyApiUsage({ ...plan, used: 2000 }, now).exhausted, true);
});
test('unavailable or expired usage never displays a misleading zero percent', () => {
  for (const value of [null, {}, { ...plan, limit: 0 }, { ...plan, used: NaN }, { ...plan, used: -1 }, { ...plan, resetsAt: 'bad' }]) {
    assert.equal(formatDailyApiUsage(value, now).label, '—% daily');
  }
  assert.equal(formatDailyApiUsage(plan, Date.parse(plan.resetsAt)).label, '—% daily');
});
test('same-tab online mode changes notify the FPS tab even when storage is unavailable', () => {
  let changes = 0;
  setOnlineMode(false);
  const unsubscribe = subscribeOnlineMode(() => changes++);
  setOnlineMode(true); setOnlineMode(true);
  assert.equal(getOnlineMode(), true);
  assert.equal(isOfflineMode(), false);
  setOnlineMode(false);
  assert.equal(isOfflineMode(), true);
  assert.equal(changes, 2);
  unsubscribe();
});
