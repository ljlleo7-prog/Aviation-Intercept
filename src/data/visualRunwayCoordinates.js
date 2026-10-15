// Threshold coordinates copied from the repository's local AIP runway export.
// This is a visual subset for prototype airports; the full AIP import remains
// the source of truth when its runway geometry becomes available at runtime.
const SURVEYED = {
  KLAX: [
    ['06L', '24R', 33.949119, -118.431187, 33.952112, -118.401954, 8926, 150, 112],
    ['06R', '24L', 33.946820, -118.434693, 33.950470, -118.399063, 10859, 150, 108],
    ['07L', '25R', 33.935556, -118.422089, 33.939881, -118.379794, 12894, 150, 119],
    ['07R', '25L', 33.933659, -118.419074, 33.937371, -118.382700, 11095, 200, 118]
  ],
  VHHH: [
    ['07L', '25R', 22.321074, 113.880692, 22.332306, 113.915558, 12467, 197, 23],
    ['07C', '25C', 22.310400, 113.896004, 22.321600, 113.931000, 12467, 197, 22],
    ['07R', '25L', 22.296200, 113.898003, 22.307431, 113.932819, 12467, 197, 28]
  ]
};

export function getVisualRunwayGeometry(airportCode, runwayEnd, fallback) {
  const code = airportCode === 'LAX' ? 'KLAX' : airportCode === 'HKG' ? 'VHHH' : airportCode;
  const row = SURVEYED[code]?.find(([first, second]) => runwayEnd === first || runwayEnd === second);
  if (!row) return fallback;
  const [, second, firstLat, firstLon, secondLat, secondLon, lengthFt, widthFt, elevationFt] = row;
  const reciprocal = runwayEnd === second;
  const northM = (secondLat - firstLat) * 111320;
  const eastM = (secondLon - firstLon) * 111320 * Math.cos((firstLat + secondLat) / 2 * Math.PI / 180);
  const trueHeading = (Math.atan2(eastM, northM) * 180 / Math.PI + 360) % 360;
  return {
    ...fallback,
    airportCode: code,
    runwayName: runwayEnd,
    heading: (trueHeading + (reciprocal ? 180 : 0)) % 360,
    length: lengthFt * .3048,
    width: widthFt * .3048,
    thresholdStart: { latitude: reciprocal ? secondLat : firstLat, longitude: reciprocal ? secondLon : firstLon, elevation: elevationFt },
    thresholdEnd: { latitude: reciprocal ? firstLat : secondLat, longitude: reciprocal ? firstLon : secondLon, elevation: elevationFt },
    geometrySource: 'local-aip'
  };
}
