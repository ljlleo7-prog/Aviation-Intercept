import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import RealisticFlightPhysicsService from '../src/services/RealisticFlightPhysicsService.js';

// Exercise the real hook mapping and overlay together, with React performing
// the state updates. Component-only tests cannot catch dropped physics fields.
const compiled = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import { useRef } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { useFlightState } from './src/hooks/useFlightState.js';
    import CrashWarningFlash from './src/components/CrashWarningFlash.jsx';
    function Probe({ snapshots, service, capture }) {
      const { flightData, updateFromPhysics } = useFlightState();
      const index = useRef(0);
      if (index.current < snapshots.length) updateFromPhysics(snapshots[index.current++], service);
      capture(flightData);
      return <CrashWarningFlash warnings={flightData.alertState?.visualWarnings ?? flightData.activeWarnings} crashWarning={flightData.crashWarning}/>;
    }
    export function deliver(snapshots, service) {
      let data;
      const html = renderToStaticMarkup(<Probe snapshots={snapshots} service={service} capture={value => { data = value; }}/>);
      return { html, data };
    }
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent',
});
const require = createRequire(import.meta.url);
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
const { deliver } = module.exports;
const aircraft = require('../src/data/aircraftDatabase.json').aircraft[0];

const createDivingAircraft = () => {
  const service = new RealisticFlightPhysicsService(aircraft);
  service.onGround = false;
  service.groundMode = false;
  service.currentGroundZ = 0;
  service.state.pos.z = -300 / 3.28084;
  service.state.vel.set(100, 0, 30);
  return service;
};

test('fast descent near the ground reaches the cockpit as a visible PULL UP alert', () => {
  const service = createDivingAircraft();
  const snapshot = service.getOutputState();
  assert.ok(snapshot.verticalSpeed < -5000);
  assert.ok(snapshot.activeWarnings.some(w => w.id === 'GPWS_PULL_UP'));
  const { html, data } = deliver([snapshot], service);
  assert.strictEqual(data.alertState, snapshot.alertState);
  assert.deepEqual(data.activeWarnings, snapshot.activeWarnings);
  assert.match(html, /PULL UP/);
});

test('acknowledged fire state and crash warnings survive the flight-state adapter', () => {
  const service = createDivingAircraft();
  service.systems.fire.eng1 = true;
  service.getOutputState();
  service.performSystemAction('alerts', 'fire');
  const snapshot = service.getOutputState();
  const { data } = deliver([{ ...snapshot, crashWarning: 'GROUND IMPACT' }], service);
  assert.equal(data.alertState.fire, false);
  assert.equal(data.activeWarnings.find(w => w.id === 'FIRE_ENG1').acknowledged, true);
  assert.equal(data.crashWarning, 'GROUND IMPACT');
  assert.match(deliver([{ ...snapshot, crashWarning: 'GROUND IMPACT' }], service).html, /GROUND IMPACT/);
});

test('cleared and missing alert fields remove stale visual warnings on subsequent updates', () => {
  const service = createDivingAircraft();
  const diving = service.getOutputState();
  const clear = { ...diving, activeWarnings: [], alertState: { warnings: [], visualWarnings: [], fire: false, caution: false, warning: false }, crashWarning: null };
  assert.equal(deliver([diving, clear], service).html, '');
  const missing = { ...clear };
  delete missing.activeWarnings;
  delete missing.alertState;
  delete missing.crashWarning;
  const { data, html } = deliver([diving, missing], service);
  assert.deepEqual(data.activeWarnings, []);
  assert.equal(data.alertState, null);
  assert.equal(data.crashWarning, null);
  assert.equal(html, '');
});
