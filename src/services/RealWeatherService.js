
/**
 * Service to fetch real-time weather data from Open-Meteo API.
 * Open-Meteo offers free non-commercial use with high limits (10,000 daily).
 * No API key required.
 */

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

class RealWeatherService {
  constructor() {
    this.cache = {};
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  coerceNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  getPressureHpa(current) {
    const pressure = [current.pressure_msl, current.sea_level_pressure, current.surface_pressure]
      .map(value => Number(value))
      .find(value => Number.isFinite(value) && value > 0);
    return pressure ?? 1013.25;
  }

  normalizeWeatherData(current = {}, currentUnits = {}) {
    const temperature = this.coerceNumber(current.temperature_2m, 15);
    const humidity = this.clamp(this.coerceNumber(current.relative_humidity_2m, 50), 0, 100);
    const pressure = this.getPressureHpa(current);
    const windSpeed = Math.max(0, this.coerceNumber(current.wind_speed_10m, 0));
    const rawWindGust = Math.max(0, this.coerceNumber(current.wind_gusts_10m, windSpeed));
    const windGust = Math.max(windSpeed, rawWindGust);
    const windDirection = ((this.coerceNumber(current.wind_direction_10m, 0) % 360) + 360) % 360;
    const cloudCover = this.clamp(this.coerceNumber(current.cloud_cover, 0), 0, 100);
    const precipitation = Math.max(0, this.coerceNumber(current.precipitation, 0));
    const weatherCode = this.coerceNumber(current.weather_code, 0);

    const windUnit = currentUnits.wind_speed_10m || currentUnits.wind_gusts_10m;
    if (windUnit && windUnit !== 'kn') {
      console.warn(`Unexpected Open-Meteo wind unit: ${windUnit}`);
    }

    const pressureUnit = currentUnits.pressure_msl || currentUnits.sea_level_pressure || currentUnits.surface_pressure;
    if (pressureUnit && pressureUnit !== 'hPa') {
      console.warn(`Unexpected Open-Meteo pressure unit: ${pressureUnit}`);
    }

    return {
      temperature,
      humidity,
      pressure,
      pressureInHg: pressure * 0.02953,
      windSpeed,
      windDirection,
      windGust,
      windShear: Math.max(0, windGust - windSpeed) * 0.6,
      cloudCover,
      precipitation,
      weatherCode,
      visibility: this.estimateVisibility(weatherCode, cloudCover),
      turbulence: this.estimateTurbulence(windSpeed, windGust, weatherCode)
    };
  }

  /**
   * Fetch current weather for a given location.
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @returns {Promise<Object>} Weather data
   */
  async getWeather(lat, lon, { signal } = {}) {
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const now = Date.now();

    if (this.cache[cacheKey] && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
      return this.cache[cacheKey].data;
    }

    try {
      // Request current weather parameters relevant to aviation
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'precipitation',
            'rain',
            'showers',
            'snowfall',
            'weather_code',
            'cloud_cover',
            'pressure_msl',
            'surface_pressure',
            'wind_speed_10m',
            'wind_direction_10m',
            'wind_gusts_10m'
        ].join(','),
        wind_speed_unit: 'kn', // Aviation standard
        precipitation_unit: 'mm',
      });

      const response = await fetch(`${BASE_URL}?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();
      const weatherData = this.normalizeWeatherData(data.current, data.current_units);

      this.cache[cacheKey] = {
        timestamp: now,
        data: weatherData
      };

      return weatherData;
    } catch (error) {
      console.error('Failed to fetch real weather:', error);
      // Return a safe fallback (Standard Atmosphere)
      return {
        source: 'fallback',
        temperature: 15,
        humidity: 50,
        pressure: 1013.25,
        pressureInHg: 1013.25 * 0.02953,
        windSpeed: 0,
        windDirection: 0,
        windGust: 0,
        windShear: 0,
        cloudCover: 0,
        precipitation: 0,
        weatherCode: 0,
        visibility: 10000,
        turbulence: 0
      };
    }
  }

  /**
   * Estimate visibility based on weather code and cloud cover.
   * Open-Meteo doesn't always provide visibility in free tier directly or robustly globally.
   */
  estimateVisibility(code, cloudCover) {
    // WMO Weather Codes: https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM
    // 0-3: Clear/Clouds
    // 45, 48: Fog
    // 51-57: Drizzle
    // 61-67: Rain
    // 71-77: Snow
    // 80-82: Showers
    // 95-99: Thunderstorm

    if (code >= 45 && code <= 48) return 500; // Fog
    if (code >= 95) return 2000; // Thunderstorm
    if (code >= 71 && code <= 77) return 1500; // Snow
    if (code >= 61 && code <= 67) return 4000; // Rain
    if (code >= 51 && code <= 57) return 6000; // Drizzle
    
    if (cloudCover > 90) return 8000;
    
    return 20000; // Clear
  }

  estimateTurbulence(windSpeed, windGust, code) {
    let turbulence = 0;
    
    // Wind factor
    if (windSpeed > 15) turbulence += 0.2;
    if (windSpeed > 30) turbulence += 0.3;
    
    // Gust factor
    const gustFactor = Math.max(0, windGust - windSpeed);
    turbulence += gustFactor * 0.05;

    // Weather code factor
    if (code >= 95) turbulence += 0.5; // Thunderstorm
    else if (code >= 80) turbulence += 0.3; // Showers

    return Math.min(1.0, turbulence);
  }

  /**
   * Generate ATIS string from weather data.
   */
  generateATIS(icao, infoCode, weather) {
    const time = new Date().toISOString().substring(11, 16).replace(':', '') + 'Z';
    const wind = `${weather.windDirection.toString().padStart(3, '0')} AT ${Math.round(weather.windSpeed)} KNOTS`;
    const vis = weather.visibility >= 10000 ? '10 KILOMETERS OR MORE' : `${Math.round(weather.visibility)} METERS`;
    
    // Sky Condition
    let sky = 'SKY CLEAR';
    if (weather.cloudCover > 80) sky = 'OVERCAST';
    else if (weather.cloudCover > 50) sky = 'BROKEN';
    else if (weather.cloudCover > 20) sky = 'SCATTERED';
    
    // Temp / Dewpoint (Dewpoint estimated)
    const temp = Math.round(weather.temperature);
    const dewpoint = Math.round(weather.temperature - ((100 - weather.humidity) / 5));
    const t_dp = `${temp}/${dewpoint}`;
    
    const qnh = `QNH ${Math.round(weather.pressure)}`;
    
    return `${icao} INFORMATION ${infoCode} ${time}. WIND ${wind}. VISIBILITY ${vis}. ${sky}. TEMPERATURE ${t_dp}. ${qnh}. ADVISE ON INITIAL CONTACT YOU HAVE INFORMATION ${infoCode}.`;
  }
}

export const realWeatherService = new RealWeatherService();
