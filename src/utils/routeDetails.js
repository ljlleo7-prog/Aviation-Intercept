import { generateGate, generateSID, generateSTAR, generateTaxiway, getLastProcedureWaypoint, getRunways, getRunwayHeading } from './routeGenerator.js';
import { applyProcedureEdits, validProcedureEdit, procedureEndpoint, interceptPoint } from './procedureEditor.js';
import { airportService } from '../services/airportService.js';
import { activateFlightRoute, getActiveWaypoints } from '../services/activeFlightPlan.js';

export const DEFAULT_ROUTE_DETAILS = {
  departureGate: '',
  departureTaxiway: '',
  departureRunway: '',
  sid: '',
  waypoints: [],
  star: '',
  landingRunway: '',
  landingTaxiway: '',
  arrivalGate: '',
  alternate: null
};

export const normalizeWaypoint = (waypoint, index = 0) => {
  if (!waypoint) return null;
  if (typeof waypoint === 'string') {
    return {
      name: waypoint,
      label: waypoint,
      latitude: 0,
      longitude: 0
    };
  }

  const name = waypoint.name || waypoint.label || waypoint.id || `WPT${index + 1}`;

  return {
    ...waypoint,
    name,
    label: waypoint.label || name,
    latitude: typeof waypoint.latitude === 'number' ? waypoint.latitude : Number(waypoint.latitude) || 0,
    longitude: typeof waypoint.longitude === 'number' ? waypoint.longitude : Number(waypoint.longitude) || 0
  };
};

export const buildApproachWaypoints = (arrivalAirport, departureAirport, landingRunway) => {
  if (!arrivalAirport || !departureAirport || !landingRunway) return [];

  const isEastward = arrivalAirport.longitude > departureAirport.longitude;
  const runwayHdg = getRunwayHeading(landingRunway, isEastward);
  const approachHdg = (runwayHdg + 180) % 360;
  const distance = 10;
  const lat1 = arrivalAirport.latitude * Math.PI / 180;
  const lon1 = arrivalAirport.longitude * Math.PI / 180;
  const brng = approachHdg * Math.PI / 180;
  const R = 3440.065;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) + Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1), Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));

  return [
    normalizeWaypoint({
      name: 'FINAL',
      latitude: lat2 * 180 / Math.PI,
      longitude: lon2 * 180 / Math.PI,
      type: 'APPROACH_FIX'
    }),
    normalizeWaypoint({
      name: landingRunway,
      label: landingRunway,
      latitude: arrivalAirport.latitude,
      longitude: arrivalAirport.longitude,
      type: 'RUNWAY_FIX'
    })
  ];
};

const projectPoint = (lat, lon, headingDeg, distanceNm) => {
  const R = 3440.065;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const brng = headingDeg * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceNm / R) + Math.cos(lat1) * Math.sin(distanceNm / R) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distanceNm / R) * Math.cos(lat1), Math.cos(distanceNm / R) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: lat2 * 180 / Math.PI, longitude: lon2 * 180 / Math.PI };
};

export const buildSyntheticSIDWaypoints = (airport, runwayName, firstWaypoint) => {
  if (!airport || !runwayName || !firstWaypoint) return [];
  const runwayHdg = getRunwayHeading(runwayName, firstWaypoint.longitude > airport.longitude);
  const sidPoint = projectPoint(airport.latitude, airport.longitude, runwayHdg, 8);
  return [normalizeWaypoint({ ...sidPoint, name: 'SID', type: 'SID_FIX' }), normalizeWaypoint(firstWaypoint)];
};

export const buildSyntheticSTARWaypoints = (airport, runwayName, lastWaypoint) => {
  if (!airport || !runwayName || !lastWaypoint) return [];
  const runwayHdg = getRunwayHeading(runwayName, lastWaypoint.longitude > airport.longitude);
  const interceptHdg = (runwayHdg + 180) % 360;
  const interceptPoint = projectPoint(airport.latitude, airport.longitude, interceptHdg, 12);
  return [normalizeWaypoint(lastWaypoint), normalizeWaypoint({ ...interceptPoint, name: 'INTCP', type: 'STAR_FIX' })];
};

export const normalizeRouteDetails = (routeDetails, selectedDeparture, selectedArrival) => {
  const normalized = {
    ...DEFAULT_ROUTE_DETAILS,
    ...(routeDetails || {})
  };

  const baseWaypoints = (normalized.waypoints || []).map(normalizeWaypoint).filter(Boolean);
  const finalWaypoints = baseWaypoints;
  const baseRouteObject = normalized.routeObject || null;
  const routeObject = baseRouteObject ? {
    ...baseRouteObject,
    waypoints: finalWaypoints
  } : null;

  return {
    ...normalized,
    departureProcedure: validProcedureEdit(normalized.departureProcedure, normalized.departureRunway, selectedDeparture),
    arrivalProcedure: validProcedureEdit(normalized.arrivalProcedure, normalized.landingRunway, selectedArrival),
    waypoints: finalWaypoints,
    routeObject,
    routeSource: normalized.routeSource || routeObject?.source || '',
    routeSourceChain: normalized.routeSourceChain || routeObject?.sourceChain || [],
    routeFallbackUsed: Boolean(normalized.routeFallbackUsed || routeObject?.fallbackUsed),
    routeDebug: normalized.routeDebug || routeObject?.debug || [],
    routeBilling: normalized.routeBilling || routeObject?.billing || null,
    procedures: normalized.procedures || routeObject?.procedures || null,
    procedureSegments: normalized.procedureSegments || routeObject?.procedureSegments || [],
    routeAlternatives: normalized.routeAlternatives || routeObject?.routeAlternatives || routeObject?.metadata?.routeAlternatives || [],
    selectedRouteAlternativeId: normalized.selectedRouteAlternativeId || routeObject?.selectedRouteAlternativeId || routeObject?.metadata?.selectedRouteAlternativeId || ''
  };
};

