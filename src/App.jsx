import useAirportResults from './hooks/useAirportResults.js';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import './App.css';
import './components/MenuWorld.css';
import useAirportSearch from './hooks/useAirportSearch';
import aircraftService from './services/aircraftService';
import { calculateFlightPlan, formatDistance, formatFlightTime, formatFuel } from './utils/distanceCalculator';
import FlightInitialization from './components/FlightInitialization.jsx';
import FlightInProgress from './components/FlightInProgress.jsx';
import RouteSelectionFrame from './components/RouteSelectionFrame.jsx';
import NarrativeScene from './components/NarrativeScene.jsx';
import { generateInitialWeather } from './services/weatherService';
import { realWeatherService } from './services/RealWeatherService.js';
import { loadBriefingWeather } from './services/briefingWeather.js';
import { buildAutoRouteDetails, buildRouteAuthState, DEFAULT_ROUTE_DETAILS, mergeFlightPlanWithRoute, normalizeRouteDetails, normalizeWaypoint } from './utils/routeDetails.js';
import { confirmRouteSelection } from './utils/confirmRouteSelection.js';

import { FadeOverlay, CinematicReview } from './components/CinematicComponents.jsx';
import { LanguageProvider, TranslatedText } from './contexts/LanguageContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import Header from './components/Header';
import DisplaySettings from './components/DisplaySettings';
import FlightRecoveryPanel from './components/FlightRecoveryPanel';
import { getRecoveryConfig } from './services/flightRecovery.js';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage.jsx';
import TutorialHub from './components/TutorialHub';
import ChallengesHub from './components/ChallengesHub';
import FMCPanel from './components/fmc/FMCPanel';
import { TUTORIALS } from './data/tutorialCatalog';
import { CHALLENGES } from './data/challengeCatalog';
import { cloudSaveService } from './services/cloudSaveService.js';
import { useAuth } from './contexts/AuthContext.jsx';
import AipLoadingProgress from './components/AipLoadingProgress.jsx';
import { preloadLocalAipData } from './services/routes/aipPreload.js';

const APP_SETTINGS_STORAGE_KEY = 'app_settings';
const DEFAULT_APP_SETTINGS = {
  offlineMode: true
};

const DEFAULT_WEATHER = {
  type: 'clear',
  windSpeed: 0,
  visibility: 10000,
  cloudCover: 0,
  ceiling: 5000,
  precipitation: 0,
  turbulence: 0
};

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const isSameAirport = (departure, arrival) => {
  if (!departure || !arrival) return false;
  const departureCode = departure.icao || departure.iata || departure.name;
  const arrivalCode = arrival.icao || arrival.iata || arrival.name;
  return departureCode && arrivalCode && departureCode === arrivalCode;
};

