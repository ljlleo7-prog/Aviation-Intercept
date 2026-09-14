import React, { useState, useEffect, useCallback } from 'react';

// Import modular components
import CrashWarningFlash from './CrashWarningFlash';
import CrashPanel from './CrashPanel';
import DraggableJoystick from './DraggableJoystick';
import ThrustManager from './ThrustManager';
import ModernAutopilotModule from './ModernAutopilotModule';
import CommunicationModule from './CommunicationModule';
import FlightPosePanel from './FlightPosePanel';
import NavigationPanel from './NavigationPanel';
import BoeingRadar from './radar/BoeingRadar';
import AirbusRadar from './radar/AirbusRadar';
import CentralPanel from './CentralPanel';
import ControlSurfacePanel from './ControlSurfacePanel';
import OverheadPanel from './OverheadPanel';
import RudderPedal from './RudderPedal';
import Sidebar from './Sidebar';
import SaveLoadPanel from './SaveLoadPanel';
import TimerPanel from './TimerPanel';
import FMCPanel from './fmc/FMCPanel';
import ChecklistPanel from './ChecklistPanel';
import SystemStatusPanel from './SystemStatusPanel';
import CircuitBreakerPanel from './CircuitBreakerPanel';
import SensoryFeedback from './SensoryFeedback';
import SettingsPanel from './SettingsPanel';
import FMA from './autoflight/FMA.jsx';
import AircraftMainPanelReplica from './AircraftMainPanelReplica.jsx';
import { useLanguage } from '../contexts/LanguageContext';
import './FlightPanel.css';

