import sceneryAirports from '../config/sceneryAirports.js';

const DEG = Math.PI / 180;
export const canonicalAirportCode = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  return Object.keys(sceneryAirports).find(code => code === normalized || sceneryAirports[code].iata === normalized) || normalized;
};
export const projectGroundPoint = (latitude, longitude, origin) => [
  (longitude - origin.longitude) * 111320 * Math.cos(origin.latitude * DEG),
  -(latitude - origin.latitude) * 111320
];
export const unprojectGroundPoint = ([x, z], origin) => ({
  latitude: origin.latitude - z / 111320,
  longitude: origin.longitude + x / (111320 * Math.cos(origin.latitude * DEG))
});

// Only separate coincident airport-reference estimates. Surveyed, already
// distinct runway coordinates are preserved. The active physics target stays fixed.
export function resolveVisualRunways(active, others) {
  const all = [active, ...others];
  const center = (runway) => runway.thresholdEnd ? {
    latitude: (runway.thresholdStart.latitude + runway.thresholdEnd.latitude) / 2,
    longitude: (runway.thresholdStart.longitude + runway.thresholdEnd.longitude) / 2
  } : null;
  const activeCenter = center(active);
  const reference = { latitude: active.airportLat, longitude: active.airportLon };
  if (!activeCenter || !Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)
    || Math.hypot(...projectGroundPoint(activeCenter.latitude, activeCenter.longitude, reference)) > 5
    || active.geometrySource === 'local-aip') return all;
  const key = (runway) => {
    const match = String(runway.runwayName || '').match(/^(\d{2})([LCR]?)/);
    if (!match) return String(runway.runwayName || '');
    const number = Number(match[1]); const suffix = number > 18 ? ({ L: 'R', R: 'L', C: 'C' }[match[2]] || '') : match[2];
    return `${String(number > 18 ? number - 18 : number).padStart(2, '0')}${suffix}`;
  };
  const approximations = all.filter((runway) => {
    const midpoint = center(runway);
    return midpoint && runway.geometrySource !== 'local-aip'
      && Math.hypot(...projectGroundPoint(midpoint.latitude, midpoint.longitude, reference)) < 5
      && Math.abs(Math.cos((runway.heading - active.heading) * DEG)) > .98;
  });
  const ordered = [...new Set(approximations.map(key))].sort();
  if (ordered.length < 2) return all;
  const canonicalHeading = (active.heading + (Number(String(active.runwayName).slice(0, 2)) > 18 ? 180 : 0)) * DEG;
  return all.map((runway) => {
    if (runway === active || !approximations.includes(runway)) return runway;
    const shift = (ordered.indexOf(key(runway)) - ordered.indexOf(key(active))) * 400;
    const east = Math.cos(canonicalHeading) * shift; const south = Math.sin(canonicalHeading) * shift;
    const translate = (point) => ({ ...point, latitude: point.latitude - south / 111320,
      longitude: point.longitude + east / (111320 * Math.cos(reference.latitude * DEG)) });
    return { ...runway, thresholdStart: translate(runway.thresholdStart), thresholdEnd: translate(runway.thresholdEnd), geometrySource: 'procedural-offset' };
  });
}
