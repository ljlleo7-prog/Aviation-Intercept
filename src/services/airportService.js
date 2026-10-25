import { loadInstalledAipPack } from './aipPackStorage.js';
import { isOfflineMode } from '../utils/appNetworkMode.js';
import airportDatabase from '../data/airportDatabase.json';
import { getVisualRunwayGeometry, getSourcedRunwayNames } from '../data/visualRunwayCoordinates.js';
import sceneryRunways from '../data/sceneryRunways.js';
import { getAirportReferenceByCode, getNearbyAirportReferences, searchAirportReferences } from './routes/adapters/airportReferenceAdapter.js';
import { getNearbyOurAirports, getOurAirportByCode, searchOurAirports } from './routes/adapters/ourAirportsAdapter.js';
import { fetchOpenAipReferences } from './routes/adapters/openAipAdapter.js';
import { buildReferenceCacheKey, getCachedReferenceData, setCachedReferenceData } from './routes/routeCacheService.js';
import { REFERENCE_DATA_TTL_MS } from './routes/routeTypes.js';
import {
  findSupabaseEmergencyLandingOptions,
  getSupabaseAirportDetails,
  getSupabaseAirportsWithinRadius,
  searchSupabaseAirports
} from './airportSupabaseService.js';

class AirportService {
  constructor(apiKey = '') {
    this.allAirports = airportDatabase.airports.map(airport => ({ ...airport }));
    this.applySceneryReferences(sceneryRunways);
    this.apiKey = apiKey;
    this.useLocalDatabase = !apiKey;
    this.freeTrialUsed = false;
  }

  async loadInstalledAirports() {
    const pack = await loadInstalledAipPack();
    const offline = isOfflineMode();
    if (this.installedAipSource === pack && this.offlineAirportData === offline) return Boolean(pack);
    this.installedAipSource = pack;
    this.offlineAirportData = offline;
    this.allAirports = [...this.builtInAirports];
    if (pack) {
      const known = new Map(this.builtInAirports.map(airport => [airport.icao, airport]));
      for (const airport of pack.airports) {
        const local = known.get(airport.icao);
        // Keep scenery geometry; fill missing fields from the AIP bundle.
        known.set(airport.icao, local ? { ...airport, ...local } : airport);
      }
      this.allAirports = [...known.values()];
    }
    return Boolean(pack);
  }

  applySceneryReferences(references) {
    // New identity invalidates spatial and code indexes after scenery updates.
    this.allAirports = [...this.allAirports];
    for (const source of Object.values(references)) {
      if (!source.airport) continue;
      const index = this.allAirports.findIndex(airport => (source.airport.icao && airport.icao === source.airport.icao) || (source.airport.iata && airport.iata === source.airport.iata));
      const runways = source.runways.map(([first, second, startLatitude, startLongitude, endLatitude, endLongitude, length, width]) => ({
        name: `${first}/${second}`, length, width, startLatitude, startLongitude, endLatitude, endLongitude
      }));
      const airport = { ...(index >= 0 ? this.allAirports[index] : {}), ...source.airport, runways,
        type: index >= 0 ? this.allAirports[index].type : source.airport.type };
      if (index >= 0) this.allAirports[index] = airport;
      else this.allAirports.push(airport);
    }
    this.builtInAirports = [...this.allAirports];
  }

  getAllAirports() {
    return this.allAirports;
  }

  getNormalAirports() {
    return this.allAirports.filter(airport => airport.type === 'normal');
  }

  getEmergencyAirports() {
    return this.allAirports.filter(airport => airport.type === 'emergency');
  }

  searchAirports(query, options = {}) {
    const { type = 'all', includeEmergency = true } = options;

    if (!query || query.trim().length < 2) {
      return [];
    }

    let airportsToSearch = this.allAirports;

    if (type === 'normal' || (!includeEmergency && type === 'all')) {
      airportsToSearch = this.getNormalAirports();
    } else if (type === 'emergency') {
      airportsToSearch = this.getEmergencyAirports();
    }

    const searchTerm = query.trim().toLowerCase();
    return airportsToSearch.filter(airport =>
      [airport.iata, airport.icao, airport.name, airport.city].some(value =>
        String(value || '').toLowerCase().includes(searchTerm))
    ).sort((a, b) => {
      const exact = airport => [airport.iata, airport.icao].some(code => String(code || '').toLowerCase() === searchTerm);
      return Number(exact(b)) - Number(exact(a));
    });
  }

