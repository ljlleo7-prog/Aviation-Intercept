import { isReverseThrustCommand } from '../utils/pedestalControls.js';
import React, { useState, useEffect, useCallback, useRef } from 'react';

const REVERSE_IDLE_LEVER = 0.19;
const FORWARD_IDLE_LEVER = 0.21;
const REVERSE_DETENT = 0.2;
const MODE_HYSTERESIS = 0.015;
const MANUAL_SYNC_LOCK_MS = 1200;

const ThrustManager = ({ controlThrust, flightState, onSystemAction }) => {
  const engineCount =
    Array.isArray(flightState?.engineN1) ? flightState.engineN1.length :
    Array.isArray(flightState?.engineN2) ? flightState.engineN2.length : 2;

  const engineCommands = flightState?.engineThrottleCommands ?? flightState?.engineThrottles;
  const initial = Array(engineCount).fill(REVERSE_DETENT);
  const [throttles, setThrottles] = useState(initial);
  const [reverse, setReverse] = useState(Array(engineCount).fill(false));
  const [sync, setSync] = useState(true);
  const displayThrottles = throttles.map(t => t * 100);

  const isDraggingRef = useRef(Array(engineCount).fill(false));
  const lastManualThrottleChangeRef = useRef(0);
  const reverseRef = useRef(reverse);

  useEffect(() => {
    reverseRef.current = reverse;
  }, [reverse]);

  useEffect(() => {
    isDraggingRef.current = Array(engineCount).fill(false);
  }, [engineCount]);

  const deriveReverseFromLever = useCallback((lever, previousMode = false) => {
    if (lever < REVERSE_DETENT - MODE_HYSTERESIS) return true;
    if (lever > REVERSE_DETENT + MODE_HYSTERESIS) return false;
    return previousMode;
  }, []);

  const deriveReverseFromCommand = useCallback(isReverseThrustCommand, []);

  const mapCommandToLever = useCallback((command) => {
    const cmd = typeof command === 'number' ? command : 0;
    if (cmd < 0) return (cmd + 1) * REVERSE_DETENT;
    return (cmd * (1 - REVERSE_DETENT)) + REVERSE_DETENT;
  }, []);

  useEffect(() => {
    if (isDraggingRef.current.some(d => d)) return;
    if (Date.now() - lastManualThrottleChangeRef.current < MANUAL_SYNC_LOCK_MS) return;

    if (Array.isArray(engineCommands)) {
      const commands = engineCommands.map(v => (typeof v === 'number' ? v : 0));
      const values = commands.map(mapCommandToLever);
      if (values.length === engineCount) {
        const nextReverse = values.map((_, index) => deriveReverseFromCommand(commands[index], reverseRef.current[index] ?? false));
        const throttlesChanged = values.some((value, index) => Math.abs((throttles[index] ?? 0) - value) > 0.0001);
        const reverseChanged = nextReverse.some((value, index) => (reverseRef.current[index] ?? false) !== value);

        if (throttlesChanged) {
          setThrottles(values);
        }
        if (reverseChanged) {
          reverseRef.current = nextReverse;
          setReverse(nextReverse);
        }
      }
    } else if (typeof flightState?.throttle === 'number') {
      const command = flightState.throttle;
      const val = mapCommandToLever(command);
      const nextMode = deriveReverseFromCommand(command, reverseRef.current[0] ?? false);
      const nextReverse = Array(engineCount).fill(nextMode);
      const nextThrottles = Array(engineCount).fill(val);
      const throttlesChanged = nextThrottles.some((value, index) => Math.abs((throttles[index] ?? 0) - value) > 0.0001);
      const reverseChanged = nextReverse.some((value, index) => (reverseRef.current[index] ?? false) !== value);

      if (throttlesChanged) {
        setThrottles(nextThrottles);
      }
      if (reverseChanged) {
        reverseRef.current = nextReverse;
        setReverse(nextReverse);
      }
    }
  }, [engineCommands, flightState?.throttle, engineCount, deriveReverseFromCommand, mapCommandToLever, throttles]);

  const mapLeverToCommand = (lever) => {
    const v = Math.max(0, Math.min(1, lever));

    if (v <= REVERSE_DETENT) {
      return -1.0 + (v / REVERSE_DETENT);
    }

    return (v - REVERSE_DETENT) / (1 - REVERSE_DETENT);
  };

  const setLeverThrottle = useCallback((index, value, options = {}) => {
    const val = Math.max(0, Math.min(1, value));
    const { forcedReverse = null } = options;
    lastManualThrottleChangeRef.current = Date.now();

    setThrottles(prev => {
      const next = [...prev];
      next[index] = val;
      if (sync) {
        for (let i = 0; i < engineCount; i++) next[i] = val;
      }
      return next;
    });

    setReverse(prev => {
      const next = [...prev];
      const resolvedMode = typeof forcedReverse === 'boolean'
        ? forcedReverse
        : deriveReverseFromLever(val, prev[index] ?? false);
      next[index] = resolvedMode;
      if (sync) {
        for (let i = 0; i < engineCount; i++) next[i] = resolvedMode;
      }
      reverseRef.current = next;
      return next;
    });

    const cmd = mapLeverToCommand(val);
    if (controlThrust) controlThrust(index, cmd);

    if (sync) {
      for (let i = 0; i < engineCount; i++) {
        if (i !== index && controlThrust) {
          controlThrust(i, cmd);
        }
      }
    }
  }, [controlThrust, sync, engineCount, deriveReverseFromLever]);

  const onDrag = (index, e) => {
    isDraggingRef.current[index] = true;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();

    const move = (evt) => {
      const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
      const pct = Math.max(0, Math.min(100, (1 - y / rect.height) * 100));
      const raw = pct / 100;
      const currentReverseState = reverseRef.current[index] ?? false;

      let clamped = raw;
      if (!currentReverseState) {
        clamped = Math.max(FORWARD_IDLE_LEVER, raw);
      } else {
        clamped = Math.min(REVERSE_DETENT, raw);
      }

      setLeverThrottle(index, clamped, { forcedReverse: currentReverseState });
    };

    const up = () => {
      isDraggingRef.current[index] = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    move(e);
  };

  const toggleReverse = (index) => {
    const targetReverse = !(reverseRef.current[index] ?? false);
    const newVal = targetReverse ? REVERSE_IDLE_LEVER : FORWARD_IDLE_LEVER;
    setLeverThrottle(index, newVal, { forcedReverse: targetReverse });
  };

  const lever = (index) => {
    const pct = displayThrottles[index];
    const isRev = reverse[index];
    const engineKey = `eng${index + 1}`;
    const engineRunning = !!flightState?.systems?.engines?.[engineKey]?.fuelControl;

    return React.createElement('div', {
      key: index,
      style: {
        background: 'rgba(0, 0, 0, 0.3)',
        padding: '6px',
        borderRadius: '8px',
        border: '1px solid #475569',
        width: '58px'
      }
    },
      React.createElement('div', { style: { textAlign: 'center', marginBottom: '6px', color: '#00ff00', fontFamily: 'monospace', fontSize: '10px' } }, `ENG ${index+1}`),
      React.createElement('div', {
        style: {
          position: 'relative',
          height: '120px',
          width: '18px',
          background: '#2a2a2a',
          borderRadius: '12px',
          margin: '6px auto',
          border: '1px solid #555',
          cursor: 'grab',
          userSelect: 'none'
        },
        onMouseDown: (e) => onDrag(index, e),
        onTouchStart: (e) => onDrag(index, e)
      },
        React.createElement('div', { style: { position: 'absolute', top: '4px', left: '4px', right: '4px', bottom: '4px', background: 'linear-gradient(to top, #ff4444 0%, #ffaa00 50%, #00ff00 100%)', borderRadius: '8px', opacity: 0.25 } }),
        React.createElement('div', { style: { position: 'absolute', bottom: `${pct}%`, left: '2px', right: '2px', height: '14px', background: 'linear-gradient(to top, #ff4444, #ffaa00, #00ff00)', borderRadius: '8px', boxShadow: '0 0 4px rgba(0,255,0,0.7)' } }),
        React.createElement('div', { style: { position: 'absolute', bottom: `${pct}%`, left: '-5px', width: '35px', height: '14px', background: '#fff', border: '1px solid #000', borderRadius: '8px', transform: 'translateY(50%)', fontSize: '8px', fontWeight: 'bold', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, isRev ? 'REV' : 'THR')
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '4px', marginTop: '4px' } },
        React.createElement('div', { style: { width: '100%', height: '14px', background: isRev ? '#ef4444' : '#10b981', color: '#fff', borderRadius: '4px', textAlign: 'center', lineHeight: '14px', fontSize: '8px', cursor: 'pointer' }, onClick: () => toggleReverse(index) }, isRev ? 'REV' : 'FWD')
      ),
      React.createElement('div', {
        style: { marginTop: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }
      },
        React.createElement('div', { style: { fontSize: '7px', color: '#aaa', textAlign: 'center' } }, engineRunning ? 'RUN' : 'CUT'),
        React.createElement('div', {
          style: { width: '28px', height: '28px', position: 'relative', cursor: onSystemAction ? 'pointer' : 'default' },
          onClick: onSystemAction ? () => onSystemAction('engines', `${engineKey}_run`) : undefined
        },
          React.createElement('div', { style: { position: 'absolute', top: '4px', left: '4px', right: '4px', bottom: '4px', background: '#888', borderRadius: '50%', boxShadow: 'inset 0 0 4px #000', border: '1px solid #555' } }),
          React.createElement('div', { style: {
            position: 'absolute',
            top: engineRunning ? '1px' : '10px',
            left: '8px',
            width: '12px', height: '18px',
            background: 'linear-gradient(90deg, #d0d0d0, #f8f8f8, #a0a0a0)',
            borderRadius: '6px',
            boxShadow: '0 3px 5px rgba(0,0,0,0.5)',
            transition: 'top 0.15s cubic-bezier(0.4,0,0.2,1)',
            zIndex: 2
          } },
            React.createElement('div', { style: { width: '100%', height: '3px', background: 'rgba(255,255,255,0.8)', borderRadius: '6px 6px 0 0' } })
          )
        )
      )
    );
  };

  return React.createElement('div', { style: { background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', padding: '15px', borderRadius: '10px', border: '2px solid #475569', display: 'flex', gap: '10px', alignItems: 'flex-start', width: 'fit-content', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)' } },
    React.createElement('div', { style: { display: 'flex', gap: '10px' } },
      Array.from({ length: engineCount }).map((_, i) => lever(i))
    ),
      React.createElement('div', { style: { marginLeft: '8px' } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ccc' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: sync,
            onChange: (e) => {
              const checked = e.target.checked;
              setSync(checked);
              if (checked) {
                const firstRev = reverseRef.current[0] || false;
                const nextReverse = Array(engineCount).fill(firstRev);
                reverseRef.current = nextReverse;
                setReverse(nextReverse);
              }
            }
          }),
          'Sync'
        )
      )
  );

};

export default ThrustManager;
