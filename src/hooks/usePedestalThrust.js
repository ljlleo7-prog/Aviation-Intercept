import { useEffect, useRef, useState } from 'react';
import { clampThrust, commandedEngines, isReverseThrustCommand, thrustLeverCommand } from '../utils/pedestalControls.js';

export default function usePedestalThrust({ flightState, engineCount, reverseCapable, onAction }) {
  const [sync, setSync] = useState(true);
  const [commands, setCommands] = useState(() => Array.from({ length: engineCount }, (_, index) => clampThrust(flightState.engineThrottleCommands?.[index] ?? flightState.throttleCommand ?? flightState.engineThrottles?.[index] ?? flightState.controls?.throttle ?? 0)));
  const [reverse, setReverse] = useState(() => commands.map(isReverseThrustCommand));
  const commandsRef = useRef(commands);
  const reverseRef = useRef(reverse);
  const lastManual = useRef(0);
  const countRef = useRef(engineCount);
  useEffect(() => {
    const countChanged = countRef.current !== engineCount;
    countRef.current = engineCount;
    if (!countChanged && Date.now() - lastManual.current < 1200) return;
    const next = Array.from({ length: engineCount }, (_, index) => clampThrust(flightState.engineThrottleCommands?.[index] ?? flightState.throttleCommand ?? flightState.engineThrottles?.[index] ?? flightState.controls?.throttle ?? 0));
    const modes = next.map(isReverseThrustCommand);
    commandsRef.current = next;
    reverseRef.current = modes;
    setCommands(previous => previous.length === next.length && previous.every((value, index) => value === next[index]) ? previous : next);
    setReverse(previous => previous.length === modes.length && previous.every((value, index) => value === modes[index]) ? previous : modes);
  }, [engineCount, flightState.engineThrottleCommands, flightState.throttleCommand, flightState.engineThrottles, flightState.controls?.throttle]);

  const commandEngines = (index, command, mode, linked = sync) => {
    lastManual.current = Date.now();
    const next = [...commandsRef.current];
    const modes = [...reverseRef.current];
    for (const target of commandedEngines(index, command, engineCount, linked, reverseCapable)) {
      next[target.index] = target.command;
      modes[target.index] = mode && reverseCapable[target.index] !== false;
      onAction?.('throttle', target.command, target.index);
    }
    commandsRef.current = next;
    reverseRef.current = modes;
    setCommands(next);
    setReverse(modes);
  };
  const moveLever = (index, position) => {
    const mode = reverseRef.current[index] ?? false;
    commandEngines(index, thrustLeverCommand(position, mode), mode);
  };
  const toggleReverse = index => {
    if (reverseCapable[index] === false) return;
    const mode = !reverseRef.current[index];
    commandEngines(index, mode ? -0.035 : 0, mode);
  };
  const toggleSync = () => {
    if (!sync) commandEngines(0, commandsRef.current[0] ?? 0, reverseRef.current[0] ?? false, true);
    setSync(!sync);
  };
  return { commands, reverse, sync, moveLever, toggleReverse, toggleSync };
}
