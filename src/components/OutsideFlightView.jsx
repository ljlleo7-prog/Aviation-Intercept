import { useLanguage } from '../contexts/LanguageContext';
import { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { airportService } from '../services/airportService.js';
import { getVisualRunwayGeometry, getSourcedRunwayNames } from '../data/visualRunwayCoordinates.js';
import { loadAirportGroundPackage } from '../services/airportGroundPackages.js';
import './OutsideFlightView.css';
import WindshieldEffects from './WindshieldEffects.jsx';
import { cockpitVisualState } from '../utils/cockpitVisualState.js';
import { terrainSceneReference } from '../utils/outsideSceneReference.js';

const OutsideFlightScene = lazy(() => import('./OutsideFlightScene.jsx'));

export default function OutsideFlightView({ flightData, weatherData, timeZulu, timeScale, quality = 'balanced', departure, arrival, departureRunway, arrivalRunway }) {
  const { tx } = useLanguage();
  const visual = cockpitVisualState(flightData?.systems, weatherData, flightData?.derived?.altitude_ft ?? flightData?.altitude);
  const position = flightData?.position;
  const distanceSq = (airport) => airport && Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
    ? (position.latitude - airport.latitude) ** 2 + ((position.longitude - airport.longitude) * Math.cos(position.latitude * Math.PI / 180)) ** 2
    : Infinity;
  const useDeparture = distanceSq(departure) <= distanceSq(arrival);
  const routeAirport = useDeparture ? departure : arrival;
  const latitudeCell = Number.isFinite(position?.latitude) ? Math.floor(position.latitude * 100) : null;
  const longitudeCell = Number.isFinite(position?.longitude) ? Math.floor(position.longitude * 100) : null;
  const nearby = useMemo(() => latitudeCell !== null && longitudeCell !== null
    ? airportService.getAirportsWithinRadius((latitudeCell + .5) / 100, (longitudeCell + .5) / 100, 12) : [],
  [latitudeCell, longitudeCell]);
  const airport = nearby.reduce((closest, candidate) => distanceSq(candidate) < distanceSq(closest) ? candidate : closest, routeAirport);
  const airportCode = airport?.icao || airport?.iata;
  const sameAirport = (candidate) => candidate && [candidate.icao, candidate.iata].filter(Boolean)
    .some(code => [airport?.icao, airport?.iata].includes(code));
  const selectedRunway = (sameAirport(departure) ? departureRunway : sameAirport(arrival) ? arrivalRunway : null)
    || getSourcedRunwayNames(airportCode)[0] || airport?.runways?.[0]?.name || airport?.runway;
  const terrainReference = useRef(null);
  if (!terrainReference.current) terrainReference.current = terrainSceneReference(position, flightData?.derived?.terrain_elevation_ft);
  const [groundState, setGroundState] = useState(null);
  const departureCode = departure?.icao || departure?.iata;
  const arrivalCode = arrival?.icao || arrival?.iata;
  useEffect(() => {
    loadAirportGroundPackage(departureCode);
    loadAirportGroundPackage(arrivalCode);
  }, [departureCode, arrivalCode]);
  useEffect(() => {
    let cancelled = false;
    // Large hub packages need the full asset timeout on slower connections.
    // A late response must not replace the airport during final or rollout.
    const timer = setTimeout(() => { if (!cancelled) { cancelled = true; setGroundState({ code: airportCode, value: null }); } }, 6500);
    loadAirportGroundPackage(airportCode).then((value) => {
      if (!cancelled) { cancelled = true; clearTimeout(timer); setGroundState({ code: airportCode, value }); }
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [airportCode]);
  const groundReady = Boolean(groundState && groundState.code === airportCode);
  const runwayEnds = String(selectedRunway || '').split(/[/-]/).filter(Boolean);
  const currentHeading = flightData?.heading;
  const runwayName = runwayEnds.length > 1 && Number.isFinite(currentHeading)
    ? runwayEnds.reduce((best, end) => {
        const error = (name) => Math.abs((((Number(name.slice(0, 2)) * 10 - currentHeading) + 540) % 360) - 180);
        return error(end) < error(best) ? end : best;
      })
    : runwayEnds[0];
  const runwayGeometry = useMemo(() => airportCode && runwayName
    ? getVisualRunwayGeometry(airportCode, runwayName, airportService.getRunwayGeometry(airportCode, runwayName))
    : null, [airportCode, runwayName]);
  const geometry = runwayGeometry || terrainReference.current;
  const airportRunways = useMemo(() => {
    if (!airportCode) return [];
    const sourcedNames = getSourcedRunwayNames(airportCode);
    const all = sourcedNames.length ? sourcedNames.map(name => ({ name })) : airportService.getAirportByCode(airportCode)?.runways || [];
    return all.map((runway) => {
      const ends = String(runway.name || '').split(/[/-]/).filter(Boolean);
      const activeHeading = Number(runwayName?.slice(0, 2)) * 10;
      return ends.find((end) => Math.abs((((Number(end.slice(0, 2)) * 10 - activeHeading) + 540) % 360) - 180) <= 90) || ends[0];
    })
      .filter((end) => end !== runwayName)
      .map((end) => getVisualRunwayGeometry(airportCode, end, airportService.getRunwayGeometry(airportCode, end)))
      .filter(Boolean);
  }, [airportCode, runwayName]);

  return <section className="outside-flight-view" aria-label={tx("Forward outside view")}>
    {geometry && Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
      ? <Suspense fallback={<div className="outside-flight-placeholder">{tx("Preparing outside view…")}</div>}>
          <OutsideFlightScene flightData={flightData} weatherData={weatherData} geometry={geometry} airportRunways={airportRunways} groundPackage={groundReady ? groundState.value : null} timeZulu={timeZulu} timeScale={timeScale} quality={quality} />
        </Suspense>
      : <div className="outside-flight-placeholder">{tx('Waiting for aircraft position…')}</div>}
    <WindshieldEffects snow={visual.snow} intensity={visual.intensity} leftWiper={visual.leftWiper} rightWiper={visual.rightWiper} />
    <div className="outside-flight-roof" /><div className="outside-flight-left" /><div className="outside-flight-right" /><div className="outside-flight-glare" />
    <div className="outside-flight-caption">{runwayGeometry ? `${airportCode} · RWY ${runwayName}` : tx('Terrain view')}</div>
    {groundReady && groundState.value?.source === 'openstreetmap' && <a className="outside-flight-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>}
  </section>;
}
