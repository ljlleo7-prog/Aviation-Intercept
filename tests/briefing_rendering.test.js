import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { CinematicReview } from './src/components/CinematicComponents.jsx';
    import { LanguageProvider } from './src/contexts/LanguageContext.jsx';
    export const render = props => renderToStaticMarkup(<LanguageProvider><CinematicReview {...props}/></LanguageProvider>);
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent'
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);

test('briefing weather and risk labels and values render in both languages', () => {
  const originalWindow = globalThis.window;
  try {
    for (const language of ['en', 'zh']) {
      globalThis.window = { localStorage: { getItem: () => language } };
      const html = module.exports.render({
        weatherData: { windSpeed: 23, visibility: 4000, cloudCover: 85, turbulence: 0.5, source: 'live' },
        difficulty: 'rookie', failureType: 'random', failureSelection: { mode: 'normal' }
      });
      for (const text of language === 'zh'
        ? ['风速', '能见度', '云量', '中度', '难度', '菜鸟', '故障模式', '正常模拟', '实时天气', '4.0 公里']
        : ['WIND', 'VISIBILITY', 'CLOUD COVER', 'MODERATE', 'ROOKIE', 'FAILURE MODE', 'NORMAL SIMULATION', '4.0 KM']) {
        assert.ok(html.includes(text), text);
      }
      assert.doesNotMatch(html, /undefined|NaN|ui\.cinematic\./);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
