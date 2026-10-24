import { useRef, useCallback, useState } from 'react';

/**
 * usePhysicsLoop - Manages the physics update loop independently
 */
export function usePhysicsLoop(physicsService, onUpdate) {
  const animationFrameRef = useRef(null);
  const lastUpdateTimeRef = useRef(Date.now());
  const [timeScale, setTimeScaleState] = useState(1);
  const timeScaleRef = useRef(1);

  const resolvePhysicsService = useCallback(() => (
    physicsService && typeof physicsService === 'object' && 'current' in physicsService
      ? physicsService.current
      : physicsService
  ), [physicsService]);

  const updatePhysics = useCallback((fixedDt = 1 / 60, controls = {}) => {
    const service = resolvePhysicsService();
    if (!service) return null;

    const iterations = timeScaleRef.current;
    let newState;

    for (let i = 0; i < iterations; i++) {
      newState = service.update(controls, fixedDt);
      if (newState.autopilotDebug?.altitudeRecoveryActive && timeScaleRef.current > 1) {
        timeScaleRef.current = 1;
        setTimeScaleState(1);
        break;
      }
      if (newState.hasCrashed) break;
    }

    if (onUpdate) onUpdate(newState);
    return newState;
  }, [resolvePhysicsService, onUpdate]);

  const startLoop = useCallback(() => {
    const targetStep = 1 / 60;

    const animate = () => {
      const currentTime = Date.now();
      const elapsed = (currentTime - lastUpdateTimeRef.current) / 1000;

      if (elapsed >= targetStep) {
        updatePhysics(targetStep);
        lastUpdateTimeRef.current = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [updatePhysics]);

  const stopLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const setTimeScale = useCallback((scale) => {
    const nextScale = Math.max(1, Math.floor(scale));
    timeScaleRef.current = nextScale;
    setTimeScaleState(nextScale);
  }, []);

  return { startLoop, stopLoop, updatePhysics, setTimeScale, timeScale };
}
