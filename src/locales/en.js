const en = {
  narrative: {
    phases: {
      boarding: {
        default: {
          0: {
            title: 'Boarding at ${departure}',
            content: 'The smell of jet fuel and coffee fills the cabin as passengers stow their luggage. Outside, the ground crew is prepping for our departure. "Welcome aboard ${callsign}," the flight attendant announces over the PA. The ${aircraft} is ready for the journey to ${arrival}.'
          },
          1: {
            title: 'Final Boarding Call',
            content: 'Passengers are taking their seats. The cabin crew is performing final checks. The captain welcomes everyone aboard. "We have a smooth flight ahead to ${arrival}." The doors will be closing shortly.'
          },
          2: {
            title: 'Pre-flight Checks',
            content: 'Cockpit preparation is underway. Checking fuel, route, and systems. "Boarding complete," the gate agent confirms. The jetway retracts. We are ready to go.'
          }
        },
        sunny: {
            0: {
                title: 'Sunny Departure',
                content: 'Sunlight streams through the windows as passengers board. It\'s a beautiful day for flying. "Welcome to ${callsign}," the crew greets everyone warmly.'
            }
        },
        rainy: {
            0: {
                title: 'Rainy Boarding',
                content: 'Rain drums against the fuselage as passengers hurry on board. "Watch your step," the crew advises. A gray day for a flight to ${arrival}.'
            }
        },
        shakespearean: {
            0: {
                title: 'The Stage is Set',
                content: 'Friends, Romans, countrymen, lend me your ears! We embark upon a journey to ${arrival}. The iron bird awaits its masters.'
            }
        }
      },
      departure_clearance: {
        default: {
          0: {
            title: 'IFR Clearance',
            content: 'The radio crackles. "${callsign}, cleared to ${arrival} via flight plan route. Climb and maintain FL350. Departure frequency 124.7. Squawk 4211." You read back the clearance as the systems come online.'
          },
          1: {
            title: 'Clearance Delivery',
            content: '"${callsign}, ready to copy clearance." "Cleared to ${arrival}, maintain 5000, expect FL350 ten minutes after departure." The pen scratches on the pad. "Readback correct."'
          },
          2: {
            title: 'Route Confirmation',
            content: 'Verifying the route to ${arrival}. "Clearance received," the First Officer nods. Setting up the FMS and checking the squawk code. Ready for pushback.'
          }
        },
        shakespearean: {
            0: {
                title: 'Permission Granted',
                content: 'The gods of the ether have spoken! We are granted passage to the lands of ${arrival}. Let us ascend!'
            }
        }
      },
      pushback: {
        default: {
          0: {
            title: 'Pushback Approved',
            content: 'A gentle jolt as the tug connects. "Ground to Cockpit, brakes released." The terminal building slowly drifts away as you start the engines. The hum of the APU is replaced by the roar of the main turbines.'
          },
          1: {
            title: 'Starting Engines',
            content: '"Pushback complete, set parking brake." "Starting engine 2." The N2 rises, followed by fuel flow and light off. A good start. "Starting engine 1."'
          },
          2: {
            title: 'Better Pushback',
            content: 'The tug pushes us back onto the taxiway. "Clear to start." The engines whine to life. "Tow bar disconnected, hand signals on the left." We are under our own power.'
          }
        },
        rainy: {
            0: {
                title: 'Wet Pushback',
                content: 'Rain streaks the windshield as we push back. The tarmac glistens under the lights. "Engine start approved." The spray kicks up behind us.'
            }
        },
        shakespearean: {
            0: {
                title: 'Backward We Go',
                content: 'We retreat to advance! The beast awakens, breathing fire and smoke. Release us from our tether!'
            }
        }
      },
      taxiing: {
        default: {
          0: {
            title: 'Taxi to Runway ${departureRunway}',
            content: '"${callsign}, taxi to runway ${departureRunway} via Alpha, Bravo." You release the parking brake. The tires thump rhythmically over the concrete joints as you weave through the maze of taxiways. Sunlight glints off the tarmac.'
          },
          1: {
            title: 'Taxi Instructions',
            content: '"Hold short of runway 27L." We taxi past heavy jets. "Give way to the 747 on your right." Proceeding to the holding point. Flaps set for takeoff.'
          },
          2: {
            title: 'On the Move',
            content: 'Rolling out to the active runway. Performing flight control checks. "Cabin crew, prepare for takeoff." The long line of planes awaits departure.'
          }
        },
        sunny: {
            0: {
                title: 'Bright Taxi',
                content: 'The sun is blinding as we taxi. Heat haze shimmers over the runway. "Taxi to holding point." Ready to fly.'
            }
        },
        rainy: {
            0: {
                title: 'Slippery Taxi',
                content: 'Wipers on. The taxiway lights reflect in the puddles. "Caution, braking action reported medium." We taxi carefully to the runway.'
            }
        },
        shakespearean: {
            0: {
                title: 'The March Begins',
                content: 'We march towards destiny! The path is winding, but the destination is clear. To the runway!'
            }
        }
      },
      takeoff_prep: {
        default: {
          0: {
            title: 'Lined Up and Waiting',
            content: 'Lined up on runway ${departureRunway}. Brakes set. Engines at idle. "Tower, ${callsign} holding in position ${departureRunway}, ready for takeoff." Check flaps, trim, and verify takeoff data.'
          },
          1: {
            title: 'Holding Position',
            content: 'Waiting for traffic to clear. "Line up and wait, runway ${departureRunway}." We position on the centerline. The runway stretches out before us.'
          },
          2: {
            title: 'Final Checks',
            content: 'Before takeoff checklist complete. "Approaching departure." Engines stable. "Ready to go?" The captain asks. "Ready," you reply.'
          }
        },
        rookie: {
            title: 'Ready for Takeoff',
            content: 'You are on the runway. Push the throttle forward to take off! Pull back on the stick when you reach speed.'
        },
        shakespearean: {
            0: {
                title: 'The Precipice',
                content: 'We stand upon the edge of the world! The sky beckons. Shall we fly, or shall we fall?'
            }
        }
      },
      takeoff: {
        default: {
          0: {
            title: 'Takeoff Clearance',
            content: 'Lined up on runway ${departureRunway}. "Wind 130 at 8, runway ${departureRunway} cleared for takeoff." Throttles forward. The engines roar to life, pressing you back into the seat. Rotate at Vr.'
          },
          1: {
            title: 'Rolling',
            content: '"Takeoff thrust set." 80 knots. "V1, Rotate." The nose lifts off the ground. We leave the earth behind.'
          },
          2: {
            title: 'Airborne',
            content: 'Full power. The runway blurs. Pulling back. The wheels leave the tarmac. "Positive rate, gear up." We are flying.'
          }
        },
        rookie: {
            title: 'Takeoff!',
            content: 'Full power! Pull up! You are flying!'
        },
        rainy: {
            0: {
                title: 'Wet Takeoff',
                content: 'Spray kicks up from the wheels. Throttles forward. We pierce through the rain and into the clouds.'
            }
        },
        shakespearean: {
            0: {
                title: 'Ascension',
                content: 'We defy gravity! The earth cannot hold us. Up, up, into the heavens!'
            }
        }
      },
      initial_climb: {
        default: {
          0: {
            title: 'Positive Rate',
            content: 'The ground falls away beneath you. "Gear up." Punching through the lower cloud layer into the sunlight. The city of ${departure} shrinks into a miniature grid below. Speed increasing to 250 knots.'
          },
          1: {
            title: 'Climbing Out',
            content: '"Contact Departure." "Climbing to 5000." Flaps up. The view is spectacular. Proceeding on course.'
          },
          2: {
            title: 'Departure',
            content: 'Turning to intercept the radial. "Maintain 250 knots." The airport is far behind us now. Climbing steadily.'
          }
        },
        rookie: {
            title: 'Climbing',
            content: 'Keep climbing! Don\'t go too fast or too slow.'
        },
        sunny: {
            0: {
                title: 'Sunny Climb',
                content: 'Breaking through the haze into brilliant sunshine. The world below is a map. Climbing to cruise.'
            }
        },
        rainy: {
            0: {
                title: 'Cloudy Climb',
                content: 'Entering the clouds. Visibility drops. Flying by instruments. Turbulence shakes the wings.'
            }
        },
        shakespearean: {
            0: {
                title: 'Higher Still',
                content: 'We soar on wings of steel! The clouds are our domain. Higher, ever higher!'
            }
        }
      },
      main_climb: {
        default: {
          0: {
            title: 'Climb to Cruise',
            content: 'Passing 10,000 feet. "Accelerate to cruise speed." The sky darkens to a deeper blue as we ascend. The air is smooth. Climbing steadily to Flight Level 350.'
          },
          1: {
            title: 'Passing FL180',
            content: '"Altimeters standard." The air is thin and cold. The engines are efficient here. Settling in for the long haul.'
          },
          2: {
            title: 'High Altitude',
            content: 'Approaching top of climb. The curve of the earth is visible. "Traffic at 2 o\'clock." We are in the high airways.'
          }
        },
        shakespearean: {
            0: {
                title: 'The Summit',
                content: 'We reach for the stars! The air is thin, but our spirits are high. Onward to the destination!'
            }
        }
      },
      cruise: {
        default: {
          0: {
            title: 'Cruising at FL350',
            content: 'Level at 35,000 feet. The horizon is a curved line of haze. "Maintain Mach 0.78." The engines hum with a steady, reassuring rhythm. Passengers are settling in for the flight to ${arrival}.'
          },
          1: {
            title: 'Smooth Flight',
            content: 'Autopilot is engaged. Monitoring systems. Fuel flow is nominal. "Coffee?" the flight attendant asks. A peaceful journey.'
          },
          2: {
            title: 'Mid-flight',
            content: 'Halfway there. Checking navigation. Waypoints pass by. The sun sets on the horizon, painting the sky in orange and purple.'
          }
        },
        sunny: {
            0: {
                title: 'Clear Skies',
                content: 'Not a cloud in sight. The ground is visible miles below. Perfect flying weather.'
            }
        },
        shakespearean: {
            0: {
                title: 'The Voyage',
                content: 'We sail the ocean of the sky. The wind is our friend. Peace reigns in the heavens.'
            }
        }
      },
      descent: {
        default: {
          0: {
            title: 'Top of Descent',
            content: 'Throttles back. The pitch drops slightly as we begin our descent. "Descend and maintain 10,000 feet." The destination ${arrival} lies ahead.'
          },
          1: {
            title: 'Descending',
            content: '"Cross constraint at 12,000." Spoilers out to slow down. The city lights of ${arrival} appear in the distance. Preparing for arrival.'
          },
          2: {
            title: 'Arrival Prep',
            content: 'Checking arrival ATIS. "Altimeters set." Cabin crew prepare for landing. Descending through the clouds.'
          }
        },
        rainy: {
            0: {
                title: 'Descent into Rain',
                content: 'Descending into the gloom. Rain lashes the windows again. "Expect ILS approach." Radar shows storms ahead.'
            }
        },
        shakespearean: {
            0: {
                title: 'The Return',
                content: 'We descend from our throne! The earth reclaims us. Prepare for the return to the mortal coil.'
            }
        }
      },
      approach: {
        default: {
          0: {
            title: 'Approach to ${arrival}',
            content: 'Lined up for runway ${landingRunway}. "Gear down, flaps 30." The runway threshold looms ahead through the haze. Speed checked, localized captured.'
          },
          1: {
            title: 'Final Approach',
            content: '"Cleared to land." Three greens. Checklist complete. Focusing on the touchdown zone. 1000 feet.'
          },
          2: {
            title: 'Short Final',
            content: '500 feet. Stable approach. "Land check." The runway lights are bright. Almost there.'
          }
        },
        rainy: {
            0: {
                title: 'Stormy Approach',
                content: 'Fighting the crosswind. Wipers on high. The runway appears out of the mist. "Minimums." Continuing.'
            }
        },
        shakespearean: {
            0: {
                title: 'The Landing',
                content: 'The ground rushes to meet us! Steady now, steady. We shall kiss the earth!'
            }
        }
      },
      landing: {
        default: {
          0: {
            title: 'Touchdown',
            content: 'Flare... Touchdown. Spoilers deployed. Reverse thrust roaring. "${callsign}, welcome to ${arrival}." Braking to taxi speed.'
          },
          1: {
            title: 'Landed',
            content: 'Firm touchdown. "Speedbrakes up, reversers normal." Slowing down. "Turn off next taxiway." We made it.'
          },
          2: {
            title: 'Arrival',
            content: 'Greased it. Smooth rollout. "Welcome to ${arrival}." Passengers applaud. Exiting the runway.'
          }
        },
        rainy: {
            0: {
                title: 'Wet Landing',
                content: 'Hydroplaning risk. Firm landing to break the water tension. Spray everywhere. Slowing safely.'
            }
        },
        shakespearean: {
            0: {
                title: 'Safe Return',
                content: 'We have returned! The journey ends. Glory to the pilots!'
            }
        }
      },
      after_land_taxiing: {
        default: {
          0: {
            title: 'Taxi to Gate',
            content: '"Turn left next taxiway, contact Ground." The flight is over. Taxing past other aircraft to our assigned gate.'
          },
          1: {
            title: 'Parking',
            content: 'Cleaning up the aircraft. Flaps up, lights off. Approaching the terminal. The marshaller waves us in.'
          },
          2: {
            title: 'Gate Arrival',
            content: 'Turning into the gate. "Stop." Parking brake set. Engines cooling down. Welcome home.'
          }
        },
        shakespearean: {
            0: {
                title: 'The End',
                content: 'The chariot stops. The journey is done. Rest now, weary travelers.'
            }
        }
      },
      shutoff: {
        default: {
          0: {
            title: 'Engine Shutdown',
            content: 'Parking brake set. Fuel cutoff. The engines spin down into silence. APU off. "Thank you for flying with us." Flight complete.'
          },
          1: {
            title: 'Debrief',
            content: 'Completing the logbook. Passengers disembarking. The aircraft is quiet. Job well done.'
          },
          2: {
            title: 'Shutdown',
            content: 'All systems off. The cockpit goes dark. One last look at the plane. Until next time.'
          }
        },
        shakespearean: {
            0: {
                title: 'Silence',
                content: 'Silence falls. The beast sleeps. Exeunt all.'
            }
        }
      }
    }
  },
  failures: {
    engine: {
      minor: 'Engine ${engineIndex + 1} showing abnormal vibrations. Monitor closely.',
      critical: 'Engine ${engineIndex + 1} FAILED! Immediate action required!',
      resolved: 'Engine ${engineIndex + 1} restored to normal operation.'
    },
    hydraulic: {
      minor: 'Primary hydraulic pressure dropping. Check systems.',
      critical: 'Primary hydraulic system FAILURE! Manual reversion required!',
      resolved: 'Hydraulic pressure stabilized. System restored.'
    },
    electrical: {
      minor: 'Electrical bus ${bus} experiencing intermittent power loss.',
      critical: 'Main electrical bus FAILURE! Emergency power engaged!',
      resolved: 'Electrical bus power restored to normal levels.'
    },
    fuel: {
      minor: 'Fuel imbalance detected. Crossfeed engaged automatically.',
      critical: 'Fuel leak detected! Rapid fuel loss occurring!',
      resolved: 'Fuel imbalance resolved.'
    },
    default: {
      minor: 'System ${type} failure detected.',
      critical: 'System ${type} CRITICAL FAILURE!',
      resolved: 'System ${type} restored.'
    }
  },
  ui: {
    flight: {
        time_zulu: 'Time (Zulu)',
        fuel: 'Fuel',
        pax: 'PAX',
        distance: 'Dist',
        altitude: 'Alt',
        speed: 'Spd',
        heading: 'Hdg',
        vertical_speed: 'V/S',
        throttle: 'THR',
        flaps: 'Flaps',
        gear: 'Gear',
        brakes: 'Brakes',
        parking_brake: 'Park Brk',
        spoilers: 'Spoilers',
        messages: {
            freq_busy: 'Frequency is busy. Please wait.'
        }
    },
    menu: {
        resume: 'Resume Flight',
        restart: 'Restart Scenario',
        settings: 'Settings',
        quit: 'Quit to Main Menu',
        language: 'Language / 语言'
    },
    systems: {
        status: 'System Status',
        engines: 'Engines',
        electrics: 'Electrics',
        hydraulics: 'Hydraulics',
        fuel: 'Fuel',
        apu: 'APU',
        pumps: 'Pumps',
        generators: 'Gens',
        batteries: 'Batteries',
        engine_and_systems: 'ENGINE & SYSTEMS',
        overhead_panel_short: 'OH PNL',
        system_status_alerts: 'SYSTEM STATUS / ALERTS',
        no_active_alerts: 'NO ACTIVE ALERTS',
        on: 'ON',
        off: 'OFF',
        auto: 'AUTO',
        avail: 'AVAIL',
        fault: 'FAULT',
        low_press: 'LOW PRESS',
        open: 'OPEN',
        valve: 'VALVE',
        off_bus: 'OFF BUS',
        discharge: 'DISCHARGE',
        disch: 'DISCH',
        maint: 'MAINT',
        inop: 'INOP'
    },
    startup: {
        checklist_incomplete: 'Startup Checklist Incomplete',
        missing_items: 'Missing items: ${items}',
        cant_proceed: 'Cannot proceed to next phase.',
        continue_anyway: 'Continue Anyway (Disable Safety)',
        continue: 'Continue'
    },
    checklist: {
        title: 'CHECKLIST',
        empty: 'No items in this checklist.',
        completed_suffix: 'COMPLETED'
    },
    flight_computer: {
        title: 'Flight Computer',
        tabs: {
            plan: 'Plan',
            add: 'Add',
            nearest: 'Nearest',
            perf: 'Perf'
        },
        empty: {
            no_waypoints: 'No waypoints in flight plan.'
        },
        add: {
            manual_entry: 'Manual Entry',
            placeholders: {
                lat: 'Lat (e.g. 37.61)',
                lon: 'Lon (e.g. -122.37)',
                label: 'Label (Optional)'
            },
            add_coordinates: 'Add Coordinates',
            or: 'OR'
        },
        search: {
            title: 'Airport Search',
            placeholder: 'Search ICAO/IATA/Name...',
            options: {
                all: 'All',
                normal: 'Normal',
                emergency: 'Emergency'
            },
            submit: 'Search'
        },
        nearest: {
            finding: 'Finding airports...',
            none: 'No airports found.',
            emergency_tag: 'EMERGENCY',
            add: 'Add',
            refresh: 'Refresh'
        },
        actions: {
            hold: 'HOLD',
            holding: 'HOLDING',
            toggle_hold_title: 'Toggle Hold Pattern (Orbit)'
        },
        tags: {
            active: 'ACTIVE'
        },
        radio: {
            nav_title: 'Navigation Radio',
            current_nav1: 'Current NAV1 Frequency',
            set_freq: 'Set Frequency (MHz)',
            tune: 'TUNE',
            common_ils: 'Common ILS Frequencies: 108.10, 108.15, ..., 111.95',
            invalid_freq: 'Invalid Frequency. Must be between 108.00 and 117.95 MHz'
        },
        utils: {
            predictions: 'Predictions',
            next_wp: 'Next Waypoint:',
            distance: 'Distance:',
            ete_to_wpt: 'ETE to WPT:',
            fuel_flow: 'Fuel Flow:',
            time_to_empty: 'Time to Empty:',
            target_alt: 'Target Alt (ft):',
            time_to_alt: 'Time to Alt:',
            converter: {
                title: 'Unit Converter',
                value: 'Value',
                result_label: 'Result:'
            }
        },
        errors: {
            invalid_coordinates: 'Please enter valid coordinates'
        }
    },
    cinematic: {
        confidential: 'CONFIDENTIAL',
        manifest_title: 'FLIGHT MANIFEST',
        official_dispatch: 'OFFICIAL DISPATCH DOCUMENT // ${callsign}',
        date: 'DATE',
        time: 'TIME',
        page: 'PAGE: ${page}',
        sections: {
            flight_data: '01. FLIGHT DATA',
            route_logistics: '02. ROUTE LOGISTICS',
            metar_env: '03. METAR & ENV',
            operational_risk: '04. OPERATIONAL RISK'
        },
        labels: {
            operator: 'OPERATOR',
            aircraft: 'AIRCRAFT',
            origin: 'ORIGIN',
            destination: 'DESTINATION',
            pax_crew: 'PAX/CREW',
            payload: 'PAYLOAD',
            departure_gate: 'DEPARTURE GATE',
            arrival_gate: 'ARRIVAL GATE',
            taxi_out: 'TAXIWAY OUT',
            taxi_in: 'TAXIWAY IN',
            departure_rwy: 'DEPARTURE RWY',
            landing_rwy: 'LANDING RWY',
            sid: 'SID',
            star: 'STAR',
            waypoints: 'WAYPOINTS:'
        },
        buttons: {
            acknowledge: 'ACKNOWLEDGE DISPATCH'
        }
    },
    narrative_ui: {
        designation: 'DESIGNATION:',
        background: 'BACKGROUND:',
        mission: 'MISSION:',
        intelligence: 'INTELLIGENCE:',
        accept_assignment: 'ACCEPT ASSIGNMENT'
    },
    crash: {
        crashed: 'CRASHED',
        final_score: 'Final Score: ${score}',
        failed_control: 'You failed to maintain control of the aircraft',
        try_again: 'Try Again'
    },
    comm: {
        active_comm: 'ACTIVE COMM',
        no_signal: 'No Signal',
        searching: 'Searching...',
        tabs: {
            log: 'LOG',
            signals: 'SIGNALS'
        },
        no_signals: 'No signals detected',
        radio_silent: 'Radio silent',
        connected: 'Connected'
    }
  },
  initialization: {
    title: 'Aviation Intercept - Flight Initialization',
    subtitle: 'Configure your flight parameters and select difficulty level',
    steps: {
      1: '01. OPERATIONAL LEVEL & INTEL',
      2: '02. FLIGHT PARAMETERS',
      3: '03. ROUTE SELECTION'
    },
    difficulty: {
      rookie: 'ROOKIE',
      amateur: 'AMATEUR',
      intermediate: 'INTERMEDIATE',
      advanced: 'ADVANCED',
      pro: 'PRO',
      devil: 'DEVIL'
    },
    intel: {
      label: 'CREW INTELLIGENCE:',
      descriptions: {
        rookie: 'Highly supportive. NPCs assist with all checks. Standard procedures strictly followed.',
        amateur: 'Experienced crew. Reliable support during significant events. NPC will assist.',
        intermediate: 'Standard operations. Crew follows leads and executes commands precisely.',
        advanced: 'Competent but prone to hesitation or minor errors under high-stress conditions.',
        pro: 'High stress. Crew acts nervously and is prone to significant mistakes during emergencies.',
        devil: 'Independent priorities. Active deviation from procedures possible. Do not rely on assistance.'
      }
    },
    params: {
      airline: 'AIRLINE',
      callsign: 'CALLSIGN',
      aircraft_type: 'AIRCRAFT TYPE',
      crew_count: 'CREW COUNT',
      passengers: 'PASSENGERS (PAX)',
      payload: 'PAYLOAD (KG)',
      cruise_height: 'CRUISE HEIGHT (FT)',
      reserve_fuel: 'RESERVE FUEL (HOURS)',
      zulu_time: 'ZULU TIME',
      season: 'SEASON',
      seasons: {
        Spring: 'SPRING',
        Summer: 'SUMMER',
        Autumn: 'AUTUMN',
        Winter: 'WINTER'
      },
      random: 'RANDOM'
    },
    route: {
      departure: 'DEPARTURE AIRPORT',
      arrival: 'ARRIVAL AIRPORT',
      search_placeholder: 'SEARCH ICAO/IATA...',
      clear_selection: 'Clear selection',
      results_count: '${count} airports found',
      summary: {
        route: 'ROUTE:',
        distance: 'DISTANCE:',
        est_time: 'EST. TIME:',
        fuel_req: 'FUEL REQ:',
        trip: 'TRIP',
        rsv: 'RSV',
        total: 'TOTAL'
      }
    },
    buttons: {
      next_params: 'NEXT: FLIGHT PARAMETERS →',
      next_route: 'NEXT: ROUTE SELECTION →',
      finalize: 'FINALIZE DISPATCH & INITIALIZE',
      randomize_difficulty: 'Randomize Difficulty',
      randomize_parameters: 'Randomize Parameters',
      randomize_route: 'Randomize Route'
    }
  }
};

export default en;
