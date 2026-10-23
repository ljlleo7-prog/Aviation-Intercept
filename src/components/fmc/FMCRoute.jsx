import { useLanguage } from '../../contexts/LanguageContext';
import { useCallback } from 'react';
import PropTypes from 'prop-types';
import AirportSearchInput from '../AirportSearchInput.jsx';
import { airportService } from '../../services/airportService';

const MIN_SEARCH_LENGTH = 2;

const getAirportCodeLabel = (airport) => {
  if (!airport) return '---';
  const primary = airport.icao || airport.iata || '---';
  const secondary = airport.iata && airport.iata !== primary ? ` / ${airport.iata}` : '';
  return `${primary}${secondary}`;
};

const getAirportSummary = (airport) => {
  if (!airport) return null;
  return [airport.city, airport.country].filter(Boolean).join(', ');
};

const buildSearchStatus = (query, results, selectedAirport, tx) => {
  if (selectedAirport) {
    return { status: 'selected', message: '' };
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return { status: 'idle', message: tx('Search by ICAO, IATA, city, or airport name.') };
  }

  if (trimmed.length < MIN_SEARCH_LENGTH) {
    return { status: 'idle', message: tx('Enter at least 2 characters.') };
  }

  if (results.length === 0) {
    return { status: 'no-results', message: tx('No airport found for “${query}”.', { query: trimmed.toUpperCase() }) };
  }

  return { status: 'idle', message: '' };
};

const AirportSelectorCard = ({
  label,
  placeholder,
  value,
  selectedAirport,
  onSearchChange,
  searchResults,
  onSelect,
  helperText,
  validationState = 'idle'
}) => {
  const { tx } = useLanguage();
  const searchStatus = buildSearchStatus(value, searchResults, selectedAirport, tx);
  const status = validationState !== 'idle' ? validationState : searchStatus.status;

  return (
    <div className={`fmc-airport-card ${validationState !== 'idle' ? validationState : ''}`.trim()}>
      <div className="fmc-airport-card-header">
        <div>
          <div className="fmc-label">{label}</div>
          <div className="fmc-airport-code-summary">{getAirportCodeLabel(selectedAirport)}</div>
        </div>
        {helperText && <div className="fmc-airport-helper">{helperText}</div>}
      </div>

      <AirportSearchInput
        placeholder={placeholder}
        onSelect={onSelect}
        selectedAirport={selectedAirport}
        searchResults={searchResults}
        handleSearch={onSearchChange}
        status={status}
        statusMessage={validationState !== 'idle' ? helperText : searchStatus.message}
        className="fmc-airport-search"
        badgeClassName="fmc-airport-badge"
        inputClassName="fmc-airport-input"
      />

      {selectedAirport && (
        <div className="fmc-airport-meta">
          <span>{selectedAirport.name}</span>
          {getAirportSummary(selectedAirport) && <span>{getAirportSummary(selectedAirport)}</span>}
        </div>
      )}
    </div>
  );
};

AirportSelectorCard.propTypes = {
  label: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  selectedAirport: PropTypes.object,
  onSearchChange: PropTypes.func.isRequired,
  searchResults: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  helperText: PropTypes.string,
  validationState: PropTypes.oneOf(['idle', 'warning', 'error'])
};

