import test from 'node:test';
import assert from 'node:assert/strict';
import { updateCockpitSmoke } from '../src/services/cockpitSmoke.js';
const engines = n1 => [{ state: { n1 } }, { state: { n1: 70 } }];
const systems = () => ({ fire: { eng1: true }, pressurization: {
  bleed1: true, bleed2: true, packL: true, packR: true, packLFlow: true, packRFlow: true, isolationValve: false,
} });

test('engine smoke needs an open bleed and a supplied pack on its side', () => {
  const state = systems();
  updateCockpitSmoke(state, engines(90), null, 20);
  assert.ok(state.cockpitSmoke.density > 0);
  state.pressurization.bleed1 = false;
  const old = state.cockpitSmoke.density;
  updateCockpitSmoke(state, engines(90), null, 20);
  assert.equal(state.cockpitSmoke.transportedRate, 0);
  assert.ok(state.cockpitSmoke.density > 0 && state.cockpitSmoke.density < old);
  assert.equal(state.fire.eng1, true);
  assert.equal(state.cockpitSmoke.activeSourceCount, 1);
});
test('isolated clean pack cannot carry smoke from the other duct; crossfeed can', () => {
  const state = systems(); state.pressurization.packL = false;
  updateCockpitSmoke(state, engines(90), null, 10);
  assert.equal(state.cockpitSmoke.density, 0);
  state.pressurization.isolationValve = true;
  updateCockpitSmoke(state, engines(90), null, 10);
  assert.ok(state.cockpitSmoke.density > 0);
});
test('less N1 can make smoke fade while the fire remains active', () => {
  const state = systems();
  updateCockpitSmoke(state, engines(95), null, 60);
  const dense = state.cockpitSmoke.density;
  updateCockpitSmoke(state, engines(5), null, 60);
  assert.ok(state.cockpitSmoke.density < dense);
  assert.ok(state.cockpitSmoke.transportedRate > 0);
  assert.equal(state.fire.eng1, true);
});
test('direct cockpit and nearby electrical smoke does not require bleed or packs', () => {
  const state = { fire: { cockpit: true }, pressurization: {} };
  updateCockpitSmoke(state, [], null, 10);
  const initial = state.cockpitSmoke.density;
  assert.ok(initial > 0);
  state.fire.cockpit = false;
  updateCockpitSmoke(state, [], null, 20);
  assert.ok(state.cockpitSmoke.density > 0 && state.cockpitSmoke.density < initial);
  const failures = new Map([['electrical_fire', { id: 'electrical_fire', currentStage: 'active' }]]);
  updateCockpitSmoke(state, [], failures, 10);
  assert.ok(state.cockpitSmoke.directRate > 0);
});
test('extinguished sources stop smoke production without instantly clearing existing haze', () => {
  const state = systems();
  updateCockpitSmoke(state, engines(80), null, 30);
  const previous = state.cockpitSmoke.density;
  state.fire.eng1 = false;
  updateCockpitSmoke(state, engines(80), null, 1);
  assert.equal(state.cockpitSmoke.transportedRate, 0);
  assert.ok(state.cockpitSmoke.density < previous && state.cockpitSmoke.density > previous * .9);
});
test('smoke respects pauses and integrates consistently at different update rates', () => {
  const coarse = systems(); const fine = systems();
  updateCockpitSmoke(coarse, engines(60), null, 30);
  for (let i = 0; i < 300; i++) updateCockpitSmoke(fine, engines(60), null, .1);
  assert.ok(Math.abs(coarse.cockpitSmoke.density - fine.cockpitSmoke.density) < 1e-10);
  const previous = fine.cockpitSmoke.density;
  updateCockpitSmoke(fine, engines(60), null, 0);
  assert.equal(fine.cockpitSmoke.density, previous);
});

test('APU and burning pack contamination stop at their isolation controls', () => {
  const state = systems(); state.fire = { apu: true };
  state.apu = { running: true, bleed: true, n2: 100 };
  updateCockpitSmoke(state, engines(0), null, 10);
  assert.ok(state.cockpitSmoke.transportedRate > 0);
  state.apu.bleed = false;
  updateCockpitSmoke(state, engines(0), null, 10);
  assert.equal(state.cockpitSmoke.transportedRate, 0);
  assert.equal(state.fire.apu, true);
  state.fire = { packL: true }; state.pressurization.packL = false;
  updateCockpitSmoke(state, engines(0), null, 10);
  assert.equal(state.cockpitSmoke.transportedRate, 0);
  state.pressurization.packL = true;
  updateCockpitSmoke(state, engines(0), null, 10);
  assert.ok(state.cockpitSmoke.transportedRate > 0);
});

test('removing an electrical fire source lets its haze disperse without a visual reset', () => {
  const state = { fire: {}, pressurization: {} };
  const failures = new Map([['electrical_fire', { id: 'electrical_fire', currentStage: 'active' }]]);
  updateCockpitSmoke(state, [], failures, 20);
  const initial = state.cockpitSmoke.density;
  failures.clear();
  updateCockpitSmoke(state, [], failures, 20);
  assert.equal(state.cockpitSmoke.directRate, 0);
  assert.ok(state.cockpitSmoke.density > 0 && state.cockpitSmoke.density < initial);
});

test('small continuous smoke input accumulates at the normal physics update rate', () => {
  const state = systems();
  // A spooling-down engine can still supply smoke through a live manifold.
  for (let i = 0; i < 500; i++) updateCockpitSmoke(state, engines(5), null, .02);
  assert.ok(state.cockpitSmoke.density > .01, 'Small per-tick doses must not be rounded away');
  assert.equal(state.fire.eng1, true);
});
