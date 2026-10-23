import { useLanguage } from '../../contexts/LanguageContext';
import PropTypes from 'prop-types';
import { calculateRouteProgress } from '../../services/efb/RouteProgress.js';
import { calculateFuelPlan, calculateAltitudeAdvisory } from '../../services/efb/FuelPlanning.js';
import { formatNumber } from '../../services/efb/UnitConversion.js';

const FMCProgress = ({ fmcService, flightPlan, flightState, preflightConfig, aircraftData }) => {
  const { tx } = useLanguage();
  const routeProgress = calculateRouteProgress({ flightPlan, flightState });
  const fuelPlan = calculateFuelPlan({ flightState, routeProgress, preflightConfig, aircraftData });
  const targetAltitude = Number(preflightConfig?.cruiseHeight) || 3000;
  const altitudeAdvisory = calculateAltitudeAdvisory({ flightState, targetAltitude });
  const tod = fmcService.calculateTOD(flightState?.altitude || 0, 3000, flightState?.groundSpeed || 0);

  return (
    <div className="fmc-page efb-page">
      <h4 className="fmc-page-title">{tx("PROGRESS")}</h4>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Active leg")}</div>
            <div className="fmc-section-subtitle">{tx("Live route and energy picture.")}</div>
          </div>
          <div className={`fmc-status-pill ${routeProgress.dataQuality?.hasRoute ? 'ready' : ''}`}>
            {routeProgress.dataQuality?.hasRoute ? 'Route loaded' : 'No route'}
          </div>
        </div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Active waypoint")}</span><span className="fmc-stat-value">{routeProgress.activeIdent}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Index")}</span><span className="fmc-stat-value">{routeProgress.waypointCount > 0 ? `${routeProgress.currentIndex + 1}/${routeProgress.waypointCount}` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Distance to next")}</span><span className="fmc-stat-value">{routeProgress.distanceToNext !== null ? `${formatNumber(routeProgress.distanceToNext, 1)} NM` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("ETE next")}</span><span className="fmc-stat-value">{routeProgress.eteNextText}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Destination progress")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Distance remaining")}</span><span className="fmc-stat-value">{routeProgress.distanceRemaining !== null ? `${formatNumber(routeProgress.distanceRemaining, 1)} NM` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("ETE destination")}</span><span className="fmc-stat-value">{routeProgress.eteDestinationText}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("ETA destination")}</span><span className="fmc-stat-value">{routeProgress.etaDestinationText}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Route complete")}</span><span className="fmc-stat-value">{routeProgress.routeCompletePercent !== null ? `${formatNumber(routeProgress.routeCompletePercent, 0)} %` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Fuel outlook")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Fuel remaining")}</span><span className="fmc-stat-value">{`${formatNumber(fuelPlan.fuelRemaining, 0)} kg`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Burn rate")}</span><span className="fmc-stat-value">{fuelPlan.dataQuality?.hasFuelFlow ? `${formatNumber(fuelPlan.fuelFlowKgH, 0)} kg/h` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Endurance")}</span><span className="fmc-stat-value">{fuelPlan.enduranceText}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Est. dest fuel")}</span><span className="fmc-stat-value">{fuelPlan.destinationFuel !== null ? `${formatNumber(fuelPlan.destinationFuel, 0)} kg` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Vertical profile")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Ground speed")}</span><span className="fmc-stat-value">{`${formatNumber(flightState?.groundSpeed || 0, 0)} kt`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Altitude")}</span><span className="fmc-stat-value">{`${formatNumber(flightState?.altitude || 0, 0)} ft`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Time to target alt")}</span><span className="fmc-stat-value">{altitudeAdvisory.text}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("TOD")}</span><span className="fmc-stat-value">{tod ? `${formatNumber(tod.distance, 1)} NM / ${formatNumber(tod.time, 0)} min` : '—'}</span></div>
        </div>
      </div>
    </div>
  );
};

FMCProgress.propTypes = {
  fmcService: PropTypes.object.isRequired,
  flightPlan: PropTypes.any,
  flightState: PropTypes.object,
  preflightConfig: PropTypes.object,
  aircraftData: PropTypes.object
};

export default FMCProgress;
