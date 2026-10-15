const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export const replicaTargets = data => ({
  ias: finite(data.autopilotTargets?.ias, finite(data.autopilotTargets?.speed, finite(data.ias, 250))),
  heading: finite(data.autopilotTargets?.heading, finite(data.heading, 360)),
  altitude: finite(data.autopilotTargets?.altitude, finite(data.altitude, 3000)),
  vs: finite(data.autopilotTargets?.vs, 0)
});

export const adjustReplicaTarget = (targets, field, direction, coarse = false) => {
  const step = (coarse
    ? { ias: 10, heading: 10, altitude: 1000, vs: 500 }
    : { ias: 5, heading: 5, altitude: 100, vs: 100 })[field];
  if (!step || ![-1, 1].includes(direction)) return targets;
  const next = { ...targets };
  const value = Math.round(targets[field] / step) * step + direction * step;
  next[field] = field === 'heading'
    ? (((value % 360) + 360) % 360 || 360)
    : field === 'ias' ? clamp(value, 120, 350)
      : field === 'altitude' ? clamp(value, 0, 45000)
        : clamp(value, -4000, 4000);
  return next;
};
