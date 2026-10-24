import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import CockpitPilotControls from './src/components/CockpitPilotControls.jsx';
    export const render = (state, isAirbus = false) => renderToStaticMarkup(
      <CockpitPilotControls flightState={state} isAirbus={isAirbus} onAction={() => {}} overlay />);
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent'
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = module.exports.render;

test('both linked yokes and pedals render the actual slow or jammed control position', () => {
  const html = render({ controlFeedback: { mechanical: true }, controls: { pitch: -0.15 * 25 * Math.PI / 180, roll: 0.15 * 30 * Math.PI / 180, yaw: 0.5 * 30 * Math.PI / 180 } });
  assert.equal((html.match(/translate\(0 7.5\) rotate\(20 100 80\)/g) || []).length, 2);
  assert.equal((html.match(/translateY\(4.5px\)/g) || []).length, 2);
  assert.equal((html.match(/translateY\(-4.5px\)/g) || []).length, 2);
});

test('unlinked sidesticks do not follow jammed surface deflection', () => {
  const html = render({ controlFeedback: { mechanical: false }, controls: { pitch: 0.3, roll: 0.3 } }, true);
  assert.match(html, /rotateX\(0deg\) rotateZ\(0deg\)/);
  assert.doesNotMatch(html, /rotateX\(-24deg\) rotateZ\(20deg\)/);
});

test('unlinked yokes also remain independent of failed surface position', () => {
  const html = render({ controlFeedback: { mechanical: false }, controls: { pitch: 0.3, roll: 0.3 } });
  assert.match(html, /translate\(0 0\) rotate\(0 100 80\)/);
});

test('a disengaged autopilot status object does not disable cockpit input', () => {
  const html = render({ autopilot: { engaged: false }, controlFeedback: { mechanical: true }, controls: {} });
  assert.match(html, /aria-label="captain yoke: drag or use arrow keys" aria-disabled="false"/);
  assert.match(html, /tabindex="0"/);
});
