import { useState, useCallback, useEffect, useRef } from 'react';
import RealisticFlightPhysicsService from '../services/RealisticFlightPhysicsService.js';
import { loadAircraftData } from '../services/aircraftService.js';
import { airportService } from '../services/airportService.js';
import { usePhysicsLoop } from './usePhysicsLoop.js';
import { useFlightControls } from './useFlightControls.js';
import { useFlightState } from './useFlightState.js';
import { PhysicsCoordinator } from '../services/PhysicsCoordinator.js';

export function useAircraftPhysics(launchConfig = {}, autoStart = true) {
  // A mounted flight owns one spawn. Route/weather/scenario updates must use the
  // live service methods, never reconstruct the aircraft from launch conditions.
  // Starting another flight unmounts this hook in App.
  const [config] = useState(() => ({ ...launchConfig }));
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [physicsState, setPhysicsState] = useState(null);
  const physicsServiceRef = useRef(null);
  const coordinatorRef = useRef(null);

  const { flightData, updateFromPhysics } = useFlightState();

  const handlePhysicsUpdate = useCallback((newState) => {
    if (!physicsServiceRef.current) return;

    const resolvedState = physicsServiceRef.current.getOutputState?.() ?? newState;
    if (!resolvedState) return;

    setPhysicsState(resolvedState);
    updateFromPhysics(resolvedState, physicsServiceRef.current);
  }, [updateFromPhysics]);

  const controls = useFlightControls(physicsServiceRef);

  const { startLoop, stopLoop, updatePhysics: loopUpdatePhysics, setTimeScale, timeScale } = usePhysicsLoop(
    physicsServiceRef,
    handlePhysicsUpdate
  );

  const updatePhysics = useCallback((dt = 1 / 60) => {
    if (!physicsServiceRef.current) return null;
    return loopUpdatePhysics(dt, controls.getControls ? controls.getControls() : {});
  }, [loopUpdatePhysics, controls]);

  useEffect(() => {
    if (physicsServiceRef.current) return;

    let cancelled = false;
    const previousService = physicsServiceRef.current;
    const previousCoordinator = coordinatorRef.current;
    physicsServiceRef.current = null;
    coordinatorRef.current = null;
    setIsInitialized(false);
    setPhysicsState(null);
    setError(null);

    async function init() {
      try {
        const db = await loadAircraftData().catch(() => null);
        if (cancelled) return;


        const aircraft = db?.find(a => a.model === config.aircraftModel) || db?.[0] || {
          name: 'Boeing 737-800',
          mass: 41410,
          maxThrustPerEngine: 120000,
          engineCount: 2
        };

        const service = new RealisticFlightPhysicsService(
          { ...aircraft, ...config },
          config.initialLatitude,
          config.initialLongitude,
          config.difficulty
        );

        let initialHeading = Number.isFinite(config.initialHeading) ? config.initialHeading : 0;
        const departureAirport = config.departure?.iata || config.departure?.icao;
        const arrivalAirport = config.arrival?.iata || config.arrival?.icao;
        const departureRunway = config.departureRunway || config.departure?.runways?.[0]?.name;
        const arrivalRunway = config.arrivalRunway || config.arrival?.runways?.[0]?.name;
        const departureGeometry = departureAirport && departureRunway
          ? airportService.getRunwayGeometry(departureAirport, departureRunway)
          : null;
        const arrivalGeometry = arrivalAirport && arrivalRunway
          ? airportService.getRunwayGeometry(arrivalAirport, arrivalRunway)
          : null;

        // The initial coordinates identify which end of the route we are spawning at.
        // Do not select the arrival runway merely because an arrival runway is present:
        // normal takeoff spawns have both runway values, but their position is at
        // departure. Selecting arrival geometry here mixes the reference threshold,
        // heading, and ground-status calculations and can put the aircraft at the
        // apparent far end of the rendered runway.
        const distanceSq = (airport) => {
          if (!airport || !Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude) ||
              !Number.isFinite(config.initialLatitude) || !Number.isFinite(config.initialLongitude)) {
            return Infinity;
          }
          const latitudeScale = Math.cos(config.initialLatitude * Math.PI / 180);
          return (config.initialLatitude - airport.latitude) ** 2 +
            ((config.initialLongitude - airport.longitude) * latitudeScale) ** 2;
        };
        const departureDistance = distanceSq(config.departure);
        const arrivalDistance = distanceSq(config.arrival);
        const geometry = departureGeometry && departureDistance <= arrivalDistance
          ? departureGeometry
          : arrivalGeometry || departureGeometry;
        if (geometry && Number.isFinite(geometry.heading) && (!Number.isFinite(config.initialHeading) || config.initialHeading === 0)) {
          initialHeading = geometry.heading;
        }

        if (service.setInitialConditions) {
          service.setInitialConditions({
            latitude: config.initialLatitude,
            longitude: config.initialLongitude,
            altitude: config.initialAltitude,
            speed: config.initialSpeed,
            orientation: { psi: initialHeading * Math.PI / 180, theta: 0, phi: 0 },
            flightPlan: config.flightPlan,
            difficulty: config.difficulty,
            failureType: config.failureType
          });

          if (geometry) service.setRunwayGeometry(geometry);
        }

        if (config.scenarioRestrictions?.autopilotForbidden && typeof service.setAutopilot === 'function') {
          service.setAutopilot(false);
        }

        if (cancelled) return;

        // Apply initial wind so TAS ≠ GS from frame 0
        if (config.windSpeedKts != null || config.windDirection != null) {
          service.setEnvironment({
            windSpeed: config.windSpeedKts ?? 0,
            windDirection: config.windDirection ?? 0,
          });
        }

        // Publish a runnable service atomically. A frame between publication and
        // React's motion-control effect would otherwise zero an airborne spawn's
        // velocity because new physics services start with motion disabled.
        service.setMotionEnabled(true);
        physicsServiceRef.current = service;
        coordinatorRef.current = new PhysicsCoordinator(service);
        if (previousService && previousService !== service && typeof previousService.stop === 'function') {
          previousService.stop();
        }
        if (previousCoordinator && previousCoordinator !== coordinatorRef.current && typeof previousCoordinator.dispose === 'function') {
          previousCoordinator.dispose();
        }
        handlePhysicsUpdate(service.getOutputState ? service.getOutputState() : null);
        setIsInitialized(true);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    }
    init();

    return () => {
      cancelled = true;
    };
  }, [config, handlePhysicsUpdate]);

  useEffect(() => {
    if (autoStart && isInitialized) startLoop();
    return () => stopLoop();
  }, [autoStart, isInitialized, startLoop, stopLoop]);

  return {
    flightData,
    physicsState,
    isInitialized,
    error,
    getCurrentOutputState: useCallback(() => {
      return physicsServiceRef.current?.getOutputState?.() ?? null;
    }, []),
    isCrashed: physicsState?.hasCrashed || physicsServiceRef.current?.crashed || false,
    physicsService: physicsServiceRef.current,
    resetAircraft: useCallback(() => {
      physicsServiceRef.current?.reset?.();
      const state = physicsServiceRef.current?.getOutputState?.();
      handlePhysicsUpdate(state);
    }, [handlePhysicsUpdate]),
    updatePhysics,
    ...controls,
    setMotionEnabled: useCallback((enabled) => {
      coordinatorRef.current?.setMotionEnabled(enabled);
    }, []),
    setEnvironment: useCallback((env) => {
      coordinatorRef.current?.updateEnvironment(env);
      const state = physicsServiceRef.current?.getOutputState?.();
      handlePhysicsUpdate(state);
    }, [handlePhysicsUpdate]),
    updateFlightPlan: useCallback((plan) => {
      physicsServiceRef.current?.updateFlightPlan(plan);
      const state = physicsServiceRef.current?.getOutputState?.();
      handlePhysicsUpdate(state);
    }, [handlePhysicsUpdate]),
    performSystemAction: useCallback((system, action, value) => {
      physicsServiceRef.current?.performSystemAction(system, action, value);
      const state = physicsServiceRef.current?.getOutputState?.();
      handlePhysicsUpdate(state);
    }, [handlePhysicsUpdate]),
    setTimeScale,
    timeScale
  };
}
