export const clampThrust = value => Math.max(-0.7, Math.min(1, Number.isFinite(value) ? value : 0));

export function thrustLeverCommand(position, reverse) {
  const travel = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
  return reverse ? -travel * 0.7 : travel;
}

export function thrustLeverPosition(command, reverse) {
  const thrust = clampThrust(command);
  return reverse ? Math.max(0, -thrust / 0.7) : Math.max(0, thrust);
}

export function commandedEngines(index, command, count, sync, reverseCapable = []) {
  const thrust = clampThrust(command);
  return Array.from({ length: count }, (_, engine) => engine)
    .filter(engine => sync || engine === index)
    .map(engine => ({ index: engine, command: thrust < 0 && reverseCapable[engine] === false ? 0 : thrust }));
}

export function spinTrim(normalizedTrim, degrees) {
  // Match the original wheel: one revolution changes trim by 0.01 radians.
  return Math.max(-1, Math.min(1, normalizedTrim + degrees / 360 * 0.01 / 0.2));
}

export function rotationDelta(previous, current) {
  return ((current - previous + 540) % 360) - 180;
}
