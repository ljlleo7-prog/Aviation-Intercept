// Distance Calculator for Aviation Intercept
// Enhanced with aircraft-specific fuel calculations

import aircraftService from '../services/aircraftService.js';
import { generateRouteWaypoints } from './routeGenerator.js';

// Haversine formula to calculate great-circle distance between two coordinates in nautical miles
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Calculate flight time in hours based on distance and average speed
function calculateFlightTime(distance, averageSpeed = 450) {
  const timeInHours = distance / averageSpeed;
  const hours = Math.floor(timeInHours);
  const minutes = Math.round((timeInHours - hours) * 60);
  
  return { hours, minutes, totalMinutes: Math.round(timeInHours * 60) };
}

// Enhanced fuel calculation with aircraft-specific parameters
async function calculateFuelConsumption(distance, aircraftModel, payload = 0, reserves = 1.0) {
  try {
    const fuelData = await aircraftService.calculateFuelRequirements(aircraftModel, distance, payload, reserves);
    return fuelData;
  } catch (error) {
    // Fallback to generic calculation if aircraft not found
    console.warn('Aircraft not found, using generic calculation:', error.message);
    
    // Generic fuel calculation (average of 2.5 kg/nm for jets)
    const genericFuelBurn = 2.5; // kg per nautical mile
    const baseFuel = distance * genericFuelBurn;
    const reserveFuel = baseFuel * reserves;
    const totalFuel = baseFuel + reserveFuel;
    
    return {
      aircraft: 'Generic Jet',
      distance: distance,
      baseFuel: Math.round(baseFuel),
      tripFuel: Math.round(baseFuel), // Added tripFuel for compatibility
      payloadFactor: 1.0,
      adjustedFuel: Math.round(baseFuel),
      reserveFuel: Math.round(reserveFuel),
      totalFuel: Math.round(totalFuel),
      maxFuelCapacity: 50000, // Generic maximum
      fuelSufficient: totalFuel <= 50000,
      flightTime: Math.round((distance / 450) * 60), // minutes
      units: 'kg',
      isGeneric: true
    };
  }
}

// Calculate complete flight plan with aircraft-specific data
async function calculateFlightPlan(departureAirport, arrivalAirport, aircraftModel, payload = 0, fuelReserve = 0.1) {
  if (!departureAirport || !arrivalAirport) {
    throw new Error('Both departure and arrival airports are required');
  }

  const distance = calculateDistance(
    departureAirport.latitude,
    departureAirport.longitude,
    arrivalAirport.latitude,
    arrivalAirport.longitude
  );

  let flightTime;
  try {
    flightTime = await aircraftService.calculateFlightTime(aircraftModel, distance);
  } catch (error) {
    console.warn('Using generic flight time calculation:', error.message);
    flightTime = calculateFlightTime(distance);
  }

  const fuelData = await calculateFuelConsumption(distance, aircraftModel, payload, fuelReserve);
  
  // Get aircraft performance data
  const aircraft = await aircraftService.getAircraftByModel(aircraftModel);
  const performance = aircraft ? await aircraftService.calculateFlightPerformance(aircraftModel, distance, payload) : null;

  // Generate route waypoints
  const waypoints = generateRouteWaypoints(departureAirport, arrivalAirport);

  return {
    departure: {
      airport: departureAirport.iata || departureAirport.icao,
      name: departureAirport.name,
      city: departureAirport.city,
      country: departureAirport.country,
      runways: departureAirport.runways,
      frequencies: departureAirport.frequencies
    },
    arrival: {
      airport: arrivalAirport.iata || arrivalAirport.icao,
      name: arrivalAirport.name,
      city: arrivalAirport.city,
      country: arrivalAirport.country,
      runways: arrivalAirport.runways,
      frequencies: arrivalAirport.frequencies
    },
    distance: {
      nauticalMiles: distance,
      kilometers: Math.round(distance * 1.852),
      statuteMiles: Math.round(distance * 1.151)
    },
    time: flightTime,
    fuel: fuelData,
    aircraft: aircraft ? {
      model: aircraft.model,
      manufacturer: aircraft.manufacturer,
      type: aircraft.type,
      maxRange: aircraft.maxRange,
      maxPayload: aircraft.maxPayload,
      maxPassengers: aircraft.maxPassengers
    } : null,
    performance: performance ? performance.performance : null,
    waypoints: waypoints,
    validation: performance ? await aircraftService.validateRoute(aircraftModel, distance, payload) : null
  };
}