  searchNormalAirports(query) {
    return this.searchAirports(query, { type: 'normal' });
  }

  mergeAirportResults(...resultSets) {
    const seen = new Set();
    return resultSets.flat().filter((airport) => {
      const key = String(airport?.icao || airport?.icaoCode || airport?.iata || airport?.iataCode || airport?.id || airport?.name || '').toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async searchAirportsRemote(query, options = {}) {
    if (await this.loadInstalledAirports()) return this.searchAirports(query, options);
    const localResults = this.searchAirports(query, options);
    if (isOfflineMode()) return localResults;
    if (!query || query.trim().length < 2) return [];
    const responses = await Promise.allSettled([
      searchSupabaseAirports(query.trim(), options),
      searchOurAirports({ query: query.trim() }),
      searchAirportReferences({ query: query.trim() })
    ]);
    const [supabaseResponse, ourAirportsResponse, referenceResponse] = responses.map(result => result.status === 'fulfilled' ? result.value : null);
    const results = this.mergeAirportResults(
      localResults,
      supabaseResponse?.status === 'ok' && Array.isArray(supabaseResponse.airports) ? supabaseResponse.airports : [],
      ourAirportsResponse?.status === 'ok' && Array.isArray(ourAirportsResponse.airports) ? ourAirportsResponse.airports : [],
      referenceResponse?.status === 'ok' && Array.isArray(referenceResponse.airports) ? referenceResponse.airports : []
    );
    for (const airport of results) {
      if (!this.getAirportByCode(airport.icao || airport.iata)) this.allAirports.push(airport);
    }
    const codes = new Set(results.map(airport => airport.icao || airport.iata));
    return this.searchAirports(query, options).filter(airport => codes.has(airport.icao || airport.iata));
  }

  async getAirportByCodeRemote(code) {
    if (await this.loadInstalledAirports()) return this.getAirportByCode(code) || null;
    const localAirport = this.getAirportByCode(code);
    if (isOfflineMode()) return localAirport || null;
    const [supabaseResponse, ourAirportResponse, referenceResponse] = await Promise.all([
      getSupabaseAirportDetails(code),
      getOurAirportByCode({ code }),
      getAirportReferenceByCode({ code })
    ]);
    const remoteAirports = [
      ...(supabaseResponse?.status === 'ok' && supabaseResponse.airport ? [supabaseResponse.airport] : []),
      ...(ourAirportResponse?.status === 'ok' && Array.isArray(ourAirportResponse.airports) ? ourAirportResponse.airports : []),
      ...(referenceResponse?.status === 'ok' && Array.isArray(referenceResponse.airports) ? referenceResponse.airports : [])
    ];
    return remoteAirports.reduce((merged, airport) => ({ ...(merged || {}), ...airport }), localAirport || null);
  }

  async getAirportsWithinRadiusRemote(latitude, longitude, radiusNm, options = {}) {
    if (await this.loadInstalledAirports()) return this.getAirportsWithinRadius(latitude, longitude, radiusNm, options);
    const localResults = this.getAirportsWithinRadius(latitude, longitude, radiusNm, options);
    if (isOfflineMode()) return localResults;
    const [supabaseResponse, ourAirportsResponse, referenceResponse] = await Promise.all([
      getSupabaseAirportsWithinRadius(latitude, longitude, radiusNm, options),
      getNearbyOurAirports({ latitude, longitude, radiusNm }),
      getNearbyAirportReferences({ latitude, longitude, radiusNm })
    ]);
    return this.mergeAirportResults(
      supabaseResponse?.status === 'ok' && Array.isArray(supabaseResponse.airports) ? supabaseResponse.airports : [],
      localResults,
      ourAirportsResponse?.status === 'ok' && Array.isArray(ourAirportsResponse.airports) ? ourAirportsResponse.airports : [],
      referenceResponse?.status === 'ok' && Array.isArray(referenceResponse.airports) ? referenceResponse.airports : []
    );
  }

  async getEmergencyLandingOptionsRemote(options = {}) {
    await this.loadInstalledAirports();
    const response = isOfflineMode() ? null : await findSupabaseEmergencyLandingOptions(options);
    if (response?.status === 'ok' && Array.isArray(response.options)) return response.options;

    const localAirports = this.getAirportsWithinRadius(
      options.latitude,
      options.longitude,
      options.maxRadiusNm || 150,
      { type: 'all' }
    );

    return localAirports
      .map((airport) => ({
        airport,
        bestRunway: this.getSuitableRunways(airport.icao || airport.iata, options.aircraftCategory || 'Light')[0] || this.getRunwayInfo(airport.icao || airport.iata)[0] || null,
        distanceNm: this.calculateDistance({ latitude: options.latitude, longitude: options.longitude }, airport),
        suitabilityScore: null,
        frequencies: this.getFrequencyInfo(airport.icao || airport.iata),
        navaids: []
      }))
      .filter((option) => option.bestRunway)
      .sort((a, b) => a.distanceNm - b.distanceNm)
      .slice(0, options.limit || 10);
  }

  searchEmergencyAirports(query) {
    return this.searchAirports(query, { type: 'emergency' });
  }

  getAirportByCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return undefined;
    if (this.codeIndexSource !== this.allAirports || this.codeIndexSize !== this.allAirports.length) {
      this.codeIndex = new Map();
      for (const airport of this.allAirports) {
        for (const value of [airport.icao, airport.iata]) {
          const key = String(value || '').toUpperCase();
          if (key && !this.codeIndex.has(key)) this.codeIndex.set(key, airport);
        }
      }
      this.codeIndexSource = this.allAirports;
      this.codeIndexSize = this.allAirports.length;
    }
    return this.codeIndex.get(normalized);
  }

  getAirportType(code) {
    const airport = this.getAirportByCode(code);
    return airport ? airport.type : null;
  }

  getPopularAirports() {
    const majorAirports = ['JFK', 'LAX', 'LHR', 'CDG', 'HND', 'DXB', 'SIN', 'SYD', 'FRA', 'ORD'];
    return this.getNormalAirports().filter(airport => majorAirports.includes(airport.iata));
  }

  calculateDistance(departure, arrival) {
    if (!departure || !arrival) return 0;

    const R = 3440;
    const lat1 = departure.latitude * Math.PI / 180;
    const lat2 = arrival.latitude * Math.PI / 180;
    const deltaLat = (arrival.latitude - departure.latitude) * Math.PI / 180;
    const deltaLon = (arrival.longitude - departure.longitude) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return Math.round(R * c);
  }

  getAirportsWithinRadius(latitude, longitude, radiusNm, options = {}) {
    const { type = 'all' } = options;

    let airportsToSearch = this.allAirports;
    if (type === 'normal') {
      airportsToSearch = this.getNormalAirports();
    } else if (type === 'emergency') {
      airportsToSearch = this.getEmergencyAirports();
    }

    return airportsToSearch.filter(airport => {
      const distance = this.calculateDistance(
        { latitude, longitude },
        { latitude: airport.latitude, longitude: airport.longitude }
      );
      return distance <= radiusNm;
    });
  }

  getAirportsByCategory(category, options = {}) {
    const { type = 'all' } = options;

    let airportsToSearch = this.allAirports;
    if (type === 'normal') {
      airportsToSearch = this.getNormalAirports();
    } else if (type === 'emergency') {
      airportsToSearch = this.getEmergencyAirports();
    }

    return airportsToSearch.filter(airport => airport.category === category);
  }

  getAirportByFrequency(frequency, position) {
    if (!Number.isFinite(frequency)) return undefined;
    const TOLERANCE = 0.005;
    const matches = this.allAirports.filter(airport =>
      airport.frequencies?.some(f => Math.abs(f.frequency - frequency) < TOLERANCE));
    if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) {
      // Frequencies are reused worldwide; an ambiguous match needs a location.
      return matches.length === 1 ? matches[0] : undefined;
    }
    let closest; let closestDistance = 200; // NM; ignore stations across the world.
    for (const airport of matches) {
      if (!Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) continue;
      const distance = this.calculateDistance(position, airport);
      if (distance < closestDistance) { closest = airport; closestDistance = distance; }
    }
    return closest;
  }

  getRunwayInfo(airportCode) {
    const airport = this.getAirportByCode(airportCode);
    if (!airport) return [];

    if (airport.runways && Array.isArray(airport.runways)) {
      return airport.runways;
    }

    if (airport.runway && airport.runwayLength) {
      return [{
        name: airport.runway,
        length: airport.runwayLength,
        surface: 'Unknown',
        category: airport.category
      }];
    }

    return [];
  }

  getFrequencyInfo(airportCode) {
    const airport = this.getAirportByCode(airportCode);
    return airport && airport.frequencies ? airport.frequencies : [];
  }

  getSuitableRunways(airportCode, aircraftCategory) {
    const runways = this.getRunwayInfo(airportCode);
    return runways.filter(runway => {
      switch (aircraftCategory) {
        case 'Heavy':
          return runway.category === 'Heavy';
        case 'Medium':
          return runway.category === 'Medium' || runway.category === 'Heavy';
        case 'Light':
          return true;
        default:
          return false;
      }
    });
  }

  getEnhancedAirportData(airportCode) {
    const airport = this.getAirportByCode(airportCode);
    if (!airport) return null;

    const enhancedData = { ...airport };

    if (airport.category === '4F') {
      enhancedData.facilities = [
        'Multiple Terminals',
        'International Gates',
        'Cargo Facilities',
        'Maintenance Hangars',
        'Fuel Services',
        'De-icing Equipment'
      ];
      enhancedData.operatingHours = '24/7';
    } else if (airport.category === '4E') {
      enhancedData.facilities = [
        'Main Terminal',
        'Regional Gates',
        'Cargo Facilities',
        'Fuel Services'
      ];
      enhancedData.operatingHours = '05:00-24:00';
    }

    return enhancedData;
  }

  getIlsFrequency(airportCode, finalRunwayName, rawRunwayName) {
    const canonicalCode = this.getAirportByCode(airportCode)?.icao || String(airportCode || '').trim().toUpperCase();
    const ILS_FREQUENCIES = {
      "KLAX": { "24R": 108.50, "24L": 108.40, "25R": 108.75, "25L": 109.90, "06L": 108.40, "06R": 108.50, "07L": 109.90, "07R": 108.75 },
      "KSFO": { "28L": 109.55, "28R": 111.70, "19L": 108.90, "19R": 108.70, "01L": 110.50, "01R": 109.30 },
      "KJFK": { "04R": 109.50, "22L": 110.90, "13L": 111.50, "31R": 112.30 },
      "ZSSS": { "18L": 109.30, "36R": 110.30, "18R": 109.90, "36L": 111.90 },
      "SHA": { "18L": 109.30, "36R": 110.30, "18R": 109.90, "36L": 111.90 }
    };
    if (ILS_FREQUENCIES[canonicalCode]?.[finalRunwayName]) {
      return ILS_FREQUENCIES[canonicalCode][finalRunwayName];
    }
    const seedSource = `${canonicalCode}:${String(finalRunwayName || rawRunwayName || '').trim().toUpperCase()}`;
    let seed = 0;
    for (let i = 0; i < seedSource.length; i++) {
      seed = (seed * 31 + seedSource.charCodeAt(i)) % 200000;
    }
    const channel = seed % 40;
    return Number((108.10 + (channel * 0.1)).toFixed(2));
  }

  getRunwayGeometry(airportCode, runwayName) {
    const airport = this.getAirportByCode(airportCode);
    if (!airport) return null;

    const sourcedEnd = String(runwayName || getSourcedRunwayNames(airportCode)[0] || '').trim().toUpperCase().split(/[/-]/)[0];
    const sourced = getVisualRunwayGeometry(airportCode, sourcedEnd, null);
    if (sourced) {
      return { ...sourced, airportLat: airport.latitude, airportLon: airport.longitude,
        ilsFrequency: this.getIlsFrequency(airportCode, sourced.runwayName, runwayName) };
    }

    const requestedRunway = String(runwayName || '').trim().toUpperCase();
    const splitRunwayEnds = (name) => String(name || '')
      .split(/[/-]/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);

    let runway = null;
    let matchedRunwayEnd = '';

    if (airport.runways && Array.isArray(airport.runways)) {
      if (requestedRunway) {
        runway = airport.runways.find((r) => String(r.name || '').trim().toUpperCase() === requestedRunway) || null;
      }

      if (!runway && requestedRunway) {
        runway = airport.runways.find((r) => splitRunwayEnds(r.name).includes(requestedRunway)) || null;
        if (runway) {
          matchedRunwayEnd = requestedRunway;
        }
      }
    }

    // Never silently select a different runway for an explicit request.
    if (requestedRunway && !runway) return null;

    // Free-flight scenery may still use an approximate default runway.
    if (!runway) {
      if (airport.runways && Array.isArray(airport.runways) && airport.runways.length > 0) {
        runway = airport.runways[0];
      } else if (airport.runway) {
        runway = { name: airport.runway, length: airport.runwayLength || 8000 };
      } else {
        runway = { name: "09/27", length: 8000 };
      }
    }

    const runwayEnds = splitRunwayEnds(runway.name);
    const primaryRunwayEnd = runwayEnds[0] || String(runway.name || '').trim().toUpperCase() || '09';
    const reciprocalRunwayEnd = runwayEnds[1] || '';
    const selectedRunwayEnd = matchedRunwayEnd || (runwayEnds.includes(requestedRunway) ? requestedRunway : '');

    const parseRunwayHeading = (designator) => {
      const headingMatch = String(designator || '').match(/^(\d{2})/);
      if (!headingMatch) return 0;
      const runwayNumber = parseInt(headingMatch[1], 10);
      return runwayNumber === 36 ? 360 : runwayNumber * 10;
    };

    // Runway designators are rounded labels; parallel strips can use different numbers.
    const storedBearing = runway.bearing == null || String(runway.bearing).trim() === ''
      ? NaN : Number(runway.bearing);
    let primaryHeadingDeg = Number.isFinite(storedBearing)
      ? ((storedBearing % 360) + 360) % 360
      : parseRunwayHeading(primaryRunwayEnd);
    const hasStoredGeometry = [runway.startLatitude, runway.startLongitude, runway.endLatitude, runway.endLongitude]
      .every(value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)));
    if (hasStoredGeometry && !Number.isFinite(storedBearing)) {
      const north = Number(runway.endLatitude) - Number(runway.startLatitude);
      const east = (Number(runway.endLongitude) - Number(runway.startLongitude))
        * Math.cos((Number(runway.startLatitude) + Number(runway.endLatitude)) / 2 * Math.PI / 180);
      primaryHeadingDeg = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
    }
    const reciprocalHeadingDeg = (primaryHeadingDeg + 180) % 360;

