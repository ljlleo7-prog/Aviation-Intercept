import { planMissionFuel } from './flightPerformancePlanning.js';
// Aircraft Service for Ultimate Crash Simulation
// Provides aircraft-specific performance data for fuel calculations

// Import aircraft database directly
import aircraftData from '../data/aircraftDatabase.json';

// Load aircraft database
let aircraftDatabase = null;

async function loadAircraftData() {
  if (!aircraftDatabase) {
    aircraftDatabase = aircraftData.aircraft;
  }
  return aircraftDatabase;
}

class AircraftService {
  constructor() {
    this.aircraftDatabase = null;
    
    // Bind all methods to ensure proper this context
    this.calculateFlightPerformance = this.calculateFlightPerformance.bind(this);
    this.calculateFuelRequirements = this.calculateFuelRequirements.bind(this);
    this.getAircraftByModel = this.getAircraftByModel.bind(this);
    this.validateRoute = this.validateRoute.bind(this);
  }

  async initialize() {
    if (!this.aircraftDatabase) {
      this.aircraftDatabase = await loadAircraftData();
    }
    return this.aircraftDatabase;
  }

  // Search aircraft by model, manufacturer, or code
  async searchAircraft(query) {
    const db = await this.initialize();
    const searchTerm = query.toLowerCase();
    return db.filter(aircraft =>
      aircraft.model.toLowerCase().includes(searchTerm) ||
      aircraft.manufacturer.toLowerCase().includes(searchTerm) ||
      aircraft.iata.toLowerCase().includes(searchTerm) ||
      aircraft.icao.toLowerCase().includes(searchTerm) ||
      aircraft.type.toLowerCase().includes(searchTerm)
    );
  }

  // Get aircraft by IATA code
  async getAircraftByIATA(iataCode) {
    const db = await this.initialize();
    return db.find(aircraft => aircraft.iata === iataCode.toUpperCase());
  }

  // Get aircraft by ICAO code
  async getAircraftByICAO(icaoCode) {
    const db = await this.initialize();
    return db.find(aircraft => aircraft.icao === icaoCode.toUpperCase());
  }

  // Get aircraft by model name
  async getAircraftByModel(modelName) {
    const db = await this.initialize();
    const normalized = modelName?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const exact = db.find(aircraft => aircraft.model.toLowerCase() === normalized);
    if (exact) {
      return exact;
    }

    const aliasMap = {
      'b737-800': 'boeing 737-800',
      '737-800': 'boeing 737-800',
      'b738': 'boeing 737-800',
      'b737': 'boeing 737-800',
      'a320': 'airbus a320-200',
      'a320-200': 'airbus a320-200'
    };

    const aliased = aliasMap[normalized];
    if (aliased) {
      return db.find(aircraft => aircraft.model.toLowerCase() === aliased);
    }

    return db.find(aircraft =>
      aircraft.iata?.toLowerCase() === normalized ||
      aircraft.icao?.toLowerCase() === normalized
    );
  }

  // Get all aircraft models
  async getAllAircraft() {
    const db = await this.initialize();
    return db;
  }

  // Get aircraft by category
  async getAircraftByCategory(category) {
    const db = await this.initialize();
    return db.filter(aircraft => 
      aircraft.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Get popular aircraft models for suggestions
  async getPopularAircraft() {
    await this.initialize();
    
    // Return all available aircraft models for user selection
    return this.aircraftDatabase.map(aircraft => ({
      model: aircraft.model,
      manufacturer: aircraft.manufacturer,
      iata: aircraft.iata,
      icao: aircraft.icao
    }));
  }

  // Calculate fuel requirements for a flight
  async calculateFuelRequirements(aircraftModel, distance, payload, fuelReserve = 0.05, options = {}) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    return planMissionFuel(aircraft, distance, payload, Number(fuelReserve), options);
  }

  // Calculate flight performance metrics
  async calculateFlightPerformance(aircraftModel, distance, payload = 0) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      return null;
    }

    // Calculate fuel efficiency
    const fuelEfficiency = aircraft.typicalFuelBurn;
    const totalFuel = fuelEfficiency * distance;
    
    // Calculate range efficiency (how much of max range is used)
    const rangeEfficiency = (distance / aircraft.maxRange) * 100;
    
    // Calculate payload efficiency
    const payloadEfficiency = (payload / aircraft.maxPayload) * 100;
    