export const mergeFlightPlanWithRoute = (flightPlan, routeDetails) => {
  if (!flightPlan) return null;

  const normalizedRoute = routeDetails ? {
    ...routeDetails,
    waypoints: (routeDetails.waypoints || []).map(normalizeWaypoint).filter(Boolean),
    routeObject: routeDetails.routeObject ? {
      ...routeDetails.routeObject,
      waypoints: (routeDetails.routeObject.waypoints || []).map(normalizeWaypoint).filter(Boolean)
    } : null
  } : null;

  const base = normalizedRoute?.waypoints?.length ? normalizedRoute.waypoints : getActiveWaypoints(flightPlan).map(normalizeWaypoint).filter(Boolean);
  const resolveAirport = supplied => ({ ...airportService.getAirportByCode(supplied?.icao || supplied?.iata || supplied?.airport), ...supplied });
  const departureAirport = resolveAirport(flightPlan.departure);
  const arrivalAirport = resolveAirport(flightPlan.arrival);
  const selectedEdit = (side) => {
    const departure = side === 'departure';
    const airport = departure ? departureAirport : arrivalAirport;
    const runway = departure ? normalizedRoute?.departureRunway : normalizedRoute?.landingRunway;
    const name = departure ? normalizedRoute?.sid : normalizedRoute?.star;
    const edit = validProcedureEdit(departure ? normalizedRoute?.departureProcedure : normalizedRoute?.arrivalProcedure, runway, airport);
    if (edit && base.some(point => point.latitude === edit.endpoint?.latitude && point.longitude === edit.endpoint?.longitude)) return { ...edit, origin: edit.origin || (Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude) ? airport : null) };
    const published = (normalizedRoute?.procedureSegments || []).some(segment => (segment.kind || segment.segment) === (departure ? 'sid' : 'star') && segment.waypoints?.length);
    if (published || !name || !runway || !Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) return null;
    const endpoint = procedureEndpoint(base, airport, side);
    if (!endpoint) return null;
    const geometry = airportService.getRunwayGeometry(airport.icao || airport.iata, runway);
    const origin = geometry?.thresholdStart || airport;
    const heading = geometry?.heading ?? getRunwayHeading(runway);
    return { endpoint, origin, runwayName: runway, airportCode: airport.icao || airport.iata,
      points: [interceptPoint(origin, heading, departure ? 8 : 12, side)] };
  };
  let selectedWaypoints = base;
  for (const kind of ['sid', 'star', 'approach']) {
    const published = (normalizedRoute?.procedureSegments || []).filter(segment => (segment.kind || segment.segment) === kind)
      .flatMap(segment => segment.waypoints || []).map(normalizeWaypoint).filter(Boolean).map(point => ({ ...point, segment: kind }));
    if (!published.length) continue;
    selectedWaypoints = selectedWaypoints.filter(point => point.segment !== kind);
    const airport = kind === 'sid' ? departureAirport : arrivalAirport;
    const endpoint = airport && procedureEndpoint(base, airport, kind === 'sid' ? 'departure' : 'arrival');
    const boundary = endpoint ? selectedWaypoints.findIndex(point => point.latitude === endpoint.latitude && point.longitude === endpoint.longitude) : -1;
    if (kind === 'sid') selectedWaypoints = [...published, ...selectedWaypoints.slice(Math.max(0, boundary))];
    else if (kind === 'star') selectedWaypoints = [...selectedWaypoints.slice(0, boundary < 0 ? selectedWaypoints.length : boundary + 1), ...published];
    else selectedWaypoints = [...selectedWaypoints.filter(point => !(airport && point.latitude === airport.latitude && point.longitude === airport.longitude)), ...published];
  }
  selectedWaypoints = applyProcedureEdits(selectedWaypoints, selectedEdit('departure'), selectedEdit('arrival'));
  if (selectedWaypoints[0]?.segment === 'sid') {
    const airport = departureAirport;
    const origin = airportService.getRunwayGeometry(airport.icao || airport.iata, normalizedRoute?.departureRunway)?.thresholdStart || airport;
    if (Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)) {
      selectedWaypoints.unshift({ ...origin, name: normalizedRoute?.departureRunway || airport.icao || airport.iata, type: 'RUNWAY_FIX', segment: 'runway' });
    }
  }
  selectedWaypoints = selectedWaypoints.filter((point, index, points) => index === 0 || point.latitude !== points[index - 1].latitude || point.longitude !== points[index - 1].longitude);
  const merged = {
    ...flightPlan,
    waypoints: selectedWaypoints,
    routeObject: normalizedRoute?.routeObject || null,
    routeSource: normalizedRoute?.routeSource || normalizedRoute?.routeObject?.source || flightPlan.routeSource || '',
    routeSourceChain: normalizedRoute?.routeSourceChain || normalizedRoute?.routeObject?.sourceChain || flightPlan.routeSourceChain || [],
    routeFallbackUsed: normalizedRoute ? Boolean(normalizedRoute.routeFallbackUsed || normalizedRoute.routeObject?.fallbackUsed) : Boolean(flightPlan.routeFallbackUsed),
    routeBilling: normalizedRoute?.routeBilling || normalizedRoute?.routeObject?.billing || flightPlan.routeBilling || null,
    procedures: normalizedRoute?.procedures || normalizedRoute?.routeObject?.procedures || flightPlan.procedures || null,
    procedureSegments: normalizedRoute?.procedureSegments || normalizedRoute?.routeObject?.procedureSegments || flightPlan.procedureSegments || [],
    routeAlternatives: normalizedRoute?.routeAlternatives || normalizedRoute?.routeObject?.routeAlternatives || normalizedRoute?.routeObject?.metadata?.routeAlternatives || flightPlan.routeAlternatives || [],
    selectedRouteAlternativeId: normalizedRoute?.selectedRouteAlternativeId || normalizedRoute?.routeObject?.selectedRouteAlternativeId || normalizedRoute?.routeObject?.metadata?.selectedRouteAlternativeId || flightPlan.selectedRouteAlternativeId || '',
    departure: {
      ...departureAirport,
      runways: normalizedRoute?.departureRunway ? [{ name: normalizedRoute.departureRunway }] : flightPlan.departure?.runways
    },
    arrival: {
      ...arrivalAirport,
      runways: normalizedRoute?.landingRunway ? [{ name: normalizedRoute.landingRunway }] : flightPlan.arrival?.runways
    }
  };
  return activateFlightRoute(merged, selectedWaypoints);
};

