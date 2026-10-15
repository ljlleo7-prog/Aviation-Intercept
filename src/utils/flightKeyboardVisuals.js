const listeners = new Set();
const axes = { pitch: 0, roll: 0, yaw: 0, toeBrakes: 0 };

export function publishKeyboardControl(action, value) {
  if (!(action in axes)) return;
  axes[action] = value;
  for (const listener of listeners) listener({ ...axes });
}

export function subscribeKeyboardControls(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
