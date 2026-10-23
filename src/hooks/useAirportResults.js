import { isAirportSuitableForMap } from '../services/airportMapData.js';
import { useEffect, useState } from 'react';
import { airportService } from '../services/airportService.js';

// Show local matches immediately; ignore responses for superseded queries.
export default function useAirportResults(query, limit = 10, mapAircraft = null) {
  const [remote, setRemote] = useState({ query: '', results: [] });
  useEffect(() => {
    let cancelled = false;
    if (!query || query.trim().length < 2) return;
    const timer = setTimeout(() => {
      airportService.searchAirportsRemote(query).then(results => {
        if (!cancelled) setRemote({ query, results });
      }).catch(() => { /* Local matches remain usable offline. */ });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  const results = remote.query === query ? remote.results : airportService.searchAirports(query);
  return (mapAircraft ? results.filter(airport => isAirportSuitableForMap(airport, mapAircraft)) : results).slice(0, limit);
}
