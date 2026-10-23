const STORAGE_KEY = 'display_preferences';
export const DEFAULT_DISPLAY_PREFERENCES = { motion: 'system', contrast: 'standard' };

export function normalizeDisplayPreferences(value) {
  return {
    motion: value?.motion === 'reduced' ? 'reduced' : 'system',
    contrast: value?.contrast === 'high' ? 'high' : 'standard'
  };
}

export function readDisplayPreferences() {
  try { return normalizeDisplayPreferences(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return { ...DEFAULT_DISPLAY_PREFERENCES }; }
}

export function applyDisplayPreferences(value) {
  const preferences = normalizeDisplayPreferences(value);
  document.documentElement.dataset.motion = preferences.motion;
  document.documentElement.dataset.contrast = preferences.contrast;
  return preferences;
}

export function writeDisplayPreferences(value) {
  const preferences = applyDisplayPreferences(value);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
  catch { /* Preferences remain active for this session. */ }
  return preferences;
}
