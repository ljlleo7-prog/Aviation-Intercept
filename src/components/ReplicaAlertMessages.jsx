import PropTypes from 'prop-types';

export default function ReplicaAlertMessages({ warnings = [], x = 3, y = 96, width = 114, rows = 3, lineHeight = 8 }) {
  const visible = warnings.slice(0, rows);
  return <g pointerEvents="none" data-component="live-alert-messages" style={{ userSelect: 'none' }}>
    {visible.map((warning, index) => <text key={warning.id} x={x} y={y + index * lineHeight} textAnchor="start"
      textLength={warning.message.length > width / 2.6 ? width : undefined} lengthAdjust="spacingAndGlyphs"
      style={{ fontSize: 5, fill: warning.level === 'CRITICAL' ? '#ff5353' : warning.level === 'WARNING' ? '#ffbd38' : '#65e0ee' }}>{warning.message}</text>)}
    {warnings.length > rows && <text x={x + width} y={y - 5} textAnchor="end" style={{ fontSize: 4, fill: '#fff' }}>MORE {warnings.length - rows}</text>}
  </g>;
}
ReplicaAlertMessages.propTypes = { warnings: PropTypes.array, x: PropTypes.number, y: PropTypes.number, width: PropTypes.number, rows: PropTypes.number, lineHeight: PropTypes.number };
