// Both cloud and downloaded saves use the same validation and restoration path.
export function validateFlightSave(value) {
  if (!value || !['1.0', '1.1'].includes(value.version)) throw new Error('Unsupported flight save version.');
  if (typeof value.aircraftModel !== 'string' || !value.aircraftModel.trim()) throw new Error('Saved aircraft is missing.');
  const state = value.physicsState;
  const position = state?.position;
  if (!position || ![position.x, position.y, position.z, position.latitude, position.longitude].every(Number.isFinite)
      || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) {
    throw new Error('Saved aircraft position is invalid.');
  }
  const velocity = state.velocity;
  if (!velocity || ![velocity.x ?? velocity.u, velocity.y ?? velocity.v, velocity.z ?? velocity.w].every(Number.isFinite)) {
    throw new Error('Saved aircraft velocity is invalid.');
  }
  const orientation = state.orientation;
  const attitude = orientation?.w !== undefined
    ? [orientation.w, orientation.x, orientation.y, orientation.z]
    : [orientation?.phi, orientation?.theta, orientation?.psi];
  if (!attitude.every(Number.isFinite) || (attitude.length === 4 && Math.hypot(...attitude) < 0.001)) {
    throw new Error('Saved aircraft attitude is invalid.');
  }
  const check = (entry) => {
    if (typeof entry === 'number' && !Number.isFinite(entry)) throw new Error('Save contains invalid numeric data.');
    if (entry && typeof entry === 'object') {
      for (const [key, item] of Object.entries(entry)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Save contains an invalid field.');
        check(item);
      }
    }
  };
  check(value);
  if (state.fuel != null && (typeof state.fuel !== 'number' || state.fuel < 0)) throw new Error('Save contains invalid control data.');
  if (state.controls != null && (typeof state.controls !== 'object' || Array.isArray(state.controls))) throw new Error('Save contains invalid control data.');
  for (const throttles of [state.controls?.engineThrottles, state.controls?.throttles, state.engineThrottleCommands]) {
    if (throttles != null && (!Array.isArray(throttles) || !throttles.every(Number.isFinite))) throw new Error('Save contains invalid control data.');
  }
  if (state.currentWaypointIndex != null && (!Number.isInteger(state.currentWaypointIndex) || state.currentWaypointIndex < 0)) throw new Error('Save contains invalid navigation data.');
  if (value.flightPlan != null && !Array.isArray(value.flightPlan) && typeof value.flightPlan !== 'object') throw new Error('Save contains invalid navigation data.');
  const reference = state.autopilot?.approachReference;
  if (reference && (![reference.heading, reference.ilsFrequency, reference.thresholdStart?.latitude, reference.thresholdStart?.longitude].every(Number.isFinite)
    || Math.abs(reference.thresholdStart.latitude) > 90 || Math.abs(reference.thresholdStart.longitude) > 180)) {
    throw new Error('Save contains invalid navigation data.');
  }
  return JSON.parse(JSON.stringify(value));
}

export function getRecoveryConfig(value) {
  const save = validateFlightSave(value);
  const session = save.session || {};
  const plan = save.flightPlan || {};
  return {
    save,
    config: {
      ...session,
      aircraftModel: save.aircraftModel,
      selectedDeparture: session.selectedDeparture || plan.departure || null,
      selectedArrival: session.selectedArrival || plan.arrival || null,
      flightPlan: plan,
      routeDetails: session.routeDetails || plan.routeDetails || {},
      weatherData: save.weatherData || {}
    }
  };
}
