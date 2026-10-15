import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { rotationDelta, spinTrim } from '../utils/pedestalControls.js';

export default function MechanicalTrimWheel({ value = 0, disabled, onChange }) {
  const [trim, setTrim] = useState(value / 0.2);
  const trimRef = useRef(trim);
  const wheel = useRef(null);
  const drag = useRef(null);
  const lastManual = useRef(0);
  const wheelHandler = useRef(null);
  useEffect(() => {
    if (drag.current || Date.now() - lastManual.current < 1200) return;
    trimRef.current = Math.max(-1, Math.min(1, value / 0.2));
    setTrim(trimRef.current);
  }, [value]);
  useEffect(() => { if (disabled) drag.current = null; }, [disabled]);
  const turn = degrees => {
    if (disabled) return;
    const next = spinTrim(trimRef.current, degrees);
    lastManual.current = Date.now();
    trimRef.current = next;
    setTrim(next);
    onChange?.(next);
  };
  wheelHandler.current = event => {
    if (disabled) return;
    event.preventDefault();
    turn(-event.deltaY * (event.deltaMode === 1 ? 16 : 1) * 0.5);
  };
  useEffect(() => {
    const element = wheel.current;
    const handleWheel = event => wheelHandler.current?.(event);
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);
  const angleAt = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.atan2((event.clientY - rect.top - rect.height / 2) / (rect.height / 2), (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 180 / Math.PI;
  };
  const release = event => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="trim-wheel"><span className="control-legend">STAB TRIM</span>
    <button ref={wheel} className="mechanical-trim-wheel" aria-label="Stabilizer trim wheel: drag around the wheel, scroll or use arrow keys" disabled={disabled}
      onPointerDown={event => { if (disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = angleAt(event); }}
      onPointerMove={event => { if (disabled || drag.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const angle = angleAt(event); turn(rotationDelta(drag.current, angle)); drag.current = angle; }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); turn(['ArrowUp', 'ArrowRight'].includes(event.key) ? 72 : -72); } }}>
      <span className="trim-wheel-disc" style={{ transform: `translate(-50%, -50%) scaleX(.38) rotate(${trim * 7200}deg)` }} aria-hidden="true"><i/></span>
    </button>
    <output>{(trim * 20).toFixed(1)}</output>
  </div>;
}
MechanicalTrimWheel.propTypes = { value: PropTypes.number, disabled: PropTypes.bool, onChange: PropTypes.func };
