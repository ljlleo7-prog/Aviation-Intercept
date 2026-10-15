const STORAGE_KEY = 'outside_visual_quality';

export function readVisualQuality() {
  try { return localStorage.getItem(STORAGE_KEY) === 'economy' ? 'economy' : 'balanced'; }
  catch { return 'balanced'; }
}

export function writeVisualQuality(value) {
  const quality = value === 'economy' ? 'economy' : 'balanced';
  try { localStorage.setItem(STORAGE_KEY, quality); } catch { /* Rendering still uses the selected session value. */ }
  return quality;
}

export function nextAutoEconomy(previous, altitudeAglFt) {
  if (!Number.isFinite(altitudeAglFt)) return previous;
  if (altitudeAglFt > 11000) return true;
  if (altitudeAglFt < 9000) return false;
  return previous;
}
