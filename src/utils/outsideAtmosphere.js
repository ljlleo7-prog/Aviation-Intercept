import { normalizeVisibilityM } from './outsideVisibility.js';

// A visual altitude blend, not a model of cloud layers or the tropopause.
export function outsideAtmosphere(altitudeFt, weather = {}) {
  const altitude = Number.isFinite(altitudeFt) ? altitudeFt : 0;
  const t = Math.min(1, Math.max(0, (altitude - 8000) / 8000));
  const cruiseBlend = t * t * (3 - 2 * t);
  const surfaceVisibility = normalizeVisibilityM(weather?.visibility);
  return {
    cruiseBlend,
    visibilityM: surfaceVisibility + (80000 - surfaceVisibility) * cruiseBlend
  };
}
