export const MAX_PROCEDURE_POINTS = 6;
export const MIN_INTERCEPT_NM = 2;
const RAD = Math.PI / 180;
export function localPoint(origin, point) {
  const delta = ((point.longitude - origin.longitude + 540) % 360) - 180;
  return { x: delta * 60 * Math.cos(origin.latitude * RAD), y: (point.latitude - origin.latitude) * 60 };
}
export function geographicPoint(origin, point) {
  return { latitude: origin.latitude + point.y / 60, longitude: ((origin.longitude + point.x / (60 * Math.max(0.001, Math.cos(origin.latitude * RAD))) + 540) % 360) - 180 };
}
export function interceptPoint(origin, heading, distance, side) {
  const angle = (heading + (side === 'arrival' ? 180 : 0)) * RAD;
  return { ...geographicPoint(origin, { x: Math.sin(angle) * distance, y: Math.cos(angle) * distance }), name: 'INTCP', kind: 'intercept' };
}
export function constrainIntercept(origin, heading, point, side) {
  const local = localPoint(origin, point);
  const angle = (heading + (side === 'arrival' ? 180 : 0)) * RAD;
  return interceptPoint(origin, heading, Math.max(MIN_INTERCEPT_NM, local.x * Math.sin(angle) + local.y * Math.cos(angle)), side);
}
export function insertProcedurePoint(points, index, origin, endpoint, side) {
  if (points.length >= MAX_PROCEDURE_POINTS) return points;
  const chain = side === 'departure' ? [origin, ...points, endpoint] : [endpoint, ...points, origin];
  if ((side === 'departure' && index === 0) || (side === 'arrival' && index === chain.length - 2)) return points;
  const start = chain[index]; const end = chain[index + 1];
  if (!start || !end) return points;
  const offset = localPoint(start, end);
  const number = Array.from({ length: MAX_PROCEDURE_POINTS }, (_, i) => i + 1).find(i => !points.some(point => point.name === `REF${i}`));
  const point = { ...geographicPoint(start, { x: offset.x / 2, y: offset.y / 2 }), name: `REF${number}`, kind: 'reference' };
  const next = [...points];
  next.splice(index, 0, point);
  return next;
}
export function procedureEndpoint(waypoints, airport, side) {
  const points = waypoints.filter(point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
    && !['sid', 'star', 'approach', 'runway', 'departure', 'arrival'].includes(point.segment)
    && !['AIRPORT', 'RUNWAY_FIX', 'APPROACH_FIX', 'SID_FIX', 'STAR_FIX'].includes(point.type)
    && Math.hypot(...Object.values(localPoint(airport, point))) > 0.1);
  return side === 'departure' ? points[0] : points.at(-1);
}
export const procedureKey = (airport, runway, endpoint, side) => JSON.stringify([airport.icao || airport.iata, runway, endpoint?.latitude, endpoint?.longitude, side]);
export function validProcedureEdit(edit, runwayName, airport) {
  return edit && edit.runwayName === runwayName && (!airport || edit.airportCode === (airport.icao || airport.iata)) ? edit : null;
}
export function applyProcedureEdits(waypoints, departureEdit, arrivalEdit) {
  let result = [...waypoints];
  for (const [edit, side] of [[departureEdit, 'departure'], [arrivalEdit, 'arrival']]) {
    if (!edit?.points?.length || edit.points.length > MAX_PROCEDURE_POINTS || !edit.endpoint
      || edit.points.some(point => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) continue;
    const index = result.findIndex(point => point.latitude === edit.endpoint.latitude && point.longitude === edit.endpoint.longitude);
    if (index < 0) continue;
    const points = edit.points.map((point, i) => ({ ...point, name: `${side === 'departure' ? 'SID' : 'STAR'}-${i + 1}`, label: `${side === 'departure' ? 'SID' : 'STAR'}-${i + 1}`, type: side === 'departure' ? 'SID_FIX' : 'STAR_FIX', segment: side === 'departure' ? 'sid' : 'star', source: 'manual', airway: 'DCT' }));
    const runway = edit.origin ? [{ ...edit.origin, name: edit.runwayName, label: edit.runwayName, type: 'RUNWAY_FIX', segment: 'runway', source: 'manual' }] : [];
    result = side === 'departure' ? [...runway, ...points, ...result.slice(index)] : [...result.slice(0, index + 1), ...points, ...runway];
  }
  return result;
}
