import { createPlanModel, buildFlightPlanOutput } from '../services/fms/FlightPlanModel.js';

export function airportGuidance(position, airport) {
  if (![position?.latitude, position?.longitude, airport?.latitude, airport?.longitude].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const lat1 = position.latitude * rad;
  const lat2 = airport.latitude * rad;
  const lon = (airport.longitude - position.longitude) * rad;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lon / 2) ** 2;
  const distance = 3440.065 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  const bearing = (Math.atan2(Math.sin(lon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon)) / rad + 360) % 360;
  const turn = Number.isFinite(position.heading) ? ((bearing - position.heading + 540) % 360) - 180 : null;
  return { distance, bearing, turn };
}

export function createDiversionPlan(plan, airport) {
  if (!airportGuidance(airport, airport)) throw new Error('Invalid diversion coordinates');
  const base = Array.isArray(plan) ? {} : { ...plan };
  delete base.fms;
  const waypoint = { latitude: airport.latitude, longitude: airport.longitude, label: airport.icao || airport.iata || airport.name, type: 'AIRPORT', details: airport, source: 'manual' };
  return buildFlightPlanOutput(createPlanModel({ ...base, waypoints: [waypoint], currentWaypointIndex: 0, diversionAirport: airport }));
}
