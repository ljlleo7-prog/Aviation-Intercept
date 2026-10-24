import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import { getActiveWaypoints } from '../services/activeFlightPlan.js';
import { calculateDistanceMeters } from '../utils/flightMath.js';
import './FlightStatusSummary.css';

const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';

export default function FlightStatusSummary({ flightData, flightPlan, arrivalRunway }) {
  const { tx } = useLanguage();
  const index = flightData?.currentWaypointIndex;
  const waypoint = Number.isInteger(index) && index >= 0 ? getActiveWaypoints(flightPlan)[index] : null;
  const position = flightData?.position;
  const distance = [position?.latitude, position?.longitude, waypoint?.latitude, waypoint?.longitude].every(Number.isFinite)
    ? calculateDistanceMeters(position.latitude, position.longitude, waypoint.latitude, waypoint.longitude) / 1852
    : null;
  const metrics = [
    { label: 'Altitude', value: number(flightData?.derived?.altitude_ft ?? flightData?.altitude), unit: 'FT' },
    { label: 'Ground speed', value: number(flightData?.groundSpeed ?? flightData?.derived?.groundSpeed), unit: 'KT' },
    { label: 'Fuel remaining', value: number(flightData?.fuel), unit: 'KG' },
    { label: 'Active waypoint', value: waypoint?.label || waypoint?.name || waypoint?.ident || '—',
      unit: Number.isFinite(distance) ? `${number(distance, 1)} NM` : '' }
  ];
  const autopilot = flightData?.autopilot;

  return <section className="flight-status-summary" aria-label={tx('Flight summary')}>
    <div className="flight-status-summary-metrics">
      {metrics.map(metric => <div className="flight-status-summary-metric" key={metric.label}>
        <span className="flight-status-summary-label">{tx(metric.label)}</span>
        <div className="flight-status-summary-reading"><strong title={String(metric.value)}>{metric.value}</strong><span>{metric.unit}</span></div>
      </div>)}
    </div>
    <div className="flight-status-summary-context">
      <span className={autopilot?.engaged ? 'flight-status-summary-ap' : ''}>
        {autopilot?.engaged ? `${tx('Autopilot')} · ${autopilot.mode || '—'}` : tx('Manual flight')}
      </span>
      {arrivalRunway && <span>{tx('Arrival runway')} · {arrivalRunway}</span>}
    </div>
  </section>;
}

FlightStatusSummary.propTypes = {
  flightData: PropTypes.object,
  flightPlan: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  arrivalRunway: PropTypes.string
};
