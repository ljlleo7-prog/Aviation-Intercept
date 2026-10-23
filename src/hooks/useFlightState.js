import { useState, useCallback } from 'react';

const mergeFiniteObject = (next = {}, prev = {}) => {
  const merged = { ...prev };
  Object.entries(next || {}).forEach(([key, value]) => {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        merged[key] = value;
      }
      return;
    }
    if (value !== undefined) {
      merged[key] = value;
    }
  });
  return merged;
};

const buildFallbackDerived = (physicsState, physicsService, prevDerived = {}) => {
  const altitudeFt = Math.max(0, -(physicsState?.position?.z ?? 0)) * 3.28084;
  const heading = ((physicsState?.orientation?.psi ?? 0) * 180 / Math.PI + 360) % 360;
  const airspeeds = physicsService?.calculateAirspeeds?.() ?? {};
  const nextDerived = physicsState?.derived ?? {};

  return {
    ...prevDerived,
    ...nextDerived,
    altitude_ft: Number.isFinite(nextDerived.altitude_ft)
      ? nextDerived.altitude_ft
      : (Number.isFinite(prevDerived.altitude_ft) ? prevDerived.altitude_ft : altitudeFt),
    airspeed: Number.isFinite(nextDerived.airspeed)
      ? nextDerived.airspeed
      : (Number.isFinite(airspeeds.trueAirspeed) ? airspeeds.trueAirspeed : (Number.isFinite(prevDerived.airspeed) ? prevDerived.airspeed : 0)),
    groundSpeed: Number.isFinite(nextDerived.groundSpeed)
      ? nextDerived.groundSpeed
      : (Number.isFinite(airspeeds.groundSpeed) ? airspeeds.groundSpeed : (Number.isFinite(prevDerived.groundSpeed) ? prevDerived.groundSpeed : 0)),
    heading: Number.isFinite(nextDerived.heading)
      ? nextDerived.heading
      : (Number.isFinite(prevDerived.heading) ? prevDerived.heading : heading),
    altitude_agl_ft: Number.isFinite(nextDerived.altitude_agl_ft)
      ? nextDerived.altitude_agl_ft
      : (Number.isFinite(prevDerived.altitude_agl_ft) ? prevDerived.altitude_agl_ft : 0),
    terrain_elevation_ft: Number.isFinite(nextDerived.terrain_elevation_ft)
      ? nextDerived.terrain_elevation_ft
      : (Number.isFinite(prevDerived.terrain_elevation_ft) ? prevDerived.terrain_elevation_ft : 0),
    airport_elevation_ft: Number.isFinite(nextDerived.airport_elevation_ft)
      ? nextDerived.airport_elevation_ft
      : (Number.isFinite(prevDerived.airport_elevation_ft) ? prevDerived.airport_elevation_ft : 0)
  };
};

/**
 * useFlightState - Manages flight data state separately from physics
 */