    // Calculate flight time
    const flightTimeHours = distance / aircraft.cruiseSpeed;
    
    // Performance rating based on multiple factors
    let performanceRating = 100;
    
    // Penalize for high range usage
    if (rangeEfficiency > 80) performanceRating -= 20;
    else if (rangeEfficiency > 60) performanceRating -= 10;
    
    // Penalize for high payload usage
    if (payloadEfficiency > 80) performanceRating -= 15;
    else if (payloadEfficiency > 60) performanceRating -= 5;
    
    // Bonus for fuel efficiency
    if (fuelEfficiency < 2.0) performanceRating += 10;
    else if (fuelEfficiency < 2.5) performanceRating += 5;
    
    performanceRating = Math.max(0, Math.min(100, performanceRating));

    return {
      performance: {
        rating: Math.round(performanceRating),
        rangeEfficiency: Math.round(rangeEfficiency),
        payloadEfficiency: Math.round(payloadEfficiency),
        fuelEfficiency: fuelEfficiency.toFixed(2),
        flightTime: Math.round(flightTimeHours * 60), // minutes
        totalFuel: Math.round(totalFuel),
        suitability: performanceRating >= 80 ? 'Excellent' : 
                     performanceRating >= 60 ? 'Good' : 
                     performanceRating >= 40 ? 'Fair' : 'Poor'
      }
    };
  }

  // Validate route feasibility
  async validateRoute(aircraftModel, distance, payload = 0) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      return { isValid: false, errors: ['Aircraft not found'] };
    }

    const errors = [];
    
    // Check range
    if (distance > aircraft.maxRange) {
      errors.push(`Distance (${distance} NM) exceeds aircraft range (${aircraft.maxRange} NM)`);
    }
    
    // Check payload
    if (payload > aircraft.maxPayload) {
      errors.push(`Payload (${payload} kg) exceeds maximum (${aircraft.maxPayload} kg)`);
    }
    
    // Check fuel capacity
    const fuelRequired = aircraft.typicalFuelBurn * distance;
    if (fuelRequired > aircraft.maxFuelCapacity) {
      errors.push(`Fuel required (${Math.round(fuelRequired)} kg) exceeds capacity (${aircraft.maxFuelCapacity} kg)`);
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
      warnings: errors.length > 0 ? ['Route may not be feasible'] : []
    };
  }

  // Calculate flight time with overhead (climb/descent/taxi)
  async calculateFlightTime(aircraftModel, distance) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    const cruiseTimeHours = distance / aircraft.cruiseSpeed;
    // Add overhead: Taxi (15m) + Climb/Descent inefficiency (20m equivalent cruise time penalty)
    // ~30 mins overhead to flight time estimation
    const overheadHours = 0.5; 
    const totalFlightHours = cruiseTimeHours + overheadHours;

    const hours = Math.floor(totalFlightHours);
    const minutes = Math.round((totalFlightHours - hours) * 60);

    return {
      hours,
      minutes,
      totalMinutes: Math.round(totalFlightHours * 60)
    };
  }

  // Check payload limits
  async checkPayloadLimits(aircraftModel, payload, fuel = 0) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      return { isValid: false, errors: ['Aircraft not found'] };
    }

    const totalWeight = aircraft.emptyWeight + Number(payload) + Number(fuel);
    const maxWeight = aircraft.maxTakeoffWeight;
    
    return {
      isValid: totalWeight <= maxWeight,
      totalWeight: Math.round(totalWeight),
      maxWeight: maxWeight,
      remainingCapacity: Math.round(maxWeight - totalWeight),
      percentage: Math.round((totalWeight / maxWeight) * 100)
    };
  }

  // Enhanced physics integration methods
  
  // Get aircraft physics configuration
  async getAircraftPhysicsConfig(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    return {
      mass: aircraft.emptyWeight,
      wingArea: aircraft.wingArea,
      aspectRatio: aircraft.aspectRatio,
      maxLiftCoefficient: aircraft.maxLiftCoefficient,
      cruiseSpeed: aircraft.cruiseSpeed,
      maxRange: aircraft.maxRange,
      momentOfInertia: aircraft.momentOfInertia || {
        x: aircraft.emptyWeight * 1000, // Rough approximation
        y: aircraft.emptyWeight * 2000,
        z: aircraft.emptyWeight * 2500
      },
      engine: {
        maxThrust: aircraft.maxThrustPerEngine || aircraft.emptyWeight * 9.81 * 0.3, // Estimate 30% of weight
        specificFuelConsumption: aircraft.typicalFuelBurn / 1000 // Convert to kg/N/s
      }
    };
  }

  // Calculate dynamic mass including fuel
  async calculateDynamicMass(aircraftModel, payload, fuelLevel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    const fuelWeight = fuelLevel * aircraft.maxFuelCapacity;
    const totalMass = aircraft.emptyWeight + payload + fuelWeight;

    return {
      emptyMass: aircraft.emptyWeight,
      payload: payload,
      fuelMass: fuelWeight,
      totalMass: totalMass,
      centerOfGravity: {
        x: (aircraft.emptyWeight * 0.4 + payload * 0.5 + fuelWeight * 0.45) / totalMass,
        y: 0, // Simplified
        z: (aircraft.emptyWeight * 0.1 + payload * 0.1 + fuelWeight * 0.15) / totalMass
      }
    };
  }

  // Validate aircraft for simulation
  async validateAircraftForSimulation(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      return { isValid: false, errors: ['Aircraft not found'] };
    }

    const errors = [];
    const warnings = [];

    // Check required physics properties
    if (!aircraft.wingArea) errors.push('Wing area not defined');
    if (!aircraft.aspectRatio) warnings.push('Aspect ratio not defined - using default');
    if (!aircraft.maxLiftCoefficient) warnings.push('Max lift coefficient not defined - using default');
    if (!aircraft.momentOfInertia) warnings.push('Moment of inertia not defined - using estimates');

    // Check performance data
    if (!aircraft.cruiseSpeed) errors.push('Cruise speed not defined');
    if (!aircraft.maxRange) errors.push('Maximum range not defined');
    if (!aircraft.typicalFuelBurn) errors.push('Fuel consumption data not defined');

    return {
      isValid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      physicsReady: errors.length === 0 && warnings.length <= 1
    };
  }

  // Get performance envelope
  async getPerformanceEnvelope(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    return {
      speed: {
        min: aircraft.cruiseSpeed * 0.6, // Approach speed
        max: aircraft.cruiseSpeed * 1.3, // High speed
        cruise: aircraft.cruiseSpeed
      },
      altitude: {
        min: 0,
        max: aircraft.serviceCeiling || 41000,
        optimal: 35000
      },
      weight: {
        empty: aircraft.emptyWeight,
        maxTakeoff: aircraft.maxTakeoffWeight,
        maxLanding: aircraft.maxLandingWeight || aircraft.maxTakeoffWeight * 0.85
      },
      range: {
        typical: aircraft.maxRange * 0.85,
        maximum: aircraft.maxRange
      }
    };
  }

  // Get flap profile for specific aircraft
  async getFlapProfile(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    // Return the flap profile if it exists, otherwise return default values
    return aircraft.flapProfile || {
      positions: [
        { angle: 0, clIncrement: 0, cdIncrement: 0, label: "UP" },
        { angle: 10, clIncrement: 0.3, cdIncrement: 0.015, label: "1" },
        { angle: 20, clIncrement: 0.6, cdIncrement: 0.035, label: "2" },
        { angle: 30, clIncrement: 1.0, cdIncrement: 0.07, label: "FULL" }
      ]
    };
  }

  // Get airbrake profile for specific aircraft
  async getAirbrakeProfile(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    // Return the airbrake profile if it exists, otherwise return default values
    return aircraft.airbrakeProfile || {
      positions: [
        { label: "RET", dragIncrement: 0, liftDecrement: 0 },
        { label: "EXT", dragIncrement: 0.06, liftDecrement: -0.1 },
        { label: "GND", dragIncrement: 0.15, liftDecrement: -0.2 }
      ]
    };
  }

  // Get all control surface profiles for specific aircraft
  async getControlSurfaceProfiles(aircraftModel) {
    const aircraft = await this.getAircraftByModel(aircraftModel);
    if (!aircraft) {
      throw new Error(`Aircraft model '${aircraftModel}' not found`);
    }

    return {
      flaps: await this.getFlapProfile(aircraftModel),
      airbrakes: await this.getAirbrakeProfile(aircraftModel)
    };
  }
}

// Create and export a singleton instance
const aircraftService = new AircraftService();
export default aircraftService;

// Export the loadAircraftData function for use in other modules
export { loadAircraftData };
