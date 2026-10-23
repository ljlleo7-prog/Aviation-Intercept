export const CHALLENGE_CATEGORIES = [
  {
    id: 'landing',
    label: 'Landing Tests',
    description: 'Approach and landing scenarios that test procedures and nerves.'
  },
  {
    id: 'handling',
    label: 'Handling',
    description: 'Recover the aircraft from unstable energy or control situations.'
  },
  {
    id: 'failures',
    label: 'Failures',
    description: 'Manage catastrophic failures with minimal help.'
  },
  {
    id: 'terrain',
    label: 'Terrain',
    description: 'Fly difficult routes where terrain and weather leave little margin.'
  }
];

export const CHALLENGES = [
  {
    id: 'ils-landing-check',
    category: 'landing',
    title: 'ILS Landing Check',
    summary: 'Configure and fly a stable ILS using instruments in 100 m visibility.',
    difficulty: 'Pro',
    duration: '4-6 min',
    challengeMode: 'systems',
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      difficulty: 'pro',
      failureType: 'none',
      weatherData: {
        type: 'cloudy',
        windSpeed: 9,
        windDirection: 245,
        visibility: 0.1, // Kilometers: 100 m.
        ceiling: 1800,
        precipitation: 0,
        turbulence: 0.08
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'approach-final',
        distanceNm: 8,
        altitude: 2600,
        speed: 172
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: true
      },
      validation: {
        profile: 'stable_spawn',
        requiredStableSeconds: 3,
        maxAltitudeDeltaFt: 260,
        maxAirspeedDeltaKts: 20,
        allowNominalDescent: true,
        maxSinkRateFpm: 2600
      }
    }
  },
  {
    id: 'manual-instrument-landing',
    category: 'landing',
    title: 'Manual Instrument Landing',
    summary: 'Fly the approach by raw instruments in 100 m visibility. No autopilot or guides.',
    difficulty: 'Devil',
    duration: '4-6 min',
    challengeMode: 'gut-check',
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'none',
      weatherData: {
        type: 'stormy',
        windSpeed: 12,
        windDirection: 250,
        visibility: 0.1, // Kilometers: 100 m.
        ceiling: 350,
        precipitation: 0.2,
        turbulence: 0.12
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'approach-final',
        distanceNm: 7,
        altitude: 2200,
        speed: 160
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: true,
        instrumentsOnly: true
      },
      validation: {
        profile: 'stable_spawn',
        requiredStableSeconds: 3,
        maxAltitudeDeltaFt: 260,
        maxAirspeedDeltaKts: 20,
        allowNominalDescent: true,
        maxSinkRateFpm: 3600
      }
    }
  },
  {
    id: 'low-speed-stall-recovery',
    category: 'handling',
    title: 'Low-Speed Stall Recovery',
    summary: 'Recover from a low-energy high-altitude setup before the aircraft departs controlled flight completely.',
    difficulty: 'Devil',
    duration: '2-4 min',
    challengeMode: 'gut-check',
    departureCode: 'KDEN',
    arrivalCode: 'KCOS',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'none',
      weatherData: {
        type: 'clear',
        windSpeed: 6,
        windDirection: 210,
        visibility: 10,
        ceiling: 12000,
        precipitation: 0,
        turbulence: 0.04
      },
      routeDetails: {
        departureRunway: '25',
        landingRunway: '35L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 16000,
        speed: 138
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: true,
        instrumentsOnly: false
      },
      validation: {
        profile: 'intentionally_unstable'
      }
    }
  },
  {
    id: 'mountain-engine-failure',
    category: 'terrain',
    title: 'Mountain Engine Failure',
    summary: 'Handle a single-engine emergency while boxed in by terrain and limited maneuvering room.',
    difficulty: 'Devil',
    duration: '4-7 min',
    challengeMode: 'failures',
    departureCode: 'LOWI',
    arrivalCode: 'LOWI',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'engine_failure',
      weatherData: {
        type: 'cloudy',
        windSpeed: 15,
        windDirection: 300,
        visibility: 6,
        ceiling: 5000,
        precipitation: 0,
        turbulence: 0.15
      },
      routeDetails: {
        departureRunway: '26',
        landingRunway: '08'
      },
      spawnPreset: {
        type: 'departure-airborne',
        distanceNm: 12,
        altitude: 11000,
        speed: 210
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: false
      },
      validation: {
        profile: 'intentionally_unstable'
      }
    }
  },
  {
    id: 'mountain-decompression',
    category: 'terrain',
    title: 'Mountain Decompression',
    summary: 'A high-altitude pressurization emergency forces an immediate descent plan while terrain limits your escape path.',
    difficulty: 'Pro',
    duration: '4-7 min',
    challengeMode: 'failures',
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      difficulty: 'pro',
      failureType: 'rapid_depressurization',
      weatherData: {
        type: 'cloudy',
        windSpeed: 12,
        windDirection: 265,
        visibility: 7,
        ceiling: 6500,
        precipitation: 0,
        turbulence: 0.1
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 20000,
        speed: 270
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: false
      },
      validation: {
        profile: 'stable_spawn',
        requiredStableSeconds: 3,
        maxAltitudeDeltaFt: 260,
        maxAirspeedDeltaKts: 20,
        allowNominalDescent: false,
        maxSinkRateFpm: 2600
      }
    }
  },
  {
    id: 'all-engines-fail',
    category: 'failures',
    title: 'All Engines Fail',
    summary: 'You are now a glider. Preserve energy, find a survivable path, and do not waste altitude.',
    difficulty: 'Devil',
    duration: '3-6 min',
    challengeMode: 'failures',
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'dual_engine_failure',
      weatherData: {
        type: 'clear',
        windSpeed: 5,
        windDirection: 170,
        visibility: 10,
        ceiling: 12000,
        precipitation: 0,
        turbulence: 0.02
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 17000,
        speed: 250
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: false
      },
      validation: {
        profile: 'intentionally_unstable'
      }
    }
  },
  {
    id: 'all-hydraulics-fail',
    category: 'failures',
    title: 'All Hydraulics Fail',
    summary: 'Control authority is badly degraded. Keep the airplane flyable long enough to make a plan.',
    difficulty: 'Devil',
    duration: '3-6 min',
    challengeMode: 'failures',
    departureCode: 'KSLC',
    arrivalCode: 'KDEN',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'major_hydraulic_failure',
      failureContext: { totalHydraulicLoss: true },
      weatherData: {
        type: 'cloudy',
        windSpeed: 10,
        windDirection: 260,
        visibility: 8,
        ceiling: 4500,
        precipitation: 0,
        turbulence: 0.07
      },
      routeDetails: {
        departureRunway: '34R',
        landingRunway: '34L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 14000,
        speed: 230
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: false
      },
      validation: {
        profile: 'intentionally_unstable'
      }
    }
  },
  {
    id: 'afghanistan-landing',
    category: 'terrain',
    title: 'Afghanistan Landing',
    summary: 'A brutally steep mountain-style approach using a regular airport setup, where terrain pressure is replaced by an aggressive glide path and tight energy margins.',
    difficulty: 'Devil',
    duration: '5-8 min',
    challengeMode: 'gut-check',
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      difficulty: 'devil',
      failureType: 'none',
      weatherData: {
        type: 'cloudy',
        windSpeed: 18,
        windDirection: 280,
        visibility: 4,
        ceiling: 2200,
        precipitation: 0,
        turbulence: 0.18
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'approach-final',
        distanceNm: 8,
        altitude: 9840,
        speed: 192
      },
      restrictions: {
        guidesDisabled: true,
        autopilotForbidden: false,
        instrumentsOnly: false
      },
      validation: {
        profile: 'stable_spawn',
        requiredStableSeconds: 3,
        maxAltitudeDeltaFt: 400,
        maxAirspeedDeltaKts: 24,
        allowNominalDescent: true,
        maxSinkRateFpm: 6200
      }
    }
  }
];

export const CHALLENGES_BY_ID = CHALLENGES.reduce((acc, challenge) => {
  acc[challenge.id] = challenge;
  return acc;
}, {});
