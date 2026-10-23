import { memo } from 'react';
import PropTypes from 'prop-types';

// Telemetry changes every frame; precipitation and wiper settings usually do not.
const WindshieldEffects = memo(function WindshieldEffects({ snow, intensity, leftWiper, rightWiper }) {
  return <>
    {intensity > 0 && <div className={`windshield-weather ${snow ? 'windshield-snow' : 'windshield-rain'}`} style={{ '--precipitation': intensity }} aria-hidden="true">
      {['left', 'right'].map(side => <div key={side} className={`windshield-pane ${(side === 'left' ? leftWiper : rightWiper) ? 'is-wiping' : ''}`}>
        {Array.from({ length: 45 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 100}%`, animationDelay: `${-i * .17}s` }} />)}
      </div>)}
    </div>}
    {['left', 'right'].map(side => (side === 'left' ? leftWiper : rightWiper) && <div key={side} className={`windshield-wiper windshield-wiper-${side}`} aria-label={`${side} windshield wiper running`} />)}
  </>;
});
WindshieldEffects.propTypes = {
  snow: PropTypes.bool,
  intensity: PropTypes.number,
  leftWiper: PropTypes.bool,
  rightWiper: PropTypes.bool,
};
export default WindshieldEffects;