export function useFlightState() {
  const [flightData, setFlightData] = useState({
    altitude: 0,
    airspeed: 0,
    trueAirspeed: 0,
    indicatedAirspeed: 0,
    verticalSpeed: 0,
    pitch: 0,
    roll: 0,
    heading: 0,
    throttle: 0,
    flapsValue: 0,
    gearValue: true,
    systems: {},
    activeWarnings: [],
    alertState: null,
    crashWarning: null,
    position: { latitude: 0, longitude: 0, x: 0, y: 0, z: 0 },
    derived: { altitude_ft: 0, airspeed: 0, groundSpeed: 0, heading: 0 }
  });

  const updateFromPhysics = useCallback((physicsState, physicsService) => {
    if (!physicsState || !physicsService) return;

    const airspeeds = physicsService.calculateAirspeeds();
    const engineThrottles = Array.isArray(physicsState.engineThrottles)
      ? physicsState.engineThrottles
      : (Array.isArray(physicsState.controls?.throttles)
        ? physicsState.controls.throttles
        : [physicsState.controls?.throttle ?? 0, physicsState.controls?.throttle ?? 0]);

    setFlightData(prev => {
      const fallbackPosition = physicsService.getOutputState?.()?.position ?? {};
      const resolvedPosition = {
        x: Number.isFinite(physicsState.position?.x) ? physicsState.position.x : (Number.isFinite(prev.position?.x) ? prev.position.x : (fallbackPosition.x ?? 0)),
        y: Number.isFinite(physicsState.position?.y) ? physicsState.position.y : (Number.isFinite(prev.position?.y) ? prev.position.y : (fallbackPosition.y ?? 0)),
        z: Number.isFinite(physicsState.position?.z) ? physicsState.position.z : (Number.isFinite(prev.position?.z) ? prev.position.z : (fallbackPosition.z ?? 0)),
        latitude: Number.isFinite(physicsState.position?.latitude)
          ? physicsState.position.latitude
          : (Number.isFinite(prev.position?.latitude) ? prev.position.latitude : (fallbackPosition.latitude ?? 0)),
        longitude: Number.isFinite(physicsState.position?.longitude)
          ? physicsState.position.longitude
          : (Number.isFinite(prev.position?.longitude) ? prev.position.longitude : (fallbackPosition.longitude ?? 0))
      };
      const resolvedVelocity = {
        u: Number.isFinite(physicsState.velocity?.u) ? physicsState.velocity.u : (Number.isFinite(prev.velocity?.u) ? prev.velocity.u : 0),
        v: Number.isFinite(physicsState.velocity?.v) ? physicsState.velocity.v : (Number.isFinite(prev.velocity?.v) ? prev.velocity.v : 0),
        w: Number.isFinite(physicsState.velocity?.w) ? physicsState.velocity.w : (Number.isFinite(prev.velocity?.w) ? prev.velocity.w : 0)
      };
      const resolvedAngularRates = {
        p: Number.isFinite(physicsState.angularRates?.p) ? physicsState.angularRates.p : (Number.isFinite(prev.angularRates?.p) ? prev.angularRates.p : 0),
        q: Number.isFinite(physicsState.angularRates?.q) ? physicsState.angularRates.q : (Number.isFinite(prev.angularRates?.q) ? prev.angularRates.q : 0),
        r: Number.isFinite(physicsState.angularRates?.r) ? physicsState.angularRates.r : (Number.isFinite(prev.angularRates?.r) ? prev.angularRates.r : 0)
      };
      const resolvedDebugPhysics = mergeFiniteObject(physicsState.debugPhysics ?? {}, prev.debugPhysics ?? {});
      const resolvedGroundStatus = physicsState.groundStatus ?? prev.groundStatus ?? null;
      const resolvedRunwayBraking = physicsState.runwayBraking ?? prev.runwayBraking ?? null;
      const resolvedDerived = buildFallbackDerived({
        ...physicsState,
        position: resolvedPosition,
        derived: physicsState.derived
      }, physicsService, prev.derived ?? {});
      const rawOrientation = physicsState.orientation ?? {};
      const resolvedOrientation = {
        phi: Number.isFinite(rawOrientation.phi) ? rawOrientation.phi : (Number.isFinite(prev.orientation?.phi) ? prev.orientation.phi : 0),
        theta: Number.isFinite(rawOrientation.theta) ? rawOrientation.theta : (Number.isFinite(prev.orientation?.theta) ? prev.orientation.theta : 0),
        psi: Number.isFinite(rawOrientation.psi) ? rawOrientation.psi : (Number.isFinite(prev.orientation?.psi) ? prev.orientation.psi : 0)
      };
      const altitude = Number.isFinite(resolvedDerived.altitude_ft)
        ? resolvedDerived.altitude_ft
        : (Number.isFinite(prev.altitude) ? prev.altitude : Math.max(0, -resolvedPosition.z) * 3.28084);
      const trueAirspeed = Number.isFinite(airspeeds?.trueAirspeed)
        ? airspeeds.trueAirspeed
        : (Number.isFinite(prev.airspeed) ? prev.airspeed : (resolvedDerived.airspeed ?? 0));
      const indicatedAirspeed = Number.isFinite(airspeeds?.indicatedAirspeed)
        ? airspeeds.indicatedAirspeed
        : (Number.isFinite(prev.indicatedAirspeed) ? prev.indicatedAirspeed : 0);
      const groundSpeed = Number.isFinite(airspeeds?.groundSpeed)
        ? airspeeds.groundSpeed
        : (Number.isFinite(prev.groundSpeed) ? prev.groundSpeed : (resolvedDerived.groundSpeed ?? 0));
      const resolvedHeading = Number.isFinite(resolvedDerived.heading)
        ? resolvedDerived.heading
        : (Number.isFinite(prev.heading) ? prev.heading : (((resolvedOrientation.psi ?? 0) * 180 / Math.PI + 360) % 360));

      return {
        altitude,
        airspeed: trueAirspeed,
        trueAirspeed,
        indicatedAirspeed,
        groundSpeed,
        verticalSpeed: Number.isFinite(physicsState.verticalSpeed) ? physicsState.verticalSpeed : (prev.verticalSpeed ?? 0),
        pitch: Number.isFinite(resolvedOrientation.theta) ? resolvedOrientation.theta * 180 / Math.PI : (prev.pitch ?? 0),
        roll: Number.isFinite(resolvedOrientation.phi) ? resolvedOrientation.phi * 180 / Math.PI : (prev.roll ?? 0),
        heading: resolvedHeading,
        throttle: (physicsState.controls?.throttle ?? 0) * 100,
        controls: physicsState.controls ?? prev.controls ?? {},
        controlFeedback: physicsState.controlFeedback ?? prev.controlFeedback,
        orientation: resolvedOrientation,
        engineThrottles,
        throttleCommand: physicsState.throttleCommand,
        engineThrottleCommands: physicsState.engineThrottleCommands,
        engineN1: Array.isArray(physicsState.engineParams?.n1) ? physicsState.engineParams.n1 : [],
        engineN2: Array.isArray(physicsState.engineParams?.n2) ? physicsState.engineParams.n2 : [],
        engineEGT: Array.isArray(physicsState.engineParams?.egt) ? physicsState.engineParams.egt : [],
        engineFuelFlow: Array.isArray(physicsState.engineParams?.fuelFlow) ? physicsState.engineParams.fuelFlow : [],
        fadecMode: physicsState.engineParams?.fadecMode ?? null,
        maxN1: physicsState.engineParams?.maxN1 ?? 102,
        egtYellow: physicsState.engineParams?.egtYellow ?? 750,
        egtRed: physicsState.engineParams?.egtRed ?? 850,
        engineEPR: Array.isArray(physicsState.engineParams?.epr) ? physicsState.engineParams.epr : [],
        startValveOpen: physicsState.engineParams?.startValveOpen ?? [],
        oilFilterBypass: physicsState.engineParams?.oilFilterBypass ?? [],
        lowOilPressure: physicsState.engineParams?.lowOilPressure ?? [],
        autopilotEngaged: physicsState.autopilot?.engaged === true,
        autopilot: physicsState.autopilot,
        autopilotMode: physicsState.autopilot?.mode ?? null,
        autopilotTargets: physicsState.autopilotTargets ?? physicsState.autopilot?.targets ?? null,
        autopilotDebug: physicsState.autopilotDebug ?? {},
        approachTelemetry: physicsState.approachTelemetry ?? null,
        flapsValue: physicsState.flaps ?? 0,
        gearValue: physicsState.gear ?? false,
        airBrakesValue: Number.isFinite(physicsState.airBrakes) ? physicsState.airBrakes : (prev.airBrakesValue ?? 0),
        wheelBrakesValue: Number.isFinite(physicsState.wheelBrakes) ? physicsState.wheelBrakes : (prev.wheelBrakesValue ?? 0),
        trimValue: Number.isFinite(physicsState.controls?.trim) ? physicsState.controls.trim : (prev.trimValue ?? 0),
        thrust: Number.isFinite(physicsState.thrust) ? physicsState.thrust : (Number.isFinite(prev.thrust) ? prev.thrust : 0),
        drag: Number.isFinite(physicsState.drag) ? physicsState.drag : (Number.isFinite(prev.drag) ? prev.drag : 0),
        fuel: physicsState.fuel ?? 0,
        hasCrashed: physicsState.hasCrashed,
        activeWarnings: physicsState.activeWarnings ?? [],
        alertState: physicsState.alertState ?? null,
        crashWarning: physicsState.crashWarning ?? null,
        systems: physicsState.systems ?? {},
        position: resolvedPosition,
        velocity: resolvedVelocity,
        angularRates: resolvedAngularRates,
        debugPhysics: resolvedDebugPhysics,
        groundStatus: resolvedGroundStatus,
        runwayBraking: resolvedRunwayBraking,
        derived: resolvedDerived,
        currentWaypointIndex: physicsState.currentWaypointIndex ?? 0
      };
    });
  }, []);

  return { flightData, updateFromPhysics };
}
