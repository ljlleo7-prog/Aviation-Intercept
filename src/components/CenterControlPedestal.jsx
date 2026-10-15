import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import aircraftService from '../services/aircraftService';
import './CenterControlPedestal.css';
import CockpitPilotControls from './CockpitPilotControls.jsx';
import MechanicalTrimWheel from './MechanicalTrimWheel.jsx';
import usePedestalThrust from '../hooks/usePedestalThrust.js';
import { thrustLeverPosition } from '../utils/pedestalControls.js';

function MechanicalLever({ label, value, min = 0, max = 1, step = 0.01, marks, onChange, kind = '', disabled, descending = true, reverseMode = false, onReverseToggle, reverseDisabled = false }) {
  const update = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientY - rect.top - 18) / (rect.height - 36)));
    onChange(Math.max(min, Math.min(max, min + Math.round(((descending ? 1 - fraction : fraction) * (max - min)) / step) * step)));
  };
  return <div className={`mechanical-lever ${kind}`}>
    <strong className="control-legend">{label.startsWith('ENG') ? label.slice(4) : label}</strong>
    <div className="lever-gate" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-disabled={disabled}
      onPointerDown={event => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={event => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) update(event); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onKeyDown={event => { if (disabled) return; const delta = ['ArrowUp', 'ArrowRight'].includes(event.key) ? step : ['ArrowDown', 'ArrowLeft'].includes(event.key) ? -step : 0; if (delta) { event.preventDefault(); onChange(Math.max(min, Math.min(max, value + delta))); } }}>
      <div className="lever-slot"/>
      {marks.map((mark, index) => <span className="gate-mark" key={index} style={{ top: `${9 + index / Math.max(1, marks.length - 1) * 82}%` }}>{mark}</span>)}
      <div className="lever-arm" style={{ top: `calc(18px + (100% - 36px) * ${descending ? (max - value) / (max - min) : (value - min) / (max - min)})` }}><span className="lever-grip">{label.startsWith('ENG') ? label.slice(4) : ''}</span>{onReverseToggle && <button className={`reverser-handle ${reverseMode ? 'deployed' : ''}`} aria-label={`${label} reverse thrust${reverseDisabled ? ' INOP' : ''}`} aria-pressed={reverseMode} disabled={disabled || reverseDisabled} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onReverseToggle(); }}>{reverseDisabled ? 'INOP' : 'REV'}</button>}</div>
    </div>
    {disabled && <output className="inop">INOP</output>}
  </div>;
}
MechanicalLever.propTypes = { label: PropTypes.string, value: PropTypes.number, min: PropTypes.number, max: PropTypes.number, step: PropTypes.number, marks: PropTypes.array, onChange: PropTypes.func, kind: PropTypes.string, disabled: PropTypes.bool, descending: PropTypes.bool, reverseMode: PropTypes.bool, onReverseToggle: PropTypes.func, reverseDisabled: PropTypes.bool };

