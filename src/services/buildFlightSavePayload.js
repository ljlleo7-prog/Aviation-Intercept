export function buildFlightSavePayload({
  flightData,
  physicsState,
  physicsService,
  flightPlan,
  weatherData,
  aircraftModel
}) {
  const serializablePhysicsState = typeof physicsService?.getSerializableState === 'function'
    ? physicsService.getSerializableState()
    : physicsState;

  return JSON.parse(JSON.stringify({
    version: '1.1',
    timestamp: Date.now(),
    session: physicsService?.sessionContext || null,
    flightData,
    physicsState: serializablePhysicsState,
    runwayGeometry: flightData?.runwayGeometry || physicsService?.runwayGeometry || null,
    flightPlan,
    weatherData,
    aircraftModel
  }));
}

export default buildFlightSavePayload;
