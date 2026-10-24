// Bounded station search shared by the app and preview. Only measured fixes are used.
const RAD = Math.PI / 180;
const EARTH_NM = 3440.065;
const indexes = new WeakMap();
const longitudeCell = longitude => ((Math.floor(longitude / 2) % 180) + 180) % 180;
const bearing = (a, b) => Math.atan2(Math.sin((b.longitude - a.longitude) * RAD) * Math.cos(b.latitude * RAD),
  Math.cos(a.latitude * RAD) * Math.sin(b.latitude * RAD) - Math.sin(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.cos((b.longitude - a.longitude) * RAD));
const turn = (a, b, c) => Math.abs(((bearing(b, c) - bearing(a, b)) / RAD + 540) % 360 - 180);

function getIndex(store) {
  let index = indexes.get(store.pointsByIdent);
  if (index) return index;
  index = new Map();
  for (const points of store.pointsByIdent.values()) for (const point of points) {
    if (point.point_type === 'airport' || !/^[A-Z][A-Z0-9]{1,6}$/.test(point.ident)
      || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    const key = `${Math.floor(point.latitude / 2)}:${longitudeCell(point.longitude)}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(point);
  }
  indexes.set(store.pointsByIdent, index);
  return index;
}
function stationPoint(origin, heading, distance) {
  const angle = distance / EARTH_NM;
  const latitude = Math.asin(Math.sin(origin.latitude * RAD) * Math.cos(angle) + Math.cos(origin.latitude * RAD) * Math.sin(angle) * Math.cos(heading));
  const longitude = origin.longitude * RAD + Math.atan2(Math.sin(heading) * Math.sin(angle) * Math.cos(origin.latitude * RAD), Math.cos(angle) - Math.sin(origin.latitude * RAD) * Math.sin(latitude));
  return { latitude: latitude / RAD, longitude: ((longitude / RAD + 540) % 360) - 180 };
}
// Accept at most a 3 NM minimax difference when a shorter, simpler path is available.
const compare = (a, b) => Math.floor(a.maxLegNm / 3) - Math.floor(b.maxLegNm / 3)
  || a.total - b.total || a.points.length - b.points.length || a.maxLegNm - b.maxLegNm;

export function searchRelaxedWaypointRoutes({ store, departureCode, arrivalCode, departurePoint, arrivalPoint, calculateGreatCircleNm: distance, options = {} }) {
  if (!departurePoint || !arrivalPoint) return [];
  const direct = distance(departurePoint, arrivalPoint);
  if (!Number.isFinite(direct) || direct <= 0) return [];
  const index = getIndex(store);
  const heading = bearing(departurePoint, arrivalPoint);
  const targetLeg = Math.max(140, Math.min(320, direct / 7));
  const maxPoints = Math.max(2, Math.min(40, Number(options.relaxedWaypointLimit) || 14));
  const count = Math.min(maxPoints - 2, Math.max(1, Math.ceil(direct / targetLeg) - 1));
  const spacing = direct / (count + 1);
  const radius = Math.max(30, Math.min(240, spacing * 0.7));
  const geometryCache = new WeakMap();
  function nearby(target) {
    const center = stationPoint(departurePoint, heading, target);
    const latDelta = radius / 60 * 1.02;
    const lonDelta = Math.min(180, latDelta / Math.max(0.001, Math.cos(Math.min(90, Math.abs(center.latitude) + latDelta) * RAD)));
    const candidates = [];
    for (let lat = Math.max(-45, Math.floor((center.latitude - latDelta) / 2)); lat <= Math.min(45, Math.floor((center.latitude + latDelta) / 2)); lat++) {
      const seen = new Set();
      for (let lon = Math.floor((center.longitude - lonDelta) / 2); lon <= Math.floor((center.longitude + lonDelta) / 2); lon++) {
        const cell = ((lon % 180) + 180) % 180;
        if (seen.has(cell)) continue;
        seen.add(cell);
        for (const point of index.get(`${lat}:${cell}`) || []) {
          if (point.ident === departureCode || point.ident === arrivalCode) continue;
          let geometry = geometryCache.get(point);
          if (!geometry) {
            const angular = distance(departurePoint, point) / EARTH_NM;
            const delta = bearing(departurePoint, point) - heading;
            geometry = {
              along: EARTH_NM * Math.atan2(Math.sin(angular) * Math.cos(delta), Math.cos(angular)),
              cross: EARTH_NM * Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(angular) * Math.sin(delta))))),
              remaining: distance(point, arrivalPoint)
            };
            geometryCache.set(point, geometry);
          }
          const { along, cross, remaining } = geometry;
          if (along <= 0.1 || along >= direct - 0.1 || Math.abs(along - target) > radius || cross > radius) continue;
          const score = Math.abs(along - target) + cross * 2;
          const candidate = { point, along, remaining, score };
          const at = candidates.findIndex(item => score < item.score);
          if (at < 0) { if (candidates.length < 8) candidates.push(candidate); }
          else { candidates.splice(at, 0, candidate); candidates.length = Math.min(8, candidates.length); }
        }
      }
    }
    return candidates;
  }
  const origin = { ...departurePoint, ident: departureCode };
  const destination = { ...arrivalPoint, ident: arrivalCode };
  const routes = [];
  const shifts = count ? [0, -0.12, 0.12].slice(0, Math.max(1, Math.min(3, options.limit || 3))) : [0];
  for (const shift of shifts) {
    let beam = [{ points: [origin], along: 0, remaining: direct, maxLegNm: 0, total: 0 }];
    for (let station = 1; station <= count; station++) {
      const candidates = nearby((station + shift) * spacing);
      const next = [];
      for (const candidate of candidates) {
        let best;
        for (const state of beam) {
          const previous = state.points.at(-1);
          if (candidate.along <= state.along + 0.1 || candidate.remaining >= state.remaining - 0.1
            || state.points.some(point => point.ident === candidate.point.ident)
            || (state.points.length > 1 && turn(state.points.at(-2), previous, candidate.point) > 100)) continue;
          const leg = distance(previous, candidate.point);
          const proposal = { points: [...state.points, candidate.point], along: candidate.along, remaining: candidate.remaining,
            maxLegNm: Math.max(state.maxLegNm, leg), total: state.total + leg };
          if (!best || compare(proposal, best) < 0) best = proposal;
        }
        if (best) next.push(best);
      }
      // Missing coverage skips a station instead of making a detour to fill a quota.
      if (next.length) beam = next.sort(compare).slice(0, 8);
    }
    for (const state of beam) {
      if (state.points.length === 1 && direct > 80) continue;
      const previous = state.points.at(-1);
      if (state.points.length > 1 && turn(state.points.at(-2), previous, destination) > 100) continue;
      const finalLeg = distance(previous, destination);
      routes.push({ points: [...state.points, destination], total: state.total + finalLeg, maxLegNm: Math.max(state.maxLegNm, finalLeg) });
    }
  }
  const seen = new Set();
  return routes.sort(compare).filter(route => {
    const key = route.points.map(point => point.ident).join(' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, options.limit || 8).map((route, i) => {
    const path = route.points.map(point => point.ident);
    const routeId = `BRUTE-FAST-${departureCode}-${arrivalCode}-${i + 1}`;
    return { routeId, routeCode: routeId, path, points: route.points, resolvedCount: path.length,
      estimatedNm: route.total, maxLegNm: route.maxLegNm, approachSpaced: true,
      legs: path.slice(0, -1).map((from, j) => ({ route_id: routeId, leg_sequence: j + 1, from_fix: from, to_fix: path[j + 1], airway: 'DCT', edge_type: 'direct', region_code: '', aip_cycle: '' })) };
  });
}
