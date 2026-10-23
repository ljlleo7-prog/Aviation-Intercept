export const TUTORIAL_CATEGORIES = [
  {
    id: 'basics',
    label: 'Basics',
    description: 'Learn the flight deck and core handling controls.'
  },
  {
    id: 'radio',
    label: 'Radio / ATC',
    description: 'Practice communication flow, tuning, and phraseology.'
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    description: 'Work with AP modes, targets, and stability tools.'
  },
  {
    id: 'ils',
    label: 'ILS / Approach',
    description: 'Set up and follow an instrument approach.'
  },
  {
    id: 'flight-computer',
    label: 'Flight Computer',
    description: 'Use route, waypoint, and diversion tools.'
  },
  {
    id: 'failures',
    label: 'Failures',
    description: 'Recognize abnormal conditions and process failures.'
  }
];

export const TUTORIALS = [
  {
    id: 'flight-basics',
    category: 'basics',
    title: 'Flight Basics',
    summary: 'Pitch, roll, throttle, and autopilot essentials in a guided airborne lesson.',
    difficulty: 'Rookie',
    duration: '6-8 min',
    guidanceMode: 'guided',
    topics: ['Controls', 'Throttle', 'Autopilot'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'rookie',
      failureType: 'none',
      weatherData: {
        type: 'clear',
        windSpeed: 4,
        visibility: 10,
        ceiling: 12000,
        precipitation: 0,
        turbulence: 0
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'departure-airborne',
        altitude: 7500,
        speed: 230,
        distanceNm: 8
      }
    }
  },
  {
    id: 'radio-communications',
    available: false,
    unavailableReason: 'The current cockpit does not provide the ATC action panel required for this lesson.',
    category: 'radio',
    title: 'Radio Communications',
    summary: 'Use the radio stack and ATC action panel to practice basic tower calls.',
    difficulty: 'Rookie',
    duration: '5-7 min',
    guidanceMode: 'guided',
    topics: ['Radio', 'ATC', 'Phraseology'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'rookie',
      failureType: 'none',
      weatherData: {
        type: 'clear',
        windSpeed: 5,
        visibility: 10,
        ceiling: 10000,
        precipitation: 0,
        turbulence: 0
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'runway'
      }
    }
  },
  {
    id: 'autopilot-basics',
    category: 'autopilot',
    title: 'Autopilot Basics',
    summary: 'Engage AP, change targets, and understand HDG versus LNAV control.',
    difficulty: 'Amateur',
    duration: '6-8 min',
    guidanceMode: 'guided',
    topics: ['AP master', 'Targets', 'Modes'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'amateur',
      failureType: 'none',
      weatherData: {
        type: 'clear',
        windSpeed: 8,
        visibility: 10,
        ceiling: 12000,
        precipitation: 0,
        turbulence: 0
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'departure-airborne',
        altitude: 12000,
        speed: 250,
        distanceNm: 12
      }
    }
  },
  {
    id: 'ils-approach',
    category: 'ils',
    title: 'ILS Approach Setup',
    summary: 'Tune the approach, brief the runway, and use APP mode to capture the localizer and glideslope.',
    difficulty: 'Intermediate',
    duration: '7-10 min',
    guidanceMode: 'info',
    topics: ['Approach setup', 'APP mode', 'Capture'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'intermediate',
      failureType: 'none',
      weatherData: {
        type: 'cloudy',
        windSpeed: 10,
        visibility: 8,
        ceiling: 3500,
        precipitation: 0,
        turbulence: 0.1
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'approach-final',
        distanceNm: 10,
        altitude: 3000,
        speed: 180
      }
    }
  },
  {
    id: 'flight-computer-basics',
    category: 'flight-computer',
    title: 'Flight Computer Basics',
    summary: 'Edit waypoints, review nearest airports, and understand diversion tools.',
    difficulty: 'Amateur',
    duration: '5-7 min',
    guidanceMode: 'info',
    topics: ['Waypoints', 'Nearest airports', 'Diversion'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'amateur',
      failureType: 'none',
      weatherData: {
        type: 'clear',
        windSpeed: 6,
        visibility: 10,
        ceiling: 12000,
        precipitation: 0,
        turbulence: 0
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 24000,
        speed: 290
      }
    }
  },
  {
    id: 'failure-processing',
    category: 'failures',
    title: 'Failure Processing',
    summary: 'Read warnings, inspect system panels, and stabilize the aircraft after an abnormal event.',
    difficulty: 'Intermediate',
    duration: '7-9 min',
    guidanceMode: 'info',
    topics: ['Warnings', 'Overhead', 'Systems'],
    departureCode: 'KSFO',
    arrivalCode: 'KLAX',
    launchConfig: {
      aircraftModel: 'B737-800',
      difficulty: 'intermediate',
      failureType: 'hydraulic_failure',
      weatherData: {
        type: 'cloudy',
        windSpeed: 12,
        visibility: 8,
        ceiling: 5000,
        precipitation: 0,
        turbulence: 0.15
      },
      routeDetails: {
        departureRunway: '28R',
        landingRunway: '25L'
      },
      spawnPreset: {
        type: 'enroute-midpoint',
        altitude: 18000,
        speed: 260
      }
    }
  }
];

export const TUTORIALS_BY_ID = TUTORIALS.reduce((acc, tutorial) => {
  acc[tutorial.id] = tutorial;
  return acc;
}, {});
