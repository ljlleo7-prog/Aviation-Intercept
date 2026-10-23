import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Render the actual JSX instruments, including their SVG switch and command bars.
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { Replica } from './previews/737-main-panel-replica.jsx';
      import { LanguageProvider } from './src/contexts/LanguageContext.jsx';
      export const render = data => renderToStaticMarkup(<LanguageProvider><Replica instrumentData={data}/></LanguageProvider>);
    `
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent'
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = module.exports.render;

test('737 FD switch points down when off and up when on; command bars follow actual enable state', () => {
  const off = render({ pitch: 0, roll: 0, flightDirector: { enabled: false }, labels: { flightDirector: 'Flight director' } });
  const on = render({ pitch: 0, roll: 0, flightDirector: { enabled: true, targetPitch: 5, targetRoll: 10 }, labels: { flightDirector: 'Flight director' } });
  const switchMarkup = html => html.match(/<g[^>]*aria-label="Flight director"[^>]*>([\s\S]*?)<\/g>/)?.[0];
  assert.match(switchMarkup(off), /aria-checked="false"/);
  assert.match(switchMarkup(off), /d="M0 -1 2 7"/);
  assert.match(switchMarkup(on), /aria-checked="true"/);
  assert.match(switchMarkup(on), /d="M0 1 2-7"/);
  assert.doesNotMatch(off, /aria-label="Flight director pitch and roll commands"/);
  assert.match(on, /aria-label="Flight director pitch and roll commands"/);
});

test('replica PFD renders live ILS diamonds, dot scales and translated accessible labels', () => {
  const html = render({
    pitch: 0, roll: 0, approachSelected: true,
    ils: { active: true, locDeviationDeg: 1, gsDeviationDeg: -.2 },
    labels: { guidance: '仪表着陆系统进近指引', localizer: '航向道偏差', glideslope: '下滑道偏差' }
  });
  assert.match(html, /aria-label="航向道偏差"/);
  assert.match(html, /aria-label="下滑道偏差"/);
  assert.match(html, /class="pfd-approach-guidance"/);
  assert.match(html, /cx="35" cy="86"/);
});
