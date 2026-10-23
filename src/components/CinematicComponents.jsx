
import React from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import './CinematicComponents.css';

const FadeOverlay = ({ phase, children }) => {
  return React.createElement('div', { className: `fade-overlay ${phase}` }, children);
};

FadeOverlay.propTypes = {
  phase: PropTypes.string,
  children: PropTypes.node
};

const CinematicReview = ({ callsign, selectedDeparture, selectedArrival, aircraftModel, weatherData, crewCount, failureType, difficulty, pax, payload, routeDetails, onComplete }) => {
  const { t } = useLanguage();
  // Safe access to weather data with fallbacks
  const safeWeatherData = weatherData || {
    windSpeed: 0,
    visibility: 0,
    cloudCover: 0,
    turbulence: 'none'
  };
  
  // Ensure turbulence has a valid string value
  const safeTurbulence = safeWeatherData.turbulence || 'none';
  
  // Safe access to other variables
  const safeCallsign = callsign || 'UNNAMED';
  const safeDepartureIata = selectedDeparture?.iata || 'DEP';
  const safeArrivalIata = selectedArrival?.iata || 'ARR';
  const safeAircraftModel = aircraftModel || 'UNKNOWN';
  const safeCrewCount = crewCount || 2;
  const safeFailureType = failureType || 'none';
  const safeDifficulty = difficulty || 'rookie';
  const safePax = pax || 0;
  const safePayload = payload || 0;

  const currentDate = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toISOString().split('T')[1].substring(0, 5) + 'Z';

  return (
    <div className="cinematic-review">
      <div className="fax-paper">
        <div className="stamp-box">{t('ui.cinematic.confidential')}</div>
        
        <div className="fax-header">
          <div className="fax-title-group">
            <h1 className="fax-title">{t('ui.cinematic.manifest_title')}</h1>
            <div style={{ fontSize: '0.8rem', letterSpacing: '2px' }}>{t('ui.cinematic.official_dispatch', { callsign: safeCallsign })}</div>
          </div>
          <div className="fax-meta">
            <div>{t('ui.cinematic.date')}: {currentDate}</div>
            <div>{t('ui.cinematic.time')}: {currentTime}</div>
            <div>{t('ui.cinematic.page', { page: '1 OF 1' })}</div>
          </div>
        </div>

        <div className="fax-content">
          
          {/* Section 1: Flight Data */}
          <div className="fax-section">
            <div className="fax-section-title">{t('ui.cinematic.sections.flight_data')}</div>
            <div className="fax-grid">
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.operator')}</span> <span className="fax-value">AVIATION INTERCEPT</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.aircraft')}</span> <span className="fax-value">{safeAircraftModel}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.origin')}</span> <span className="fax-value">{safeDepartureIata}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.destination')}</span> <span className="fax-value">{safeArrivalIata}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.pax_crew')}</span> <span className="fax-value">{safePax}/{safeCrewCount}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.payload')}</span> <span className="fax-value">{safePayload} KG</span></div>
            </div>
          </div>

          {/* Section 2: Detailed Route */}
          <div className="fax-section">
            <div className="fax-section-title">{t('ui.cinematic.sections.route_logistics')}</div>
            <div className="fax-grid">
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.departure_gate')}</span> <span className="fax-value">{routeDetails?.departureGate || 'AUTO'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.arrival_gate')}</span> <span className="fax-value">{routeDetails?.arrivalGate || 'AUTO'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.taxi_out')}</span> <span className="fax-value">{routeDetails?.departureTaxiway || 'AUTO'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.taxi_in')}</span> <span className="fax-value">{routeDetails?.landingTaxiway || 'AUTO'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.departure_rwy')}</span> <span className="fax-value">{routeDetails?.departureRunway || 'DEFAULT'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.landing_rwy')}</span> <span className="fax-value">{routeDetails?.landingRunway || 'DEFAULT'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.sid')}</span> <span className="fax-value">{routeDetails?.sid || 'N/A'}</span></div>
              <div className="fax-row"><span className="fax-label">{t('ui.cinematic.labels.star')}</span> <span className="fax-value">{routeDetails?.star || 'N/A'}</span></div>
            </div>
            {routeDetails?.waypoints && routeDetails.waypoints.length > 0 && (
              <div className="fax-row" style={{ marginTop: '1rem', borderBottom: 'none' }}>
                <span className="fax-label">{t('ui.cinematic.labels.waypoints')}</span>
                <span className="fax-value" style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                  {routeDetails.waypoints.map(wp => typeof wp === 'string' ? wp : (wp.name || 'WPT')).join(' > ')}
                </span>
              </div>
            )}
          </div>

          {/* Section 3: METAR */}
          <div className="fax-section">
            <div className="fax-section-title">{t('ui.cinematic.sections.metar_env')}</div>
            <div className="fax-grid">
              <div className="fax-row"><span className="fax-label">WIND</span> <span className="fax-value">{safeWeatherData.windSpeed} KTS</span></div>
              <div className="fax-row"><span className="fax-label">VISIBILITY</span> <span className="fax-value">{safeWeatherData.visibility} MI</span></div>
              <div className="fax-row"><span className="fax-label">TURBULENCE</span> <span className="fax-value">{safeTurbulence.toUpperCase()}</span></div>
              <div className="fax-row"><span className="fax-label">CLOUD COVER</span> <span className="fax-value">{safeWeatherData.cloudCover}%</span></div>
            </div>
          </div>

          {/* Section 4: Risk Assessment */}
          <div className="fax-section">
            <div className="fax-section-title">{t('ui.cinematic.sections.operational_risk')}</div>
            <div className="fax-grid">
              <div className="fax-row"><span className="fax-label">DIFFICULTY</span> <span className="fax-value">{safeDifficulty.toUpperCase()}</span></div>
              <div className="fax-row"><span className="fax-label">FAILURE MODE</span> <span className="fax-value">{safeFailureType.toUpperCase()}</span></div>
            </div>
          </div>

        </div>

        {onComplete && (
          <div className="fax-footer" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
            <button 
              className="accept-btn" 
              onClick={onComplete}
              style={{
                background: '#000',
                color: '#fff',
                border: '2px solid #000',
                padding: '10px 30px',
                fontFamily: 'monospace',
                fontSize: '1.2rem',
                cursor: 'pointer',
                letterSpacing: '2px'
              }}
            >
              {t('ui.cinematic.buttons.acknowledge')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

CinematicReview.propTypes = {
  callsign: PropTypes.string,
  selectedDeparture: PropTypes.shape({
    iata: PropTypes.string
  }),
  selectedArrival: PropTypes.shape({
    iata: PropTypes.string
  }),
  aircraftModel: PropTypes.string,
  weatherData: PropTypes.shape({
    windSpeed: PropTypes.number,
    visibility: PropTypes.number,
    cloudCover: PropTypes.number,
    turbulence: PropTypes.string
  }),
  crewCount: PropTypes.number,
  failureType: PropTypes.string,
  difficulty: PropTypes.string,
  pax: PropTypes.number,
  payload: PropTypes.number,
  routeDetails: PropTypes.shape({
    departureGate: PropTypes.string,
    arrivalGate: PropTypes.string,
    departureTaxiway: PropTypes.string,
    landingTaxiway: PropTypes.string,
    departureRunway: PropTypes.string,
    landingRunway: PropTypes.string,
    sid: PropTypes.string,
    star: PropTypes.string,
    waypoints: PropTypes.array
  }),
  onComplete: PropTypes.func
};

export { FadeOverlay, CinematicReview };
