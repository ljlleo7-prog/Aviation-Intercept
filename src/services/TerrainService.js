import { fetchElevationResponse } from './elevationRequests.js';

const BASE_URL = 'https://api.open-elevation.com/api/v1/lookup';
const FETCH_TIMEOUT_MS = 3000;

export class TerrainService {
  constructor() {
    this.cache = new Map(); // Key: "lat,lon" (rounded), Value: elevation
    this.lastCallTime = 0;
    this.pendingRequest = null;
    this.MIN_INTERVAL = 1000; // 1 second
  }

  /**
   * Get terrain elevation for a specific location.
   * Uses Open-Elevation API with throttling and caching.
   * @param {number} lat 
   * @param {number} lon 
   * @returns {Promise<number>} Elevation in meters
   */
  async getElevation(lat, lon) {
    // Round to 3 decimal places (~100m precision) for caching
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.MIN_INTERVAL) {
      // Return cached value if available, or wait? 
      // For smooth gameplay, returning previous nearest or waiting is better.
      // But we can't block. Let's return a promise that resolves later?
      // Or just return null/undefined and handle it? 
      // Let's return the last known good value if throttled.
      return null; 
    }

    this.lastCallTime = now;

    let timeoutId = null;

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetchElevationResponse(`${BASE_URL}?locations=${lat},${lon}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      timeoutId = null;
      if (!response) return null;
      if (!response.ok) throw new Error('Terrain API failed');

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const elevation = data.results[0].elevation;
        if (!Number.isFinite(elevation)) return null;
        this.cache.set(key, elevation);

        // Prune cache if too big
        if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        return elevation;
      }
    } catch (error) {
      console.warn('Terrain fetch failed:', error);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    return null; // Keep the last known terrain until valid data arrives.
  }
}

export const terrainService = new TerrainService();