const FlightPanelModular = ({ flightData, physicsState, physicsService, weatherData, onActionRequest, aircraftModel, aircraftData, selectedArrival, flightPlan, radioMessages, onRadioFreqChange, npcs, frequencyContext, currentRegion, timeScale, setTimeScale, onUpdateFlightPlan, availableRunways, startupStatus, playerSettings, playerSettingsError, autoSaveStatus, onUpdatePlayerSettings, ilsRunwayOptions = [] }) => {
  const { t } = useLanguage();
  const isAirbus = ((aircraftModel || '').toLowerCase().includes('a3') || (aircraftModel || '').toLowerCase().includes('airbus'));
  const efisFontClass = isAirbus ? 'efis-font-airbus' : 'efis-font-boeing';
  const efisFontFamily = isAirbus ? 'Courier New, monospace' : 'monospace';
  const resolvedTrueAirspeed = Number.isFinite(flightData?.trueAirspeed)
    ? flightData.trueAirspeed
    : (Number.isFinite(flightData?.derived?.trueAirspeed) ? flightData.derived.trueAirspeed : 450);
  const resolvedGroundSpeed = Number.isFinite(flightData?.groundSpeed)
    ? flightData.groundSpeed
    : (Number.isFinite(flightData?.derived?.groundSpeed) ? flightData.derived.groundSpeed : 430);
  const resolvedIndicatedAirspeed = Number.isFinite(flightData?.indicatedAirspeed)
    ? flightData.indicatedAirspeed
    : (Number.isFinite(flightData?.derived?.indicatedAirspeed)
        ? flightData.derived.indicatedAirspeed
        : (Number.isFinite(flightData?.airspeed) ? flightData.airspeed : 280));
  // Use flightData from parent component instead of creating own physics service
  const [showOverhead, setShowOverhead] = useState(false);
  const [showCircuitBreakers, setShowCircuitBreakers] = useState(false);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState(null);

  const [flightState, setFlightState] = useState({
    // Navigation
    heading: flightData?.heading ?? 270,
    trueAirspeed: resolvedTrueAirspeed,
    groundSpeed: resolvedGroundSpeed,
    indicatedAirspeed: resolvedIndicatedAirspeed,
    latitude: (flightData && flightData.position && typeof flightData.position.latitude === 'number') ? flightData.position.latitude : 0,
    longitude: (flightData && flightData.position && typeof flightData.position.longitude === 'number') ? flightData.position.longitude : 0,
    radioFreq: 121.5,
    
    // Flight Pose
    pitch: flightData?.pitch ?? 2.5,
    roll: flightData?.roll ?? 0.5,
    verticalSpeed: flightData?.verticalSpeed ?? 1200,
    altitude: flightData?.altitude ?? 35000,
    altimeter: 29.92,
    localQNH: weatherData?.pressureInHg || 29.92,
    
    // Engine
    engineN1: [85.2, 85.1],
    engineN2: [95.3, 95.2],
    engineEGT: [650, 645],
    engineFuelFlow: [0, 0],
    fuel: 8500,
    
    // Systems
    hydraulicPressure: 3000,
    circuitBreakers: {
      engine1: true,
      engine2: true,
      hydraulics: true,
      electrical: true,
      instruments: true
    },
    alarms: [], // FIXED: Initialize alarms as empty array
    activeWarnings: [],
    
    // Autopilot
    autopilot: true,
    autopilotMode: flightData?.autopilotMode || 'LNAV',
    flightDirector: true,
    altitudeHold: true,
    headingHold: true,
    autopilotTargets: {
      ias: 280,
      vs: 1200,
      altitude: 35000
    },
    autopilotFma: flightData?.autopilot?.fma || null,
    derived: flightData?.derived ?? null,
    environment: flightData?.environment ?? {},

    // Surface Controls State
    flapsPosition: 'up',
    gearPosition: 'up',
    airBrakesPosition: 'up',
    
    // Central Display
    flightPhase: 'CRUISE',
    physicsActive: false, // New: Track physics state
    currentNarrative: null, // New: Track narrative
    nextWaypoint: 'WPT3',
    distanceToWaypoint: 125.4,
    timeToWaypoint: 18.2,
    
    // Crash Detection
    crashWarning: null,
    timeToCrash: null,
    hasCrashed: false,
    frame: flightData?.frame ?? 0
  });
  
  // Update flightState when flightData changes
  useEffect(() => {
    if (flightData) {
      setFlightState(prevState => {
        const nextState = {
          ...prevState,
          // Navigation
          heading: flightData.heading ?? prevState.heading,
          trueAirspeed: resolvedTrueAirspeed,
          groundSpeed: resolvedGroundSpeed,
          indicatedAirspeed: resolvedIndicatedAirspeed,
          radioFreq: prevState.radioFreq,
          latitude: (flightData && flightData.position && typeof flightData.position.latitude === 'number') ? flightData.position.latitude : prevState.latitude,
          longitude: (flightData && flightData.position && typeof flightData.position.longitude === 'number') ? flightData.position.longitude : prevState.longitude,

          // Flight Pose
          pitch: flightData.pitch ?? 0,
          roll: flightData.roll ?? 0,
          verticalSpeed: flightData.verticalSpeed ?? 0,
          altitude: flightData.altitude ?? 0,
          altimeter: prevState.altimeter,
          localQNH: (weatherData && typeof weatherData.pressureInHg === 'number') ? weatherData.pressureInHg : (prevState.localQNH || 29.92),
          terrainElevation: (flightData.derived && typeof flightData.derived.terrain_elevation_ft === 'number') ? flightData.derived.terrain_elevation_ft : (prevState.terrainElevation || 0),
          visibility: weatherData?.visibility,

          // Engine
          engineN1: Array.isArray(flightData.engineN1)
            ? flightData.engineN1
            : (Array.isArray(flightData.engineParams?.n1) ? flightData.engineParams.n1 : prevState.engineN1),
          engineN2: Array.isArray(flightData.engineN2)
            ? flightData.engineN2
            : (Array.isArray(flightData.engineParams?.n2) ? flightData.engineParams.n2 : prevState.engineN2),
          engineEGT: Array.isArray(flightData.engineEGT)
            ? flightData.engineEGT
            : (Array.isArray(flightData.engineParams?.egt) ? flightData.engineParams.egt : prevState.engineEGT),
          engineFuelFlow: Array.isArray(flightData.engineFuelFlow)
            ? flightData.engineFuelFlow
            : (Array.isArray(flightData.engineParams?.fuelFlow) ? flightData.engineParams.fuelFlow : (prevState.engineFuelFlow || [0, 0])),
          fuel: flightData.fuel ?? prevState.fuel,
          throttle: typeof flightData.controls?.throttle === 'number' ? flightData.controls.throttle : prevState.throttle,
          engineThrottles: Array.isArray(flightData.engineThrottles)
            ? flightData.engineThrottles
            : (Array.isArray(flightData.controls?.throttles) ? flightData.controls.throttles : prevState.engineThrottles),

          // Systems
          hydraulicPressure: flightData.hydraulicPressure ?? prevState.hydraulicPressure,
          oilPressure: (Array.isArray(flightData.engineParams?.oilPressure) && flightData.engineParams.oilPressure.length > 0)
              ? Math.min(...flightData.engineParams.oilPressure)
              : (flightData.systems?.engines?.left?.oilPressure ?? 45),
          electricalVoltage: flightData.systems?.electrical?.acVolts ?? 115,
          circuitBreakers: prevState.circuitBreakers,
          alarms: flightData.alarms ?? prevState.alarms,
          activeWarnings: flightData.activeWarnings ?? [],

          // Scene State
          physicsActive: flightData.physicsActive,
          currentNarrative: flightData.narrativeHistory && flightData.narrativeHistory.length > 0
            ? flightData.narrativeHistory[flightData.narrativeHistory.length - 1]
            : prevState.currentNarrative,
          flightPhase: flightData.phaseName || prevState.flightPhase,

          // Surface controls
          flapsValue: flightData.flapsValue,
          gearValue: flightData.gearValue,
          flaps: (typeof flightData.flaps === 'number') ? flightData.flaps : (flightData.flapsValue || 0),
          gearDown: (typeof flightData.gear === 'boolean') ? flightData.gear : (flightData.gearValue > 0.5),
          airBrakesValue: flightData.airBrakesValue,
          wheelBrakesValue: typeof flightData.wheelBrakesValue === 'number' ? flightData.wheelBrakesValue : prevState.wheelBrakesValue,
          trimValue: typeof flightData.trimValue === 'number' ? flightData.trimValue : prevState.trimValue,

          // Autopilot - Update from physics service status
          autopilot: flightData.autopilotEngaged === true,
          autopilotMode: flightData.autopilotMode ?? prevState.autopilotMode ?? 'LNAV',
          autopilotDebug: flightData.autopilotDebug ?? {},
          approachTelemetry: flightData.approachTelemetry ?? null,
          flightDirector: prevState.flightDirector,
          altitudeHold: prevState.altitudeHold,
          headingHold: prevState.headingHold,
          autopilotTargets: flightData.autopilotTargets ?? prevState.autopilotTargets,
          autopilotFma: flightData.autopilot?.fma ?? prevState.autopilotFma ?? null,
          frame: typeof flightData.frame === 'number' ? flightData.frame : prevState.frame,
          systems: flightData.systems ?? prevState.systems ?? {},
          currentWaypointIndex: flightData.currentWaypointIndex !== undefined ? flightData.currentWaypointIndex : (prevState.currentWaypointIndex || 0),
          navigationPath: Array.isArray(flightData.navigationPath)
            ? flightData.navigationPath
            : (Array.isArray(flightData.navigation?.navigationPath) ? flightData.navigation.navigationPath : prevState.navigationPath || []),
          derived: flightData.derived ?? prevState.derived ?? null,
          environment: flightData.environment ?? prevState.environment ?? {}
        };

        return nextState;
      });
    }
  }, [flightData, weatherData]);
  
  const [flashActive, setFlashActive] = useState(false);
  const [flashText, setFlashText] = useState('');
  const [showCrashPanel, setShowCrashPanel] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const alertCooldown = 3000;

  // Handle crash warnings and alerts
  useEffect(() => {
    let warningMsg = null;
    
    // Priority 1: Crash
    if (flightData?.crashWarning) {
        warningMsg = flightData.crashWarning;
    } 
    // Priority 2: Flashing Warnings (Re-enabled for critical incidents)
    else if (flightData?.activeWarnings) {
        const flashWarning = flightData.activeWarnings.find(w => w.isFlashing);
        if (flashWarning) {
            warningMsg = flashWarning.message;
        }
    }

    if (!warningMsg) {
      return;
    }
    const now = Date.now();
    if (now - lastAlertTime < alertCooldown) {
      return;
    }
    setFlashText(warningMsg);
    setFlashActive(true);
  }, [flightData?.crashWarning, flightData?.activeWarnings, lastAlertTime]);

  const handleAlertComplete = useCallback(() => {
    setFlashActive(false);
    setLastAlertTime(Date.now());
  }, []);

  useEffect(() => {
    if (flightData?.hasCrashed) {
      setShowCrashPanel(true);
    }
  }, [flightData?.hasCrashed]);

  // Control functions - Updated to use parent's physics service
  const controlPitch = (amount) => {
    if (onActionRequest) {
      onActionRequest('pitch', amount);
    }
  };

  const controlRoll = (amount) => {
    if (onActionRequest) {
      onActionRequest('roll', amount);
    }
  };

  const controlYaw = (amount) => {
    if (onActionRequest) {
      onActionRequest('yaw', amount);
    }
  };

  const controlThrust = (engineIndex, throttleValue) => {
    // ✅ CLEAN ARCHITECTURE: Pass throttle in 0-1 range to parent
    console.log('📡 FlightPanelModular: Thrust control:', {
      engineIndex,
      throttleValue,
      percentage: (throttleValue * 100).toFixed(1) + '%'
    });
    
    if (onActionRequest) {
      onActionRequest('throttle', throttleValue, engineIndex); // Already in 0-1 range
    }
  };

  const toggleAutopilot = () => {
    if (onActionRequest) {
      onActionRequest('toggle-autopilot');
    }
  };

  const setAutopilotTargets = (targets) => {
    if (onActionRequest) {
      onActionRequest('set-autopilot-targets', targets);
    }
  };

  const setAutopilotMode = (mode) => {
    if (onActionRequest) {
      onActionRequest('set-autopilot-mode', mode);
    }
  };

  const setILSRunway = (airportCode, runwayName) => {
    if (onActionRequest) {
      onActionRequest('set-ils-runway', { airportCode, runwayName });
    }
  };

  const controlFlaps = (position) => {
    if (onActionRequest) {
      onActionRequest('flaps', position);
    }
  };

  const controlAirBrakes = (position) => {
    if (onActionRequest) {
      onActionRequest('airBrakes', position);
    }
  };

  const controlWheelBrakes = (position) => {
    if (onActionRequest) {
      onActionRequest('wheelBrakes', position);
    }
  };

  const controlGear = (position) => {
    if (onActionRequest) {
      onActionRequest('gear', position);
    }
  };

  const resetFlight = () => {
    // TODO: Implement control through parent component
    console.log('Reset flight requested');
    
    // Call parent's reset function to roll back to flight initiation
    if (onActionRequest) {
      onActionRequest('reset-to-initiation');
    }
  };

  const handleSystemAction = (system, action, value) => {
    if (onActionRequest) {
      onActionRequest('system-action', { system, action, value });
    }
  };

  const handleSidebarToggle = (panelId) => {
    if (panelId === 'inspect') {
      if (onActionRequest) {
        onActionRequest('toggle-debug', { target: 'physics' });
      }
      setActiveSidebarPanel(prev => prev === panelId ? null : panelId);
    } else {
      setActiveSidebarPanel(prev => prev === panelId ? null : panelId);
    }
  };

  const handleLoadFlight = (data) => {
    if (onActionRequest) {
      onActionRequest('load-flight', data);
    }
    setActiveSidebarPanel(null);
  };

  // Main render function
  const renderContent = () => {
    // PHY-OFF INTERFACE (Immersive Narrative Mode)
    // Show this mode if physics is off OR if we are in a narrative-heavy phase (like Boarding)
    const isNarrativePhase = ['BOARDING', 'DEPARTURE_CLEARANCE'].includes(flightState.flightPhase);
    
    if (!flightState.physicsActive && !showOverhead) {
      return React.createElement('div', { 
        className: 'immersive-mode',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%',
          background: 'radial-gradient(circle at center, #1a1a2e 0%, #000000 100%)',
          color: '#e6e6e6',
          padding: '40px',
          boxSizing: 'border-box',
          position: 'relative' // For absolute positioning of buttons
        }
      },
        // Animation Styles
        React.createElement('style', null, `
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `),

        // Systems Access Button (OH PNL)
        React.createElement('button', {
          onClick: () => setShowOverhead(true),
          style: {
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '10px 20px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #4ade80',
            color: '#4ade80',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            zIndex: 1000,
            transition: 'all 0.2s'
          },
          onMouseEnter: (e) => { e.target.style.background = 'rgba(74, 222, 128, 0.2)'; },
          onMouseLeave: (e) => { e.target.style.background = 'rgba(0, 0, 0, 0.6)'; }
        }, "SYSTEMS [OH PNL]"),
        
        // Narrative Container
        React.createElement('div', {
          style: {
            maxWidth: '800px',
            textAlign: 'center',
            marginBottom: '40px',
            animation: 'fadeIn 1s ease-out'
          }
        },
          React.createElement('h1', {
            style: {
              fontSize: '3rem',
              marginBottom: '20px',
              color: '#4ade80',
              textShadow: '0 0 20px rgba(74, 222, 128, 0.3)'
            }
          }, t(flightState.currentNarrative?.title, flightState.currentNarrative?.data) || flightState.flightPhase),
          React.createElement('p', {
            style: {
              fontSize: '1.5rem',
              lineHeight: '1.6',
              color: '#cbd5e1'
            }
          }, t(flightState.currentNarrative?.content, flightState.currentNarrative?.data) || "Awaiting instructions...")
        ),

        // Communication Module (Immersive Style)
        React.createElement('div', {
          style: {
            width: '100%',
            maxWidth: '600px',
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '30px'
          }
        },
          React.createElement(CommunicationModule, {
            flightState,
            setRadioFreq: (freq) => {
              setFlightState(prev => ({ ...prev, radioFreq: freq }));
              if (onRadioFreqChange) onRadioFreqChange(freq);
            },
            flightPlan,
            radioMessages,
            frequencyContext,
            currentRegion,
            immersiveMode: true
          })
        ),
        
        // Skip/Continue Button
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('button', {
            onClick: () => {
              if (onActionRequest) onActionRequest('skip-phase');
            },
            style: {
              padding: '12px 30px',
              background: 'transparent',
              border: '1px solid #4ade80',
              color: '#4ade80',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              letterSpacing: '2px',
              transition: 'all 0.3s ease',
              opacity: 0.8,
              textTransform: 'uppercase'
            },
            onMouseEnter: (e) => {
              e.target.style.background = 'rgba(74, 222, 128, 0.1)';
              e.target.style.opacity = 1;
              e.target.style.boxShadow = '0 0 15px rgba(74, 222, 128, 0.2)';
            },
            onMouseLeave: (e) => {
              e.target.style.background = 'transparent';
              e.target.style.opacity = 0.8;
              e.target.style.boxShadow = 'none';
            }
          }, `${t('ui.startup.continue') || 'CONTINUE'} ►`),

          // Startup Requirements Tooltip
          startupStatus && startupStatus.missingItems && startupStatus.missingItems.length > 0 &&
          React.createElement('div', {
            style: {
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: '0',
              background: 'rgba(17, 24, 39, 0.95)',
              border: '1px solid #ef4444',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#d1d5db',
              whiteSpace: 'nowrap',
              zIndex: 100,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
              minWidth: '200px'
            }
          },
            React.createElement('div', { style: { fontWeight: 'bold', marginBottom: '6px', color: '#ef4444', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', paddingBottom: '4px' } }, `⚠️ ${t('ui.startup.checklist_incomplete') || 'STARTUP REQUIRED'}`),
            startupStatus.missingItems.map(item => React.createElement('div', { key: item, style: { marginBottom: '2px', display: 'flex', alignItems: 'center' } }, 
               React.createElement('span', { style: { color: '#ef4444', marginRight: '6px' } }, '×'),
               item // Items like 'engines' might need translation too, but let's stick to narrative for now
            ))
          )
        )
      );
    }

    // PHY-ON INTERFACE (Simulation Mode)
    return React.createElement('div', { className: 'modern-cockpit' },
      // Narrative Overlay REMOVED as requested (using Head Bar instead)

      // Top Row: Autopilot + Comm
      React.createElement('div', { 
        style: { 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '8px',
          width: '100%',
          alignItems: 'stretch'
        } 
      },
        React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
          minWidth: 0
        }
      },
        React.createElement(FMA, { fma: flightState.autopilotFma }),
        React.createElement(ModernAutopilotModule, {
          flightState,
          setAutopilotTargets,
          toggleAutopilot,
          setAutopilotMode,
          setAltimeter: (val) => setFlightState(prev => ({ ...prev, altimeter: val })),
          frequencyContext, // Pass frequency context for ILS availability
          efisFontFamily,
          availableRunways,
          selectedArrival,
          setILSRunway
        })
      ),
        React.createElement(CommunicationModule, {
          flightState,
          setRadioFreq: (freq) => {
            setFlightState(prev => ({ ...prev, radioFreq: freq }));
            if (onRadioFreqChange) onRadioFreqChange(freq);
          },
          flightPlan,
          radioMessages,
          frequencyContext,
          currentRegion
        })
      ),
      
      // Three parallel panels
      React.createElement(AircraftMainPanelReplica, { aircraftModel, flightState, flightPlan, className: efisFontClass },
        // Flight Pose Panel (Left)
        React.createElement(FlightPosePanel, { flightState, efisFontFamily }),

        // Navigation Panel (Middle)
        React.createElement(isAirbus ? AirbusRadar : BoeingRadar, { flightState, selectedArrival, flightPlan, npcs, weatherData, efisFontFamily }),

        // Central Panel (Right)
        React.createElement(CentralPanel, {
          flightState,
          aircraftModel,
          efisFontFamily,
          onToggleSystems: () => setShowOverhead(prev => !prev),
          onToggleBreakers: () => setShowCircuitBreakers(prev => !prev)
        })
      ),
      
      // Manual controls at bottom
      React.createElement('div', { className: 'manual-controls' },
        // Joystick & Rudder Group
        React.createElement('div', { 
          className: 'control-group-stick',
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }
        },
          React.createElement(DraggableJoystick, { controlPitch, controlRoll, flightState }),
          React.createElement(RudderPedal, { controlYaw, flightState })
        ),
        React.createElement('div', { className: 'thrust-manager-wrapper' },
          React.createElement(ThrustManager, { controlThrust, flightState, onSystemAction: handleSystemAction })
        ),
        React.createElement(ControlSurfacePanel, {
          controlFlaps,
          controlGear,
          controlAirBrakes,
          controlWheelBrakes,
          controlTrim: (payload) => onActionRequest('trim', payload),
          controlNavFrequency: (payload) => onActionRequest('set-nav-frequency', payload),
          flightState,
          aircraftModel,
          ilsRunwayOptions
        })
      )
    );
  };

  return React.createElement('div', { className: 'modern-flight-panel', style: { userSelect: 'none', display: 'flex', flexDirection: 'row', gap: '10px', padding: 0 } },
    
    // Sidebar (Leftmost)
    React.createElement(Sidebar, { activePanel: activeSidebarPanel, onTogglePanel: handleSidebarToggle }),

    // Flight Computer Panel Overlay
    activeSidebarPanel === 'flight_computer' && React.createElement(FMCPanel, {
      onClose: () => setActiveSidebarPanel(null),
      flightPlan: flightPlan,
      onUpdateFlightPlan: onUpdateFlightPlan,
      weatherData: weatherData,
      aircraftModel: aircraftModel,
      aircraftData: aircraftData
    }),

    // Timer Panel Overlay
    activeSidebarPanel === 'timer' && React.createElement(TimerPanel, {
        timeScale,
        setTimeScale,
        flightData,
        flightPlan,
        onClose: () => setActiveSidebarPanel(null)
    }),

    // Checklist Panel Overlay
    activeSidebarPanel === 'checklist' && React.createElement(ChecklistPanel, {
        onClose: () => setActiveSidebarPanel(null),
        physicsState: physicsState,
        flightState: flightState
    }),
    
    // Save & Load Panel Overlay
    activeSidebarPanel === 'save_load' && React.createElement(SaveLoadPanel, {
        flightData,
        physicsState,
        physicsService,
        flightPlan,
        weatherData,
        aircraftModel,
        onClose: () => setActiveSidebarPanel(null),
        onLoadFlight: handleLoadFlight
    }),

    activeSidebarPanel === 'settings' && React.createElement(SettingsPanel, {
        settings: playerSettings,
        settingsError: playerSettingsError,
        autoSaveStatus,
        onUpdateSettings: onUpdatePlayerSettings,
        onClose: () => setActiveSidebarPanel(null)
    }),

    // System Status Panel Overlay
    activeSidebarPanel === 'systems' && React.createElement('div', {
        style: {
            position: 'absolute',
            top: '60px',
            left: '80px',
            width: '350px',
            height: '400px',
            backgroundColor: 'rgba(20, 24, 30, 0.95)',
            border: '1px solid #444',
            borderRadius: '8px',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }
    }, [
        React.createElement('div', {
            key: 'header',
            style: {
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '5px',
                borderBottom: '1px solid #333'
            }
        }, React.createElement('button', {
            onClick: () => setActiveSidebarPanel(null),
            style: {
                background: 'none',
                border: 'none',
                color: '#aaa',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0 5px'
            }
        }, '×')),
        React.createElement('div', {
            key: 'content',
            style: { flex: 1, overflow: 'hidden' }
        }, React.createElement(SystemStatusPanel, {
            flightState: flightState
        }))
    ]),

    // Main Content Area (Wrapped in a div to take remaining width)
    React.createElement('div', { style: { flex: 1, position: 'relative', padding: '20px' } },

      // Overhead Panel Overlay
      showOverhead && React.createElement(OverheadPanel, {
        onClose: () => setShowOverhead(false),
        flightState,
        onSystemAction: handleSystemAction,
        aircraftModel: aircraftModel,
        aircraftData: aircraftData
      }),

      // Circuit Breaker Panel Overlay
      showCircuitBreakers && React.createElement(CircuitBreakerPanel, {
        onClose: () => setShowCircuitBreakers(false)
      }),
      
      // Sensory Feedback Overlay (Always active for effects)
      React.createElement(SensoryFeedback),

      // Crash warning flash
      React.createElement(CrashWarningFlash, { flashActive, flashText, onAlertComplete: handleAlertComplete }),
      
      // Crash panel (if crashed)
      React.createElement(CrashPanel, { showCrashPanel, resetFlight }),

      // Debug frame panel
      React.createElement('div', {
        style: {
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          padding: '6px 10px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: '#0f0',
          fontSize: '12px',
          borderRadius: '4px',
          zIndex: 1000
        }
      }, `Frame: ${flightState.frame !== undefined ? flightState.frame : 0}`),
      
      // Render Content based on Mode
      renderContent()
    )
  );
};

export default FlightPanelModular;