    if (hasStoredGeometry) {
      const startThreshold = {
        latitude: Number(runway.startLatitude),
        longitude: Number(runway.startLongitude),
        elevation: Number(airport.elevation) || 0
      };
      const endThreshold = {
        latitude: Number(runway.endLatitude),
        longitude: Number(runway.endLongitude),
        elevation: Number(airport.elevation) || 0
      };
      const selectedIsReciprocal = selectedRunwayEnd && selectedRunwayEnd === reciprocalRunwayEnd;
      const finalRunwayName = selectedRunwayEnd || requestedRunway || primaryRunwayEnd || runway.name;
      const finalHeading = selectedIsReciprocal
        ? reciprocalHeadingDeg
        : primaryHeadingDeg;
      return {
        airportCode: String(airportCode || airport.iata || airport.icao || '').trim().toUpperCase(),
        airportLat: airport.latitude,
        airportLon: airport.longitude,
        heading: finalHeading,
        headingSource: Number.isFinite(storedBearing) ? 'published-bearing' : 'threshold-coordinates',
        length: (Number(runway.length) || 8000) * 0.3048,
        width: (Number(runway.width) || 45 * 3.28084) * 0.3048,
        thresholdStart: selectedIsReciprocal ? endThreshold : startThreshold,
        thresholdEnd: selectedIsReciprocal ? startThreshold : endThreshold,
        runwayName: finalRunwayName,
        ilsFrequency: this.getIlsFrequency(airportCode, finalRunwayName, runway.name)
      };
    }

