import PropTypes from 'prop-types';

export default function ReplicaLightingControl({ label, control, lighting = {}, onAction, children }) {
  const active = Boolean(lighting[control]);
  const activate = () => onAction?.('system-action', { system: 'lighting', action: control, value: !active });
  return <g role="switch" tabIndex={0} aria-label={label} aria-checked={active}
    style={{ cursor: 'pointer' }} onClick={activate} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    }}>
    <title>{`${label}: ${active ? 'ON' : 'OFF'}`}</title>
    {children}
  </g>;
}

ReplicaLightingControl.propTypes = {
  label: PropTypes.string.isRequired,
  control: PropTypes.string.isRequired,
  lighting: PropTypes.object,
  onAction: PropTypes.func,
  children: PropTypes.node.isRequired,
};
