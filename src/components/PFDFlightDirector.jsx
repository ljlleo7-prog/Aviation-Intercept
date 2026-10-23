import PropTypes from 'prop-types';
import { getFlightDirectorBars } from '../utils/flightDirectorDisplay.js';

export default function PFDFlightDirector({ director, pitch, roll, labels }) {
  const bars = getFlightDirectorBars(director, pitch, roll);
  if (!bars) return null;
  return <g aria-label={labels?.commands || 'Flight director pitch and roll commands'} stroke="#ed5bff" strokeWidth="1.6" fill="none">
    <path d={`M${59 + bars.rollOffset} 32v46`} />
    <path d={`M36 ${55 + bars.pitchOffset}h46`} />
  </g>;
}

PFDFlightDirector.propTypes = { director: PropTypes.object, pitch: PropTypes.number, roll: PropTypes.number, labels: PropTypes.object };
