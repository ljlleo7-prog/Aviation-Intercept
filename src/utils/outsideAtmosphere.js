import { normalizeVisibilityM } from './outsideVisibility.js';

// A visual altitude blend, not a model of cloud layers or the tropopause.
export function outsideAtmosphere(altitudeFt, weather = {}) {
  const altitude = Number.isFinite(altitudeFt) ? altitudeFt : 0;
  const t = Math.min(1, Math.max(0, (altitude - 8000) / 8000));
  const cruiseBlend = t * t * (3 - 2 * t);
  const surfaceVisibility = normalizeVisibilityM(weather?.visibility);
  const visibilityGloom = Math.min(1, Math.max(0, (10000 - surfaceVisibility) / 8000));
  const cloudGloom = Number.isFinite(weather?.cloudCover)
    ? Math.min(1, Math.max(0, (weather.cloudCover - 40) / 60)) : 0;
  const code = Number(weather?.weatherCode ?? weather?.weather_code ?? 0);
  const raining = Number(weather?.precipitation) > 0
    || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const rainT = Math.min(1, Math.max(0, (altitude - 8000) / 4000));
  const rainGloom = raining ? 1 - rainT * rainT * (3 - 2 * rainT) : 0;
  const gloom = Math.max(visibilityGloom, cloudGloom, rainGloom) * (1 - cruiseBlend);
  return {
    cruiseBlend,
    gloom,
    visibilityM: surfaceVisibility + (80000 - surfaceVisibility) * cruiseBlend
  };
}
