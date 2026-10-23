export function terrainSceneReference(position, groundElevationFt = 0) {
  if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return null;
  return {
    terrainOnly: true,
    heading: 0,
    length: 0,
    width: 0,
    airportLat: position.latitude,
    airportLon: position.longitude,
    thresholdStart: {
      latitude: position.latitude, longitude: position.longitude,
      elevation: Number.isFinite(groundElevationFt) ? groundElevationFt : 0
    }
  };
}
