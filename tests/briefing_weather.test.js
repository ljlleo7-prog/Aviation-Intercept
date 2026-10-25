import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBriefingWeather } from '../src/services/briefingWeather.js';
import { formatBriefingWeather } from '../src/utils/briefingWeather.js';
import { RealWeatherService } from '../src/services/RealWeatherService.js';

const departure = { latitude: 0, longitude: 0 };
const generated = { windSpeed: 12, visibility: 8000, cloudCover: 60 };
const options = {
  offlineMode: false, season: 'summer', zuluTime: '2026-10-24T08:00:00Z',
  generateWeather: () => generated
};

test('briefing fetches departure weather online, including zero coordinates', async () => {
  const weather = await loadBriefingWeather(departure, {
    ...options, getWeather: async (lat, lon, { signal }) => {
      assert.equal(lat, 0);
      assert.equal(lon, 0);
      assert.ok(signal instanceof AbortSignal);
      return { windSpeed: 22, visibility: 4000, cloudCover: 85, turbulence: 0.5 };
    }
  });
  assert.equal(weather.windSpeed, 22);
  assert.equal(weather.source, 'live');
  assert.equal(weather.season, 'summer');
  assert.deepEqual(formatBriefingWeather(weather), {
    windSpeed: '22', visibilityKm: '4.0', cloudCover: '85', turbulenceKey: 'moderate'
  });
});

test('offline briefing generates local weather without any cloud request', async () => {
  const weather = await loadBriefingWeather(departure, {
    ...options, offlineMode: true,
    getWeather: () => assert.fail('Offline weather must not fetch')
  });
  assert.equal(weather.source, 'simulated');
  assert.equal(weather.cloudCover, 60);
});

test('network errors and service fallbacks use clearly marked simulated weather', async () => {
  for (const getWeather of [async () => { throw new Error('Network failed'); }, async () => ({ source: 'fallback', windSpeed: 0 })]) {
    const weather = await loadBriefingWeather(departure, { ...options, getWeather });
    assert.deepEqual(weather, { ...generated, source: 'fallback' });
  }
});

test('a stalled request cannot hold the briefing indefinitely', async () => {
  let signal;
  const weather = await loadBriefingWeather(departure, {
    ...options, timeoutMs: 5,
    getWeather: (_lat, _lon, opts) => {
      signal = opts.signal;
      return new Promise(() => {});
    }
  });
  assert.equal(signal.aborted, true);
  assert.equal(weather.source, 'fallback');
});

test('missing coordinates do not fetch or reuse another airport weather', async () => {
  assert.deepEqual(await loadBriefingWeather(null, {
    ...options, getWeather: () => assert.fail('No airport')
  }), { source: 'unavailable' });
});

test('formatting preserves zero readings and handles missing or legacy turbulence', () => {
  assert.deepEqual(formatBriefingWeather({ windSpeed: 0, visibility: 0, cloudCover: 0, turbulence: 0 }), {
    windSpeed: '0', visibilityKm: '0.0', cloudCover: '0', turbulenceKey: 'none'
  });
  assert.equal(formatBriefingWeather({ turbulence: 'LIGHT' }).turbulenceKey, 'light');
  assert.equal(formatBriefingWeather({ turbulence: 0.9 }).turbulenceKey, 'severe');
  assert.equal(formatBriefingWeather({ turbulence: {} }).turbulenceKey, 'unavailable');
  assert.equal(formatBriefingWeather().cloudCover, '—');
});

test('real weather forwards the timeout signal to its request', async () => {
  const realWeatherService = new RealWeatherService({ requestWeather: (...args) => fetch(...args) });
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  realWeatherService.cache = {};
  globalThis.fetch = async (_url, opts) => {
    assert.equal(opts.signal, controller.signal);
    return { ok: true, json: async () => ({ current: { wind_speed_10m: 19, cloud_cover: 70 } }) };
  };
  try {
    assert.equal((await realWeatherService.getWeather(12, 34, { signal: controller.signal })).windSpeed, 19);
  } finally {
    globalThis.fetch = originalFetch;
    realWeatherService.cache = {};
  }
});
