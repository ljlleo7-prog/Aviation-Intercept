const EARTH_RADIUS_M = 6371000;

// Weather visibility controls fog, while geometry must still reach the horizon.
export function terrainViewRange(heightM) {
  const height = Math.max(0, Number.isFinite(heightM) ? heightM : 0);
  const horizon = Math.sqrt(height * (2 * EARTH_RADIUS_M + height));
  const far = Math.max(60000, horizon * 1.2 + 10000);
  return { far, surfaceSize: far * 2.2 };
}

export function terrainRequestCenter(latitude, longitude, heading = 0) {
  const angle = (Number.isFinite(heading) ? heading : 0) * Math.PI / 180;
  const leadM = 4000;
  return {
    latitude: latitude + leadM * Math.cos(angle) / 111320,
    longitude: longitude + leadM * Math.sin(angle) / (111320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180)))
  };
}
