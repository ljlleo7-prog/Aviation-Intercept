// Engineering estimates for the simulator, not certified dispatch/performance tables.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

export function recommendCruiseAltitude(distanceNm, aircraft = {}, payload = 0, fieldElevation = 0) {
  const distance = Math.max(0, Number(distanceNm) || 0);
  const ceiling = Math.min(41000, positive(aircraft.serviceCeiling, 41000));
  const weightRatio = (positive(aircraft.emptyWeight, 41400) + Math.max(0, Number(payload) || 0)) /
    positive(aircraft.maxTakeoffWeight, 79000);
  // Local circuits and transfers need a useful level segment, not a jet cruise level.
  let target = distance < 5 ? fieldElevation + 2500
    : distance < 50 ? fieldElevation + 5000
      : distance < 350 ? 12000 + (distance - 50) * 50
        : distance < 900 ? 27000 + (distance - 350) * 16
          : 37000 + Math.min(4000, (distance - 900) * 2);
  if (distance >= 350) target -= Math.max(0, weightRatio - 0.75) * 16000;
  const recommended = clamp(Math.round(target / 1000) * 1000, Math.min(ceiling, fieldElevation + 2000), ceiling);
  return { recommended, min: Math.max(fieldElevation + 1000, recommended - 1000), max: Math.min(ceiling, recommended + 1000) };
}

export function planMissionFuel(aircraft, distanceNm, payload = 0, reserve = 0.05, options = {}) {
  const distance = Math.max(0, Number(distanceNm) || 0);
  const empty = positive(aircraft.emptyWeight, 41400);
  const load = Math.max(0, Number(payload) || 0);
  const mtow = positive(aircraft.maxTakeoffWeight, empty * 1.9);
  const elevation = Math.max(0, Number(options.fieldElevation) || 0);
  const altitudeRange = recommendCruiseAltitude(distance, aircraft, load, elevation);
  const cruiseAltitude = clamp(positive(options.cruiseAltitude, altitudeRange.recommended), elevation, Math.min(41000, positive(aircraft.serviceCeiling, 41000)));
  const speed = positive(aircraft.cruiseSpeed, 450);
  const baseFlow = positive(aircraft.typicalFuelBurn, 5.4) * speed;
  const referenceMass = empty + positive(aircraft.maxPayload, 18900) * 0.65 + positive(aircraft.maxFuelCapacity, 26020) * 0.2;
  const height = Math.max(0, cruiseAltitude - elevation);
  let blockFuel = baseFlow;
  let result;
  // Fuel carried increases climb energy and cruise drag; solve the dependency iteratively.
  for (let i = 0; i < 20; i++) {
    const takeoffMass = empty + load + blockFuel;
    const weightFactor = (takeoffMass - blockFuel * 0.35) / referenceMass;
    const climbRate = clamp(2200 * referenceMass / takeoffMass, 900, 3000);
    const climbHours = height / climbRate / 60;
    const descentHours = height / 1800 / 60;
    const phaseDistance = climbHours * 250 + descentHours * 280;
    const cruiseHours = Math.max(0, distance - phaseDistance) / Math.min(speed, cruiseAltitude < 10000 ? 230 : cruiseAltitude < 28000 ? 360 : speed);
    const taxiFuel = baseFlow * 0.12 * 0.25;
    const climbFuel = baseFlow * 1.55 * weightFactor * climbHours;
    const cruiseFuel = baseFlow * weightFactor * (1 + Math.max(0, 35000 - cruiseAltitude) / 100000) * cruiseHours;
    const descentFuel = baseFlow * 0.3 * descentHours;
    const approachFuel = baseFlow * 0.35 * 0.1;
    const tripFuel = climbFuel + cruiseFuel + descentFuel + approachFuel;
    // Legacy fractions are contingency factors; values >= 1 request reserve hours.
    const contingencyFuel = tripFuel * (reserve > 0 && reserve < 1 ? Math.max(0.05, reserve) : 0.05);
    const holdingFlow = baseFlow * 0.75 * weightFactor;
    const finalReserveFuel = holdingFlow * 0.5;
    const alternateFuel = baseFlow * weightFactor * 0.25; // 15-minute proxy until an alternate is selected.
    const extraFuel = reserve >= 1 ? Math.max(0, holdingFlow * reserve - finalReserveFuel - alternateFuel) : 0;
    const reserveFuel = contingencyFuel + finalReserveFuel + alternateFuel + extraFuel;
    const totalFuel = taxiFuel + tripFuel + reserveFuel;
    result = { taxiFuel, climbFuel, cruiseFuel, descentFuel, approachFuel, tripFuel, contingencyFuel, finalReserveFuel, alternateFuel, extraFuel, reserveFuel, totalFuel,
      cruiseAltitude, altitudeRange, takeoffWeight: empty + load + totalFuel - taxiFuel,
      flightMinutes: (climbHours + cruiseHours + descentHours + 0.1) * 60 };
    if (Math.abs(totalFuel - blockFuel) < 0.1) break;
    blockFuel = totalFuel;
  }
  const warnings = [];
  if (load > aircraft.maxPayload) warnings.push('Payload exceeds aircraft maximum payload');
  if (result.takeoffWeight > mtow) warnings.push('Takeoff weight exceeds MTOW');
  if (result.totalFuel > aircraft.maxFuelCapacity) warnings.push('Required fuel exceeds tank capacity');
  return { ...result, warnings, feasible: warnings.length === 0, maxCapacity: aircraft.maxFuelCapacity,
    fuelPercentage: Math.round(result.totalFuel / aircraft.maxFuelCapacity * 100) };
}

export function takeoffThrustFraction({ mass, maxTakeoffWeight, assumedTemperature, ambientTemperature = 15 }) {
  const ambient = ambientTemperature > 150 ? ambientTemperature - 273.15 : ambientTemperature;
  if (!Number.isFinite(assumedTemperature) || assumedTemperature <= ambient) return 1;
  // Conservative weight-based reduction budget; full rating is required near MTOW.
  const weightBudget = Number.isFinite(mass) && maxTakeoffWeight > 0
    ? clamp((0.95 - mass / maxTakeoffWeight) * 0.8, 0, 0.25) : 0;
  return 1 - Math.min(weightBudget, (assumedTemperature - ambient) * 0.005);
}
