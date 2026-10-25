import { formatDuration } from './UnitConversion.js';

export const getFuelFlowKgPerHour = (flightState) => {
  const flows = Array.isArray(flightState?.engineFuelFlow) ? flightState.engineFuelFlow : [];
  const totalKgPerSecond = flows.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return totalKgPerSecond * 3600;
};

export const calculateFuelPlan = ({ flightState, routeProgress, preflightConfig, aircraftData }) => {
  const fuelRemaining = Number(flightState?.fuel) || 0;
  const fuelFlowKgH = getFuelFlowKgPerHour(flightState);
  const enduranceHours = fuelFlowKgH > 0 ? fuelRemaining / fuelFlowKgH : null;
  const destinationFuel = enduranceHours !== null && routeProgress?.eteDestinationHours !== null
    ? fuelRemaining - (fuelFlowKgH * routeProgress.eteDestinationHours)
    : null;
  const reserveFuel = Number(preflightConfig?.flightPlan?.fuel?.reserveFuel) || Number(preflightConfig?.fuelReserve) || 0;
  const tripFuel = Number(preflightConfig?.flightPlan?.fuel?.tripFuel) || null;
  const dryOperatingMass = Number(aircraftData?.emptyWeight || aircraftData?.mass) || 0;
  const airborneWeight = Number(flightState?.mass) || dryOperatingMass + Math.max(0, Number(preflightConfig?.payload) || 0) + fuelRemaining;

  return {
    fuelRemaining,
    fuelFlowKgH,
    enduranceHours,
    enduranceText: enduranceHours !== null ? formatDuration(enduranceHours) : '—',
    destinationFuel,
    reserveFuel,
    tripFuel,
    reserveMargin: destinationFuel !== null ? destinationFuel - reserveFuel : null,
    airborneWeight,
    dataQuality: {
      hasFuel: fuelRemaining > 0,
      hasFuelFlow: fuelFlowKgH > 1,
      hasDestinationEstimate: destinationFuel !== null
    }
  };
};

export const calculateAltitudeAdvisory = ({ flightState, targetAltitude }) => {
  const altitude = Number(flightState?.altitude) || 0;
  const verticalSpeed = Number(flightState?.verticalSpeed) || 0;
  const target = Number(targetAltitude);
  if (!Number.isFinite(target) || Math.abs(verticalSpeed) < 50) {
    return { timeMinutes: null, text: Math.abs(verticalSpeed) < 50 ? 'Level' : '—', direction: 'level' };
  }

  const diff = target - altitude;
  const movingToward = (diff > 0 && verticalSpeed > 0) || (diff < 0 && verticalSpeed < 0);
  if (!movingToward) return { timeMinutes: null, text: 'Wrong VS direction', direction: diff > 0 ? 'climb' : 'descent' };

  const timeMinutes = Math.abs(diff / verticalSpeed);
  return {
    timeMinutes,
    text: `${Math.floor(timeMinutes)}m ${Math.floor((timeMinutes % 1) * 60)}s`,
    direction: diff > 0 ? 'climb' : 'descent'
  };
};