// Format distance for display
function formatDistance(distance) {
  return `${distance.toFixed(1)} NM`;
}

// Format flight time for display
function formatFlightTime(flightTime) {
  if (flightTime.hours === 0) {
    return `${flightTime.minutes}m`;
  }
  return `${flightTime.hours}h ${flightTime.minutes}m`;
}

// Format fuel consumption for display
function formatFuel(fuelData) {
  if (!fuelData || !fuelData.totalFuel) {
    return 'Calculating...';
  }
  return `${fuelData.totalFuel.toLocaleString()} kg`;
}

// Validate airport codes (IATA or ICAO)
function isValidAirportCode(code) {
  if (!code) return false;
  
  // IATA: 3 letters, ICAO: 4 letters
  const iataPattern = /^[A-Z]{3}$/;
  const icaoPattern = /^[A-Z]{4}$/;
  
  return iataPattern.test(code) || icaoPattern.test(code);
}

// Get aircraft suggestions based on distance
function suggestAircraftForDistance(distance) {
  const allAircraft = aircraftService.aircraftDatabase;
  
  return allAircraft.filter(aircraft => {
    // Suggest aircraft that can handle at least 80% of the distance
    return aircraft.maxRange >= distance * 0.8;
  }).sort((a, b) => a.maxRange - b.maxRange); // Sort by range ascending
}

// Calculate optimal aircraft for a route
function calculateOptimalAircraft(distance, payload, passengerCount) {
  const suitableAircraft = aircraftService.aircraftDatabase.filter(aircraft => {
    return aircraft.maxRange >= distance && 
           aircraft.maxPayload >= payload &&
           aircraft.maxPassengers >= passengerCount;
  });

  if (suitableAircraft.length === 0) {
    // If no perfect match, find closest match
    return aircraftService.aircraftDatabase
      .map(aircraft => ({
        ...aircraft,
        suitabilityScore: calculateSuitabilityScore(aircraft, distance, payload, passengerCount)
      }))
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)[0];
  }

  // Return most fuel-efficient suitable aircraft
  return suitableAircraft.sort((a, b) => a.typicalFuelBurn - b.typicalFuelBurn)[0];
}

// Calculate suitability score for aircraft selection
function calculateSuitabilityScore(aircraft, distance, payload, passengerCount) {
  let score = 100;
  
  // Penalize for insufficient range
  if (aircraft.maxRange < distance) {
    score -= (distance - aircraft.maxRange) / distance * 100;
  }
  
  // Penalize for insufficient payload
  if (aircraft.maxPayload < payload) {
    score -= (payload - aircraft.maxPayload) / payload * 100;
  }
  
  // Penalize for insufficient passenger capacity
  if (aircraft.maxPassengers < passengerCount) {
    score -= (passengerCount - aircraft.maxPassengers) / passengerCount * 100;
  }
  
  // Bonus for fuel efficiency
  score += (2.5 - aircraft.typicalFuelBurn) * 10; // Lower fuel burn = higher score
  
  return Math.max(0, score);
}

export {
  calculateDistance,
  calculateFlightTime,
  calculateFuelConsumption,
  calculateFlightPlan,
  formatDistance,
  formatFlightTime,
  formatFuel,
  isValidAirportCode,
  suggestAircraftForDistance,
  calculateOptimalAircraft,
  toRadians
};
