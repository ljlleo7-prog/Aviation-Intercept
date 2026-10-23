import PropTypes from 'prop-types';
import { getIlsDisplayState } from '../utils/ilsDisplay.js';

// Coordinates match the shared replica PFD's 120 by 120 instrument viewport.
export default function PFDApproachGuidance({ ils, approachSelected, labels }) {
  const guidance = getIlsDisplayState(ils, approachSelected);
  if (!guidance.visible) return null;
  const diamond = (x, y, label) => <path aria-label={label}
    d={`M${x} ${y - 3}l3 3-3 3-3-3z`} fill="#ed5bff" stroke="#ed5bff" strokeWidth=".6" />;
  return <g className="pfd-approach-guidance" aria-label={labels?.guidance || 'ILS approach guidance'}>
    <g fill="none" stroke="white" strokeWidth=".7">
      {[-2, -1, 1, 2].map(step => <circle key={`loc-${step}`} cx={59 + step * 12} cy="86" r="1.1" />)}
      {[-2, -1, 1, 2].map(step => <circle key={`gs-${step}`} cx="89" cy={55 + step * 11} r="1.1" />)}
      <path d="M59 83v6M86 55h6" />
    </g>
    {guidance.localizerValid ? diamond(59 + guidance.localizerOffset * 24, 86, labels?.localizer || 'Localizer deviation')
      : <text x="59" y="87" textAnchor="middle" fill="#ffbf55" fontSize="4">LOC</text>}
    {guidance.glideslopeValid ? diamond(89, 55 + guidance.glideslopeOffset * 22, labels?.glideslope || 'Glideslope deviation')
      : <text x="89" y="56" textAnchor="middle" fill="#ffbf55" fontSize="4">GS</text>}
  </g>;
}

PFDApproachGuidance.propTypes = { ils: PropTypes.object, approachSelected: PropTypes.bool, labels: PropTypes.object };
