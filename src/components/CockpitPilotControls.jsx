import { createCockpitControlPointer } from '../utils/cockpitControlPointer.js';
import { memo, useEffect, useId, useRef } from 'react';
import { pilotControlVisuals, paintPilotControls } from '../utils/pilotControlVisuals.js';
import { hasMechanicalFeedback } from '../services/physics/controlTransmission.js';
import PropTypes from 'prop-types';
import './CockpitPilotControls.css';
import { subscribeKeyboardControls } from '../utils/flightKeyboardVisuals.js';

function CockpitPilotControls({ flightState, onAction, physicsService, isAirbus = false, overlay = false }) {
  const demand = useRef({ x: 0, y: 0, rudder: 0, left: 0, right: 0 });
  const root = useRef(null);
  const position = demand.current;
  const pedals = demand.current;
  const setPosition = value => Object.assign(demand.current, value);
  const setPedals = value => Object.assign(demand.current, typeof value === 'function' ? value(demand.current) : value);
  const pointer = useRef(null);
  const inputs = useRef({ rudder: { left: 0, right: 0 }, brakes: { left: 0, right: 0 } });
  const actions = useRef(onAction);
  actions.current = onAction;
  // Demand moves an unlinked sidestick; linked yokes/pedals follow the actual
  // slow or jammed mechanism published by physics, regardless of input device.
  const feedback = flightState.controlFeedback?.mechanical ?? !isAirbus;
  const visiblePosition = pilotControlVisuals(flightState.controls, demand.current, feedback);
  const visibleRudder = visiblePosition.rudder;
  const live = useRef(null);
  live.current = { flightState, physicsService, feedback, isAirbus };
  const paint = () => {
    const { flightState: state, physicsService: service, feedback: linked, isAirbus: airbus } = live.current;
    const controls = service?.controls ? {
      pitch: service.controls.elevator, roll: service.controls.aileron, yaw: service.controls.rudder
    } : state.controls;
    const mechanical = service ? hasMechanicalFeedback(service.aircraft) : linked;
    paintPilotControls(root.current, pilotControlVisuals(controls, demand.current, mechanical), airbus);
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  useEffect(() => {
    let frame;
    const animate = () => { paintRef.current(); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const gradient = useId();
  const disabled = !onAction || flightState.hasCrashed;
  const autopilotEngaged = typeof flightState.autopilot === 'object'
    ? flightState.autopilot?.engaged === true : flightState.autopilot === true;
  const locked = disabled || autopilotEngaged;
  const rudderLocked = disabled || (autopilotEngaged && !flightState.onGround);
  useEffect(() => subscribeKeyboardControls(({ pitch, roll, yaw, toeBrakes }) => {
    setPosition({ x: roll / 0.3, y: pitch / 0.3 });
    setPedals({ rudder: yaw, left: toeBrakes, right: toeBrakes });
    paintRef.current();
  }), []);
  const neutral = () => {
    setPosition({ x: 0, y: 0 });
    actions.current?.('pitch', 0);
    actions.current?.('roll', 0);
    paintRef.current();
  };
  useEffect(() => {
    if (locked) {
      setPosition({ x: 0, y: 0 });
      actions.current?.('pitch', 0);
      actions.current?.('roll', 0);
    }
  }, [locked]);
  useEffect(() => {
    if (rudderLocked) {
      inputs.current.rudder = { left: 0, right: 0 };
      setPedals(previous => ({ ...previous, rudder: 0 }));
      actions.current?.('yaw', 0);
    }
  }, [rudderLocked]);
  useEffect(() => () => {
    actions.current?.('pitch', 0);
    actions.current?.('roll', 0);
    actions.current?.('yaw', 0);
    actions.current?.('toeBrakes', 0);
  }, []);
  if (!pointer.current) pointer.current = createCockpitControlPointer(({ x, y }) => {
    setPosition({ x, y });
    actions.current?.('pitch', y * 0.3);
    actions.current?.('roll', x * 0.3);
    paintRef.current();
  }, neutral);
  const pedal = (kind, side, value) => {
    inputs.current[kind][side] = value;
    const rudder = inputs.current.rudder.right - inputs.current.rudder.left;
    const { left, right } = inputs.current.brakes;
    setPedals({ rudder, left, right });
    actions.current?.(kind === 'rudder' ? 'yaw' : 'toeBrakes', kind === 'rudder' ? rudder : Math.max(left, right));
  };
  const pedalEvents = (kind, side) => ({
    onPointerDown: event => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pedal(kind, side, 1);
    },
    onPointerMove: event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      pedal(kind, side, Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)));
    },
    onPointerUp: event => {
      pedal(kind, side, 0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => pedal(kind, side, 0),
    onLostPointerCapture: () => pedal(kind, side, 0),
    onBlur: () => pedal(kind, side, 0),
    onKeyDown: event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pedal(kind, side, 1); }
    },
    onKeyUp: event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pedal(kind, side, 0); }
    },
  });
  const control = seat => <svg key={seat} className={`cockpit-${isAirbus ? 'sidestick' : 'yoke'} cockpit-${isAirbus ? 'sidestick' : 'yoke'}-${seat}`} viewBox={isAirbus ? "0 0 160 210" : "0 0 200 190"} role="group" tabIndex={locked ? -1 : 0}
    aria-label={`${seat} ${isAirbus ? 'sidestick' : 'yoke'}: drag or use arrow keys`} aria-disabled={locked}
    onPointerDown={event => { if (!locked) pointer.current.begin(event, position, isAirbus); }}
    onPointerMove={event => { if (!locked) pointer.current.move(event); }}
    onPointerUp={event => pointer.current.end(event)}
    onPointerCancel={event => pointer.current.end(event)}
    onLostPointerCapture={event => pointer.current.lost(event)}
    onBlur={() => { pointer.current.end(); neutral(); }}
    onKeyDown={event => {
      if (locked || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const x = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const y = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      setPosition({ x, y }); actions.current?.('pitch', y * 0.3); actions.current?.('roll', x * 0.3);
    }} onKeyUp={event => { if (event.key.startsWith('Arrow')) neutral(); }}>
    <rect width={isAirbus ? 160 : 200} height={isAirbus ? 210 : 190} fill="transparent" pointerEvents="all" />
    <defs><linearGradient id={`${gradient}-${seat}`}><stop stopColor="#111a1e"/><stop offset=".35" stopColor="#697571"/><stop offset=".6" stopColor="#354240"/><stop offset="1" stopColor="#10191d"/></linearGradient></defs>
    {isAirbus ? <>
      <ellipse cx="80" cy="180" rx="45" ry="18" fill="#17232a" stroke="#7b878b" strokeWidth="2"/>
      <path d="M54 178 62 151H98L106 178Q80 191 54 178Z" fill="#222d32" stroke="#10191e" strokeWidth="2"/>
      <path d="M59 172Q80 181 101 172M61 165Q80 173 99 165M63 158Q80 165 97 158" fill="none" stroke="#465158" strokeWidth="3"/>
      <g data-control-grip="" className="sidestick-moving" style={{ transform: `perspective(420px) rotateX(${-visiblePosition.y * 24}deg) rotateZ(${visiblePosition.x * 20}deg)`, transformOrigin: '80px 174px', transformBox: 'view-box' }}>
        <path d="M72 174 69 105H91L88 174Z" fill={`url(#${gradient}-${seat})`} stroke="#111a1e" strokeWidth="2"/>
        <path d={seat === 'captain' ? 'M69 127 59 60Q50 28 72 24L97 30Q110 35 104 57L94 125Z' : 'M91 127 101 60Q110 28 88 24L63 30Q50 35 56 57L66 125Z'} fill={`url(#${gradient}-${seat})`} stroke="#10191e" strokeWidth="3"/>
        <path d="M66 67 96 72M67 78 95 83M69 89 93 94" fill="none" stroke="#111a1d" strokeWidth="5" strokeLinecap="round"/>
        <circle cx={seat === 'captain' ? 91 : 69} cy="42" r="7" fill="#a63e31" stroke="#401c19" strokeWidth="2"/>
        <path d="M72 31 85 34" stroke="#a3adaa" strokeWidth="2" strokeLinecap="round"/>
      </g>
    </> : <>
    <path data-control-shaft="" d={`M88 ${87 + visiblePosition.y * 15}h24l7 100H81Z`} fill={`url(#${gradient}-${seat})`} stroke="#111a1e" strokeWidth="2"/>
    <g data-control-grip="" transform={`translate(0 ${visiblePosition.y * 15}) rotate(${visiblePosition.x * 40} 100 80)`}>
        <path d="M100 115V80M100 80Q42 90 28 62L20 24M100 80Q158 90 172 62L180 24" fill="none" stroke="#101619" strokeWidth="25" strokeLinecap="round"/>
        <path d="M100 115V80M100 80Q42 90 28 62L20 24M100 80Q158 90 172 62L180 24" fill="none" stroke={`url(#${gradient}-${seat})`} strokeWidth="19" strokeLinecap="round"/>
        <path d="m17 28 9-2m-8 11 9-2m-7 11 9-2m147-18 9 2m-10 7 9 2m-11 7 9 2" stroke="#11191b" strokeWidth="3"/>
        <rect x="73" y="61" width="54" height="37" rx="7" fill="#303c3d" stroke="#101b1f" strokeWidth="3"/>
        <path d="M79 65h42" stroke="#7b8780"/><circle cx="81" cy="71" r="2" fill="#a0a49b"/><circle cx="119" cy="89" r="2" fill="#a0a49b"/>
        <path d="M87 75h26m-26 5h26m-26 5h26" stroke="#192426" strokeWidth="2"/>
    </g>
    </>}
  </svg>;
  const pedalAssembly = seat => <div className={`cockpit-pedals cockpit-pedals-${seat}`} role="group" aria-label={`${seat} rudder, nosewheel steering and toe brakes`}>
      <div className="pedal-linkage" aria-hidden="true"/>
      {['left', 'right'].map(side => <div key={side} data-control-pedal={side} className={`cockpit-pedal cockpit-pedal-${side}`} style={{ transform: `translateY(${visibleRudder * (side === 'left' ? 9 : -9)}px)` }}>
        <div className="pedal-piston" aria-hidden="true"/>
        <button data-control-toe={side} className="pedal-toe" disabled={disabled} aria-label={`${seat} ${side} toe brake (both main wheel brakes)`} title="Hold toe brake" style={{ transform: `perspective(100px) rotateX(${pedals[side] * -20}deg)` }} {...pedalEvents('brakes', side)}><span aria-hidden="true"/></button>
        <button className="pedal-heel" disabled={rudderLocked} aria-label={`${seat} ${side} rudder and ground steering`} title={`Hold ${side} rudder / nosewheel steering`} {...pedalEvents('rudder', side)}><span aria-hidden="true"/></button>
      </div>)}
      <svg className="rudder-position" viewBox="0 0 70 32" role="img" aria-label={`Actual rudder deflection ${((flightState.controls?.yaw ?? 0) * 180 / Math.PI).toFixed(0)} degrees`}>
        <path d="M35 4v13" stroke="#9da99e" strokeWidth="5"/><path d="M35 17v11" transform={`rotate(${-(flightState.controls?.yaw ?? 0) * 180 / Math.PI} 35 17)`} stroke="#e2dfc7" strokeWidth="5"/>
        <path d="M8 28h12m30 0h12" stroke="#687a70"/>
      </svg>
    </div>;
  return <div ref={root} className={`${overlay ? 'cockpit-pilot-overlay' : 'cockpit-pilot-side'} ${isAirbus ? 'has-sidesticks' : ''}`}>
    {control('captain')}{overlay && control('first-officer')}
    {pedalAssembly('captain')}{overlay && pedalAssembly('first-officer')}
  </div>;
}
CockpitPilotControls.propTypes = { flightState: PropTypes.object.isRequired, onAction: PropTypes.func, physicsService: PropTypes.object, isAirbus: PropTypes.bool, overlay: PropTypes.bool };

export default memo(CockpitPilotControls, (previous, next) => {
  if (!next.physicsService) return false;
  return previous.physicsService === next.physicsService && previous.onAction === next.onAction &&
    previous.isAirbus === next.isAirbus && previous.overlay === next.overlay &&
    previous.flightState.hasCrashed === next.flightState.hasCrashed &&
    previous.flightState.autopilot === next.flightState.autopilot &&
    previous.flightState.onGround === next.flightState.onGround;
});
