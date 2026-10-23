import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import CrashWarningFlash from './src/components/CrashWarningFlash.jsx';
    import ReplicaAlertButton from './src/components/ReplicaAlertButton.jsx';
    import B737FirePanel from './src/components/B737FirePanel.jsx';
    import B737EnginePanel from './src/data/aircraft/b738/eicasPanel.jsx';
    import { AircraftPanelGraphic } from './previews/main-panel-replicas.jsx';
    import { Replica } from './previews/737-main-panel-replica.jsx';
    import { LanguageProvider } from './src/contexts/LanguageContext.jsx';
    export const overlay = props => renderToStaticMarkup(<CrashWarningFlash {...props}/>);
    export const button = props => ReplicaAlertButton(props);
    export const fire = props => renderToStaticMarkup(<B737FirePanel {...props}/>);
    export const engine = data => renderToStaticMarkup(<B737EnginePanel flightState={data}/>);
    export const panel = (key, data) => renderToStaticMarkup(<LanguageProvider>{key === '737' ? <Replica instrumentData={data}/> : <AircraftPanelGraphic modelKey={key} instrumentData={data}/>}</LanguageProvider>);
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = module.exports;
const warnings = [{ id: 'FIRE_ENG1', level: 'CRITICAL', message: 'ENGINE 1 FIRE' }];

test('overlay retains hazards after acknowledgement and clears resolved messages', async () => {
  const hazard = { id: 'GPWS_PULL_UP', level: 'CRITICAL', message: 'PULL UP', acknowledged: true };
  assert.match(render.overlay({ warnings: [hazard, ...warnings] }), /PULL UP/);
  assert.equal(render.overlay({ warnings: warnings.map(w => ({ ...w, acknowledged: true })) }), '');
  assert.equal(render.overlay({ warnings: [] }), '');
  const css = await readFile(new URL('../src/components/CrashWarningFlash.css', import.meta.url), 'utf8');
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /user-select:\s*none/);
  assert.match(css, /-webkit-user-select:\s*none/);
});

test('737 fire and caution buttons dispatch distinct acknowledgements with keyboard support', () => {
  const calls = [];
  const data = { alertState: { fire: true, caution: true }, onAutopilotAction: (...args) => calls.push(args) };
  render.button({ x: 0, y: 0, label: 'FIRE|WARN', group: 'fire', data }).props.onClick();
  let prevented = false;
  render.button({ x: 0, y: 0, label: 'MASTER|CAUTION', group: 'caution', data }).props.onKeyDown({ key: ' ', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(calls, [
    ['system-action', { system: 'alerts', action: 'fire' }],
    ['system-action', { system: 'alerts', action: 'caution' }],
  ]);
});

test('all supported ECAM/EICAS replicas display the same active fault without canned faults', () => {
  for (const key of ['747', '757', '777', '320', '340', '350', '380']) {
    const html = render.panel(key, { warnings, alertState: { fire: true } });
    assert.match(html, /ENGINE 1 FIRE/, key);
    assert.doesNotMatch(html, /ENG 1 OIL FILTER|PACK L/, key);
    assert.match(html, /Acknowledge/, key);
  }
});

test('737 engine display has no EICAS message list; physical annunciators remain present', () => {
  assert.doesNotMatch(render.engine({ activeWarnings: warnings }), /ENGINE 1 FIRE|NORMAL/);
  const html = render.panel('737', { warnings, alertState: { fire: true, annunciators: ['OVHT/DET'] } });
  assert.match(html, /Acknowledge FIRE WARN/);
  assert.match(html, /system annunciators recall/);
  assert.match(html, /OVHT\/DET/);
});

test('737 fire panel requires pull before discharge and marks shared bottles spent', () => {
  const stowed = render.fire({ fire: { bottle1: 100, bottle2: 100, apuBottle: 100 } });
  assert.match(stowed, /disabled="" aria-label="ENG 1 discharge bottle 1"/);
  const pulled = render.fire({ fire: { eng1: true, eng1Handle: true, bottle1: 0, bottle2: 100, apuBottle: 100 } });
  assert.match(pulled, /fire-detected/);
  assert.match(pulled, /disabled="" aria-label="ENG 1 discharge bottle 1"/);
  assert.doesNotMatch(pulled, /disabled="" aria-label="ENG 1 discharge bottle 2"/);
  assert.match(pulled, /BTL 1: DISCH/);
});
