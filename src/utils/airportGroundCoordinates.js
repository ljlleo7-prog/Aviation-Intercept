const DEG = Math.PI / 180;
export const canonicalAirportCode = (code) => ({ LAX: 'KLAX', HKG: 'VHHH' }[code] || String(code || '').toUpperCase());
export const projectGroundPoint = (latitude, longitude, origin) => [
  (longitude - origin.longitude) * 111320 * Math.cos(origin.latitude * DEG),
  -(latitude - origin.latitude) * 111320
];
export const unprojectGroundPoint = ([x, z], origin) => ({
  latitude: origin.latitude - z / 111320,
  longitude: origin.longitude + x / (111320 * Math.cos(origin.latitude * DEG))
});
