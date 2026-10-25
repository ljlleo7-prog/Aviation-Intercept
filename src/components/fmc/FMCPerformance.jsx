import { useLanguage } from '../../contexts/LanguageContext';
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import VSpeedCalculator from '../../services/VSpeedCalculator';
import { calculateRouteProgress } from '../../services/efb/RouteProgress.js';
import { calculateFuelPlan } from '../../services/efb/FuelPlanning.js';
import { buildWeatherBriefing } from '../../services/efb/EFBDataService.js';
import { formatNumber, formatDuration } from '../../services/efb/UnitConversion.js';

const clampNumber = (value, fallback = 0, min = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
};

const FMCPerformance = ({ preflightConfig, aircraftData, flightState, weatherData, onUpdatePreflight, readiness, flightPlan }) => {
  const { tx } = useLanguage();
  const pax = clampNumber(preflightConfig?.pax, 0, 0);
  const payload = clampNumber(preflightConfig?.payload, 0, 0);
  const fuelReserve = clampNumber(preflightConfig?.fuelReserve, 0, 0);
  const cruiseHeight = clampNumber(preflightConfig?.cruiseHeight, 0, 0);
  const flightPlanFuel = preflightConfig?.flightPlan?.fuel || {};
  const dryOperatingMass = clampNumber(aircraftData?.emptyWeight || aircraftData?.mass, 70000, 0);
  const estimatedTakeoffWeight = dryOperatingMass + payload + clampNumber(flightPlanFuel.totalFuel, 0, 0) - clampNumber(flightPlanFuel.taxiFuel, 0, 0);
  const estimatedLandingWeight = dryOperatingMass + payload + clampNumber(flightPlanFuel.reserveFuel, 0, 0);
  const takeoffReferenceWeight = clampNumber(aircraftData?.maxTakeoffWeight, 79000, 1);
  const landingReferenceWeight = clampNumber(aircraftData?.maxLandingWeight || aircraftData?.maxTakeoffWeight * 0.85, 66000, 1);
  const stallSpeed = clampNumber(aircraftData?.stallSpeed, 118, 1);
  const weatherBriefing = buildWeatherBriefing({ weatherData, runwayHeading: flightState?.heading });
  const temperature = weatherBriefing.temperature ?? 15;
  const headwind = weatherBriefing.windComponents?.headwind ?? 0;
  const routeProgress = calculateRouteProgress({ flightPlan, flightState });
  const fuelPlan = calculateFuelPlan({ flightState, routeProgress, preflightConfig, aircraftData });

  const derivedTakeoffPerformance = useMemo(() => VSpeedCalculator.calculateTakeoff({
    weight: estimatedTakeoffWeight,
    flaps: 0.17,
    elevation: flightState?.elevation || 0,
    temperature,
    headwind,
    runwayCondition: 'dry',
    stallSpeed,
    referenceWeight: takeoffReferenceWeight
  }), [estimatedTakeoffWeight, flightState?.elevation, temperature, headwind, stallSpeed, takeoffReferenceWeight]);

  const derivedLandingPerformance = useMemo(() => VSpeedCalculator.calculateLanding({
    weight: estimatedLandingWeight,
    flaps: 1.0,
    headwind,
    runwayCondition: 'dry',
    stallSpeed,
    referenceWeight: landingReferenceWeight
  }), [estimatedLandingWeight, headwind, stallSpeed, landingReferenceWeight]);

  const takeoffPerformance = preflightConfig?.takeoffPerformance || derivedTakeoffPerformance;
  const landingPerformance = preflightConfig?.landingPerformance || derivedLandingPerformance;

  const handleChange = (field, value, min = 0) => {
    onUpdatePreflight?.({ [field]: clampNumber(value, 0, min) });
  };

  const handleCalculateTO = () => {
    onUpdatePreflight?.({ takeoffPerformance: derivedTakeoffPerformance });
  };

  const handleCalculateLanding = () => {
    onUpdatePreflight?.({ landingPerformance: derivedLandingPerformance });
  };

  return (
    <div className="fmc-page fmc-performance-page">
      <h4 className="fmc-page-title">{tx("Load & Performance")}</h4>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Editable loadout")}</div>
            <div className="fmc-section-subtitle">{tx("These values feed the shared preflight state.")}</div>
          </div>
          <div className={`fmc-status-pill ${readiness?.isLoadoutReady ? 'ready' : ''}`}>{readiness?.isLoadoutReady ? tx("Ready") : tx("Needs input")}</div>
        </div>

        <div className="fmc-edit-grid">
          <div className="fmc-input-group">
            <label>{tx("Passengers")}</label>
            <input type="number" min="0" max="400" value={pax} onChange={(e) => handleChange('pax', e.target.value, 0)} />
            <small>{tx("Passenger count used for load and takeoff estimates.")}</small>
          </div>

          <div className="fmc-input-group">
            <label>{tx("Payload (kg)")}</label>
            <input type="number" min="0" step="100" value={payload} onChange={(e) => handleChange('payload', e.target.value, 0)} />
            <small>{tx("Cargo and baggage payload included in fuel planning.")}</small>
          </div>

          <div className="fmc-input-group">
            <label>{tx("Reserve factor")}</label>
            <input type="number" min="0" max="1" step="0.01" value={fuelReserve} onChange={(e) => handleChange('fuelReserve', e.target.value, 0)} />
            <small>{tx("Contingency multiplier used by flight-plan fuel calculation.")}</small>
          </div>

          <div className="fmc-input-group">
            <label>{tx("Cruise altitude (ft)")}</label>
            <input type="number" min="1000" max="41000" step="1000" value={cruiseHeight} onChange={(e) => onUpdatePreflight?.({ cruiseHeight: Math.max(1000, Math.min(41000, Number(e.target.value))), cruiseAltitudeManual: true })} />
            <small>{tx("Target cruise altitude handed off into the flight runtime.")}</small>
            {flightPlanFuel.altitudeRange && <small>{flightPlanFuel.altitudeRange.min}–{flightPlanFuel.altitudeRange.max} ft</small>}
            <button type="button" onClick={() => onUpdatePreflight?.({ cruiseAltitudeManual: false })}>AUTO</button>
          </div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Flight plan fuel")}</div>
        {flightPlanFuel.warnings?.map(warning => <div key={warning} role="status">{warning}</div>)}
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">Taxi</span><span className="fmc-stat-value">{formatNumber(flightPlanFuel.taxiFuel, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">Climb</span><span className="fmc-stat-value">{formatNumber(flightPlanFuel.climbFuel, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Trip fuel")}</span><span className="fmc-stat-value">{formatNumber(flightPlanFuel.tripFuel, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Reserve fuel")}</span><span className="fmc-stat-value">{formatNumber(flightPlanFuel.reserveFuel, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Total fuel")}</span><span className="fmc-stat-value">{formatNumber(flightPlanFuel.totalFuel, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Flight time")}</span><span className="fmc-stat-value">{Number.isFinite(preflightConfig?.flightPlan?.time?.hours) ? `${preflightConfig.flightPlan.time.hours}h ${preflightConfig.flightPlan.time.minutes}m` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Live fuel and weight")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Fuel flow")}</span><span className="fmc-stat-value">{fuelPlan.dataQuality?.hasFuelFlow ? `${formatNumber(fuelPlan.fuelFlowKgH, 0)} kg/h` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Endurance")}</span><span className="fmc-stat-value">{fuelPlan.enduranceText}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Dest fuel")}</span><span className="fmc-stat-value">{fuelPlan.destinationFuel !== null ? `${formatNumber(fuelPlan.destinationFuel, 0)} kg` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Reserve margin")}</span><span className="fmc-stat-value">{fuelPlan.reserveMargin !== null ? `${formatNumber(fuelPlan.reserveMargin, 0)} kg` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Airborne weight")}</span><span className="fmc-stat-value">{`${formatNumber(fuelPlan.airborneWeight, 0)} kg`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Landing weight")}</span><span className="fmc-stat-value">{fuelPlan.destinationFuel !== null ? `${formatNumber(dryOperatingMass + fuelPlan.destinationFuel, 0)} kg` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Derived weights and environment")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Dry operating")}</span><span className="fmc-stat-value">{formatNumber(dryOperatingMass, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Estimated TOW")}</span><span className="fmc-stat-value">{formatNumber(estimatedTakeoffWeight, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Estimated landing")}</span><span className="fmc-stat-value">{formatNumber(estimatedLandingWeight, 0, ' kg')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Headwind")}</span><span className="fmc-stat-value">{`${formatNumber(headwind, 0)} kt`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Crosswind")}</span><span className="fmc-stat-value">{weatherBriefing.windComponents?.crosswind !== null ? `${formatNumber(Math.abs(weatherBriefing.windComponents.crosswind), 0)} kt` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("ETE destination")}</span><span className="fmc-stat-value">{routeProgress.eteDestinationHours !== null ? formatDuration(routeProgress.eteDestinationHours) : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Takeoff")}</div>
            <div className="fmc-section-subtitle">{tx("Calculated from current load, weather, and runway assumptions.")}</div>
          </div>
          <button className="fmc-btn-secondary fmc-inline-action" onClick={handleCalculateTO}>{tx("Save speeds")}</button>
        </div>
        <div className="fmc-perf-grid">
          <div className="fmc-input-group"><label>V1 (kt)</label><input type="number" value={takeoffPerformance.v1 || 0} readOnly /></div>
          <div className="fmc-input-group"><label>VR (kt)</label><input type="number" value={takeoffPerformance.vr || 0} readOnly /></div>
          <div className="fmc-input-group"><label>V2 (kt)</label><input type="number" value={takeoffPerformance.v2 || 0} readOnly /></div>
          <div className="fmc-input-group"><label>{tx("Runway state")}</label><input type="text" value={tx("Dry")} readOnly /></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Landing")}</div>
            <div className="fmc-section-subtitle">{tx("Landing reference speeds based on estimated landing weight.")}</div>
          </div>
          <button className="fmc-btn-secondary fmc-inline-action" onClick={handleCalculateLanding}>{tx("Save speeds")}</button>
        </div>
        <div className="fmc-perf-grid">
          <div className="fmc-input-group"><label>VREF (kt)</label><input type="number" value={landingPerformance.vref || 0} readOnly /></div>
          <div className="fmc-input-group"><label>VAPP (kt)</label><input type="number" value={landingPerformance.vapp || 0} readOnly /></div>
        </div>
      </div>
    </div>
  );
};

FMCPerformance.propTypes = {
  preflightConfig: PropTypes.object,
  aircraftData: PropTypes.object,
  flightState: PropTypes.object,
  weatherData: PropTypes.object,
  onUpdatePreflight: PropTypes.func,
  readiness: PropTypes.shape({
    isLoadoutReady: PropTypes.bool
  }),
  flightPlan: PropTypes.any
};

export default FMCPerformance;