    // Dimensions
    // Assuming length is in feet (standard in aviation databases here), convert to meters
    const lengthM = (runway.length || 8000) * 0.3048;
    const widthM = 45; // Standard width in meters

    // Calculate endpoints
    // Midpoint is airport lat/lon
    // We need to convert meters to lat/lon degrees
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;

    // Calculate offsets from midpoint to ends (half length)
    // We assume the runway is centered at the airport coordinates
    const halfLength = lengthM / 2;

    // Primary direction follows the first listed runway end in the database name.
    const dLat = (halfLength * Math.cos(primaryHeadingDeg * toRad)) / R * toDeg;
    const dLon = (halfLength * Math.sin(primaryHeadingDeg * toRad)) / (R * Math.cos(airport.latitude * toRad)) * toDeg;

    const p1 = {
      latitude: airport.latitude - dLat,
      longitude: airport.longitude - dLon,
      elevation: Number(airport.elevation) || 0
    };

    const p2 = {
      latitude: airport.latitude + dLat,
      longitude: airport.longitude + dLon,
      elevation: Number(airport.elevation) || 0
    };

    let start = p1;
    let end = p2;
    let finalHeading = primaryHeadingDeg;
    let finalRunwayName = selectedRunwayEnd || requestedRunway || primaryRunwayEnd || runway.name;

