import { useEffect, useRef, useState } from 'react';
import aircraftService from '../services/aircraftService';
import { publishKeyboardControl } from '../utils/flightKeyboardVisuals.js';
import { attachFlightKeyboard } from '../utils/flightKeyboard.js';

export default function useFlightKeyboard({ aircraftModel, physicsService, enabled, controls }) {
  const [maxFlaps, setMaxFlaps] = useState(0);
  const latest = useRef(null);
  latest.current = { physicsService, enabled, controls, maxFlaps };
  useEffect(() => {
    let active = true;
    setMaxFlaps(0);
    aircraftService.getControlSurfaceProfiles(aircraftModel).then(profile => {
      if (active) setMaxFlaps(Math.max(0, (profile?.flaps?.positions?.length || 1) - 1));
    }).catch(() => {});
    return () => { active = false; };
  }, [aircraftModel]);
  const crashed = physicsService?.crashed;
  const autopilot = physicsService?.getAutopilotStatus?.()?.engaged;
  useEffect(() => attachFlightKeyboard({
    target: window,
    getState: () => {
      const { physicsService: service, enabled: ready, maxFlaps: max } = latest.current;
      return {
        enabled: ready, hasCrashed: service?.crashed,
        autopilot: service?.getAutopilotStatus?.()?.engaged, onGround: service?.onGround,
        gear: service?.controls?.gear > 0.5, flaps: service?.controls?.flaps ?? 0,
        maxFlaps: max, throttle: service?.controls?.throttle ?? 0,
        parkingBrake: service?.systems?.brakes?.parkingBrake === true
      };
    },
    onAction: (action, value) => {
      latest.current.controls[action]?.(value);
      publishKeyboardControl(action, value);
    }
  }), [enabled, crashed, autopilot]);
}
