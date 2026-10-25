import test from 'node:test';
import assert from 'node:assert/strict';
import { RealWeatherService } from '../src/services/RealWeatherService.js';

const realWeatherService = new RealWeatherService({ requestWeather: (...args) => fetch(...args) });

test('real weather normalizes authoritative API payload into sane aviation values', async () => {
  const originalFetch = global.fetch;
  realWeatherService.cache = {};

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      current_units: {
        temperature_2m: '°C',
        relative_humidity_2m: '%',
        precipitation: 'mm',
        pressure_msl: 'hPa',
        wind_speed_10m: 'kn',
        wind_gusts_10m: 'kn'
      },
      current: {
        temperature_2m: 19,
        relative_humidity_2m: 61,
        precipitation: -2,
        weather_code: 63,
        cloud_cover: -14,
        sea_level_pressure: 1007.4,
        surface_pressure: 1005.1,
        wind_speed_10m: 24,
        wind_direction_10m: 185,
        wind_gusts_10m: 12
      }
    })
  });

  try {
    const weather = await realWeatherService.getWeather(34.05, -118.25);

    assert.equal(weather.temperature, 19);
    assert.equal(weather.humidity, 61);
    assert.equal(weather.pressure, 1007.4);
    assert.ok(Math.abs(weather.pressureInHg - 29.75) < 0.05);
    assert.equal(weather.windSpeed, 24);
    assert.equal(weather.windGust, 24);
    assert.equal(weather.windShear, 0);
    assert.equal(weather.cloudCover, 0);
    assert.equal(weather.precipitation, 0);
    assert.equal(weather.weatherCode, 63);
    assert.ok(weather.visibility > 0);
    assert.ok(weather.turbulence >= 0 && weather.turbulence <= 1);
  } finally {
    global.fetch = originalFetch;
    realWeatherService.cache = {};
  }
});
