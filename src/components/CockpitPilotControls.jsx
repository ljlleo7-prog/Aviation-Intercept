import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './CockpitPilotControls.css';
import { subscribeKeyboardControls } from '../utils/flightKeyboardVisuals.js';

export default function CockpitPilotControls({ flightState, onAction, isAirbus = false, overlay = false }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [pedals, setPedals] = useState({ rudder: 0, left: 0, right: 0 });
  const inputs = useRef({ rudder: { left: 0, right: 0 }, brakes: { left: 0, right: 0 } });
  const actions = useRef(onAction);
  actions.current = onAction;
  const gradient = useId();
  const disabled = !onAction || flightState.hasCrashed;
  const locked = disabled || flightState.autopilot;
  const rudderLocked = disabled || (flightState.autopilot && !flightState.onGround);
  useEffect(() => subscribeKeyboardControls(({ pitch, roll, yaw, toeBrakes }) => {
    setPosition({ x: roll / 0.3, y: pitch / 0.3 });
    setPedals({ rudder: yaw, left: toeBrakes, right: toeBrakes });
  }), []);
  const neutral = () => {
    setPosition({ x: 0, y: 0 });
    actions.current?.('pitch', 0);
    actions.current?.('roll', 0);
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
  const moveYoke = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.35)));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height * 0.35) / (rect.height * 0.35)));
    setPosition({ x, y });
    actions.current?.('pitch', y * 0.3);
    actions.current?.('roll', x * 0.3);
  };
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
  const yoke = seat => <svg key={seat} className={`cockpit-yoke cockpit-yoke-${seat}`} viewBox="0 0 200 190" role="group" tabIndex={locked ? -1 : 0}
    aria-label={`${seat} ${isAirbus ? 'sidestick' : 'yoke'}: drag or use arrow keys`} aria-disabled={locked}
    onPointerDown={event => { if (locked) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); moveYoke(event); }}
    onPointerMove={event => { if (!locked && event.currentTarget.hasPointerCapture(event.pointerId)) moveYoke(event); }}
    onPointerUp={event => { neutral(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={neutral} onLostPointerCapture={neutral} onBlur={neutral}
    onKeyDown={event => {
      if (locked || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const x = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const y = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      setPosition({ x, y }); actions.current?.('pitch', y * 0.3); actions.current?.('roll', x * 0.3);
    }} onKeyUp={event => { if (event.key.startsWith('Arrow')) neutral(); }}>
    <defs><linearGradient id={`${gradient}-${seat}`}><stop stopColor="#111a1e"/><stop offset=".35" stopColor="#697571"/><stop offset=".6" stopColor="#354240"/><stop offset="1" stopColor="#10191d"/></linearGradient></defs>
    <path d={`M88 ${87 + position.y * 15}h24l7 100H81Z`} fill={`url(#${gradient}-${seat})`} stroke="#111a1e" strokeWidth="2"/>
    <g transform={`translate(0 ${position.y * 15}) rotate(${position.x * 40} 100 80)`}>
      {isAirbus ? <><path d="M85 140 78 60Q65 18 91 12L112 18Q126 22 120 46L111 140Z" fill={`url(#${gradient}-${seat})`} stroke="#131d21" strokeWidth="3"/><path d="M83 38 110 44M84 48 108 54M85 58 106 64" stroke="#101315" strokeWidth="5"/><circle cx="104" cy="25" r="7" fill="#922d24"/></> : <>
        <path d="M100 115V80M100 80Q42 90 28 62L20 24M100 80Q158 90 172 62L180 24" fill="none" stroke="#101619" strokeWidth="25" strokeLinecap="round"/>
        <path d="M100 115V80M100 80Q42 90 28 62L20 24M100 80Q158 90 172 62L180 24" fill="none" stroke={`url(#${gradient}-${seat})`} strokeWidth="19" strokeLinecap="round"/>
        <path d="m17 28 9-2m-8 11 9-2m-7 11 9-2m147-18 9 2m-10 7 9 2m-11 7 9 2" stroke="#11191b" strokeWidth="3"/>
        <rect x="73" y="61" width="54" height="37" rx="7" fill="#303c3d" stroke="#101b1f" strokeWidth="3"/>
        <path d="M79 65h42" stroke="#7b8780"/><circle cx="81" cy="71" r="2" fill="#a0a49b"/><circle cx="119" cy="89" r="2" fill="#a0a49b"/>
        <path d="M87 75h26m-26 5h26m-26 5h26" stroke="#192426" strokeWidth="2"/>
      </>}
    </g>
  </svg>;
  const pedalAssembly = seat => <div className={`cockpit-pedals cockpit-pedals-${seat}`} role="group" aria-label={`${seat} rudder, nosewheel steering and toe brakes`}>
      <div className="pedal-linkage" aria-hidden="true"/>
      {['left', 'right'].map(side => <div key={side} className={`cockpit-pedal cockpit-pedal-${side}`} style={{ transform: `translateY(${pedals.rudder * (side === 'left' ? 9 : -9)}px)` }}>
        <div className="pedal-piston" aria-hidden="true"/>
        <button className="pedal-toe" disabled={disabled} aria-label={`${seat} ${side} toe brake (both main wheel brakes)`} title="Hold toe brake" style={{ transform: `perspective(100px) rotateX(${pedals[side] * -20}deg)` }} {...pedalEvents('brakes', side)}><span aria-hidden="true"/></button>
        <button className="pedal-heel" disabled={rudderLocked} aria-label={`${seat} ${side} rudder and ground steering`} title={`Hold ${side} rudder / nosewheel steering`} {...pedalEvents('rudder', side)}><span aria-hidden="true"/></button>
      </div>)}
      <svg className="rudder-position" viewBox="0 0 70 32" role="img" aria-label={`Actual rudder deflection ${((flightState.controls?.yaw ?? 0) * 180 / Math.PI).toFixed(0)} degrees`}>
        <path d="M35 4v13" stroke="#9da99e" strokeWidth="5"/><path d="M35 17v11" transform={`rotate(${-(flightState.controls?.yaw ?? 0) * 180 / Math.PI} 35 17)`} stroke="#e2dfc7" strokeWidth="5"/>
        <path d="M8 28h12m30 0h12" stroke="#687a70"/>
      </svg>
    </div>;
  return <div className={overlay ? 'cockpit-pilot-overlay' : 'cockpit-pilot-side'}>
    {yoke('captain')}{overlay && yoke('first-officer')}
    {pedalAssembly('captain')}{overlay && pedalAssembly('first-officer')}
  </div>;
}
CockpitPilotControls.propTypes = { flightState: PropTypes.object.isRequired, onAction: PropTypes.func, isAirbus: PropTypes.bool, overlay: PropTypes.bool };