export const buildRouteAuthState = ({ offlineMode = true, activeUser = null } = {}) => {
  if (offlineMode) return 'offline';
  return activeUser ? 'authenticated' : 'guest';
};

export const buildAutoRouteDetails = async ({
  departure,
  arrival,
  previousRouteDetails = DEFAULT_ROUTE_DETAILS,
  routeOptions = {}
} = {}) => {
  if (!departure || !arrival) {
    return normalizeRouteDetails(previousRouteDetails, departure, arrival);
  }

  const departureCode = departure.icao || departure.iata || departure.name;
  const arrivalCode = arrival.icao || arrival.iata || arrival.name;
  if (departureCode && arrivalCode && departureCode === arrivalCode) {
    return normalizeRouteDetails(previousRouteDetails, departure, arrival);
  }

  const { generateSmartRouteDetails } = await import('./routeGenerator.js');
  const routeObject = await generateSmartRouteDetails(departure, arrival, routeOptions);
  const waypoints = (routeObject.waypoints || []).map(normalizeWaypoint).filter(Boolean);
  const firstWaypoint = waypoints[0]?.name || waypoints[0]?.label || '';
  const lastWaypoint = getLastProcedureWaypoint(waypoints);
  const isEastward = arrival.longitude > departure.longitude;
  const departureRunways = getRunways(departure);
  const arrivalRunways = getRunways(arrival);
  const departureRunway = departureRunways[0] || '';
  const landingRunway = arrivalRunways.find((runway) => {
    const heading = getRunwayHeading(runway, isEastward);
    return isEastward ? heading < 180 : heading >= 180;
  }) || arrivalRunways[0] || '';

  return normalizeRouteDetails({
    ...DEFAULT_ROUTE_DETAILS,
    alternate: previousRouteDetails?.alternate || null,
    departureGate: generateGate(),
    departureTaxiway: generateTaxiway(),
    departureRunway,
    sid: firstWaypoint ? generateSID(firstWaypoint) : '',
    waypoints,
    star: lastWaypoint ? generateSTAR(lastWaypoint) : '',
    landingRunway,
    landingTaxiway: generateTaxiway(),
    arrivalGate: generateGate(),
    routeObject,
    routeSource: routeObject.source,
    routeSourceChain: routeObject.sourceChain || [],
    routeFallbackUsed: routeObject.fallbackUsed,
    routeDebug: routeObject.debug || [],
    routeBilling: routeObject.billing || null,
    procedures: routeObject.procedures || null,
    procedureSegments: routeObject.procedureSegments || [],
    routeAlternatives: routeObject.routeAlternatives || routeObject.metadata?.routeAlternatives || [],
    selectedRouteAlternativeId: routeObject.selectedRouteAlternativeId || routeObject.metadata?.selectedRouteAlternativeId || ''
  }, departure, arrival);
};