    if (selectedRunwayEnd && selectedRunwayEnd === reciprocalRunwayEnd) {
      start = p2;
      end = p1;
      finalHeading = reciprocalHeadingDeg;
      finalRunwayName = reciprocalRunwayEnd;
    } else if (selectedRunwayEnd && selectedRunwayEnd === primaryRunwayEnd) {
      finalHeading = primaryHeadingDeg;
      finalRunwayName = primaryRunwayEnd;
    }

    const ilsFrequency = this.getIlsFrequency(airportCode, finalRunwayName, runway.name);

    return {
      airportCode: String(airportCode || airport.iata || airport.icao || '').trim().toUpperCase(),
      airportLat: airport.latitude,
      airportLon: airport.longitude,
      heading: finalHeading,
      headingSource: Number.isFinite(storedBearing) ? 'published-bearing' : 'designator-estimate',
      length: lengthM,
      width: widthM,
      thresholdStart: start,
      thresholdEnd: end,
      runwayName: finalRunwayName,
      ilsFrequency: ilsFrequency
    };
  }

  async getRouteReferenceAirportData(airportCode) {
    const airport = this.getAirportByCode(airportCode);
    if (!airport) return null;

    const cacheKey = buildReferenceCacheKey({ type: 'airport', airport, query: airportCode });
    const cached = getCachedReferenceData(cacheKey, REFERENCE_DATA_TTL_MS);
    if (cached) {
      return cached;
    }

    const response = await fetchOpenAipReferences({
      query: airport.icao || airport.iata || airport.name,
      type: 'airport'
    });

    if (response?.status !== 'ok' || !Array.isArray(response.references) || !response.references.length) {
      const localReferenceData = {
        airport,
        references: [],
        source: 'local',
        billing: response?.billing || { chargedTokens: 0 },
        status: response?.status || 'ok'
      };
      setCachedReferenceData(cacheKey, localReferenceData);
      return localReferenceData;
    }

    const matchedReference = response.references.find((reference) =>
      reference.icaoCode === String(airport.icao || '').toUpperCase() ||
      reference.iataCode === String(airport.iata || '').toUpperCase() ||
      reference.identifier === String(airport.icao || '').toUpperCase() ||
      reference.identifier === String(airport.iata || '').toUpperCase()
    ) || response.references[0];

    const referenceData = {
      airport: {
        ...airport,
        latitude: matchedReference.latitude ?? airport.latitude,
        longitude: matchedReference.longitude ?? airport.longitude,
        openAipReference: matchedReference
      },
      references: response.references,
      source: 'openaip',
      billing: response.billing || { chargedTokens: 1 },
      status: response.status
    };

    setCachedReferenceData(cacheKey, referenceData);
    return referenceData;
  }

}

export const airportService = new AirportService();
export const createAirportService = (apiKey) => new AirportService(apiKey);

export default AirportService;
