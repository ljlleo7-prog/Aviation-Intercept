import { useState } from 'react';
import PropTypes from 'prop-types';
import { Knob } from '../../previews/main-panel-parts.jsx';
import { adjustReplicaTarget } from '../utils/replicaAutopilot';

export default function ReplicaAutopilotDial({ x, y, r = 7, field, targets, onChange }) {
  const [coarse, setCoarse] = useState(false);
  const turn = direction => onChange?.(adjustReplicaTarget(targets, field, direction, coarse));
  return <g
    role="slider"
    tabIndex={0}
    aria-label={`${field} target knob, ${coarse ? 'coarse' : 'fine'} increments; press to change increment`}
    aria-valuenow={targets[field]}
    onWheel={event => { event.preventDefault(); turn(event.deltaY < 0 ? 1 : -1); }}
    onClick={() => setCoarse(value => !value)}
    onKeyDown={event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCoarse(value => !value); }
    }}
    style={{ cursor: 'ns-resize' }}
  >
    <Knob x={x} y={y} r={r}/>
    <text x={x + r + 4} y={y + 2} className="tiny" textAnchor="middle">{coarse ? 'C' : 'F'}</text>
    <circle cx={x} cy={y} r={r + 3} fill="transparent"/>
  </g>;
}

ReplicaAutopilotDial.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  r: PropTypes.number,
  field: PropTypes.oneOf(['ias', 'heading', 'altitude', 'vs']).isRequired,
  targets: PropTypes.object.isRequired,
  onChange: PropTypes.func
};
