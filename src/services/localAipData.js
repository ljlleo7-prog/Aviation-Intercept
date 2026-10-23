import { loadInstalledAipPack } from './aipPackStorage.js';

const distance = (lat, lon, point) => {
  const rad = Math.PI / 180;
  const a = Math.sin((point.latitude - lat) * rad / 2) ** 2
    + Math.cos(lat * rad) * Math.cos(point.latitude * rad) * Math.sin((point.longitude - lon) * rad / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
};

export async function queryInstalledAip(name, params) {
  const pack = await loadInstalledAipPack();
  if (!pack) return null;
  const result = value => ({ status: 'ok', ...value, source: 'local-aip-pack', billing: { chargedTokens: 0 } });
  const query = String(params.p_query || params.p_airport_code || '').trim().toUpperCase();
  const limit = Math.max(1, Math.min(Number(params.p_limit) || 20, 100));
  const matchesCode = airport => [airport.icao, airport.iata, airport.ident].some(code => code && code.toUpperCase() === query);
  if (name === 'skylinetragedy_search_airports') {
    const airports = pack.airports.filter(airport => (params.p_include_emergency !== false || airport.type !== 'emergency')
      && [airport.icao, airport.iata, airport.ident, airport.name, airport.city].some(value => String(value || '').toUpperCase().includes(query)));
    airports.sort((a, b) => Number(matchesCode(b)) - Number(matchesCode(a)));
    return result({ airports: airports.slice(0, limit) });
  }
  if (name === 'skylinetragedy_airport_details') {
    const airport = pack.airports.find(matchesCode);
    return airport ? result({ airport }) : { status: 'unavailable', billing: { chargedTokens: 0 } };
  }
  const lat = Number(params.p_latitude); const lon = Number(params.p_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: 'unavailable', billing: { chargedTokens: 0 } };
  const nearby = items => items.map(item => ({ ...item, distanceNm: distance(lat, lon, item) }))
    .filter(item => item.distanceNm <= (params.p_radius_nm ?? 150)).sort((a, b) => a.distanceNm - b.distanceNm);
  if (name === 'skylinetragedy_airports_within_radius') return result({ airports: nearby(pack.airports).slice(0, limit) });
  if (name === 'skylinetragedy_nearest_navaids') return result({ navaids: nearby(pack.navaids).slice(0, limit) });
  if (name === 'skylinetragedy_nearest_suitable_airports') {
    const options = nearby(pack.airports).map(airport => {
      const bestRunway = airport.runways.filter(runway => runway.length >= (params.p_min_runway_length_ft || 0))
        .sort((a, b) => b.length - a.length)[0];
      return bestRunway ? { airport, bestRunway, distanceNm: airport.distanceNm, suitabilityScore: null,
        frequencies: airport.frequencies, navaids: pack.navaids.filter(item => item.associatedAirport === airport.ident).slice(0, 5) } : null;
    }).filter(Boolean).slice(0, limit);
    return result({ options });
  }
  return null;
}
