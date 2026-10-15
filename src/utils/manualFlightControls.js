// Pilot input is positive when pulling aft. The aerodynamic model uses positive
// elevator trailing-edge-down deflection, which produces a nose-down moment.
export function manualPitchToElevator(value) {
  const normalized = Math.abs(value) <= 1 ? value : value / 100;
  return -normalized * 25 * Math.PI / 180;
}
