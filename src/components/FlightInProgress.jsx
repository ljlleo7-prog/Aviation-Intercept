import React, { useRef, useState, useEffect, useMemo, startTransition } from 'react';
import { useAircraftPhysics } from '../hooks/useAircraftPhysics';
import { useLanguage } from '../contexts/LanguageContext';
import { updateWeather } from '../services/weatherService';
import { realWeatherService } from '../services/RealWeatherService';
import { terrainService } from '../services/TerrainService';
import { terrainRadarService } from '../services/TerrainRadarService';
import { airportService } from '../services/airportService';
import weatherConfig from '../config/weatherConfig.json';
import FlightPanelModular from './FlightPanelModular';
import DebugPhysicsPanel from './DebugPhysicsPanel';
import FailureDebugPanel from './FailureDebugPanel';
import sceneManager from '../services/sceneManager.js';
import eventBus from '../services/eventBus';
import { getRunwayHeading } from '../utils/routeGenerator';
import {
  appendApproachTelemetrySample,
  buildApproachTelemetrySample,
  summarizeApproachTelemetry
} from '../utils/approachTelemetry.js';
import RadioActionPanel from './RadioActionPanel';
import { atcManager } from '../services/ATCLogic';
import { initializeATCPhraseologyTemplates } from '../data/atcResponseDatabase';
import { npcService } from '../services/NPCService';
import { regionControlService } from '../services/RegionControlService';
import { checkStartupRequirements, StartupPhases } from '../services/StartupChecklist';
import { Checklists } from '../services/ChecklistData.js';
import { evaluateNormalChecklist, resolveAbnormalChecklist } from '../services/autoflight/NPCChecklistService.js';
import { buildNPCSystemSnapshot, formatNPCSystemReport } from '../services/autoflight/NPCReportingService.js';
import { aviationInterceptService } from '../services/aviationIntercept/AviationInterceptService.js';
import { npcCrewService } from '../services/NPCCrewService';
import CrewPanel from './CrewPanel';
import TutorialOverlay from './TutorialOverlay';
import MultiplayerTrafficPanel from './MultiplayerTrafficPanel.jsx';
import usePhysicsMotionControl from '../hooks/flight/usePhysicsMotionControl.js';
import useEventBusSubscriptions from '../hooks/flight/useEventBusSubscriptions.js';
import useStartupChecklist from '../hooks/flight/useStartupChecklist.js';
import useAutoCloudSave from '../hooks/flight/useAutoCloudSave.js';
import { multiplayerSessionService } from '../services/multiplayer/MultiplayerSessionService.js';
import { trafficSyncService } from '../services/multiplayer/TrafficSyncService.js';
import { playerSettingsService } from '../services/playerSettingsService.js';
import { getNPCDifficultyProfile, getNPCResponseDelay, shouldNPCIntroduceNoise } from '../services/autoflight/NPCDifficultyProfile.js';
import { getNPCQuickCommands, parseNPCCommand } from '../services/autoflight/NPCCommandService.js';
import { NPCOrderStatus, createNPCOrder, summarizeNPCOrder, transitionNPCOrder } from '../services/autoflight/NPCOrderService.js';

