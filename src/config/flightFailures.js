export const FAILURE_BANKS = ['engine', 'systems', 'controls', 'environment', 'sensors'];

export function normalizeFailureSelection(selection = {}) {
  const count = Number(selection.count ?? 2);
  return {
    mode: selection.mode === 'custom' ? 'custom' : 'normal',
    count: Number.isFinite(count) ? Math.max(1, Math.min(10, Math.round(count))) : 2,
    banks: Array.isArray(selection.banks)
      ? FAILURE_BANKS.filter(bank => selection.banks.includes(bank))
      : [...FAILURE_BANKS]
  };
}

export function estimateFailureFlightSeconds(departure, arrival) {
  if (![departure?.latitude, departure?.longitude, arrival?.latitude, arrival?.longitude].every(Number.isFinite)) return 3600;
  const radians = value => value * Math.PI / 180;
  const a = Math.sin(radians(arrival.latitude - departure.latitude) / 2) ** 2 +
    Math.cos(radians(departure.latitude)) * Math.cos(radians(arrival.latitude)) *
    Math.sin(radians(arrival.longitude - departure.longitude) / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  return Math.max(600, distanceKm / 750 * 3600 + 900);
}
