const clamp = value => Math.max(-1, Math.min(1, value));

export function hasMechanicalFeedback(aircraft = {}) {
  if (typeof aircraft.controlTransmission?.mechanicalFeedback === 'boolean') return aircraft.controlTransmission.mechanicalFeedback;
  return /^(B73[0-9]|B737|B737-800|Boeing 737(?:-.*)?)$/i.test(aircraft.icao || aircraft.model || '');
}

export function hasManualReversion(aircraft, axis) {
  const configured = aircraft?.controlTransmission?.manualReversionAxes;
  if (Array.isArray(configured)) return configured.includes(axis);
  return hasMechanicalFeedback(aircraft) && ['aileron', 'elevator'].includes(axis);
}

export function hydraulicAssistAvailable(systems = {}) {
  if (Array.isArray(systems.resourceNetwork?.resources)) {
    return systems.resourceNetwork.resources.some(resource => /^hydraulic_[AB]$/.test(resource));
  }
  const circuits = Object.values(systems.hydraulics || {});
  return !circuits.length || circuits.some(circuit => circuit.pressure > 1500);
}

export function advanceControlPosition(current, target, response, dt, manualReversion, releaseToCenter = true) {
  // Only unpowered cable/manual reversion snaps back under load. Powered
  // controls retain their normal smoothing. Jams are handled before this.
  if (manualReversion && releaseToCenter && Math.abs(target) < 0.0001) return 0;
  if (!manualReversion) return current + (clamp(target) - current) * response;
  // Simulation proxy for pilot effort: reaching full travel requires a sustained
  // hold. Preserve the requested final deflection instead of scaling authority.
  const travel = Math.max(0, dt) * 0.08;
  return current + Math.max(-travel, Math.min(travel, clamp(target) - current));
}

export function getControlLock(service, axis) {
  const jam = service.failureSystem?.activeFailures.get('control_jam');
  if (jam && jam.currentStage !== 'recovered') {
    const context = jam.variation.context;
    if ((context.surface || 'elevator') === axis) {
      context.stuckValue ??= service.controls[axis];
      return context.stuckValue;
    }
  }
  const component = service.systemModel?.componentStore?.components.get(`controls.${axis}`);
  const locked = component?.damageModes?.some(mode => ['mechanical_lockout', 'jam', 'asymmetry_lockout'].includes(mode));
  if (locked || service.failureParams?.movement_restricted?.[axis]) return service.controls[axis];
  return null;
}