const FlightInProgress = ({
  callsign,
  aircraftModel,
  difficulty,
  selectedDeparture,
  selectedArrival,
  initialDeparture, // New prop
  flightPlan,
  airline,
  pax,
  payload,
  fuelReserve,
  cruiseHeight,
  useRandomTime,
  timeZulu,
  useRandomSeason,
  season,
  handleResetFlight,
  formatDistance,
  formatFlightTime,
  formatFuel,
  weatherData,
  setWeatherData,
  failureType,
  crewCount,
  physicsModel = 'realistic',
  routeDetails,
  isTutorial = false,
  activeTutorial = null,
  activeChallenge = null,
  onTutorialClose,
  offlineMode = false
}) => {


  const averagePassengerWeight = 90;
  const averageCrewWeight = 90;
  // Parse inputs safely as they might be strings from the initialization form
  const safePax = parseInt(pax) || 0;
  const safeCrew = parseInt(crewCount) || 0;
  const safePayload = parseFloat(payload) || 0;
  const safeCruiseHeight = parseInt(cruiseHeight) || 0;

  const totalPassengerWeight = safePax * averagePassengerWeight;
  const totalCrewWeight = safeCrew * averageCrewWeight;
  const additionalPayloadWeight = safePayload;
  const totalPayloadWeight = totalPassengerWeight + totalCrewWeight + additionalPayloadWeight;
  const flightPlanFuelWeight = flightPlan && flightPlan.fuel && typeof flightPlan.fuel.totalFuel === 'number'
    ? flightPlan.fuel.totalFuel
    : 0;
  const activeScenario = activeChallenge || activeTutorial || null;
  const scenarioSpawnPreset = activeScenario?.launchConfig?.spawnPreset || null;
  const scenarioRestrictions = activeScenario?.launchConfig?.restrictions || {};
  const isScenarioMode = Boolean(activeScenario);
  const isDirectScenarioMode = isTutorial || Boolean(activeChallenge);

  const offsetPointFromReference = React.useCallback((reference, headingDeg, distanceNm) => {
    if (!reference || !Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)) {
      return null;
    }

    const distanceMeters = (distanceNm || 0) * 1852;
    const headingRad = headingDeg * Math.PI / 180;
    const metersPerLat = 111111;
    const metersPerLon = 111111 * Math.cos(reference.latitude * Math.PI / 180);

    return {
      latitude: reference.latitude + (distanceMeters * Math.cos(headingRad)) / metersPerLat,
      longitude: reference.longitude + (distanceMeters * Math.sin(headingRad)) / metersPerLon
    };
  }, []);

  // Calculate initial heading from runway
  const runwayName = (routeDetails?.departureRunway) || (flightPlan?.departure?.runways?.[0]?.name) || '36L';
  const isEastward = selectedArrival && selectedDeparture ? selectedArrival.longitude > selectedDeparture.longitude : null;
  const departureRunwayGeometry = React.useMemo(() => {
    const airportCode = initialDeparture?.iata || initialDeparture?.icao;
    if (!airportCode || !runwayName) return null;
    return airportService.getRunwayGeometry(airportCode, runwayName);
  }, [initialDeparture, runwayName]);

  const baseRunwayHeadingDeg = departureRunwayGeometry?.heading ?? getRunwayHeading(runwayName, isEastward);

  const scenarioSpawn = useMemo(() => {
    if (!isScenarioMode || !scenarioSpawnPreset) {
      return null;
    }

    const departureCode = selectedDeparture?.iata || selectedDeparture?.icao;
    const arrivalCode = selectedArrival?.iata || selectedArrival?.icao;
    const departureRunwayName = (routeDetails?.departureRunway) || (flightPlan?.departure?.runways?.[0]?.name) || '36L';
    const arrivalRunwayName = (routeDetails?.landingRunway) || (flightPlan?.arrival?.runways?.[0]?.name);
    const departureGeometry = departureCode && departureRunwayName === runwayName && departureRunwayGeometry
      ? departureRunwayGeometry
      : (departureCode ? airportService.getRunwayGeometry(departureCode, departureRunwayName) : null);
    const arrivalGeometry = arrivalCode && arrivalRunwayName ? airportService.getRunwayGeometry(arrivalCode, arrivalRunwayName) : null;

    if (scenarioSpawnPreset.type === 'runway' && departureGeometry?.thresholdStart) {
      const runwayPoint = offsetPointFromReference(
        departureGeometry.thresholdStart,
        departureGeometry.heading,
        0.054
      );

      return {
        latitude: runwayPoint?.latitude ?? departureGeometry.thresholdStart.latitude,
        longitude: runwayPoint?.longitude ?? departureGeometry.thresholdStart.longitude,
        heading: scenarioSpawnPreset.heading ?? departureGeometry.heading,
        altitude: scenarioSpawnPreset.altitude,
        speed: scenarioSpawnPreset.speed
      };
    }

    if (scenarioSpawnPreset.type === 'departure-airborne' && departureGeometry?.thresholdStart) {
      const airbornePoint = offsetPointFromReference(
        departureGeometry.thresholdStart,
        departureGeometry.heading,
        scenarioSpawnPreset.distanceNm || 8
      );

      return {
        latitude: airbornePoint?.latitude ?? departureGeometry.thresholdStart.latitude,
        longitude: airbornePoint?.longitude ?? departureGeometry.thresholdStart.longitude,
        heading: scenarioSpawnPreset.heading ?? departureGeometry.heading,
        altitude: scenarioSpawnPreset.altitude ?? 9000,
        speed: scenarioSpawnPreset.speed ?? 240
      };
    }

    if (scenarioSpawnPreset.type === 'approach-final' && arrivalGeometry?.thresholdStart) {
      const reciprocalHeading = (arrivalGeometry.heading + 180) % 360;
      const finalPoint = offsetPointFromReference(
        arrivalGeometry.thresholdStart,
        reciprocalHeading,
        scenarioSpawnPreset.distanceNm || 10
      );

      return {
        latitude: finalPoint?.latitude ?? arrivalGeometry.thresholdStart.latitude,
        longitude: finalPoint?.longitude ?? arrivalGeometry.thresholdStart.longitude,
        heading: scenarioSpawnPreset.heading ?? arrivalGeometry.heading,
        altitude: scenarioSpawnPreset.altitude ?? 3000,
        speed: scenarioSpawnPreset.speed ?? 180
      };
    }

    if (scenarioSpawnPreset.type === 'enroute-midpoint' && selectedDeparture && selectedArrival) {
      const midpoint = {
        latitude: (selectedDeparture.latitude + selectedArrival.latitude) / 2,
        longitude: (selectedDeparture.longitude + selectedArrival.longitude) / 2
      };
      const heading = scenarioSpawnPreset.heading ?? departureGeometry?.heading ?? baseRunwayHeadingDeg;

      return {
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        heading,
        altitude: scenarioSpawnPreset.altitude ?? 20000,
        speed: scenarioSpawnPreset.speed ?? 280
      };
    }

    return null;
  }, [
    isScenarioMode,
    scenarioSpawnPreset,
    selectedDeparture,
    selectedArrival,
    routeDetails,
    flightPlan,
    departureRunwayGeometry,
    runwayName,
    baseRunwayHeadingDeg,
    offsetPointFromReference
  ]);

  let runwayHeadingDeg = baseRunwayHeadingDeg;
  let runwayHeadingRad = runwayHeadingDeg * Math.PI / 180;

  // Calculate Spawn Position (Runway Threshold)
  let initialLat = scenarioSpawn?.latitude ?? initialDeparture?.latitude ?? 37.6188;
  let initialLon = scenarioSpawn?.longitude ?? initialDeparture?.longitude ?? -122.3750;

  if (scenarioSpawn) {
      runwayHeadingDeg = Number.isFinite(scenarioSpawn.heading) ? scenarioSpawn.heading : runwayHeadingDeg;
      runwayHeadingRad = runwayHeadingDeg * Math.PI / 180;
  } else if (initialDeparture && runwayName) {
      // Try to get runway geometry to spawn at the threshold
      // Pass the airport code (IATA or ICAO)
      const airportCode = initialDeparture.iata || initialDeparture.icao;
      if (airportCode) {
          const geom = departureRunwayGeometry || airportService.getRunwayGeometry(airportCode, runwayName);
          if (geom && geom.thresholdStart) {
              console.log(`Spawn Point Adjusted to Runway ${runwayName} Threshold:`, geom.thresholdStart);
              initialLat = geom.thresholdStart.latitude;
              initialLon = geom.thresholdStart.longitude;
              runwayHeadingDeg = Number.isFinite(geom.heading) ? geom.heading : runwayHeadingDeg;
              runwayHeadingRad = runwayHeadingDeg * Math.PI / 180;

              // Apply 100m offset along runway geometry heading to prevent spawn jitter at the exact threshold
              // 1 deg Lat ~= 111,111m
              // 1 deg Lon ~= 111,111m * cos(lat)
              const offsetMeters = 100;
              const metersPerLat = 111111;
              const metersPerLon = 111111 * Math.cos(initialLat * Math.PI / 180);

              const dLat = (offsetMeters * Math.cos(runwayHeadingRad)) / metersPerLat;
              const dLon = (offsetMeters * Math.sin(runwayHeadingRad)) / metersPerLon;

              initialLat += dLat;
              initialLon += dLon;
          }
      }
  }

  const activeRouteWaypoints = (Array.isArray(routeDetails?.waypoints) && routeDetails.waypoints.length > 0)
    ? routeDetails.waypoints
    : (Array.isArray(flightPlan?.waypoints) ? flightPlan.waypoints : []);

  const aircraftConfig = useMemo(() => ({
    aircraftModel,
    payloadWeight: totalPayloadWeight,
    fuelWeight: flightPlanFuelWeight,
    cruiseHeight,
    windSpeedKts: weatherData && typeof weatherData.windSpeed === 'number'
      ? weatherData.windSpeed
      : 0,
    windDirection: weatherData?.windDirection ?? 0,
    initialLatitude: initialLat,
    initialLongitude: initialLon,
    initialHeading: scenarioSpawn?.heading ?? runwayHeadingDeg,
    airportElevation: initialDeparture?.elevation || 0,
    initialAltitude: scenarioSpawn?.altitude,
    initialSpeed: scenarioSpawn?.speed,
    flightPlan: activeRouteWaypoints,
    departure: selectedDeparture,
    arrival: selectedArrival,
    departureRunway: (routeDetails?.departureRunway) || (flightPlan?.departure?.runways?.[0]?.name),
    arrivalRunway: (routeDetails?.landingRunway) || (flightPlan?.arrival?.runways?.[0]?.name),
    difficulty: difficulty,
    failureType: failureType,
    scenarioRestrictions,
    scenarioMode: isScenarioMode
  }), [
    aircraftModel,
    totalPayloadWeight,
    flightPlanFuelWeight,
    cruiseHeight,
    weatherData,
    initialLat,
    initialLon,
    runwayHeadingDeg,
    initialDeparture?.elevation,
    isTutorial,
    routeDetails,
    flightPlan,
    selectedDeparture,
    selectedArrival,
    difficulty,
    failureType,
    scenarioRestrictions,
    isScenarioMode
  ]);
  const {
    flightData,
    physicsState,
    isInitialized,
    error,
    isCrashed,
    updatePhysics,
    setThrottle,
    setPitch,
    setRoll,
    setYaw,
    setFlaps,
    setAirBrakes,
    setWheelBrakes,
    setGear,
    setTrim,
    performSystemAction,
    setEnvironment,
    physicsService,
    setTimeScale,
    timeScale,
    updateFlightPlan,
    setEngineThrottle,
    setMotionEnabled
  } = useAircraftPhysics(aircraftConfig, false, physicsModel);

  const formatNumber = (value, digits = 0, suffix = '') => (
    Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '---'
  );

  const overlayTelemetryRef = useRef({
    heading: 0,
    latitude: initialLat,
    longitude: initialLon,
    altitude_ft: 0,
    indicatedAirspeed: 0,
    groundSpeed: 0
  });

  useEffect(() => {
    const next = overlayTelemetryRef.current;

    if (Number.isFinite(flightData?.derived?.heading)) next.heading = flightData.derived.heading;
    if (Number.isFinite(flightData?.position?.latitude)) next.latitude = flightData.position.latitude;
    if (Number.isFinite(flightData?.position?.longitude)) next.longitude = flightData.position.longitude;
    if (Number.isFinite(flightData?.derived?.altitude_ft)) next.altitude_ft = flightData.derived.altitude_ft;
    else if (Number.isFinite(flightData?.altitude)) next.altitude_ft = flightData.altitude;
    if (Number.isFinite(flightData?.indicatedAirspeed)) next.indicatedAirspeed = flightData.indicatedAirspeed;
    if (Number.isFinite(flightData?.derived?.groundSpeed)) next.groundSpeed = flightData.derived.groundSpeed;
    else if (Number.isFinite(flightData?.groundSpeed)) next.groundSpeed = flightData.groundSpeed;
  }, [flightData, initialLat, initialLon]);

  // Control state for UI components
  const { language, t } = useLanguage();
  const [, setThrottleControl] = useState(0); // Initialize at IDLE
  const [commandInput, setCommandInput] = useState('');
  const [radioMessages, setRadioMessages] = useState([]);
  const [npcOrders, setNpcOrders] = useState([]);
  const [currentFreq, setCurrentFreq] = useState(121.500);
  const [useRealWeather] = useState(true);
  const [sceneState, setSceneState] = useState(
    isDirectScenarioMode
      ? {
          scenarioId: null,
          status: activeChallenge ? 'challenge' : 'tutorial',
          phaseId: null,
          phaseName: activeChallenge ? 'Challenge' : 'Tutorial',
          phaseType: null,
          elapsedInPhase: 0,
          totalElapsed: 0,
          physicsActive: true,
          activeFailures: [],
          completedPhases: [],
          lastCommand: null,
          takeoffClearanceReceived: true,
          narrativeHistory: []
        }
      : sceneManager.getState()
  );
  const lastSceneStateRef = useRef(sceneState);
  const isInitializedRef = useRef(isInitialized);
  const updatePhysicsRef = useRef(updatePhysics);
  const physicsServiceRef = useRef(physicsService);
  const physicsStateRef = useRef(physicsState);
  const [narrative, setNarrative] = useState(null);
  const [activeFailures, setActiveFailures] = useState(sceneState?.activeFailures || []);
  const npcProfile = useMemo(() => getNPCDifficultyProfile(difficulty), [difficulty]);
  const npcQuickCommands = useMemo(() => getNPCQuickCommands(), []);

  const appendCrewMessage = React.useCallback((content, overrides = {}) => {
    const payload = {
      sender: overrides.sender || 'Copilot',
      content,
      timestamp: Date.now(),
      stress: overrides.stress,
      role: overrides.role || 'FO'
    };
    eventBus.publish(eventBus.Types.NPC_CREW_MESSAGE, payload);
    return payload;
  }, []);

  const getChecklistContext = React.useCallback((checklistId) => {
    if (checklistId === 'ENG START' || checklistId === 'ENGINE_START') {
      return checkStartupRequirements(
        StartupPhases.ENGINE_START,
        physicsState?.systems,
        physicsState?.systems?.engines || physicsState?.engines
      );
    }

    return checkStartupRequirements(
      StartupPhases.POWER_UP,
      physicsState?.systems,
      physicsState?.systems?.engines || physicsState?.engines
    );
  }, [physicsState]);

  const [phaseName, setPhaseName] = useState('');
  const [showDebugPhysics, setShowDebugPhysics] = useState(false);
  const [showFailurePanel, setShowFailurePanel] = useState(false);
  const [isChannelBusy, setIsChannelBusy] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [currentRegion, setCurrentRegion] = useState(null);
  const [multiplayerStatus, setMultiplayerStatus] = useState({
    label: 'Offline',
    detail: 'Supabase auth and namespace session required.'
  });
  const [remoteTraffic, setRemoteTraffic] = useState([]);
  const [playerSettings, setPlayerSettings] = useState(playerSettingsService.defaults);
  const [playerSettingsError, setPlayerSettingsError] = useState(null);
  const [playerSettingsLoaded, setPlayerSettingsLoaded] = useState(false);
  const [activeFlightPlan, setActiveFlightPlan] = useState(flightPlan);
  const [autoSaveStatus, setAutoSaveStatus] = useState({
    isSaving: false,
    lastSavedAt: null,
    saveError: null
  });
  useEffect(() => {
    if (offlineMode) {
      setPlayerSettings(playerSettingsService.defaults);
      setPlayerSettingsError(null);
      setPlayerSettingsLoaded(true);
      return;
    }

    let isMounted = true;

    const loadPlayerSettings = async () => {
      const { data, error } = await playerSettingsService.getPlayerSettings();
      if (!isMounted) {
        return;
      }

      if (data) {
        setPlayerSettings(data);
      }
      setPlayerSettingsError(error?.message ?? null);
      setPlayerSettingsLoaded(true);
    };

    loadPlayerSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePlayerSettingsChange = async (patch) => {
    if (offlineMode) {
      const nextSettings = {
        ...playerSettings,
        ...patch
      };
      setPlayerSettings(nextSettings);
      setPlayerSettingsError(null);
      return;
    }

    const nextSettings = {
      ...playerSettings,
      ...patch
    };

    setPlayerSettings(nextSettings);
    const { data, error } = await playerSettingsService.updatePlayerSettings(nextSettings);

    if (data) {
      setPlayerSettings(data);
    }
    setPlayerSettingsError(error?.message ?? null);
  };

  const autoSaveMeta = useAutoCloudSave({
    enabled: !offlineMode && playerSettings.autoSaveEnabled,
    intervalMinutes: playerSettings.autoSaveIntervalMinutes,
    isInitialized: !offlineMode && isInitialized && playerSettingsLoaded && !isDirectScenarioMode,
    flightData,
    physicsState,
    physicsService,
    flightPlan: activeFlightPlan,
    weatherData,
    aircraftModel,
    onSaveStateChange: setAutoSaveStatus
  });

  useEffect(() => {
    setAutoSaveStatus(prev => ({
      ...prev,
      lastSavedAt: autoSaveMeta.lastSavedAt,
      saveError: autoSaveMeta.saveError,
      isSaving: autoSaveMeta.isSaving
    }));
  }, [autoSaveMeta.isSaving, autoSaveMeta.lastSavedAt, autoSaveMeta.saveError]);

  useEffect(() => {
    if (!isDirectScenarioMode) {
      return;
    }

    setNarrative(null);
    setPhaseName(activeChallenge ? 'Challenge' : 'Tutorial');
    setActiveFailures([]);
    const scenarioSceneState = {
      scenarioId: activeScenario?.id || null,
      status: activeChallenge ? 'challenge' : 'tutorial',
      phaseId: null,
      phaseName: activeChallenge ? 'Challenge' : 'Tutorial',
      phaseType: null,
      elapsedInPhase: 0,
      totalElapsed: 0,
      physicsActive: true,
      activeFailures: [],
      completedPhases: [],
      lastCommand: null,
      takeoffClearanceReceived: true,
      narrativeHistory: []
    };
    lastSceneStateRef.current = scenarioSceneState;
    setSceneState(scenarioSceneState);
  }, [isDirectScenarioMode, activeChallenge, activeScenario]);

  useEffect(() => {
    initializeATCPhraseologyTemplates();
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupMultiplayer = async () => {
      if (isDirectScenarioMode || offlineMode) {
        setMultiplayerStatus({ label: 'Offline', detail: offlineMode ? 'Offline mode enabled.' : 'Scenario mode active.' });
        return;
      }

      const namespaceKey = import.meta.env.VITE_MULTIPLAYER_NAMESPACE || 'legacy';
      const gate = await multiplayerSessionService.canUseMultiplayer();
      if (!mounted) {
        return;
      }

      if (!gate.ok) {
        setMultiplayerStatus({ label: 'Offline', detail: gate.reason });
        return;
      }

      const sessionCode = `${(selectedDeparture?.iata || selectedDeparture?.icao || 'DEP')}-${(selectedArrival?.iata || selectedArrival?.icao || 'ARR')}`;
      const result = await multiplayerSessionService.createOrJoinSession({
        namespaceKey,
        sessionCode,
        role: 'pilot',
        callsign,
        aircraftType: aircraftModel,
        scenarioConfig: {
          departure: selectedDeparture?.iata || selectedDeparture?.icao || null,
          arrival: selectedArrival?.iata || selectedArrival?.icao || null,
          difficulty,
          failureType
        }
      });

      if (!mounted) {
        return;
      }

      if (result.error) {
        setMultiplayerStatus({ label: 'Unavailable', detail: result.error.message || 'Failed to create multiplayer session.' });
        return;
      }

      const session = result.data;
      const connection = await trafficSyncService.connect({
        namespaceKey: session.namespaceKey,
        sessionId: session.sessionId,
        userId: gate.user.id,
        callsign,
        aircraftType: aircraftModel,
        role: session.role || 'pilot'
      });

      if (!mounted) {
        return;
      }

      if (!connection.connected) {
        setMultiplayerStatus({ label: 'Disconnected', detail: 'Realtime channel unavailable.' });
        return;
      }

      setMultiplayerStatus({
        label: 'Live traffic',
        detail: `${session.namespaceKey} / ${session.sessionCode}`
      });
    };

    setupMultiplayer();

    const unsubscribeTraffic = eventBus.subscribe(eventBus.Types.MULTIPLAYER_TRAFFIC_UPDATED, (payload) => {
      setRemoteTraffic(payload?.traffic || []);
    });

    const unsubscribeStatus = eventBus.subscribe(eventBus.Types.MULTIPLAYER_STATUS_CHANGED, (payload) => {
      if (payload?.status === 'left') {
        setRemoteTraffic([]);
        setMultiplayerStatus({ label: 'Offline', detail: 'Multiplayer session closed.' });
      }
    });

    return () => {
      mounted = false;
      unsubscribeTraffic?.();
      unsubscribeStatus?.();
      trafficSyncService.disconnect();
      multiplayerSessionService.leaveCurrentSession().catch(() => {});
    };
  }, [isDirectScenarioMode, offlineMode, callsign, aircraftModel, difficulty, failureType, selectedDeparture, selectedArrival]);

  const submitRadioTransmission = (messageDataOrText, type, templateId, params, senderOverride) => {
    // Check if channel is busy
    if (atcManager.isBusy(currentFreq)) {
        setRadioMessages(prev => [...prev, {
            sender: 'System',
            text: '[FREQUENCY BUSY]',
            timestamp: Date.now(),
            type: 'system'
        }]);
        return false;
    }

    let messageText, messageType, messageTemplateId, messageParams, messageSender;

    // Handle both object (from RadioActionPanel) and legacy string arguments
    if (typeof messageDataOrText === 'object' && messageDataOrText !== null) {
        messageText = messageDataOrText.text;
        messageType = messageDataOrText.type;
        messageTemplateId = messageDataOrText.templateId;
        messageParams = messageDataOrText.params;
        messageSender = messageDataOrText.sender;
    } else {
        messageText = messageDataOrText;
        messageType = type;
        messageTemplateId = templateId;
        messageParams = params;
        messageSender = senderOverride;
    }

    // Add pilot/copilot message
    const freqType = getFrequencyType(currentFreq);
    const newMessage = {
      sender: messageSender || callsign,
      text: messageText,
      timestamp: Date.now(),
      type: messageType || 'transmission',
      templateId: messageTemplateId,
      params: messageParams,
      frequency: freqType
    };

    setRadioMessages(prev => [...prev, newMessage]);

    // Process with ATC Logic
    const context = {
        callsign: callsign,
        altitude: Math.round(flightData?.altitude ?? 0),
        heading: Math.round(flightData?.heading ?? 0),
        weather: weatherData,
        frequencyType: freqType,
        language,
        phaseOfFlight: sceneState.phaseType,
        difficulty
    };

    atcManager.processMessage(
        { type: messageType, templateId: messageTemplateId, params: messageParams, text: messageText },
        context,
        (response) => {
            setRadioMessages(prev => [...prev, { ...response, frequency: freqType }]);

            if (messageTemplateId === 'req_takeoff') {
                console.log('🛫 Takeoff Clearance Received - Triggering Event');
                eventBus.publish('atc.clearance.takeoff', {
                    timestamp: Date.now(),
                    runway: messageParams?.runway
                });
            }
        }
    );

    return true;
  };

  // Radio Message Handler
  const handleRadioTransmit = (messageDataOrText, type, templateId, params) => {
    submitRadioTransmission(messageDataOrText, type, templateId, params);
  };

  // Startup Checklist Logic (advisory-only)
  const [startupStatus, setStartupStatus] = useState({
    canContinue: true,
    missingItems: []
  });
  const [approachTelemetrySamples, setApproachTelemetrySamples] = useState([]);
  const approachTelemetry = summarizeApproachTelemetry(approachTelemetrySamples);
  const { startupStatus: quickStartupStatus } = useStartupChecklist(difficulty, physicsState?.systems);

  usePhysicsMotionControl({
    motionController: setMotionEnabled,
    phaseType: sceneState.phaseType,
    takeoffClearanceReceived: sceneState.takeoffClearanceReceived,
    isInitialized,
    isTutorial,
    onParkedPhaseChange: (isParkedPhase) => {
      if (physicsService?.setGroundMode) {
        physicsService.setGroundMode(isParkedPhase);
      }
    }
  });

  useEffect(() => {
    if (!physicsState || !physicsState.systems) return;

    // Only enforce for Pro/Devil modes
    if (difficulty !== 'pro' && difficulty !== 'devil') {
        if (startupStatus.missingItems.length > 0) {
            setStartupStatus({ canContinue: true, missingItems: [] });
        }
        return;
    }

    if (quickStartupStatus && quickStartupStatus.items?.length > 0) {
        const quickMissingItems = quickStartupStatus.items.filter(item => !item.complete).map(item => item.name);
        if (!quickStartupStatus.complete && sceneState.phaseType === 'boarding') {
            const nextQuickStatus = { canContinue: true, missingItems: quickMissingItems };
            if (JSON.stringify(nextQuickStatus) !== JSON.stringify(startupStatus)) {
                setStartupStatus(nextQuickStatus);
            }
            return;
        }
    }

    let phaseToCheck = null;
    const currentPhaseType = sceneState.phaseType;

    // Map phases to checklist requirements
    // Scene 1: Boarding/Pre-flight -> Power Up
    if (currentPhaseType === 'boarding' || currentPhaseType === 'takeoff_prep' || currentPhaseType === 'departure_clearance') {
        // Note: takeoff_prep is usually just before takeoff, but if we start cold & dark,
        // we might be in boarding.
        phaseToCheck = StartupPhases.POWER_UP;
    } 
    // Scene 2: Pushback -> Engine Start
    else if (currentPhaseType === 'pushback') {
        phaseToCheck = StartupPhases.ENGINE_START;
    }

    if (phaseToCheck) {
        const result = checkStartupRequirements(
          phaseToCheck,
          physicsState.systems,
          physicsState.systems?.engines || physicsState.engines
        );
        const advisoryStatus = { canContinue: true, missingItems: result.missingItems };

        // Only update state if changed to avoid render loops
        if (JSON.stringify(advisoryStatus) !== JSON.stringify(startupStatus)) {
            setStartupStatus(advisoryStatus);
        }
    } else {
        if (startupStatus.missingItems.length > 0) {
            setStartupStatus({ canContinue: true, missingItems: [] });
        }
    }
  }, [physicsState, sceneState.phaseType, difficulty]);

  useEffect(() => {
    setApproachTelemetrySamples([]);
  }, [callsign, aircraftModel, selectedArrival?.iata, selectedArrival?.icao, routeDetails?.landingRunway, flightPlan?.arrival?.runways?.[0]?.name]);

  useEffect(() => {
    const sample = buildApproachTelemetrySample({ ils: flightData?.autopilotDebug?.ils, timestamp: Date.now() });
    setApproachTelemetrySamples(prev => appendApproachTelemetrySample(prev, sample));
  }, [flightData?.autopilotDebug?.ils]);

  // Sync prop flightPlan to state if it changes (e.g. reset)
  useEffect(() => {
    // Only update if the plan actually changed content-wise to prevent object identity loops
    setActiveFlightPlan(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(flightPlan)) {
            return flightPlan;
        }
        return prev;
    });
  }, [flightPlan]);
  
  // Handle Flight Plan Update
   const handleUpdateFlightPlan = (newPlan) => {
     console.log("📝 Flight Plan Updated:", newPlan);

     let updatedPlanObject;
     if (Array.isArray(newPlan)) {
         updatedPlanObject = {
             ...(activeFlightPlan || {}),
             waypoints: newPlan
         };
     } else {
         updatedPlanObject = newPlan;
     }

     setActiveFlightPlan(updatedPlanObject);

     if (updateFlightPlan) {
         const activePlanForPhysics = Array.isArray(updatedPlanObject?.fms?.activePlan?.waypoints)
           ? {
               ...updatedPlanObject,
               waypoints: updatedPlanObject.fms.activePlan.waypoints,
               currentWaypointIndex: updatedPlanObject.fms.currentWaypointIndex ?? updatedPlanObject.currentWaypointIndex ?? 0
             }
           : updatedPlanObject;
         updateFlightPlan(activePlanForPhysics);
     }
   };
  
  const lastNpcUpdateRef = React.useRef(Date.now());
  const lastRegionUpdateRef = React.useRef(0);

  const getFrequencyType = (freq) => {
    const f = parseFloat(freq);
    const alt = flightData?.altitude || 0;
    const lat = flightData?.position?.latitude;
    const lon = flightData?.position?.longitude;

    // Check Region Control Frequency first
    if (currentRegion && Math.abs(f - parseFloat(currentRegion.frequency)) < 0.005) {
        return 'CENTER';
    }

    // High Altitude Logic (> 5000ft)
    if (alt > 5000) {
        if (Math.abs(f - 121.5) < 0.1) return 'GUARD';
        return 'UNICOM'; 
    }

    // Dynamic Airport Frequency Check
    if (lat && lon) {
        // Find nearest airport within 20nm
        const nearbyAirports = airportService.getAirportsWithinRadius(lat, lon, 20);
        if (nearbyAirports.length > 0) {
            // Sort by distance to prioritize the closest one
            nearbyAirports.sort((a, b) => {
                const distA = airportService.calculateDistance({ latitude: lat, longitude: lon }, a);
                const distB = airportService.calculateDistance({ latitude: lat, longitude: lon }, b);
                return distA - distB;
            });

            const nearest = nearbyAirports[0];
            if (nearest.frequencies) {
                const matchedFreq = nearest.frequencies.find(freqObj => 
                    Math.abs(f - freqObj.frequency) < 0.005 // Stricter tolerance for specific freqs
                );
                
                if (matchedFreq) {
                    return matchedFreq.type.toUpperCase();
                }
            }
        }
    }

    // Low Altitude Logic (Standard/Fallback)
    if (Math.abs(f - 118.0) < 0.1) return 'TOWER';
    if (Math.abs(f - 121.9) < 0.1) return 'GROUND';
    if (Math.abs(f - 121.5) < 0.1) return 'GUARD';
    if (Math.abs(f - 119.0) < 0.1) return 'CENTER';
    return 'UNICOM';
  };

  // NPC Update Loop
  useEffect(() => {
    if (!flightData || !flightData.position) return;
    
    const now = Date.now();
    let dt = (now - lastNpcUpdateRef.current) / 1000;
    lastNpcUpdateRef.current = now;

    // Cap dt to prevent huge jumps after pause/lag
    if (dt > 1.0) dt = 0.016;
    
    // Sync busy state
    const busy = atcManager.isBusy(currentFreq);
    if (busy !== isChannelBusy) {
        setIsChannelBusy(busy);
    }

    // Update Region Info (every 5 seconds or if not set)
    if (!currentRegion || now - lastRegionUpdateRef.current > 5000) {
        if (flightData.position) {
             const region = regionControlService.getRegionInfo(flightData.position.latitude, flightData.position.longitude);
             console.log('Region Update:', region);
             setCurrentRegion(region);
             lastRegionUpdateRef.current = now;
        }
    }

    // Update NPCs
    // Use timeScale for acceleration
    const effectiveDt = dt * (timeScale || 1);
    const messages = npcService.update(effectiveDt, flightData.position, { atcManager }); // Pass ATC context for channel blocking checks
    setNpcs([...npcService.npcs]); // Update state for radar

    // Update ATC Logic (Proactive & ATIS)
    const freqType = getFrequencyType(currentFreq);
    const freqInfo = {
        frequency: currentFreq,
        type: freqType,
        station: freqType === 'CENTER' && currentRegion ? currentRegion.name : freqType
    };

    atcManager.update(effectiveDt, {
        altitude: flightData.altitude,
        verticalSpeed: flightData.verticalSpeed,
        callsign: callsign,
        weather: weatherData,
        weatherData,
        language
    }, freqInfo, (msg) => {
        setRadioMessages(prev => [...prev, { ...msg, frequency: freqType }]);
    });

    if (messages.length > 0) {
        // Handle incoming NPC messages
        messages.forEach(msg => {
            setRadioMessages(prev => [...prev, msg]);
        });
    }
  }, [flightData.frame, flightData.position]);

  useEventBusSubscriptions(eventBus, {
    [eventBus.Types.NARRATIVE_UPDATE]: (payload) => {
      setNarrative(payload);
    },
    [eventBus.Types.CRITICAL_MESSAGE]: (payload) => {
      setNarrative(payload);
    },
    [eventBus.Types.PHASE_CHANGED]: (payload) => {
      const phase = payload?.phase;
      setPhaseName(phase?.name || '');
      if (phase?.narrative) {
        setNarrative(phase.narrative);
      }
    },
    [eventBus.Types.FAILURE_OCCURRED]: () => {
      const state = sceneManager.getState();
      setActiveFailures(state.activeFailures);
    },
    [eventBus.Types.FAILURE_RESOLVED]: () => {
      const state = sceneManager.getState();
      setActiveFailures(state.activeFailures);
    },
    [eventBus.Types.PHYSICS_INITIALIZE]: (payload) => {
      const initialConditions = payload?.initialConditions;
      const hasDestructiveInitFields = Boolean(
        initialConditions && (
          initialConditions.position !== undefined ||
          initialConditions.velocity !== undefined ||
          initialConditions.orientation !== undefined ||
          initialConditions.latitude !== undefined ||
          initialConditions.longitude !== undefined ||
          initialConditions.altitude !== undefined ||
          initialConditions.speed !== undefined ||
          initialConditions.flightPlan !== undefined ||
          initialConditions.difficulty !== undefined ||
          initialConditions.coldStart !== undefined
        )
      );

      if (physicsService && typeof physicsService.setInitialConditions === 'function' && hasDestructiveInitFields) {
        physicsService.setInitialConditions(initialConditions);
      } else if (physicsService && initialConditions) {
        if (initialConditions.throttle !== undefined) {
          physicsService.controls.throttle = initialConditions.throttle;
          if (Array.isArray(physicsService.controls.engineThrottles)) {
            physicsService.controls.engineThrottles.fill(initialConditions.throttle);
          }
          physicsService.engines?.forEach(engine => engine.setThrottle(initialConditions.throttle));
        }
        if (initialConditions.brakes !== undefined) {
          const brakeValue = Math.max(0, Math.min(1, initialConditions.brakes));
          physicsService.controls.wheelBrakes = brakeValue;
          if (physicsService.systems?.brakes) {
            physicsService.systems.brakes.parkingBrake = brakeValue > 0.1;
          }
        }
        if (initialConditions.airBrakes !== undefined) {
          physicsService.controls.airBrakes = initialConditions.airBrakes;
        }
        if (initialConditions.gear !== undefined) {
          physicsService.controls.gear = initialConditions.gear ? 1 : 0;
        }
      }

      if (physicsService && typeof physicsService.updateAutopilotTargets === 'function') {
        const targets = {};
        if (payload?.targetAltitude !== undefined) {
          targets.altitude = payload.targetAltitude;
        }
        if (payload?.targetSpeed !== undefined) {
          targets.speed = payload.targetSpeed;
        }
        if (Object.keys(targets).length > 0) {
          physicsService.updateAutopilotTargets(targets);
        }
      }
    }
  });

  useEffect(() => {
    if (!isInitialized || !physicsState || !setGear || !setFlaps) return;

    const autopilotDebug = physicsState.autopilotDebug || {};
    const ilsDebug = autopilotDebug.ils || {};
    const ilsActive = autopilotDebug.mode === 'ILS' && ilsDebug.active;
    const distAlongFt = Number.isFinite(ilsDebug.distAlong) ? ilsDebug.distAlong : Infinity;
    const altitudeAglFt = Number.isFinite(physicsState?.derived?.altitude_agl_ft)
      ? physicsState.derived.altitude_agl_ft
      : Infinity;
    const gearDown = physicsState?.gear === true || physicsState?.controls?.gear > 0.5;
    const flapValue = Number.isFinite(physicsState?.flaps)
      ? physicsState.flaps
      : (Number.isFinite(physicsState?.controls?.flaps) ? physicsState.controls.flaps : 0);
    const landingConfigGate = ilsActive && distAlongFt <= 6076 && altitudeAglFt <= 3000 && altitudeAglFt >= 80;
    const landingFlapsTarget = 0.83;

    if (!landingConfigGate) return;
    if (!gearDown) setGear(true);
    if (flapValue < landingFlapsTarget - 0.05) setFlaps(landingFlapsTarget);
  }, [isInitialized, physicsState, setGear, setFlaps]);

  useEffect(() => {
    let interval;

    if (useRealWeather) {
       const fetchRealWeather = async () => {
         const svc = physicsServiceRef.current;
         const lat = svc?.state?.geo?.lat || initialDeparture?.latitude || 37.6188;
         const lon = svc?.state?.geo?.lon || initialDeparture?.longitude || -122.3750;
         
         try {
             const data = await realWeatherService.getWeather(lat, lon);
             // Only update if data changed (deep comparison would be better, but simplified check helps)
             setWeatherData(prev => {
                 if (JSON.stringify(prev) !== JSON.stringify(data)) {
                     console.log("🌦️ Real Weather Updated:", data);
                     if (setEnvironment) setEnvironment(data);
                     return data;
                 }
                 return prev;
             });
         } catch (e) {
             console.error("❌ Real Weather Fetch Failed", e);
         }
       };
       
       fetchRealWeather();
       interval = setInterval(fetchRealWeather, 5 * 60 * 1000); // Update every 5 minutes
    } else {
        interval = setInterval(() => {
          setWeatherData(prevWeatherData => {
            const updated = updateWeather(prevWeatherData, weatherConfig.atisUpdateIntervalMinutes);
            if (setEnvironment) setEnvironment(updated);
            return updated;
          });
        }, weatherConfig.atisUpdateIntervalMinutes * 60 * 1000);
    }

    return () => clearInterval(interval);
  }, [useRealWeather, offlineMode, setEnvironment]); // physicsServiceRef used inside to always read live position

  // Terrain update effect
  useEffect(() => {
    const fetchTerrain = async () => {
       if (!physicsService || !physicsService.state || !physicsService.state.geo) return;

       const { lat, lon } = physicsService.state.geo;

       try {
           const radarEleFt = terrainRadarService.getTerrainHeight(lat, lon);

           if (radarEleFt !== null) {
               physicsService.terrainElevation = radarEleFt * 0.3048;
               return;
           }

           if (offlineMode) {
               return;
           }

           const ele = await terrainService.getElevation(lat, lon);
           if (ele !== null && typeof ele === 'number') {
               physicsService.terrainElevation = ele;
           }
       } catch (e) {
           console.error("❌ Terrain fetch failed", e);
       }
    };
    
    // Loop every 1 second
    const interval = setInterval(fetchTerrain, 1000);
    return () => clearInterval(interval);
  }, [physicsService, offlineMode]);

  // Update scene manager with selected flight parameters
  useEffect(() => {
    if (isDirectScenarioMode) {
      return;
    }

    if (selectedDeparture && selectedArrival) {
      console.log('✈️  FlightInProgress: Updating scene manager with flight parameters:', {
        callsign: callsign,
        departure: selectedDeparture.iata || selectedDeparture.icao,
        arrival: selectedArrival.iata || selectedArrival.icao,
        aircraftModel: aircraftModel,
        departureRunway: routeDetails?.departureRunway,
        landingRunway: routeDetails?.landingRunway,
        initialHeading: runwayHeadingDeg
      });

      sceneManager.updateScenario({
        callsign: callsign,
        departure: selectedDeparture.iata || selectedDeparture.icao,
        arrival: selectedArrival.iata || selectedArrival.icao,
        aircraftModel: aircraftModel,
        departureRunway: routeDetails?.departureRunway,
        landingRunway: routeDetails?.landingRunway,
        initialHeading: runwayHeadingDeg
      });

      console.log('✅ FlightInProgress: Scene manager updated successfully');
    }
  }, [callsign, selectedDeparture, selectedArrival, aircraftModel, routeDetails, runwayHeadingDeg, isDirectScenarioMode]);

  // Trigger Physics ILS update when radio frequency changes
  useEffect(() => {
    if (physicsService && isInitialized) {
        const currentFlightPlan = {
            waypoints: activeRouteWaypoints,
            departure: selectedDeparture,
            arrival: selectedArrival
        };
        physicsService.handleRadioTuning(currentFreq, currentFlightPlan);
    }
  }, [currentFreq, isInitialized, physicsService, routeDetails, flightPlan, selectedDeparture, selectedArrival]);

  // Initialize SkylineTragedy Service
  useEffect(() => {
    if (!offlineMode) {
      aviationInterceptService.initialize();
    }
    npcCrewService.initialize(difficulty);

    return () => {
      npcCrewService.destroy();
    };
  }, [difficulty, offlineMode]);

  useEffect(() => {
    npcCrewService.setAircraftStateProvider(() => {
      if (!physicsService) return null;
      return {
        altitude: physicsService.altitude,
        airspeed: physicsService.speed,
        heading: physicsService.heading,
        fuel: physicsService.systems?.fuel || 0
      };
    });
  }, [physicsService]);

  useEffect(() => {
    isInitializedRef.current = isInitialized;
    updatePhysicsRef.current = updatePhysics;
    physicsServiceRef.current = physicsService;
    physicsStateRef.current = physicsState;
  }, [isInitialized, updatePhysics, physicsService, physicsState]);

  // Main update loop
  useEffect(() => {
    if (isDirectScenarioMode) {
      setMotionEnabled?.(true);
    } else {
      sceneManager.start();
    }

    const FIXED_STEP = 1 / 60;
    const MAX_FRAME_DELTA = 0.1;
    const MAX_ACCUMULATED_TIME = FIXED_STEP * 6;
    let animationId = null;
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = now => {
      const frameDt = Math.min((now - lastTime) / 1000, MAX_FRAME_DELTA);
      lastTime = now;
      accumulator = Math.min(accumulator + frameDt, MAX_ACCUMULATED_TIME);

      let physicsSnapshot = physicsStateRef.current;
      let steppedDt = 0;

      while (isInitializedRef.current && accumulator >= FIXED_STEP) {
        physicsSnapshot = updatePhysicsRef.current?.(FIXED_STEP) ?? physicsSnapshot;
        accumulator -= FIXED_STEP;
        steppedDt += FIXED_STEP;

        if (physicsServiceRef.current) {
          aviationInterceptService.update(FIXED_STEP, physicsServiceRef.current);
        }
      }

      if (!isDirectScenarioMode) {
        sceneManager.update(steppedDt || frameDt, physicsSnapshot);
        const nextState = sceneManager.getState();
        const previousState = lastSceneStateRef.current;
        const shouldUpdateSceneState =
          previousState.phaseId !== nextState.phaseId ||
          previousState.phaseName !== nextState.phaseName ||
          previousState.phaseType !== nextState.phaseType ||
          previousState.status !== nextState.status ||
          previousState.physicsActive !== nextState.physicsActive ||
          previousState.takeoffClearanceReceived !== nextState.takeoffClearanceReceived ||
          previousState.scenarioId !== nextState.scenarioId ||
          previousState.activeFailures.length !== nextState.activeFailures.length ||
          previousState.completedPhases.length !== nextState.completedPhases.length ||
          previousState.narrativeHistory.length !== nextState.narrativeHistory.length ||
          previousState.lastCommand !== nextState.lastCommand;

        if (shouldUpdateSceneState) {
          lastSceneStateRef.current = nextState;
          startTransition(() => {
            setSceneState(nextState);
          });
        }
      }

      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isDirectScenarioMode, setMotionEnabled]);

  useEffect(() => {
    if (offlineMode) {
      return;
    }

    const session = multiplayerSessionService.getCurrentSession();
    const userId = multiplayerSessionService.currentUser?.id;
    if (!session || !userId || !flightData?.position) {
      return;
    }

    trafficSyncService.broadcastTraffic({
      sessionId: session.sessionId,
      namespaceKey: session.namespaceKey,
      userId,
      callsign,
      aircraftType: aircraftModel,
      role: session.role || 'pilot',
      flightData
    });
  }, [flightData, callsign, aircraftModel]);

  // ✅ CLEAN ARCHITECTURE: Throttle control handler
  const handleThrustControl = (engineIndex, throttleValue) => {
    console.log('🎯 FlightInProgress: Throttle control received:', {
      engineIndex,
      throttleValue,
      percentage: `${((Number(throttleValue) || 0) * 100).toFixed(1)}%`
    });
    
    const validatedThrottle = Math.max(-0.7, Math.min(1, throttleValue));
    
    // Update local display state (Legacy support)
    setThrottleControl(validatedThrottle * 100);
    
    // Send directly to physics engine
    if (setEngineThrottle) {
        setEngineThrottle(engineIndex, validatedThrottle);
        console.log(`🚀 FlightInProgress: Engine ${engineIndex} throttle set to:`, validatedThrottle);
    } else {
        setThrottle(validatedThrottle);
        console.log('🚀 FlightInProgress: Global throttle set to:', validatedThrottle);
    }
  };

  // Handle surface control changes
  const handleFlapsControl = (position) => {
    console.log(`🛩️ Flaps control: ${position}`);
    setFlaps(position);
  };

  const handleGearControl = (position) => {
    console.log(`🔧 Gear control: ${position}`);
    setGear(position);
  };

  const handleAirBrakesControl = (position) => {
    console.log(`🛑 Air brakes control: ${position}`);
    setAirBrakes(position);
  };

  const handleWheelBrakesControl = (position) => {
    console.log(`🛞 Wheel brakes control: ${position}`);
    setWheelBrakes(position);
    if (performSystemAction) {
      performSystemAction('brakes', 'parkingBrake', position >= 0.5);
    }
  };

  const runNPCChecklist = React.useCallback((checklistId) => {
    const systems = physicsState?.systems;
    const flightSnapshot = {
      flapsValue: flightData?.flaps ?? flightData?.flapsValue ?? physicsState?.controls?.flaps,
      gearValue: flightData?.gear ?? flightData?.gearValue ?? physicsState?.controls?.gear,
      airBrakesValue: flightData?.airBrakes ?? flightData?.airBrakesValue ?? physicsState?.controls?.airBrakes,
      engineN2: Array.isArray(physicsState?.engines)
        ? physicsState.engines.map(engine => engine?.n2 ?? engine?.state?.n2 ?? 0)
        : [],
      throttleLevers: Array.isArray(flightData?.engines)
        ? flightData.engines.map(engine => engine?.throttle ?? 0)
        : []
    };

    if (checklistId === 'ABNORMAL') {
      const abnormal = resolveAbnormalChecklist(activeFailures);
      const checklistItems = abnormal.items.map(item => ({
        ...item,
        complete: typeof item.validate === 'function' ? !!item.validate(systems, flightSnapshot) : false
      }));
      appendCrewMessage(abnormal.intro, { stress: npcCrewService.crewState.FO.stress });
      checklistItems.forEach(item => {
        const prefix = item.complete ? 'Checked' : item.severity === 'critical' ? 'Memory item' : 'Pending';
        appendCrewMessage(`${prefix}: ${item.label}.`, { stress: npcCrewService.crewState.FO.stress });
      });
      const pending = checklistItems.filter(item => !item.complete).map(item => item.label);
      if (pending.length === 0) {
        appendCrewMessage(`${abnormal.name} checklist complete.`, { stress: npcCrewService.crewState.FO.stress });
        return { blocked: false, missingItems: [], name: abnormal.name };
      }
      appendCrewMessage(`${abnormal.name} checklist outstanding items: ${pending.join(', ')}.`, { stress: npcCrewService.crewState.FO.stress });
      return { blocked: true, missingItems: pending, name: abnormal.name };
    }

    const checklistItems = evaluateNormalChecklist(checklistId, systems, flightSnapshot);

    const startupContext = getChecklistContext(checklistId);
    const missingItems = checklistItems.filter(item => !item.complete).map(item => item.label);
    const startupMissing = startupContext?.missingItems || [];
    const combinedMissing = Array.from(new Set([...missingItems, ...startupMissing]));

    if (combinedMissing.length === 0) {
      if (npcProfile.explanationLevel === 'full') {
        appendCrewMessage(`${checklistId} checklist complete. We are configured and ready.`, { stress: npcCrewService.crewState.FO.stress });
      } else {
        appendCrewMessage(`${checklistId} checklist complete.`, { stress: npcCrewService.crewState.FO.stress });
      }
      return { blocked: false, missingItems: [] };
    }

    const lead = npcProfile.diagnosticDepth === 'detailed'
      ? `${checklistId} checklist incomplete. Missing:`
      : `${checklistId} incomplete:`;
    appendCrewMessage(`${lead} ${combinedMissing.join(', ')}.`, { stress: npcCrewService.crewState.FO.stress });

    if (npcProfile.suggestions && combinedMissing[0]) {
      appendCrewMessage(`Next item I would fix: ${combinedMissing[0]}.`, { stress: npcCrewService.crewState.FO.stress });
    }

    return { blocked: true, missingItems: combinedMissing };
  }, [activeFailures, appendCrewMessage, flightData, getChecklistContext, npcProfile, physicsState]);

  const buildNPCStatusReport = React.useCallback(() => {
    const startupContext = getChecklistContext(sceneState.phaseType === 'pushback' ? 'ENG START' : 'PREFLIGHT');
    const snapshot = buildNPCSystemSnapshot({
      difficulty,
      currentFreq,
      currentFreqType: getFrequencyType(currentFreq),
      sceneState,
      startupContext,
      activeFailures,
      physicsState,
      flightData
    });

    return formatNPCSystemReport(snapshot, npcProfile.diagnosticDepth === 'detailed' ? 'full' : 'brief');
  }, [activeFailures, currentFreq, difficulty, flightData, getChecklistContext, npcProfile.diagnosticDepth, physicsState, sceneState]);

  const executeNPCIntent = React.useCallback((intent) => {
    const order = createNPCOrder(intent);
    setNpcOrders(prev => [...prev, order]);
    const acknowledgedOrder = transitionNPCOrder(order, NPCOrderStatus.ACKNOWLEDGED, { summary: summarizeNPCOrder(order) });
    setNpcOrders(prev => prev.map(item => item.id === order.id ? acknowledgedOrder : item));

    if (intent.type !== 'QUERY_HELP') {
      appendCrewMessage(
        npcProfile.explanationLevel === 'full'
          ? `Copy. Working ${summarizeNPCOrder(order)}.`
          : `Copy.`,
        { stress: npcCrewService.crewState.FO.stress }
      );
    }

    const finalizeOrder = (status, patch = {}) => {
      setNpcOrders(prev => prev.map(item => item.id === order.id ? transitionNPCOrder(item, status, patch) : item));
    };

    const delay = getNPCResponseDelay(npcProfile);

    window.setTimeout(() => {
      switch (intent.type) {
        case 'ORDER_ACTION': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          if (intent.action === 'flaps' && intent.value !== null) {
            handleFlapsControl(intent.value);
            appendCrewMessage(`Flaps set ${intent.value}.`, { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.COMPLETED);
            return;
          }
          if (intent.action === 'gear') {
            handleGearControl(intent.value);
            appendCrewMessage(intent.value === 1 ? 'Gear down.' : 'Gear up.', { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.COMPLETED);
            return;
          }
          if (intent.action === 'airBrakes') {
            handleAirBrakesControl(intent.value);
            appendCrewMessage(intent.token === 'arm' || intent.token === 'armed' ? 'Speedbrake armed.' : 'Speedbrake set.', { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.COMPLETED);
            return;
          }
          if (intent.action === 'radio') {
            const stations = {
              tower: 118.700,
              ground: 121.900,
              approach: 124.700,
              departure: 124.700,
              center: currentRegion ? Number(currentRegion.frequency) : 127.800
            };
            const nextFreq = intent.value || stations[intent.target] || currentFreq;
            setCurrentFreq(Math.round(nextFreq * 1000) / 1000);
            appendCrewMessage(`Tuned ${Number(nextFreq).toFixed(3)}.`, { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.COMPLETED);
            return;
          }
          appendCrewMessage('Unable to execute that action right now.', { stress: npcCrewService.crewState.FO.stress });
          finalizeOrder(NPCOrderStatus.FAILED);
          return;
        }
        case 'RUN_CHECKLIST': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          const result = runNPCChecklist(intent.checklistId);
          finalizeOrder(result.blocked ? NPCOrderStatus.BLOCKED : NPCOrderStatus.COMPLETED, { details: result.missingItems });
          return;
        }
        case 'REPORT_STATUS': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          appendCrewMessage(buildNPCStatusReport(), { stress: npcCrewService.crewState.FO.stress });
          finalizeOrder(NPCOrderStatus.COMPLETED);
          return;
        }
        case 'DIAGNOSE_ISSUE': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          const report = buildNPCStatusReport();
          const noisy = shouldNPCIntroduceNoise(npcProfile, 'high');
          appendCrewMessage(noisy ? `${report} I may be missing something obvious.` : report, { stress: npcCrewService.crewState.FO.stress });
          finalizeOrder(NPCOrderStatus.COMPLETED, { noisy });
          return;
        }
        case 'REQUEST_RADIO_CALL': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          const templateMap = {
            req_taxi: { text: `${Number.isFinite(currentFreq) ? currentFreq.toFixed(3) : 'Ground'}, ${callsign} ready for taxi.`, type: 'request', params: {} },
            req_startup: { text: `${Number.isFinite(currentFreq) ? currentFreq.toFixed(3) : 'Ground'}, ${callsign} ready for startup and pushback.`, type: 'request', params: {} },
            req_takeoff: { text: `${Number.isFinite(currentFreq) ? currentFreq.toFixed(3) : 'Tower'}, ${callsign} ready for takeoff, runway ${(routeDetails?.departureRunway) || (flightPlan?.departure?.runways?.[0]?.name) || 'active'}.`, type: 'request', params: { runway: (routeDetails?.departureRunway) || (flightPlan?.departure?.runways?.[0]?.name) || 'active' } },
            inf_mayday: { text: `MAYDAY MAYDAY MAYDAY, ${(Number.isFinite(currentFreq) ? currentFreq.toFixed(3) : 'Tower')}, ${callsign} declaring emergency due to ${activeFailures[0]?.type || 'unknown issue'}.`, type: 'inform', params: { failure: activeFailures[0]?.type || 'unknown issue' } }
          };
          const template = templateMap[intent.templateId];
          if (!template) {
            appendCrewMessage('I do not have a radio template for that call.', { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.FAILED);
            return;
          }
          const ok = submitRadioTransmission({
            text: template.text,
            type: template.type,
            templateId: intent.templateId,
            params: template.params,
            sender: 'Copilot'
          });
          if (ok) {
            appendCrewMessage('Radio call transmitted.', { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.COMPLETED);
          } else {
            appendCrewMessage('Channel is busy. Unable to transmit.', { stress: npcCrewService.crewState.FO.stress });
            finalizeOrder(NPCOrderStatus.BLOCKED);
          }
          return;
        }
        case 'QUERY_HELP': {
          finalizeOrder(NPCOrderStatus.EXECUTING);
          appendCrewMessage('Available commands: status, diagnose, run startup checklist, run abnormal checklist, run before takeoff checklist, set flaps 5, gear down, request taxi, request takeoff clearance, declare emergency.', { stress: npcCrewService.crewState.FO.stress });
          finalizeOrder(NPCOrderStatus.COMPLETED);
          return;
        }
        default: {
          appendCrewMessage('I did not understand that command.', { stress: npcCrewService.crewState.FO.stress });
          finalizeOrder(NPCOrderStatus.FAILED);
        }
      }
    }, delay);
  }, [activeFailures, appendCrewMessage, buildNPCStatusReport, callsign, currentFreq, flightPlan, npcProfile, routeDetails, runNPCChecklist, submitRadioTransmission, currentRegion]);

  const submitNPCCommand = React.useCallback((rawCommand) => {
    const intent = parseNPCCommand(rawCommand);
    if (intent.type === 'UNKNOWN') {
      appendCrewMessage('Unable to parse that. Try status, diagnose, checklist, flaps, gear, or radio requests.', { stress: npcCrewService.crewState.FO.stress });
      return intent;
    }

    eventBus.publish('command.input', {
      raw: rawCommand,
      sceneId: sceneState.sceneId,
      scenarioId: sceneState.scenarioId,
      parsedIntent: intent
    });

    executeNPCIntent(intent);
    return intent;
  }, [appendCrewMessage, executeNPCIntent, sceneState.sceneId, sceneState.scenarioId]);

  const handleQuickNPCCommand = React.useCallback((command) => {
    if (!command) return;
    setCommandInput(command);
    submitNPCCommand(command);
  }, [submitNPCCommand]);

  const handleCommandSubmit = (event) => {
    event.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) {
      return;
    }
    console.log('🧭 COMMAND INPUT:', trimmed);
    submitNPCCommand(trimmed);
    setCommandInput('');
  };
  const ilsRunwayOptions = useMemo(() => {
    const airportCode = selectedArrival?.iata || selectedArrival?.icao;
    const runways = Array.isArray(selectedArrival?.runways) ? selectedArrival.runways : [];
    if (!airportCode || runways.length === 0) return [];

    return runways
      .flatMap((runway) => {
        const runwayLabel = String(runway.name || '').trim();
        if (!runwayLabel) return [];

        const geometry = airportService.getRunwayGeometry(airportCode, runwayLabel);
        if (!geometry) return [];

        const runwayEnds = runwayLabel
          .split(/[\/-]/)
          .map((part) => part.trim())
          .filter(Boolean);

        return runwayEnds.map((runwayEnd) => {
          const endGeometry = airportService.getRunwayGeometry(airportCode, runwayEnd);
          return {
            runwayName: runwayEnd,
            ilsFrequency: endGeometry?.ilsFrequency,
          };
        });
      })
      .filter((option) => Number.isFinite(option.ilsFrequency))
      .filter((option, index, all) => all.findIndex((candidate) => candidate.runwayName === option.runwayName) === index);
  }, [selectedArrival]);




  if (!isInitialized && !error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>✈️ Starting Flight Simulation...</div>
          <div style={{ color: '#4ade80' }}>Initializing physics engine...</div>
        </div>
      </div>
    );
  }

  // Show error state if initialization fails
  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '20px', color: '#ef4444' }}>❌ Initialization Error</div>
          <div style={{ marginBottom: '20px' }}>{error}</div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '12px 25px',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      minHeight: '100vh',
      background: '#0a0a0a',
      overflowX: 'hidden',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
          background: 'linear-gradient(to right, rgba(15,23,42,0.95), rgba(30,64,175,0.85))',
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          zIndex: 10
        }}
      >
        <div style={{ flex: 2, minWidth: 0 }}>
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#9CA3AF',
              marginBottom: '4px'
            }}
          >
            {phaseName || 'Situation'}
          </div>
          
          {/* Conditional Rendering: Only show narrative in Header if Physics is ACTIVE (PHY-ON) 
              In PHY-OFF mode, narrative is shown in the immersive full-screen view.
              Also show if there is a warning/critical message (e.g. checklist blocked) */}
          {(sceneState.physicsActive || narrative?.severity === 'warning' || narrative?.severity === 'critical') && (
            <>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: narrative?.severity === 'critical' ? '#ef4444' : narrative?.severity === 'warning' ? '#f59e0b' : '#E5E7EB',
                  marginBottom: '4px'
                }}
              >
                {narrative?.title || 'Awaiting flight instructions...'}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#D1D5DB',
                  opacity: 0.9,
                  marginBottom: '8px'
                }}
              >
                {narrative?.content || 'Prepare for takeoff.'}
              </div>
            </>
          )}

          {/* Live Startup Checklist Status (Pro/Devil Mode) */}
          {!startupStatus.canContinue && (difficulty === 'pro' || difficulty === 'devil') && (
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <div style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                color: '#f59e0b',
                marginBottom: '4px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>⚠️ Checklist Incomplete</span>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {startupStatus.missingItems.map((item, index) => (
                  <div key={index} style={{
                    fontSize: '11px',
                    color: '#fbbf24',
                    padding: '6px 8px',
                    background: 'rgba(69, 26, 3, 0.6)',
                    borderRadius: '4px',
                    borderLeft: '3px solid #f59e0b',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <span style={{ marginRight: '6px' }}>☐</span> {item}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Active Failures Display - Always visible if failures exist */}
          {activeFailures.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                color: '#ef4444',
                marginBottom: '4px'
              }}>
                Active Failures ({activeFailures.length})
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                {activeFailures.map((failure, index) => (
                  <div key={index} style={{
                    fontSize: '10px',
                    color: failure.isCritical ? '#ef4444' : '#f59e0b',
                    padding: '4px 6px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '3px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{failure.type.toUpperCase()} {failure?.data?.engineIndex !== undefined ? `ENGINE ${failure.data.engineIndex + 1}` : ''}</span>
                    <span>{failure.isCritical ? 'CRITICAL' : `${Math.round(failure.progress)}%`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1.3, minWidth: '260px', height: '120px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <RadioActionPanel
            onTransmit={handleRadioTransmit}
            currentStation={Number.isFinite(currentFreq) ? currentFreq.toFixed(3) : '---'}
            callsign={callsign || 'N12345'}
            flightPlan={activeFlightPlan}
            isChannelBusy={isChannelBusy}
            frequencyType={getFrequencyType(currentFreq)}
          />
          <MultiplayerTrafficPanel status={multiplayerStatus} remoteTraffic={remoteTraffic} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {showFailurePanel && (
          <FailureDebugPanel
            physicsService={physicsService}
            onClose={() => setShowFailurePanel(false)}
          />
        )}

        <div
          style={{
            position: 'absolute',
            right: '350px',
            bottom: '20px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            zIndex: 50,
            pointerEvents: 'none'
          }}
        >
          {showDebugPhysics && (
            <div style={{ pointerEvents: 'auto' }}>
              <DebugPhysicsPanel
                debugPhysicsData={flightData?.debugPhysics}
                thrust={flightData?.thrust}
                drag={flightData?.drag}
                waypoints={aircraftConfig.flightPlan}
                flightData={flightData}
                groundStatus={physicsService?.groundStatus?.status}
                remainingRunwayLength={physicsService?.groundStatus?.remainingLength ?? 0}
                embedded
              />
            </div>
          )}

          <div style={{ pointerEvents: 'auto' }}>
            <CrewPanel difficulty={difficulty} quickCommands={npcQuickCommands} onQuickCommand={handleQuickNPCCommand} />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 10 }}>
          <FlightPanelModular
            flightData={{
              ...flightData,
              trueAirspeed: flightData?.trueAirspeed,
              indicatedAirspeed: flightData?.indicatedAirspeed ?? flightData?.derived?.indicatedAirspeed ?? flightData?.airspeed,
              groundSpeed: flightData?.groundSpeed ?? flightData?.derived?.groundSpeed,
              physicsActive: sceneState.physicsActive,
              narrativeHistory: sceneState.narrativeHistory,
              phaseName: sceneState.phaseName,
              approachTelemetry
            }}
            physicsState={physicsState}
            physicsService={physicsService}
            weatherData={weatherData}
            aircraftModel={aircraftModel}
            aircraftData={physicsService?.aircraft}
            selectedArrival={selectedArrival}
            flightPlan={activeFlightPlan} // Pass active dynamic plan
            radioMessages={radioMessages}
            onRadioFreqChange={setCurrentFreq}
            npcs={npcs}
            frequencyContext={getFrequencyType(currentFreq)}
            currentRegion={currentRegion}
            timeScale={timeScale}
            setTimeScale={setTimeScale}
            onUpdateFlightPlan={handleUpdateFlightPlan}
            startupStatus={startupStatus}
            playerSettings={playerSettings}
            playerSettingsError={offlineMode ? null : playerSettingsError}
            autoSaveStatus={offlineMode ? { isSaving: false, lastSavedAt: null, saveError: null } : autoSaveStatus}
            ilsRunwayOptions={ilsRunwayOptions}
            onUpdatePlayerSettings={handlePlayerSettingsChange}
            onActionRequest={(action, payload, extra) => {
              const payloadStr = typeof payload === 'number' ? payload.toFixed(5) : JSON.stringify(payload);
              console.log(`📡 UI Action: ${action} = ${payloadStr}, Extra: ${extra}`);

              switch (action) {
                case 'throttle':
                  handleThrustControl(extra !== undefined ? extra : 0, payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}, Engine: ${extra}`);
                  break;
                case 'flaps':
                  handleFlapsControl(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'airBrakes':
                  handleAirBrakesControl(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'wheelBrakes':
                  handleWheelBrakesControl(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'gear':
                  handleGearControl(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'trim':
                  setTrim(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'pitch':
                  setPitch(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'roll':
                  setRoll(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'yaw':
                  setYaw(payload);
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                case 'toggle-autopilot': {
                  if (scenarioRestrictions.autopilotForbidden) {
                    console.warn('Autopilot is disabled for this challenge.');
                    break;
                  }
                  if (physicsService && typeof physicsService.setAutopilot === 'function') {
                    const status = typeof physicsService.getAutopilotStatus === 'function'
                      ? physicsService.getAutopilotStatus()
                      : null;
                    const engaged = status && typeof status.engaged === 'boolean' ? status.engaged : false;
                    physicsService.setAutopilot(!engaged);
                  }
                  console.log(`📡 FlightPanel Action: ${action}`);
                  break;
                }
                case 'set-autopilot-mode': {
                  if (scenarioRestrictions.autopilotForbidden) {
                    console.warn('Autopilot modes are disabled for this challenge.');
                    break;
                  }
                  if (physicsService && typeof physicsService.setAutopilotMode === 'function') {
                    physicsService.setAutopilotMode(payload);
                  }
                  console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  break;
                }
                case 'set-autopilot-targets': {
                  if (scenarioRestrictions.autopilotForbidden) {
                    console.warn('Autopilot targets are disabled for this challenge.');
                    break;
                  }
                  if (physicsService && typeof physicsService.updateAutopilotTargets === 'function' && payload) {
                    // Direct pass-through for RealisticAutopilotService (Imperial Units)
                    // ModernAutopilotModule sends: { ias, vs, altitude }
                    const targets = {
                      altitude: payload.altitude, // ft
                      speed: payload.ias,         // kts
                      vs: payload.vs              // ft/min
                    };
                    
                    physicsService.updateAutopilotTargets(targets);
                  }
                  console.log(`📡 FlightPanel Action: ${action} = ${JSON.stringify(payload)}`);
                  break;
                }
                case 'set-nav-frequency': {
                  if (scenarioRestrictions.autopilotForbidden) {
                    console.warn('NAV tuning is disabled because autopilot is forbidden for this challenge.');
                    break;
                  }
                  if (physicsService && physicsService.autopilot && typeof physicsService.autopilot.setNavFrequency === 'function') {
                    physicsService.autopilot.setNavFrequency(payload);

                    const arrivalAirportCode = selectedArrival?.iata || selectedArrival?.icao;
                    const matchedIlsRunway = ilsRunwayOptions.find((option) => Math.abs(option.ilsFrequency - payload) < 0.01);
                    if (arrivalAirportCode && matchedIlsRunway && typeof physicsService.setRunwayGeometry === 'function') {
                      const geometry = airportService.getRunwayGeometry(arrivalAirportCode, matchedIlsRunway.runwayName);
                      if (geometry) {
                        physicsService.setRunwayGeometry({ ...geometry, ilsFrequency: payload });
                      }
                    }
                    console.log(`📡 FlightPanel Action: ${action} = ${payload}`);
                  }
                  break;
                }
                case 'system-action': {
                  if (performSystemAction && payload) {
                    performSystemAction(payload.system, payload.action, payload.value);
                  }
                  console.log(`📡 FlightPanel Action: ${action} = ${JSON.stringify(payload)}`);
                  break;
                }
                case 'load-flight': {
                  if (physicsService && typeof physicsService.loadFlightState === 'function') {
                    physicsService.loadFlightState(payload);
                  }
                  console.log(`📡 FlightPanel Action: ${action} = ${JSON.stringify(payload)}`);
                  break;
                }
                case 'toggle-debug': {
                  if (payload?.target === 'physics') {
                    setShowDebugPhysics(prev => !prev);
                    setShowFailurePanel(prev => !prev);
                    console.log(`📡 FlightPanel Action: ${action} -> Toggling Physics Debug Panel & Failure Graph`);
                    break;
                  }

                  setShowDebugPhysics(prev => !prev);
                  setShowFailurePanel(prev => !prev);
                  console.log(`📡 FlightPanel Action: ${action} -> Toggling Physics Debug Panel & Failure Graph`);
                  break;
                }
                case 'skip-phase': {
                  // Check if we can proceed (Hardcore modes only)
                  if ((difficulty === 'pro' || difficulty === 'devil') && !startupStatus.canContinue) {
                    const missing = startupStatus.missingItems.join(', ');
                    const warningMsg = {
                        title: 'Checklist Incomplete',
                        content: `Cannot proceed. Missing items: ${missing}`,
                        severity: 'warning'
                    };
                    
                    // Show warning via narrative
                    setNarrative(warningMsg);
                    
                    // Also log to console
                    console.warn('❌ Cannot skip phase:', missing);
                    return;
                  }

                  sceneManager.skipPhase();
                  console.log(`📡 FlightPanel Action: ${action}`);
                  break;
                }
                default:
                  console.log('Unhandled action:', action);
              }
            }}
          />

        </div>
      </div>
      
      {isCrashed && (
        <div className="end-scene-overlay">
          <div className="end-scene-content">
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>{t('narrative.phases.shutoff.default.0.title') || 'Flight Ended'}</div>
            <div style={{ marginBottom: '20px', maxWidth: '420px' }}>
              {t('narrative.phases.shutoff.default.2.content') || 'Placeholder: post-incident summary and narrative debrief will appear here.'}
            </div>
            <button
              onClick={() => {
                window.location.reload();
              }}
              style={{
                background: 'linear-gradient(135deg, #DC2626, #F97316)',
                color: 'white',
                border: 'none',
                padding: '12px 25px',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {t('ui.menu.quit') || 'Return to Initialization'}
            </button>
          </div>
        </div>
      )}
      {isTutorial && flightData && (
        <TutorialOverlay
          tutorial={activeTutorial}
          physicsState={flightData}
          radioMessages={radioMessages}
          currentFrequency={currentFreq}
          frequencyType={getFrequencyType(currentFreq)}
          onClose={onTutorialClose}
        />
      )}
    </div>
  );
};

export default FlightInProgress;
