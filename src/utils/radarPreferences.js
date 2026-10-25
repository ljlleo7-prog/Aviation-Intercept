export const RADAR_OPTIONS = {
  terrainSpacing: [0.005, 0.01, 0.02, 0.05],
  terrainInterval: [1, 2, 5, 10, 30],
  terrainRange: [5, 10, 20, 40, 80],
  weatherSpacing: [0.025, 0.05, 0.1, 0.25],
  weatherInterval: [1, 2, 5, 10, 30],
  weatherRange: [10, 20, 40, 80, 160]
};
export const DEFAULT_RADAR_PREFERENCES = {
  terrainSpacing: 0.01, terrainInterval: 2, terrainRange: 20,
  weatherSpacing: 0.05, weatherInterval: 2, weatherRange: 40
};
const key = 'radar_preferences';
export function normalizeRadarPreferences(value) {
  return Object.fromEntries(Object.entries(RADAR_OPTIONS).map(([name, options]) =>
    [name, options.includes(value?.[name]) ? value[name] : DEFAULT_RADAR_PREFERENCES[name]]));
}
export function readRadarPreferences() {
  try { return normalizeRadarPreferences(JSON.parse(localStorage.getItem(key))); }
  catch { return { ...DEFAULT_RADAR_PREFERENCES }; }
}
let current = readRadarPreferences();
const listeners = new Set();
export const getRadarPreferences = () => current;
export function subscribeRadarPreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function writeRadarPreferences(value) {
  current = normalizeRadarPreferences(value);
  try { localStorage.setItem(key, JSON.stringify(current)); } catch { /* Session settings still apply. */ }
  listeners.forEach(listener => listener(current));
  return current;
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  current = readRadarPreferences();
  listeners.forEach(listener => listener(current));
});
