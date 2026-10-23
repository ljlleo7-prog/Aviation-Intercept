import { canonicalAirportCode } from '../utils/airportGroundCoordinates.js';

const supported = new Set(['KLAX', 'VHHH', 'ZSPD', 'ZGGG', 'ZBAA', 'KATL', 'KLGA', 'EGLL', 'WSSS', 'OMDB']);
const cache = new Map();

export { validateGroundPackage } from './validateGroundPackage.js';
import { validateGroundPackage } from './validateGroundPackage.js';
import { listSceneryPacks, readInstalledAirport } from './sceneryPackStorage.js';
let installedSnapshot;

export function setScenerySnapshot(packs) {
  installedSnapshot = Promise.resolve(packs);
  cache.clear();
}

export function loadAirportGroundPackage(airportCode) {
  const code = canonicalAirportCode(airportCode);
  if (!/^[A-Z]{4}$/.test(code)) return Promise.resolve(null);
  if (cache.has(code)) return cache.get(code);
  const base = import.meta.env?.BASE_URL || '/';
  // Keep scenery consistent for this session, even when packs change during a flight.
  installedSnapshot ||= listSceneryPacks().catch(() => []);
  const pending = installedSnapshot.then(packs => readInstalledAirport(code, packs)).catch(() => null).then(installed => installed || (supported.has(code) ? fetch(`${base}scenery/airports/${code}.json`, { signal: AbortSignal.timeout(6000) })
    .then(async (response) => {
      if (!response.ok) return null;
      const value = await response.json();
      return validateGroundPackage(value, code) ? value : null;
    }).catch(() => null) : null));
  cache.set(code, pending);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return pending;
}
