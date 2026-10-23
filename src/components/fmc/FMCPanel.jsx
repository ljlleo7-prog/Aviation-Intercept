import { useLanguage } from '../../contexts/LanguageContext';
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import FMCService from '../../services/FMCService';
import FMCInit from './FMCInit';
import FMCRoute from './FMCRoute';
import FMCLegs from './FMCLegs';
import FMCProgress from './FMCProgress';
import FMCPerformance from './FMCPerformance';
import FMCWeather from './FMCWeather';
import FMCUtilities from './FMCUtilities';
import FMCApproach from './FMCApproach';
import './FMCPanel.css';
import FlightMapWorkspace from '../FlightMapWorkspace';

const FMCPanel = ({
  onClose,
  flightPlan,
  onUpdateFlightPlan,
  flightState,
  aircraftData,
  aircraftSuggestions,
  weatherData,
  preflightMode = false,
  preflightConfig,
  routeDetails,
  onUpdatePreflight,
  onUpdateRouteDetails,
  onSelectDeparture,
  onSelectArrival,
  routeSearchState,
  tabletReadiness,
  routeValidation,
  onActionRequest,
  selectedArrival
}) => {
  const { tx } = useLanguage();
  const [activePage, setActivePage] = useState(preflightMode ? 'init' : 'progress');
  const fmcService = useMemo(() => new FMCService(), []);
  const planView = useMemo(() => fmcService.getPlanView(flightPlan), [fmcService, flightPlan]);

  const pages = [
    { id: 'maps', label: tx("Maps"), icon: '⌖' },
    { id: 'init', label: tx("Overview"), icon: '🧾' },
    { id: 'route', label: tx("Route"), icon: '🗺️' },
    { id: 'legs', label: tx("Legs"), icon: '📍' },
    { id: 'approach', label: tx('Approach'), icon: '↘' },
    { id: 'progress', label: tx("Live"), icon: '📊' },
    { id: 'perf', label: tx("Load"), icon: '✈️' },
    { id: 'weather', label: tx("Weather"), icon: '🌦️' },
    { id: 'tools', label: tx("Tools"), icon: '🧮' }
  ];

  const visiblePages = preflightMode ? pages.filter((page) => !['progress', 'weather', 'tools', 'approach'].includes(page.id)) : pages;

  const handleUpdateLegs = (nextFlightPlan) => {
    if (preflightMode) {
      onUpdateRouteDetails?.({ waypoints: nextFlightPlan?.waypoints || [] });
      return;
    }
    onUpdateFlightPlan?.(nextFlightPlan);
  };

  const handleExecuteTemporaryPlan = () => {
    if (preflightMode) return;
    onUpdateFlightPlan?.(fmcService.executeTemporaryPlan(flightPlan));
  };

  const handleDiscardTemporaryPlan = () => {
    if (preflightMode) return;
    onUpdateFlightPlan?.(fmcService.discardTemporaryPlan(flightPlan));
  };

  return (
    <div className={`fmc-panel ${preflightMode ? 'preflight-tablet' : ''}`.trim()}>
      <div className="fmc-header">
        <div>
          <div className="fmc-kicker">{preflightMode ? tx("Dispatch tablet") : tx("Flight computer")}</div>
          <h3>{preflightMode ? tx("Preflight setup") : tx("Flight Computer")}</h3>
        </div>
        {preflightMode ? (
          <div className="fmc-tablet-statusbar">
            <span className={`fmc-status-pill ${tabletReadiness?.isRouteReady ? 'ready' : ''}`}>{tx("Route")}</span>
            <span className={`fmc-status-pill ${tabletReadiness?.isLoadoutReady ? 'ready' : ''}`}>{tx("Loadout")}</span>
            <span className={`fmc-status-pill ${tabletReadiness?.isPerformanceReady ? 'ready' : ''}`}>{tx("Perf")}</span>
          </div>
        ) : (
          <button className="fmc-close" onClick={onClose}>×</button>
        )}
      </div>

      <div className="fmc-nav">
        {visiblePages.map((page) => (
          <button key={page.id} className={`fmc-nav-btn ${activePage === page.id ? 'active' : ''}`} onClick={() => setActivePage(page.id)}>
            <span className="fmc-nav-icon" aria-hidden="true">{String(visiblePages.indexOf(page) + 1).padStart(2, '0')}</span>
            <span className="fmc-nav-label">{tx(page.label)}</span>
          </button>
        ))}
      </div>

      <div className="fmc-content">
        {activePage === 'approach' && <FMCApproach flightState={flightState} arrival={selectedArrival || flightPlan?.arrival} onActionRequest={onActionRequest} />}
        {activePage === 'maps' && <FlightMapWorkspace aircraftData={aircraftData} flightPlan={flightPlan} flightState={flightState} departure={preflightConfig?.selectedDeparture} arrival={preflightConfig?.selectedArrival} routeDetails={routeDetails} />}
        {!preflightMode && planView.validation.execPending && (
          <div className="fmc-banner warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{tx("TEMPY")}{planView.validation.pendingChanges > 0 ? `· ${planView.validation.pendingChanges} pending change${planView.validation.pendingChanges === 1 ? '' : 's'}` : ''}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleDiscardTemporaryPlan}>{tx("CANCEL MOD")}</button>
              <button onClick={handleExecuteTemporaryPlan}>{tx("EXEC")}</button>
            </div>
          </div>
        )}
        {activePage === 'init' && <FMCInit aircraftData={aircraftData} preflightConfig={preflightConfig} onUpdatePreflight={onUpdatePreflight} aircraftSuggestions={aircraftSuggestions} />}
        {activePage === 'route' && (
          <FMCRoute
            routeDetails={routeDetails}
            selectedDeparture={preflightConfig?.selectedDeparture}
            selectedArrival={preflightConfig?.selectedArrival}
            onSelectDeparture={onSelectDeparture}
            onSelectArrival={onSelectArrival}
            onUpdateRouteDetails={onUpdateRouteDetails}
            flightState={flightState}
            routeSearchState={routeSearchState}
            routeValidation={routeValidation}
          />
        )}
        {activePage === 'legs' && (
          <FMCLegs
            flightPlan={flightPlan}
            flightState={flightState}
            fmcService={fmcService}
            planView={planView}
            onUpdateFlightPlan={handleUpdateLegs}
          />
        )}
        {!preflightMode && activePage === 'progress' && (
          <FMCProgress
            fmcService={fmcService}
            flightPlan={flightPlan}
            flightState={flightState}
            preflightConfig={preflightConfig}
            aircraftData={aircraftData}
          />
        )}
        {activePage === 'perf' && (
          <FMCPerformance
            preflightConfig={preflightConfig}
            aircraftData={aircraftData}
            flightState={flightState}
            weatherData={weatherData}
            onUpdatePreflight={onUpdatePreflight}
            readiness={tabletReadiness}
            flightPlan={flightPlan}
          />
        )}
        {!preflightMode && activePage === 'weather' && <FMCWeather weatherData={weatherData} flightState={flightState} />}
        {!preflightMode && activePage === 'tools' && <FMCUtilities />}
      </div>
    </div>
  );
};

FMCPanel.propTypes = {
  onActionRequest: PropTypes.func,
  selectedArrival: PropTypes.object,
  onClose: PropTypes.func,
  flightPlan: PropTypes.any,
  onUpdateFlightPlan: PropTypes.func,
  flightState: PropTypes.object,
  aircraftData: PropTypes.object,
  weatherData: PropTypes.object,
  preflightMode: PropTypes.bool,
  preflightConfig: PropTypes.object,
  routeDetails: PropTypes.object,
  onUpdatePreflight: PropTypes.func,
  onUpdateRouteDetails: PropTypes.func,
  onSelectDeparture: PropTypes.func,
  onSelectArrival: PropTypes.func,
  routeSearchState: PropTypes.object,
  tabletReadiness: PropTypes.object,
  routeValidation: PropTypes.object,
  aircraftSuggestions: PropTypes.any
};

export default FMCPanel;
