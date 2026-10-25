const readOnlineMode = () => {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage;
    const mode = JSON.parse(storage?.getItem('app_settings') || '{}').offlineMode;
    return typeof mode === 'boolean' ? !mode : null;
  } catch { return null; }
};
let configured = readOnlineMode() !== null;
let online = readOnlineMode() ?? false;
const listeners = new Set();
export const getOnlineMode = () => online;
export function subscribeOnlineMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function setOnlineMode(value) {
  configured = true;
  if (online === Boolean(value)) return;
  online = Boolean(value);
  listeners.forEach(listener => listener());
}
// Read storage again at each dispatch, including during an in-flight mode switch.
export const isOfflineMode = () => readOnlineMode() === false || (configured && !online);
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === 'app_settings' || event.key === null) setOnlineMode(readOnlineMode() ?? false);
});