const FMCRoute = ({
  routeDetails,
  selectedDeparture,
  selectedArrival,
  onSelectDeparture,
  onSelectArrival,
  onUpdateRouteDetails,
  flightState,
  routeSearchState,
  routeValidation
}) => {
  const { tx } = useLanguage();
  const handleAlternateSelect = useCallback((airport) => {
    onUpdateRouteDetails?.({ alternate: airport || null });
  }, [onUpdateRouteDetails]);

  const handleDepartureSearch = useCallback((value) => {
    routeSearchState?.setDepartureQuery?.(value);
  }, [routeSearchState]);

  const handleArrivalSearch = useCallback((value) => {
    routeSearchState?.setArrivalQuery?.(value);
  }, [routeSearchState]);

  const handleAlternateSearch = useCallback((value) => {
    routeSearchState?.setAlternateQuery?.(value);
  }, [routeSearchState]);

  const selectedAlternate = routeDetails?.alternate || null;

  return (
    <div className="fmc-page fmc-route-page">
      <h4 className="fmc-page-title">{tx("Route Setup")}</h4>

      <div className="fmc-route-grid">
        <AirportSelectorCard
          label={tx("Departure")}
          placeholder="Search departure airport"
          value={routeSearchState?.departureQuery || ''}
          selectedAirport={selectedDeparture}
          onSearchChange={handleDepartureSearch}
          searchResults={routeSearchState?.departureResults || []}
          onSelect={onSelectDeparture}
          helperText={routeValidation?.departureMessage}
          validationState={routeValidation?.departureState || 'idle'}
        />

        <AirportSelectorCard
          label={tx("Arrival")}
          placeholder="Search arrival airport"
          value={routeSearchState?.arrivalQuery || ''}
          selectedAirport={selectedArrival}
          onSearchChange={handleArrivalSearch}
          searchResults={routeSearchState?.arrivalResults || []}
          onSelect={onSelectArrival}
          helperText={routeValidation?.arrivalMessage}
          validationState={routeValidation?.arrivalState || 'idle'}
        />

        <AirportSelectorCard
          label="Alternate"
          placeholder="Optional alternate airport"
          value={routeSearchState?.alternateQuery || ''}
          selectedAirport={selectedAlternate}
          onSearchChange={handleAlternateSearch}
          searchResults={routeSearchState?.alternateResults || []}
          onSelect={handleAlternateSelect}
          helperText={routeValidation?.alternateMessage}
          validationState={routeValidation?.alternateState || 'idle'}
        />
      </div>

      {routeValidation?.routeState === 'error' && routeValidation?.routeMessage && (
        <div className="fmc-banner error">{routeValidation.routeMessage}</div>
      )}
      {routeValidation?.routeState === 'success' && routeValidation?.routeMessage && (
        <div className="fmc-banner success">{routeValidation.routeMessage}</div>
      )}

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div className="fmc-label">{tx("Route Summary")}</div>
          <div className={`fmc-status-pill ${routeValidation?.isRouteReady ? 'ready' : ''}`}>{routeValidation?.isRouteReady ? tx("Ready") : tx('Incomplete')}</div>
        </div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card">
            <span className="fmc-stat-label">{tx("Departure runway")}</span>
            <span className="fmc-stat-value">{routeDetails?.departureRunway || 'Not set'}</span>
          </div>
          <div className="fmc-stat-card">
            <span className="fmc-stat-label">{tx("Arrival runway")}</span>
            <span className="fmc-stat-value">{routeDetails?.landingRunway || 'Not set'}</span>
          </div>
          <div className="fmc-stat-card">
            <span className="fmc-stat-label">{tx("Waypoints")}</span>
            <span className="fmc-stat-value">{routeDetails?.waypoints?.length || 0}</span>
          </div>
          <div className="fmc-stat-card">
            <span className="fmc-stat-label">{tx("Distance")}</span>
            <span className="fmc-stat-value">
              {selectedDeparture && selectedArrival
                ? `${airportService.calculateDistance(selectedDeparture, selectedArrival).toLocaleString()} NM`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {flightState && (
        <div className="fmc-section">
          <div className="fmc-label">{tx("Current position")}</div>
          <div className="fmc-value">{flightState.latitude?.toFixed(4)}, {flightState.longitude?.toFixed(4)}</div>
        </div>
      )}
    </div>
  );
};

FMCRoute.propTypes = {
  routeDetails: PropTypes.object,
  selectedDeparture: PropTypes.object,
  selectedArrival: PropTypes.object,
  onSelectDeparture: PropTypes.func,
  onSelectArrival: PropTypes.func,
  onUpdateRouteDetails: PropTypes.func,
  flightState: PropTypes.object,
  routeSearchState: PropTypes.shape({
    departureQuery: PropTypes.string,
    arrivalQuery: PropTypes.string,
    alternateQuery: PropTypes.string,
    departureResults: PropTypes.array,
    arrivalResults: PropTypes.array,
    alternateResults: PropTypes.array,
    setDepartureQuery: PropTypes.func,
    setArrivalQuery: PropTypes.func,
    setAlternateQuery: PropTypes.func
  }),
  routeValidation: PropTypes.shape({
    departureState: PropTypes.string,
    departureMessage: PropTypes.string,
    arrivalState: PropTypes.string,
    arrivalMessage: PropTypes.string,
    alternateState: PropTypes.string,
    alternateMessage: PropTypes.string,
    routeState: PropTypes.string,
    routeMessage: PropTypes.string,
    isRouteReady: PropTypes.bool
  })
};

export default FMCRoute;