export default function CenterControlPedestal({ aircraftModel, isAirbus, flightState, onAction, ilsRunwayOptions = [] }) {
  const [profiles, setProfiles] = useState(null);
  const [aircraft, setAircraft] = useState(null);
  useEffect(() => {
    let active = true;
    setProfiles(null);
    setAircraft(null);
    Promise.all([aircraftService.getControlSurfaceProfiles(aircraftModel), aircraftService.getAircraftByModel(aircraftModel)]).then(([controls, data]) => { if (active) { setProfiles(controls); setAircraft(data); } }).catch(() => { if (active) setProfiles(null); });
    return () => { active = false; };
  }, [aircraftModel]);
  const send = (action, value, index) => onAction?.(action, value, index);
  const engineCount = flightState.engineN1?.length || flightState.engineThrottles?.length || aircraft?.engineCount || 2;
  const reverseCapable = aircraft?.engineReverseCapable || [];
  const thrust = usePedestalThrust({ flightState, engineCount, reverseCapable, onAction });
  const flapMarks = profiles?.flaps?.positions?.map(pos => pos.label) || ['UP'];
  const brakeMarks = profiles?.airbrakes?.positions?.map(pos => pos.label) || (profiles?.airbrakes?.hasTwoTier ? ['RET', 'ARM', 'FLT', 'GND'] : ['RET', 'EXT']);
  const disabled = !onAction || flightState.hasCrashed;
  const parkingBrakeSet = flightState.systems?.brakes?.parkingBrake === true;
  const nav = flightState.autopilotDebug?.nav1Frequency;
  return <section className={`cockpit-controller ${isAirbus ? 'airbus' : 'boeing'}`} aria-label="Flight control pedestal">
    {isAirbus && <CockpitPilotControls flightState={flightState} onAction={onAction} isAirbus/>}
    <div className="center-pedestal">
      <div className="pedestal-upper">
        <MechanicalTrimWheel value={flightState.trimValue ?? 0} disabled={disabled} onChange={value => send('trim', value)}/>
      <div className="quadrant">
        <MechanicalLever label="SPEED BRAKE" kind="speedbrake" value={flightState.airBrakesValue ?? 0} max={Math.max(1, brakeMarks.length - 1)} step={1} descending={false} marks={brakeMarks} disabled={disabled || !profiles} onChange={value => send('airBrakes', value)}/>
        {Array.from({ length: engineCount }, (_, index) => <MechanicalLever key={index} label={`ENG ${index + 1}`} kind="thrust" value={thrustLeverPosition(thrust.commands[index], thrust.reverse[index])} marks={thrust.reverse[index] ? ['MAX REV', 'REV', 'IDLE'] : isAirbus ? ['TOGA', 'MCT', 'CL', 'IDLE'] : ['MAX', 'THRUST', 'IDLE']} disabled={disabled} reverseMode={thrust.reverse[index]} reverseDisabled={reverseCapable[index] === false} onReverseToggle={() => thrust.toggleReverse(index)} onChange={value => thrust.moveLever(index, value)}/>)}
        <MechanicalLever label="FLAPS" kind="flaps" value={flightState.flapsValue ?? 0} max={Math.max(1, flapMarks.length - 1)} step={1} descending={false} marks={flapMarks} disabled={disabled || flapMarks.length < 2} onChange={value => send('flaps', value)}/>
      </div>
      </div>
      <div className="pedestal-accessories">
        <button className={`thrust-sync ${thrust.sync ? 'linked' : ''}`} aria-label="Synchronize engine throttles" aria-pressed={thrust.sync} disabled={disabled} onClick={thrust.toggleSync}><span className="sync-toggle" aria-hidden="true"/><span className="control-legend">THR SYNC</span></button>

        <button className={`parking-handle ${parkingBrakeSet ? 'set' : ''}`} disabled={disabled} aria-pressed={parkingBrakeSet} onClick={() => send('wheelBrakes', parkingBrakeSet ? 0 : 1)}><span className="parking-pull" aria-hidden="true"/><span className="control-legend">PARKING BRAKE</span><br/>{parkingBrakeSet ? 'SET' : 'RELEASED'}</button>
        <button className="pedestal-gear" disabled={disabled} onClick={() => send('gear', !flightState.gearValue)}><span className="control-legend">GEAR</span><br/>{flightState.gearValue ? 'DOWN' : 'UP'}</button>
        
      </div>
      <div className="radio-panel"><label><span className="control-legend">NAV 1</span> <input aria-label="NAV1 frequency" type="number" min="108.1" max="117.95" step="0.05" value={nav > 0 ? nav : ''} disabled={disabled} onChange={event => { const value = Number(event.target.value); if (value >= 108.1 && value <= 117.95) send('set-nav-frequency', value); }}/></label>{ilsRunwayOptions.slice(0, 4).map(option => <button key={`${option.runwayName}-${option.ilsFrequency}`} disabled={disabled} onClick={() => send('set-nav-frequency', option.ilsFrequency)}>{option.runwayName} {option.ilsFrequency.toFixed(2)}</button>)}<span className="inop">AUDIO INOP</span></div>
    </div>
  </section>;
}
CenterControlPedestal.propTypes = { aircraftModel: PropTypes.string, isAirbus: PropTypes.bool, flightState: PropTypes.object.isRequired, onAction: PropTypes.func, ilsRunwayOptions: PropTypes.array };
