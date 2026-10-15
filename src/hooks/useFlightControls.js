import { useRef, useCallback } from 'react';
import { manualPitchToElevator } from '../utils/manualFlightControls.js';

/**
 * useFlightControls - Manages control inputs separately
 */
export function useFlightControls(physicsService) {
  const controlsRef = useRef({
    throttle: 0,
    engineThrottles: null,
    pitch: 0,
    roll: 0,
    yaw: 0,
    trim: 0
  });

  const resolvePhysicsService = useCallback(() => (
    physicsService && typeof physicsService === 'object' && 'current' in physicsService
      ? physicsService.current
      : physicsService
  ), [physicsService]);

  const setThrottle = useCallback((value) => {
    const normalized = Math.max(-0.7, Math.min(1, value));
    controlsRef.current.throttle = normalized;
    controlsRef.current.engineThrottles = null;
  }, []);

  const setEngineThrottle = useCallback((engineIndex, value) => {
    const service = resolvePhysicsService();
    const normalized = Math.max(-0.7, Math.min(1, value));
    if (service?.setEngineThrottle) {
      service.setEngineThrottle(engineIndex, normalized);
    }

    const engineCount = service?.engines?.length || 2;
    const throttles = Array.isArray(controlsRef.current.engineThrottles)
      ? [...controlsRef.current.engineThrottles]
      : Array(engineCount).fill(controlsRef.current.throttle);

    throttles[engineIndex] = normalized;
    controlsRef.current.engineThrottles = throttles;
    controlsRef.current.throttle = normalized;
  }, [resolvePhysicsService]);

  const setPitch = useCallback((value) => {
    controlsRef.current.pitch = manualPitchToElevator(value);
  }, []);

  const setRoll = useCallback((value) => {
    const normalized = Math.abs(value) <= 1 ? value : value / 100;
    controlsRef.current.roll = normalized * 30 * Math.PI / 180;
  }, []);

  const setYaw = useCallback((value) => {
    controlsRef.current.yaw = value * 30 * Math.PI / 180;
  }, []);

  const setTrim = useCallback((value) => {
    const service = resolvePhysicsService();
    const normalized = Math.max(-1, Math.min(1, Math.abs(value) <= 1 ? value : value / 100));
    const trimValue = normalized * 0.2;
    controlsRef.current.trim = trimValue;
    if (service?.setTrim) {
      service.setTrim(trimValue);
    }
  }, [resolvePhysicsService]);

  const setFlaps = useCallback((value) => {
    resolvePhysicsService()?.setFlaps?.(value);
  }, [resolvePhysicsService]);

  const setAirBrakes = useCallback((value) => {
    resolvePhysicsService()?.setAirBrakes?.(value);
  }, [resolvePhysicsService]);

  const setWheelBrakes = useCallback((value) => {
    resolvePhysicsService()?.setWheelBrakes?.(value);
  }, [resolvePhysicsService]);

  const setToeBrakes = useCallback((value) => {
    resolvePhysicsService()?.setToeBrakes?.(value);
  }, [resolvePhysicsService]);

  const setGear = useCallback((value) => {
    resolvePhysicsService()?.setGear?.(value);
  }, [resolvePhysicsService]);

  const inputServiceRef = useRef(null);
  const getControls = useCallback(() => {
    const service = resolvePhysicsService();
    if (service && inputServiceRef.current !== service) {
      // Airborne challenges spawn with thrust. Preserve it on the first physics
      // tick instead of replacing it with the input buffer's idle defaults.
      controlsRef.current.throttle = service.controls?.throttle ?? 0;
      controlsRef.current.engineThrottles = Array.isArray(service.controls?.engineThrottles)
        ? [...service.controls.engineThrottles]
        : null;
      controlsRef.current.trim = service.controls?.trim ?? 0;
      inputServiceRef.current = service;
    }
    return {
      ...controlsRef.current,
      throttles: Array.isArray(controlsRef.current.engineThrottles)
        ? controlsRef.current.engineThrottles
        : undefined
    };
  }, [resolvePhysicsService]);

  return {
    setThrottle,
    setEngineThrottle,
    setPitch,
    setRoll,
    setYaw,
    setTrim,
    setFlaps,
    setAirBrakes,
    setWheelBrakes,
    setToeBrakes,
    setGear,
    getControls
  };
}
