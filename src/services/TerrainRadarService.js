class TerrainRadarService {
    constructor() {
        this.GRID_SIZE = 0.01; // 0.01 degrees resolution (approx 1.1km or 0.6nm)
        this.cache = new Map(); // Key: "latIdx_lonIdx", Value: height (ft)
        this.fetchQueue = []; // Array of { key, latIdx, lonIdx, lat, lon, distSq }
        this.isFetching = false;
        this.lastPlayerPos = { lat: 0, lon: 0 };
        this.maxCacheSize = 5000; // Limit cache size
        this.fetchTimer = null;

        // Open-Elevation API endpoint
        this.API_ENDPOINT = 'https://api.open-elevation.com/api/v1/lookup';

        // Start the fetch loop only in browser/runtime usage
        if (typeof window !== 'undefined') {
            this.startFetcher();
        }
    }

    // Convert lat/lon to grid indices
    getGridIndices(lat, lon) {
        return {
            latIdx: Math.floor(lat / this.GRID_SIZE),
            lonIdx: Math.floor(lon / this.GRID_SIZE)
        };
    }

    // Get unique key for grid tile
    getKey(latIdx, lonIdx) {
        return `${latIdx}_${lonIdx}`;
    }

    // Public method to get terrain height
    // Returns height in feet if available, or null if pending
    getTerrainHeight(lat, lon) {
        const { latIdx, lonIdx } = this.getGridIndices(lat, lon);
        const key = this.getKey(latIdx, lonIdx);
        
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        // If not in cache, it will be picked up by the update loop
        return null;
    }

    // Main update loop called by the component
    // Populates the queue based on current position and range
    update(lat, lon, rangeNm, heading = 0) {
        this.lastPlayerPos = { lat, lon };

        // 1. Calculate visible grid bounds
        // 1 degree approx 60nm. 
        const rangeDeg = rangeNm / 60;
        const startLat = lat - rangeDeg;
        const endLat = lat + rangeDeg;
        const startLon = lon - rangeDeg; 
        const endLon = lon + rangeDeg;

        const startIdx = this.getGridIndices(startLat, startLon);
        const endIdx = this.getGridIndices(endLat, endLon);

        const newQueue = [];
        const seenKeys = new Set();

        // 2. Identify needed tiles
        const headingRad = heading * Math.PI / 180;
        const forwardX = Math.sin(headingRad);
        const forwardY = Math.cos(headingRad);
        for (let i = startIdx.latIdx; i <= endIdx.latIdx; i++) {
            for (let j = startIdx.lonIdx; j <= endIdx.lonIdx; j++) {
                const key = this.getKey(i, j);
                if (!this.cache.has(key)) {
                    // Calculate center of tile
                    const tileLat = (i + 0.5) * this.GRID_SIZE;
                    const tileLon = (j + 0.5) * this.GRID_SIZE;

                    // Approximate distance check
                    const dLat = tileLat - lat;
                    const dLon = tileLon - lon;
                    const distSq = dLat ** 2 + dLon ** 2;

                    // Priority: closest first, front-180° before back-180°.
                    // Apply a small multiplier penalty to back-hemisphere tiles so
                    // distance remains the dominant sort key.
                    const dot = (dLon * forwardX) + (dLat * forwardY);
                    const hemispherePenalty = dot >= 0 ? 1.0 : 2.0;
                    const priority = distSq * hemispherePenalty;

                    newQueue.push({
                        key,
                        latIdx: i,
                        lonIdx: j,
                        lat: tileLat,
                        lon: tileLon,
                        distSq,
                        priority
                    });
                }
                seenKeys.add(key);
            }
        }

        // 3. Update Queue: Sort by distance with forward bias
        // We only replace the queue if we have new targets, merging with existing priority
        // For simplicity, we just use the new queue but might lose in-progress stuff if not careful.
        // Better: Filter out what is already in cache (done above) and replace queue.
        newQueue.sort((a, b) => (a.priority ?? a.distSq) - (b.priority ?? b.distSq));
        this.fetchQueue = newQueue;

        // 4. Cleanup old cache
        this.cleanup(seenKeys);
    }

    cleanup(activeKeys) {
        // Remove keys that are too far (not in the current active set)
        // To prevent thrashing, we only remove if cache is too big
        if (this.cache.size > this.maxCacheSize) {
            for (const key of this.cache.keys()) {
                if (!activeKeys.has(key)) {
                    this.cache.delete(key);
                    if (this.cache.size <= this.maxCacheSize) break;
                }
            }
        }
    }

    // Async Fetcher Loop
    async startFetcher() {
        const processBatch = async () => {
            if (this.fetchQueue.length > 0 && !this.isFetching) {
                this.isFetching = true;
                
                // Process a batch of tiles
                // Open-Elevation accepts multiple locations in one request
                // Let's take up to 20 closest points
                const batchSize = 20;
                const batch = this.fetchQueue.splice(0, batchSize);

                if (batch.length > 0) {
                    try {
                        await this.fetchElevationData(batch);
                    } catch (error) {
                        console.warn("Terrain fetch failed:", error);
                        // Re-queue items at the back or discard? 
                        // For now, discard to prevent loops, they will be re-added by update() if still relevant
                    }
                }
                
                this.isFetching = false;
            }
            
            // Schedule next check
            setTimeout(processBatch, 200); // 5 requests per second max (polite rate limit)
        };

        processBatch();
    }

    // Call Terrain API with Fallback (Double-Entry)
    async fetchElevationData(batch) {
        // Format: locations=lat,lon|lat,lon...
        const locationsParam = batch.map(item => `${item.lat.toFixed(5)},${item.lon.toFixed(5)}`).join('|');
        
        // Primary: Open-Elevation
        // Note: Using corsproxy.io to bypass potential CORS/Mixed-Content issues on production (GitHub Pages)
        const urlPrimary = `https://api.open-elevation.com/api/v1/lookup?locations=${locationsParam}`;
        
        // Secondary: OpenTopoData (ASTER 30m Global)
        // Public API: https://api.opentopodata.org/v1/aster30m
        const urlSecondary = `https://api.opentopodata.org/v1/aster30m?locations=${locationsParam}`;

        // CORS Proxy: Used to wrap requests for static site deployment (GitHub Pages)
        // where no backend proxy is available.
        const corsProxy = 'https://corsproxy.io/?';

        let success = false;

        // Try Primary
        try {
            // console.log("Terrain: Trying Primary (Open-Elevation)...");
            // Try direct first, if that fails (network/cors), we could try proxy, 
            // but usually for CORS it fails instantly. 
            // Let's try wrapping with proxy to be safe for production if direct is known to be flaky with CORS.
            // However, Open-Elevation often supports CORS. Let's try direct first for Primary.
            const response = await fetch(urlPrimary);
            if (!response.ok) throw new Error(`Primary API Error: ${response.status}`);
            const data = await response.json();
            if (data && data.results) {
                this.processResults(batch, data.results);
                success = true;
            }
        } catch (error) {
            console.warn("Terrain: Primary API failed, switching to Secondary...", error);
        }

        // Try Secondary if Primary failed
        if (!success) {
            try {
                // console.log("Terrain: Trying Secondary (OpenTopoData)...");
                // OpenTopoData often has strict CORS. Use proxy.
                const response = await fetch(corsProxy + encodeURIComponent(urlSecondary));
                if (!response.ok) throw new Error(`Secondary API Error: ${response.status}`);
                const data = await response.json();
                if (data && data.results) {
                    this.processResults(batch, data.results);
                    success = true;
                }
            } catch (error) {
                console.warn("Terrain: Secondary API also failed.", error);
            }
        }
        
        // If both failed, we just leave them as null (pending) or could cache 0s
        if (!success) {
             // Optional: Cache 0s to stop retrying immediately? 
             // batch.forEach(item => this.cache.set(item.key, 0));
        }
    }

    processResults(batch, results) {
        results.forEach((result, index) => {
            // Match result back to batch item
            if (index < batch.length) {
                const item = batch[index];
                const elevationMeters = result.elevation;
                // Handle null elevation (ocean/error)
                const validElev = (elevationMeters !== null && elevationMeters !== undefined) ? elevationMeters : 0;
                const elevationFeet = validElev * 3.28084;
                this.cache.set(item.key, elevationFeet);
            }
        });
    }
}

export const terrainRadarService = new TerrainRadarService();
