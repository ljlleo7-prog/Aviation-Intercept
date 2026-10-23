import PropTypes from 'prop-types';

export default function B737SystemAnnunciators({ x, data = {}, firstOfficer = false }) {
  const labels = firstOfficer ? ['ANTI-ICE', 'ENG', 'HYD', 'OVERHEAD', 'DOORS', 'AIR COND'] : ['FLT CONT', 'ELEC', 'IRS', 'APU', 'FUEL', 'OVHT/DET'];
  const recall = () => data.onAutopilotAction?.('system-action', { system: 'alerts', action: 'recall' });
  return <g role="button" tabIndex={0} aria-label={`${firstOfficer ? 'First officer' : 'Captain'} system annunciators recall`} onClick={recall}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); recall(); } }} style={{ cursor: 'pointer', userSelect: 'none' }}>
    {labels.map((label, index) => { const lit = data.alertState?.annunciators?.includes(label); return <g key={label} transform={`translate(${x + index % 2 * 26} ${88 + Math.floor(index / 2) * 7})`}>
      <rect width="25" height="6" fill={lit ? '#66400b' : '#191f20'}/>
      <text x="12.5" y="4" textAnchor="middle" style={{ fontSize: 3.4, fill: lit ? '#ffbd38' : '#646963' }}>{label}</text>
    </g>; })}
  </g>;
}
B737SystemAnnunciators.propTypes = { x: PropTypes.number, data: PropTypes.object, firstOfficer: PropTypes.bool };
