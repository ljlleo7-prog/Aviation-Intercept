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

export function outsideRenderBudget(quality, width, height, devicePixelRatio = 1) {
  const economy = quality === 'economy';
  const area = Math.max(1, width || 1) * Math.max(1, height || 1);
  return {
    fps: economy ? 20 : 30,
    pixelRatio: Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1,
      economy ? .65 : 1, Math.sqrt((economy ? 200000 : 420000) / area))
  };
}

// Ground spill disappears beyond each lamp's useful range. Hysteresis keeps
// terrain/AGL noise from repeatedly changing the renderer's light/shader count.
export function outsideLightRanges(previous, altitudeAglFt) {
  if (!Number.isFinite(altitudeAglFt)) return previous || { ground: true, landing: true };
  const inRange = (wasEnabled, lower, upper) => wasEnabled
    ? altitudeAglFt < upper : altitudeAglFt <= lower;
  return {
    ground: inRange(previous?.ground ?? true, 120, 180),
    landing: inRange(previous?.landing ?? true, 1300, 1700),
  };
}
