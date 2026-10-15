import { flightKeyboardBindings, flightKeyboardResponse } from '../config/flightKeyboard.js';

const heldActions = new Set(['pitchDown', 'pitchUp', 'rollLeft', 'rollRight', 'rudderLeft', 'rudderRight', 'brake']);
const editable = target => target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [aria-modal="true"]');

// Keep browser event handling independent of React so release and focus behavior can be tested.
export function attachFlightKeyboard({ target, getState, onAction, bindings = flightKeyboardBindings }) {
  const held = new Set();
  const values = { pitch: 0, roll: 0, yaw: 0 };
  let frame = null;
  let lastTime = null;
  const targets = () => {
    const state = getState();
    const active = state.enabled && !state.hasCrashed;
    const axis = (positive, negative) => Number(held.has(positive)) - Number(held.has(negative));
    return {
      pitch: active && !state.autopilot ? axis('pitchUp', 'pitchDown') * 0.3 : 0,
      roll: active && !state.autopilot ? axis('rollRight', 'rollLeft') * 0.3 : 0,
      yaw: active && (!state.autopilot || state.onGround) ? axis('rudderRight', 'rudderLeft') : 0
    };
  };
  const tick = time => {
    frame = null;
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    let moving = false;
    for (const [action, goal] of Object.entries(targets())) {
      const previous = values[action];
      const duration = goal === 0 ? flightKeyboardResponse.releaseSeconds : flightKeyboardResponse.pressSeconds;
      const next = previous + (goal - previous) * (1 - Math.exp(-dt / duration));
      values[action] = Math.abs(goal - next) < 0.0001 ? goal : next;
      if (values[action] !== previous) onAction(action, values[action]);
      if (values[action] !== goal) moving = true;
    }
    if (moving) frame = target.requestAnimationFrame(tick);
  };
  const apply = () => {
    const state = getState();
    onAction('toeBrakes', state.enabled && !state.hasCrashed && held.has('brake') ? 1 : 0);
    if (frame === null) {
      lastTime = target.performance.now();
      frame = target.requestAnimationFrame(tick);
    }
  };
  // Focus loss, teardown and control lock changes must never leave a residual command.
  const reset = () => {
    held.clear();
    if (frame !== null) target.cancelAnimationFrame(frame);
    frame = null;
    for (const action of Object.keys(values)) {
      if (values[action] !== 0) { values[action] = 0; onAction(action, 0); }
    }
    onAction('toeBrakes', 0);
  };
  const down = event => {
    const action = bindings[event.code];
    const state = getState();
    if (!action || !state.enabled || state.hasCrashed || event.ctrlKey || event.metaKey || event.altKey || editable(event.target)) return;
    event.preventDefault();
    if (heldActions.has(action)) {
      if (held.has(action)) return;
      held.add(action);
      apply();
    } else if (!event.repeat) {
      if (action === 'gear') onAction('gear', !state.gear);
      if (action === 'flaps' && state.maxFlaps > 0) onAction('flaps', Math.max(0, Math.min(state.maxFlaps, state.flaps + (event.shiftKey ? -1 : 1))));
      if (action === 'parkingBrake') onAction('parkingBrake', !state.parkingBrake);
      if (action === 'throttleUp' || action === 'throttleDown') onAction('throttle', Math.max(0, Math.min(1, state.throttle + (action === 'throttleUp' ? 0.05 : -0.05))));
    }
  };
  const up = event => {
    if (held.delete(bindings[event.code])) { event.preventDefault(); apply(); }
  };
  const visibility = () => { if (target.document.hidden) reset(); };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', reset);
  target.addEventListener('focusin', reset);
  target.document.addEventListener('visibilitychange', visibility);
  return () => {
    reset();
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', reset);
    target.removeEventListener('focusin', reset);
    target.document.removeEventListener('visibilitychange', visibility);
  };
}