function App() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [devMode, setDevMode] = useState(false);
  const [appMode, setAppMode] = useState('home');
  const [isTutorial, setIsTutorial] = useState(false);
  const [difficulty, setDifficulty] = useState('rookie');
  const [preflightConfig, setPreflightConfig] = useState({
    failureSelection: { mode: 'normal', count: 2, banks: ['engine', 'systems', 'controls', 'environment', 'sensors'] },
    airline: 'Test Airline',
    callsign: 'TEST001',
    aircraftModel: 'B737-800',
    pax: 150,
    payload: 20000,
    fuelReserve: 0.1,
    cruiseHeight: 35000,
    crewCount: 2,
    timeZulu: '',
    useRandomTime: true,
    season: '',
    useRandomSeason: true,
    weatherData: DEFAULT_WEATHER,
    selectedDeparture: null,
    selectedArrival: null,
    routeDetails: DEFAULT_ROUTE_DETAILS,
    flightPlan: null
  });

  const [flightInitialized, setFlightInitialized] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState(null);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [resumeSave, setResumeSave] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [flightSessionId, setFlightSessionId] = useState(0);
  const [resumeCheckLoading, setResumeCheckLoading] = useState(false);
  const [resumeCheckError, setResumeCheckError] = useState(null);
  const { selectedDeparture, selectedArrival, selectDeparture, selectArrival, getAirportByCode, getAirportByCodeRemote } = useAirportSearch();
  const [aircraftSuggestions, setAircraftSuggestions] = useState([]);
  const [failureType, setFailureType] = useState('random');
  const [weatherData, setWeatherData] = useState(DEFAULT_WEATHER);
  const [cinematicPhase, setCinematicPhase] = useState('none');
  const [showSettings, setShowSettings] = useState(false);
  const [showRouteSelection, setShowRouteSelection] = useState(false);
  const [appSettings, setAppSettings] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_APP_SETTINGS;
    }

    try {
      const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return DEFAULT_APP_SETTINGS;
      }
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed
      };
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });
  const [departureQuery, setDepartureQuery] = useState('');
  const [arrivalQuery, setArrivalQuery] = useState('');
  const [alternateQuery, setAlternateQuery] = useState('');
  const routeGenerationRequestRef = useRef(0);
  const routeConfirmationRevisionRef = useRef(0);

  const offlineMode = appSettings.offlineMode;
  const activeUser = offlineMode ? null : authUser;
  const routeAuthState = buildRouteAuthState({ offlineMode, activeUser });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
    } catch {
      // Keep settings usable when browser storage is unavailable.
    }
  }, [appSettings]);

  useEffect(() => {
    preloadLocalAipData();
  }, []);

  const departureResults = useAirportResults(departureQuery);
  const arrivalResults = useAirportResults(arrivalQuery);
  const alternateResults = useAirportResults(alternateQuery);

  const updatePreflightConfig = (patch) => {
    setPreflightConfig((prev) => ({ ...prev, ...patch }));
  };

  const updateRouteDetails = (patch) => {
    setPreflightConfig((prev) => ({
      ...prev,
      routeDetails: normalizeRouteDetails(
        typeof patch === 'function' ? patch(prev.routeDetails) : { ...prev.routeDetails, ...patch },
        prev.selectedDeparture,
        prev.selectedArrival
      )
    }));
  };

  const regenerateRouteDetails = async (departure, arrival, previousRouteDetails) => {
    const requestId = routeGenerationRequestRef.current + 1;
    routeGenerationRequestRef.current = requestId;
    const relaxAirwayLimitations = Boolean(previousRouteDetails?.relaxAirwayLimitations);
    const nextRouteDetails = await buildAutoRouteDetails({
      departure,
      arrival,
      previousRouteDetails,
      routeOptions: {
        authState: routeAuthState,
        aircraftType: preflightConfig.aircraftModel,
        localAip: { relaxAirwayLimitations },
        supabaseAip: { relaxAirwayLimitations }
      }
    });
    if (routeGenerationRequestRef.current !== requestId) return;
    setPreflightConfig((prev) => ({
      ...prev,
      routeDetails: nextRouteDetails
    }));
  };

  const resolveAirportDetails = async (airport) => {
    const code = airport?.icao || airport?.iata || airport?.ident;
    if (!code) return airport || null;
    return await getAirportByCodeRemote(code) || airport;
  };

  const setPreflightDeparture = async (airport) => {
    const revision = routeConfirmationRevisionRef.current;
    const resolvedAirport = await resolveAirportDetails(airport);
    if (revision !== routeConfirmationRevisionRef.current) return;
    selectDeparture(resolvedAirport);
    setDepartureQuery('');
    const routeDetails = normalizeRouteDetails(preflightConfig.routeDetails, resolvedAirport, preflightConfig.selectedArrival);
    setPreflightConfig((prev) => ({
      ...prev,
      selectedDeparture: resolvedAirport,
      routeDetails
    }));
    if (resolvedAirport && preflightConfig.selectedArrival && !isSameAirport(resolvedAirport, preflightConfig.selectedArrival)) {
      regenerateRouteDetails(resolvedAirport, preflightConfig.selectedArrival, routeDetails);
    } else {
      routeGenerationRequestRef.current += 1;
    }
  };

  const setPreflightArrival = async (airport) => {
    const revision = routeConfirmationRevisionRef.current;
    const resolvedAirport = await resolveAirportDetails(airport);
    if (revision !== routeConfirmationRevisionRef.current) return;
    selectArrival(resolvedAirport);
    setArrivalQuery('');
    const routeDetails = normalizeRouteDetails(preflightConfig.routeDetails, preflightConfig.selectedDeparture, resolvedAirport);
    setPreflightConfig((prev) => ({
      ...prev,
      selectedArrival: resolvedAirport,
      routeDetails
    }));
    if (preflightConfig.selectedDeparture && resolvedAirport && !isSameAirport(preflightConfig.selectedDeparture, resolvedAirport)) {
      regenerateRouteDetails(preflightConfig.selectedDeparture, resolvedAirport, routeDetails);
    } else {
      routeGenerationRequestRef.current += 1;
    }
  };

  const setPreflightAlternate = async (airport) => {
    const resolvedAirport = await resolveAirportDetails(airport);
    setAlternateQuery('');
    updateRouteDetails({ alternate: resolvedAirport || null });
  };

  const mergedFlightPlan = useMemo(
    () => mergeFlightPlanWithRoute(preflightConfig.flightPlan, preflightConfig.routeDetails),
    [preflightConfig.flightPlan, preflightConfig.routeDetails]
  );

  const runtimeRouteDetails = useMemo(
    () => normalizeRouteDetails(preflightConfig.routeDetails, preflightConfig.selectedDeparture, preflightConfig.selectedArrival),
    [preflightConfig.routeDetails, preflightConfig.selectedDeparture, preflightConfig.selectedArrival]
  );

  const routeValidation = useMemo(() => {
    const departure = preflightConfig.selectedDeparture;
    const arrival = preflightConfig.selectedArrival;
    const alternate = runtimeRouteDetails.alternate;
    const hasDeparture = Boolean(departure);
    const hasArrival = Boolean(arrival);
    const sameAirport = hasDeparture && hasArrival && (departure.icao || departure.iata) === (arrival.icao || arrival.iata);
    const isRouteReady = hasDeparture && hasArrival && !sameAirport;

    return {
      departureState: hasDeparture ? 'idle' : 'warning',
      departureMessage: hasDeparture ? 'Departure selected.' : 'Select a valid departure airport.',
      arrivalState: hasArrival ? 'idle' : 'warning',
      arrivalMessage: hasArrival ? 'Arrival selected.' : 'Select a valid arrival airport.',
      alternateState: alternate ? 'idle' : 'idle',
      alternateMessage: alternate ? 'Alternate selected.' : 'Optional but recommended for dispatch planning.',
      routeState: sameAirport ? 'error' : isRouteReady ? 'success' : 'idle',
      routeMessage: sameAirport
        ? 'Departure and arrival must be different airports.'
        : isRouteReady
          ? 'Valid route selected. You can continue to route review.'
          : 'Set both departure and arrival to complete the route.',
      isRouteReady
    };
  }, [preflightConfig.selectedDeparture, preflightConfig.selectedArrival, runtimeRouteDetails.alternate]);

  const tabletReadiness = useMemo(() => {
    const hasPax = isPositiveNumber(preflightConfig.pax);
    const hasPayload = isPositiveNumber(preflightConfig.payload);
    const hasReserve = Number.isFinite(Number(preflightConfig.fuelReserve)) && Number(preflightConfig.fuelReserve) >= 0;
    const hasCruise = isPositiveNumber(preflightConfig.cruiseHeight);
    const hasFlightPlanFuel = Boolean(preflightConfig.flightPlan?.fuel?.totalFuel);
    const isLoadoutReady = hasPax && hasPayload && hasReserve && hasCruise;
    const isPerformanceReady = hasFlightPlanFuel && isLoadoutReady;

    return {
      isRouteReady: routeValidation.isRouteReady,
      isLoadoutReady,
      isPerformanceReady,
      isFinalizeReady: routeValidation.isRouteReady && isLoadoutReady,
      hasPax,
      hasPayload,
      hasReserve,
      hasCruise
    };
  }, [preflightConfig.pax, preflightConfig.payload, preflightConfig.fuelReserve, preflightConfig.cruiseHeight, preflightConfig.flightPlan, routeValidation.isRouteReady]);

  const routeSearchState = useMemo(() => ({
    departureQuery,
    arrivalQuery,
    alternateQuery,
    departureResults,
    arrivalResults,
    alternateResults,
    setDepartureQuery,
    setArrivalQuery,
    setAlternateQuery
  }), [departureQuery, arrivalQuery, alternateQuery, departureResults, arrivalResults, alternateResults]);

  const {
    airline,
    callsign,
    aircraftModel,
    pax,
    payload,
    fuelReserve,
    cruiseHeight,
    crewCount,
    timeZulu,
    useRandomTime,
    season,
    useRandomSeason
  } = preflightConfig;

  const handleDevStart = () => {
    console.log('🚀 Development Mode: Starting flight simulation directly');

    const devDeparture = getAirportByCode('KSFO') || getAirportByCode('KATL');
    const devArrival = getAirportByCode('KLAX') || getAirportByCode('KJFK');

    if (devDeparture && devArrival) {
      console.log('📍 Dev Mode: Using default airports', devDeparture.iata, '->', devArrival.iata);
      setPreflightDeparture(devDeparture);
      setPreflightArrival(devArrival);

      setTimeout(() => {
        setFlightInitialized(true);
        setAppMode('simulation');
        setCinematicPhase('none');
      }, 100);
    } else {
      console.warn('⚠️ Dev Mode: Could not find default airports');
      setFlightInitialized(true);
      setAppMode('simulation');
      setCinematicPhase('none');
    }
  };

  useEffect(() => {
    const loadAircraft = async () => {
      try {
        const popularAircraft = await aircraftService.getPopularAircraft();
        setAircraftSuggestions(popularAircraft);
      } catch (error) {
        console.error('Error loading popular aircraft:', error);
        setAircraftSuggestions([]);
      }
    };
    loadAircraft();
  }, []);

  useEffect(() => {
    if (offlineMode) {
      setResumeSave(null);
      setResumeCheckError(null);
      setResumeCheckLoading(false);
      return;
    }

    let isMounted = true;

    const loadResumeSave = async () => {
      if (authLoading || !activeUser || appMode !== 'recovery') {
        if (isMounted) {
          setResumeSave(null);
          setResumeCheckError(null);
          setResumeCheckLoading(false);
        }
        return;
      }

      setResumeCheckLoading(true);
      let result;
      try {
        result = await cloudSaveService.getCurrentUserSave();
      } catch {
        result = { data: null, error: { message: 'Unable to load cloud save.' } };
      }
      const { data, error } = result;

      if (!isMounted) {
        return;
      }

      setResumeSave(data ?? null);
      setResumeCheckError(error?.message ?? null);
      setResumeCheckLoading(false);
    };

    loadResumeSave();

    return () => {
      isMounted = false;
    };
  }, [activeUser, appMode, authLoading, offlineMode]);

  useEffect(() => {
    const calculateFlightPlanAsync = async () => {
      if (preflightConfig.selectedDeparture && preflightConfig.selectedArrival && preflightConfig.aircraftModel) {
        try {
          const plan = await calculateFlightPlan(
            preflightConfig.selectedDeparture,
            preflightConfig.selectedArrival,
            preflightConfig.aircraftModel,
            preflightConfig.payload,
            preflightConfig.fuelReserve
          );
          setPreflightConfig((prev) => ({ ...prev, flightPlan: plan }));
        } catch (error) {
          console.error('Error calculating flight plan:', error);
          setPreflightConfig((prev) => ({ ...prev, flightPlan: null }));
        }
      } else {
        setPreflightConfig((prev) => ({ ...prev, flightPlan: null }));
      }
    };
    calculateFlightPlanAsync();
  }, [preflightConfig.selectedDeparture, preflightConfig.selectedArrival, preflightConfig.aircraftModel, preflightConfig.payload, preflightConfig.fuelReserve]);

  const handleInitializeFlight = () => {
    setShowRouteSelection(true);
  };

  const handleRouteConfirm = (routeData) => {
    // Cancel pending airport route lookups so they cannot overwrite the reviewed runway.
    routeGenerationRequestRef.current += 1;
    routeConfirmationRevisionRef.current += 1;
    if (routeData.departure) selectDeparture(routeData.departure);
    if (routeData.arrival) selectArrival(routeData.arrival);
    setPreflightConfig(previous => confirmRouteSelection(previous, routeData));
    setShowRouteSelection(false);
    startSimulation(routeData);
  };

  const handleRouteSkip = () => {
    routeGenerationRequestRef.current += 1;
    routeConfirmationRevisionRef.current += 1;
    setShowRouteSelection(false);
    updateRouteDetails(DEFAULT_ROUTE_DETAILS);
    startSimulation(DEFAULT_ROUTE_DETAILS);
  };

  const handleResumeFlight = async (saveRecord) => {
    try {
      const { save, config } = getRecoveryConfig(saveRecord?.data);
      if (!await aircraftService.getAircraftByModel(save.aircraftModel)) throw new Error('Saved aircraft is not supported.');
      setRecovery(save);
      setPreflightConfig(prev => ({ ...prev, ...config }));
      setWeatherData(config.weatherData);
      setDifficulty(config.difficulty || 'rookie');
      setFailureType(config.failureType || 'random');
      setActiveTutorial(null);
      setActiveChallenge(null);
      setIsTutorial(false);
      setShowSettings(false);
      setCinematicPhase('none');
      setResumeCheckError(null);
      setFlightSessionId(previous => previous + 1);
      setFlightInitialized(true);
      setAppMode('simulation');
    } catch (error) {
      setResumeCheckError(error.message);
    }
  };

  const handleDiscardResumeSave = async () => {
    if (offlineMode) {
      setResumeSave(null);
      return;
    }

    if (!resumeSave?.id) {
      setResumeSave(null);
      return;
    }

    setResumeCheckLoading(true);
    try {
      const { error } = await cloudSaveService.discardFlight(resumeSave.id);
      if (error) {
        setResumeCheckError(error.message || 'Unable to discard cloud save.');
      } else {
        setResumeSave(null);
        setResumeCheckError(null);
      }
    } catch {
      setResumeCheckError('Unable to discard cloud save.');
    } finally {
      setResumeCheckLoading(false);
    }
  };

  const startSimulation = async (routeData = {}) => {
    const fadeDuration = 2500;

    let currentSeason = season;
    if (useRandomSeason) {
      const seasons = ['spring', 'summer', 'autumn', 'winter'];
      currentSeason = seasons[Math.floor(Math.random() * seasons.length)];
      updatePreflightConfig({ season: currentSeason });
    }

    let currentTimeZulu = timeZulu;
    if (useRandomTime) {
      currentTimeZulu = new Date().toISOString();
      updatePreflightConfig({ timeZulu: currentTimeZulu });
    }

    setCinematicPhase('fade_out');
    const [initialWeather] = await Promise.all([
      loadBriefingWeather(routeData.departure || preflightConfig.selectedDeparture, {
        offlineMode,
        season: currentSeason,
        zuluTime: currentTimeZulu,
        generateWeather: (...args) => {
          const weather = generateInitialWeather(...args);
          return {
            ...weather,
            turbulence: realWeatherService.estimateTurbulence(weather.windSpeed, weather.windGust, 0)
          };
        },
        getWeather: (...args) => realWeatherService.getWeather(...args)
      }),
      new Promise(resolve => setTimeout(resolve, fadeDuration))
    ]);
    setWeatherData(initialWeather);
    updatePreflightConfig({ weatherData: initialWeather });
    setCinematicPhase('cinematic_review');
  };

  const handleCinematicReviewComplete = () => {
    setCinematicPhase('narrative_scene');
  };

  const handleNarrativeComplete = () => {
    setCinematicPhase('fade_in');
    setTimeout(() => {
      setFlightInitialized(true);
      setAppMode('simulation');
      setCinematicPhase('none');
    }, 2500);
  };

  const handleResetFlight = () => {
    setRecovery(null);
    setFlightInitialized(false);
    setAppMode('init');
    updatePreflightConfig({ flightPlan: null, routeDetails: DEFAULT_ROUTE_DETAILS });
  };

  const handleStartSinglePlayer = () => {
    setRecovery(null);
    setAppMode('init');
    setIsTutorial(false);
    setActiveTutorial(null);
    setActiveChallenge(null);
  };

  const handleStartTutorial = () => {
    setAppMode('tutorial-hub');
    setIsTutorial(false);
    setActiveTutorial(null);
    setActiveChallenge(null);
  };

  const handleStartChallenges = () => {
    setAppMode('challenge-hub');
    setIsTutorial(false);
    setActiveTutorial(null);
    setActiveChallenge(null);
  };

  const launchScenario = async (scenario, mode = 'tutorial') => {
    if (scenario.available === false) return;

    const dep = getAirportByCode(scenario.departureCode);
    const arr = getAirportByCode(scenario.arrivalCode);

    if (!dep || !arr) {
      alert(`Could not load ${mode} airports. Please try again.`);
      return;
    }

    const launchRouteDetails = normalizeRouteDetails(
      scenario.launchConfig?.routeDetails || DEFAULT_ROUTE_DETAILS,
      dep,
      arr
    );

    let scenarioFlightPlan = null;
    try {
      scenarioFlightPlan = await calculateFlightPlan(
        dep,
        arr,
        scenario.launchConfig?.aircraftModel || aircraftModel,
        preflightConfig.payload,
        preflightConfig.fuelReserve
      );
    } catch (error) {
      console.error(`Error calculating ${mode} flight plan:`, error);
    }

    if (!scenarioFlightPlan?.fuel?.totalFuel) {
      scenarioFlightPlan = {
        ...(scenarioFlightPlan || {}),
        fuel: {
          ...(scenarioFlightPlan?.fuel || {}),
          totalFuel: 12000,
          reserveFuel: scenarioFlightPlan?.fuel?.reserveFuel ?? 1200,
          tripFuel: scenarioFlightPlan?.fuel?.tripFuel ?? 10800,
          fuelSufficient: true
        }
      };
    }

    setIsTutorial(mode === 'tutorial');
    setActiveTutorial(mode === 'tutorial' ? scenario : null);
    setActiveChallenge(mode === 'challenge' ? scenario : null);
    setDifficulty(scenario.launchConfig?.difficulty || 'rookie');
    setFailureType(scenario.launchConfig?.failureType || 'none');
    setWeatherData(scenario.launchConfig?.weatherData || DEFAULT_WEATHER);
    setPreflightDeparture(dep);
    setPreflightArrival(arr);
    setPreflightConfig((prev) => ({
      ...prev,
      aircraftModel: scenario.launchConfig?.aircraftModel || prev.aircraftModel,
      weatherData: scenario.launchConfig?.weatherData || DEFAULT_WEATHER,
      selectedDeparture: dep,
      selectedArrival: arr,
      routeDetails: launchRouteDetails,
      flightPlan: scenarioFlightPlan
    }));
    setCinematicPhase('none');

    setTimeout(() => {
      setFlightInitialized(true);
      setAppMode('simulation');
    }, 100);
  };

  const handleLaunchTutorial = async (tutorial) => {
    await launchScenario(tutorial, 'tutorial');
  };

  const handleLaunchChallenge = async (challenge) => {
    await launchScenario(challenge, 'challenge');
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
  };

  const handleOfflineModeChange = (event) => {
    const checked = event.target.checked;
    setAppSettings(prev => ({
      ...prev,
      offlineMode: checked
    }));
  };

  const handleTutorialClose = () => {
    setIsTutorial(false);
    setActiveTutorial(null);
    setActiveChallenge(null);
    setFlightInitialized(false);
    setAppMode('home');
    updatePreflightConfig({ flightPlan: null, routeDetails: DEFAULT_ROUTE_DETAILS });
  };

  if (typeof window !== 'undefined' && window.location.pathname === '/login') {
    return <LoginPage />;
  }

  if (cinematicPhase !== 'none') {
    return (
      <LanguageProvider>
        <AipLoadingProgress />
        <div className={`cinematic-container ${cinematicPhase}`}>
          <LanguageSwitcher style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 2000 }} />

          {cinematicPhase === 'fade_out' && (
            <FadeOverlay phase="fade-out">
              <div className="fade-content">
                <h1><TranslatedText>Initializing Flight Simulation</TranslatedText></h1>
                <p><TranslatedText>Preparing for takeoff...</TranslatedText></p>
              </div>
            </FadeOverlay>
          )}

          {cinematicPhase === 'cinematic_review' && (
            <CinematicReview
              callsign={callsign}
              selectedDeparture={preflightConfig.selectedDeparture}
              selectedArrival={preflightConfig.selectedArrival}
              aircraftModel={aircraftModel}
              weatherData={weatherData}
              setWeatherData={setWeatherData}
              crewCount={crewCount}
              failureType={failureType}
              failureSelection={preflightConfig.failureSelection}
              difficulty={difficulty}
              pax={pax}
              payload={payload}
              routeDetails={runtimeRouteDetails}
              onComplete={handleCinematicReviewComplete}
            />
          )}

          {cinematicPhase === 'narrative_scene' && (
            <NarrativeScene
              onComplete={handleNarrativeComplete}
              context={{
                difficulty,
                departure: preflightConfig.selectedDeparture,
                arrival: preflightConfig.selectedArrival,
                pax,
                callsign
              }}
            />
          )}

          {cinematicPhase === 'fade_in' && (
            <FadeOverlay phase="fade-in">
              <div className="fade-content">
                <h1><TranslatedText>Simulation Active</TranslatedText></h1>
                <p><TranslatedText>Flight controls are now available</TranslatedText></p>
              </div>
            </FadeOverlay>
          )}
        </div>
      </LanguageProvider>
    );
  }

  if (appMode === 'simulation' && flightInitialized) {
    return (
      <LanguageProvider>
        <LanguageSwitcher style={{ position: 'fixed', top: '10px', right: '120px', zIndex: 2000 }} />
        <FlightInProgress
          key={flightSessionId}
          initialSave={recovery}
          onRestoreFlight={payload => handleResumeFlight({ data: payload })}
          callsign={callsign}
          aircraftModel={aircraftModel}
          difficulty={difficulty}
          selectedDeparture={preflightConfig.selectedDeparture}
          selectedArrival={preflightConfig.selectedArrival}
          initialDeparture={preflightConfig.selectedDeparture}
          flightPlan={mergedFlightPlan}
          airline={airline}
          pax={pax}
          payload={payload}
          fuelReserve={fuelReserve}
          cruiseHeight={cruiseHeight}
          useRandomTime={useRandomTime}
          timeZulu={timeZulu}
          useRandomSeason={useRandomSeason}
          season={season}
          handleResetFlight={handleResetFlight}
          formatDistance={formatDistance}
          formatFlightTime={formatFlightTime}
          formatFuel={formatFuel}
          weatherData={weatherData}
          setWeatherData={setWeatherData}
          failureSelection={preflightConfig.failureSelection}
          failureType={failureType}
          crewCount={crewCount}
          routeDetails={runtimeRouteDetails}
          isTutorial={isTutorial}
          activeTutorial={activeTutorial}
          activeChallenge={activeChallenge}
          onTutorialClose={handleTutorialClose}
          offlineMode={offlineMode}
        />
      </LanguageProvider>
    );
  }

  if (appMode === 'init') {
    return (
      <LanguageProvider>
        <div className="App app-entry menu-world">
          <LanguageSwitcher style={{ position: 'absolute', top: '20px', right: '20px' }} />
          <Header devMode={devMode} setDevMode={setDevMode} handleDevStart={handleDevStart} />

          <main className="app-main">
            <button className="entry-back" onClick={() => setAppMode('home')}><TranslatedText>← Main menu</TranslatedText></button>
            <RouteSelectionFrame
                isOpen
                onConfirm={handleRouteConfirm}
                onSkip={handleRouteSkip}
                onChange={updateRouteDetails}
                difficulty={difficulty}
                onSetDifficulty={setDifficulty}
                departure={preflightConfig.selectedDeparture}
                arrival={preflightConfig.selectedArrival}
                onSelectDeparture={setPreflightDeparture}
                onSelectArrival={setPreflightArrival}
                routeData={runtimeRouteDetails}
                routeAuthState={routeAuthState}
                aircraftType={preflightConfig.aircraftModel}
                preflightConfig={preflightConfig}
                updatePreflightConfig={updatePreflightConfig}
                aircraftSuggestions={aircraftSuggestions}
              />
          </main>

          <footer className="app-footer">
            <p>©2026, GeeksProductionStudio. All Rights Reserved.</p>
          </footer>
        </div>
      </LanguageProvider>
    );
  }

  if (appMode === 'recovery') {
    return <LanguageProvider>
      <div className="app-entry menu-world">
        <main className="app-main" style={{ padding: '32px', minHeight: '100svh' }}>
          <button className="entry-back" onClick={() => setAppMode('home')}><TranslatedText>← Main menu</TranslatedText></button>
          <FlightRecoveryPanel save={resumeSave} loading={resumeCheckLoading} error={resumeCheckError}
            offline={offlineMode} onResume={handleResumeFlight} onDiscard={handleDiscardResumeSave} />
        </main>
      </div>
    </LanguageProvider>;
  }

  if (appMode === 'tutorial-hub') {
    return (
      <LanguageProvider>
        <LanguageSwitcher style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2000 }} />
        <TutorialHub
          tutorials={TUTORIALS}
          onLaunchTutorial={handleLaunchTutorial}
          onBack={() => setAppMode('home')}
        />
      </LanguageProvider>
    );
  }

  if (appMode === 'challenge-hub') {
    return (
      <LanguageProvider>
        <LanguageSwitcher style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2000 }} />
        <ChallengesHub
          challenges={CHALLENGES}
          onLaunchChallenge={handleLaunchChallenge}
          onBack={() => setAppMode('home')}
        />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <HomePage
        onStartSinglePlayer={handleStartSinglePlayer}
        onStartTutorial={handleStartTutorial}
        onStartChallenges={handleStartChallenges}
        onOpenSettings={handleOpenSettings}
        onRecoverFlight={() => setAppMode('recovery')}
      />
      {showSettings && (
        <div className="menu-settings-overlay" style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div className="menu-settings-panel" style={{
            width: 'min(420px, calc(100vw - 32px))',
            borderRadius: '12px',
            padding: '20px',
            color: '#f9fafb',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}><TranslatedText>Settings</TranslatedText></h2>
              <button aria-label="Close settings" onClick={handleCloseSettings} style={{ background: 'transparent', color: '#f9fafb', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <DisplaySettings />
            <label style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}><TranslatedText>Offline mode</TranslatedText></div>
                <div style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>
                  <TranslatedText>Disable multiplayer, cloud save, live weather, and network terrain fetches.</TranslatedText>
                </div>
              </div>
              <input type="checkbox" checked={offlineMode} onChange={handleOfflineModeChange} />
            </label>
          </div>
        </div>
      )}
    </LanguageProvider>
  );
}

export default App;
export { normalizeWaypoint, normalizeRouteDetails, mergeFlightPlanWithRoute };
