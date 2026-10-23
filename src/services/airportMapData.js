import aircraftDatabase from '../data/aircraftDatabase.json';
import { resolveICAO } from '../data/aircraft/index.js';

const categoryRank = { LIGHT: 1, MEDIUM: 2, HEAVY: 3, SUPER: 4 };
export function getMapAircraft(aircraft) {
  if (aircraft && typeof aircraft === 'object') return aircraft;
  const code = resolveICAO(aircraft);
  return aircraftDatabase.aircraft.find(item => item.icao === code) || null;
}

export function isAirportSuitableForMap(airport, aircraft) {
  if (!airport || airport.type === 'closed' || airport.airport_type === 'closed') return false;
  const data = getMapAircraft(aircraft);
  const runways = Array.isArray(airport?.runways) && airport.runways.length ? airport.runways
    : airport?.runway && airport.runwayLength ? [{ length: airport.runwayLength, category: airport.category }] : [];
  const requiredLength = data ? Math.max(Number(data.takeoffDistance) || 0, Number(data.landingDistance) || 0) / 0.3048 : 0;
  const weight = Number(data?.maxTakeoffWeight) || 0;
  const requiredRank = categoryRank[String(data?.runwayCategory || data?.category || '').toUpperCase()] || (weight >= 136000 ? 3 : weight >= 7000 ? 2 : 1);
  const span = Number(data?.wingSpan) || 0;
  const requiredLetter = span >= 65 ? 'F' : span >= 52 ? 'E' : span >= 36 ? 'D' : span >= 24 ? 'C' : span >= 15 ? 'B' : 'A';
  const requiredNumber = requiredLength * 0.3048 >= 1800 ? 4 : requiredLength * 0.3048 >= 1200 ? 3 : requiredLength * 0.3048 >= 800 ? 2 : 1;
  const categoryFits = category => {
    const value = String(category || '').toUpperCase();
    if (categoryRank[value]) return categoryRank[value] >= requiredRank;
    const code = /^([1-4])([A-F])$/.exec(value);
    return !code || (Number(code[1]) >= requiredNumber && code[2] >= requiredLetter);
  };
  if (data && !categoryFits(airport?.category)) return false;
  return runways.some(runway => ![true, 1, '1'].includes(runway.closed) && Number.isFinite(Number(runway.length ?? runway.length_ft))
    && Number(runway.length ?? runway.length_ft) > 0
    && Number(runway.length ?? runway.length_ft) >= requiredLength
    && (!data || categoryFits(runway.category)));
}

const indexes = new WeakMap();
const longitudeCell = lon => ((Math.floor(lon) + 180) % 360 + 360) % 360;
function getIndex(airports) {
  let index = indexes.get(airports);
  if (index?.size === airports.length) return index;
  const cells = new Map();
  for (const airport of airports) {
    if (!Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) continue;
    const key = `${Math.floor(airport.latitude)}:${longitudeCell(airport.longitude)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(airport);
  }
  index = { size: airports.length, cells };
  indexes.set(airports, index);
  return index;
}
const distanceNm = (lat, lon, airport) => {
  const rad = Math.PI / 180;
  const a = Math.sin((airport.latitude - lat) * rad / 2) ** 2
    + Math.cos(lat * rad) * Math.cos(airport.latitude * rad) * Math.sin((airport.longitude - lon) * rad / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
};

// Query nearby grid cells instead of scanning the world dataset on each frame.
export function getMapAirports(airports, latitude, longitude, radiusNm, aircraft, limit = 24) {
  if (![latitude, longitude, radiusNm].every(Number.isFinite) || radiusNm < 0 || Math.abs(latitude) > 90) return [];
  const data = getMapAircraft(aircraft);
  const { cells } = getIndex(airports);
  const latDelta = radiusNm / 60 * 1.01;
  const poleward = Math.min(90, Math.abs(latitude) + latDelta);
  const lonDelta = poleward >= 90 ? 180 : Math.min(180, latDelta / Math.cos(poleward * Math.PI / 180));
  const matches = [];
  for (let lat = Math.max(-90, Math.floor(latitude - latDelta)); lat <= Math.min(90, Math.floor(latitude + latDelta)); lat++) {
    const seen = new Set();
    for (let lon = Math.floor(longitude - lonDelta); lon <= Math.floor(longitude + lonDelta); lon++) {
      const cell = longitudeCell(lon);
      if (seen.has(cell)) continue;
      seen.add(cell);
      for (const airport of cells.get(`${lat}:${cell}`) || []) {
        if (!isAirportSuitableForMap(airport, data)) continue;
        const distance = distanceNm(latitude, longitude, airport);
        if (distance <= radiusNm) matches.push({ airport, distance });
      }
    }
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, limit).map(item => item.airport);
}
