import { getRadarPreferences } from './radarPreferences.js';

export const GUEST_WEATHER = Object.freeze({ spacing: 0.25, interval: 60, range: 20 });
let guest = false;
export function setGuestApiAccess(value) { guest = Boolean(value); }
export function getEffectiveRadarPreferences() {
  const preferences = getRadarPreferences();
  return guest ? { ...preferences, weatherSpacing: GUEST_WEATHER.spacing,
    weatherInterval: GUEST_WEATHER.interval, weatherRange: GUEST_WEATHER.range } : preferences;
}
