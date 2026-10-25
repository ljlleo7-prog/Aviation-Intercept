// WeatherRadarService.js
// Mirrors TerrainRadarService pattern: cached grid, limited storage, async fetch.
// Uses Open-Meteo (free, no API key) for cloud cover + precipitation (proxy for turbulence).

import { attachRadarDemand } from './radarDemand.js';
import { fetchElevationResponse } from './elevationRequests.js';

export class WeatherRadarService {
    constructor({ requestWeather = fetchElevationResponse } = {}) {
        this.requestWeather = requestWeather;
        this.GRID_SIZE = 0.05; // ~3 nm north/south; configurable sampling, not model resolution.
        this.cache = new Map(); // key: "latIdx_lonIdx" -> { cloud: 0-100, precip: mm/h, updated: timestamp }
        this.fetchQueue = [];
        this.isFetching = false;
        this.maxCacheSize = 500;
        this.cacheTTL = 5 * 60 * 1000; // 5 min — weather changes slowly

        if (typeof window !== 'undefined') {
            this.demand = attachRadarDemand(this, 'weather', () => this.fetchNextBatch());
        }
    }

    getGridIndices(lat, lon) {
        return {
            latIdx: Math.floor(lat / this.GRID_SIZE),
            lonIdx: Math.floor(lon / this.GRID_SIZE)
        };
    }

    getKey(latIdx, lonIdx) {
        return `${latIdx}_${lonIdx}`;
    }

    // Returns { cloud: 0-100, precip: mm/h } or null if not yet fetched
    getWeather(lat, lon) {
        const { latIdx, lonIdx } = this.getGridIndices(lat, lon);
        const entry = this.cache.get(this.getKey(latIdx, lonIdx));
        if (!entry) return null;
        // Expire stale entries
        if (Date.now() - entry.updated > this.cacheTTL) {
            this.cache.delete(this.getKey(latIdx, lonIdx));
            return null;
        }
        return entry;
    }

    update(lat, lon, rangeNm) {
        const rangeDeg = rangeNm / 60;
        const longitudeRange = rangeDeg / Math.max(0.01, Math.cos(lat * Math.PI / 180));
        const startIdx = this.getGridIndices(lat - rangeDeg, lon - longitudeRange);
        const endIdx   = this.getGridIndices(lat + rangeDeg, lon + longitudeRange);

        const newQueue = [];
        const seenKeys = new Set();

        for (let i = startIdx.latIdx; i <= endIdx.latIdx; i++) {
            for (let j = startIdx.lonIdx; j <= endIdx.lonIdx; j++) {
                const key = this.getKey(i, j);
                seenKeys.add(key);
                const entry = this.cache.get(key);
                const stale = !entry || (Date.now() - entry.updated > this.cacheTTL);
                if (stale) {
                    const tileLat = (i + 0.5) * this.GRID_SIZE;
                    const tileLon = (j + 0.5) * this.GRID_SIZE;
                    const distSq = (tileLat - lat) ** 2 + (tileLon - lon) ** 2;
                    newQueue.push({ key, latIdx: i, lonIdx: j, lat: tileLat, lon: tileLon, distSq });
                }
            }
        }

        newQueue.sort((a, b) => a.distSq - b.distSq);
        this.fetchQueue = newQueue;
        this._cleanup(seenKeys);
    }

    _cleanup(activeKeys) {
        if (this.cache.size > this.maxCacheSize) {
            for (const key of this.cache.keys()) {
                if (!activeKeys.has(key)) {
                    this.cache.delete(key);
                    if (this.cache.size <= this.maxCacheSize) break;
                }
            }
        }
    }

    async fetchNextBatch() {
        if (this.isFetching) return;
        const item = this.fetchQueue.shift();
        if (!item) return;
        this.isFetching = true;
        try { await this._fetchTile(item); }
        finally { this.isFetching = false; }
    }

    async _fetchTile(item) {
        // Open-Meteo: free, no key, CORS-friendly
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${item.lat.toFixed(4)}&longitude=${item.lon.toFixed(4)}&current=cloud_cover,precipitation&wind_speed_unit=kn&forecast_days=1`;
        const res = await this.requestWeather(url, { signal: this.requestSignal ? AbortSignal.any([this.requestSignal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
        if (!res) return;
        if (!res.ok) throw new Error(`Weather fetch ${res.status}`);
        const data = await res.json();
        if (this.isRequestCurrent && !this.isRequestCurrent()) return;
        const cloud = data?.current?.cloud_cover;
        const precip = data?.current?.precipitation;
        if (!Number.isFinite(cloud) || !Number.isFinite(precip)) return;
        this.cache.set(item.key, { cloud, precip, updated: Date.now() });
    }
}

export const weatherRadarService = new WeatherRadarService();
if (import.meta.hot) import.meta.hot.dispose(() => weatherRadarService.demand?.dispose());
