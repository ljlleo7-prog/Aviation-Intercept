import PropTypes from 'prop-types';
import { isFlightHazard } from '../services/CrewAlertState.js';
import './CrashWarningFlash.css';

export default function CrashWarningFlash({ warnings = [], crashWarning }) {
  const visible = warnings.filter(w => isFlightHazard(w) || ((w.level === 'CRITICAL' || w.isFlashing) && !w.acknowledged));
  const messages = [...new Set([crashWarning, ...visible.map(w => w.message)].filter(Boolean))];
  if (!messages.length) return null;
  return <div className="flight-visual-alerts" aria-live="assertive" aria-atomic="true">
    {messages.map((message, index) => <div key={message} className={index === 0 ? 'flight-alert-primary' : 'flight-alert-secondary'}>{message}</div>)}
  </div>;
}
CrashWarningFlash.propTypes = { warnings: PropTypes.array, crashWarning: PropTypes.string };
