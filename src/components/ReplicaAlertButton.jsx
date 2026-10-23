import PropTypes from 'prop-types';

export default function ReplicaAlertButton({ x, y, w = 25, h = 19, label, group, data = {} }) {
  const lit = group === 'warning' ? data.alertState?.warning || data.alertState?.fire : data.alertState?.[group];
  const color = group === 'caution' ? '#ffbd38' : '#ff5353';
  const activate = () => {
    data.onAutopilotAction?.('system-action', { system: 'alerts', action: group });
    if (group === 'warning') data.onAutopilotAction?.('system-action', { system: 'alerts', action: 'fire' });
  };
  return <g transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Acknowledge ${label.replace('|', ' ')}`} aria-pressed={!!lit}
    onClick={activate} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }} style={{ cursor: 'pointer', userSelect: 'none' }}>
    <rect width={w} height={h} rx="1" fill={lit ? color : '#252a2b'} stroke={lit ? color : '#8c9290'} strokeWidth=".6"/>
    {label.split('|').map((line, index, lines) => <text key={line} x={w / 2} y={h / 2 + (index - (lines.length - 1) / 2) * 5 + 2} textAnchor="middle" style={{ fontSize: 4, fill: lit ? '#101010' : '#bfc4c0' }}>{line}</text>)}
  </g>;
}
ReplicaAlertButton.propTypes = { x: PropTypes.number, y: PropTypes.number, w: PropTypes.number, h: PropTypes.number, label: PropTypes.string, group: PropTypes.string, data: PropTypes.object };
