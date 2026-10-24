import { normalizeRouteDetails } from './routeDetails.js';

// Confirmation commits the reviewed configuration; it must not regenerate a route.
export function confirmRouteSelection(previous, selection) {
  const selectedDeparture = selection.departure || previous.selectedDeparture;
  const selectedArrival = selection.arrival || previous.selectedArrival;
  return { ...previous, selectedDeparture, selectedArrival,
    routeDetails: normalizeRouteDetails(selection, selectedDeparture, selectedArrival) };
}
