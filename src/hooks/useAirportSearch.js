import { useState, useCallback } from 'react';
import { airportService } from '../services/airportService';

const useAirportSearch = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDeparture, setSelectedDeparture] = useState(null);
  const [selectedArrival, setSelectedArrival] = useState(null);

  const searchAirports = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const filteredAirports = await airportService.searchAirportsRemote(query);

      setSearchResults(filteredAirports.slice(0, 10));
    } catch (err) {
      setError('Failed to search airports');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectDeparture = useCallback((airport) => {
    setSelectedDeparture(airport);
    setSearchResults([]);
  }, []);

  const selectArrival = useCallback((airport) => {
    setSelectedArrival(airport);
    setSearchResults([]);
  }, []);

  const clearSelection = useCallback((type = null) => {
    if (type === 'departure') {
      setSelectedDeparture(null);
    } else if (type === 'arrival') {
      setSelectedArrival(null);
    } else {
      setSelectedDeparture(null);
      setSelectedArrival(null);
    }
  }, []);

  const getAirportByCode = useCallback((code) => {
    return airportService.getAirportByCode(code);
  }, []);

  const getAirportByCodeRemote = useCallback(async (code) => {
    if (!code || code.trim().length < 3) return null;
    try {
      return await airportService.getAirportByCodeRemote(code.trim().toUpperCase());
    } catch {
      return airportService.getAirportByCode(code.trim().toUpperCase());
    }
  }, []);

  return {
    searchResults,
    isLoading,
    error,
    selectedDeparture,
    selectedArrival,
    searchAirports,
    selectDeparture,
    selectArrival,
    clearSelection,
    getAirportByCode,
    getAirportByCodeRemote
  };
};

export default useAirportSearch;