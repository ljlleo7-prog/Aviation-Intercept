import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { airportService } from '../services/airportService.js';
import { getVisualRunwayGeometry } from '../data/visualRunwayCoordinates.js';
import { loadAirportGroundPackage } from '../services/airportGroundPackages.js';
import './OutsideFlightView.css';

const OutsideFlightScene = lazy(() => import('./OutsideFlightScene.jsx'));

export default function OutsideFlightView({ flightData, weatherData, timeZulu, timeScale, quality = 'balanced', departure, arrival, departureRunway, arrivalRunway }) {
  const position = flightData?.position;
  const distanceSq = (airport) => airport && Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
    ? (position.latitude - airport.latitude) ** 2 + ((position.longitude - airport.longitude) * Math.cos(position.latitude * Math.PI / 180)) ** 2
    : Infinity;
  const useDeparture = distanceSq(departure) <= distanceSq(arrival);
  const airport = useDeparture ? departure : arrival;
  const airportCode = airport?.icao || airport?.iata;
  const selectedRunway = useDeparture ? departureRunway : arrivalRunway;
  const [groundState, setGroundState] = useState(null);
  const departureCode = departure?.icao || departure?.iata;
  const arrivalCode = arrival?.icao || arrival?.iata;
  useEffect(() => {
    loadAirportGroundPackage(departureCode);
    loadAirportGroundPackage(arrivalCode);
  }, [departureCode, arrivalCode]);
  useEffect(() => {
    let cancelled = false;
    // Wait briefly for our own cached static asset, then freeze the fallback.
    // A late response must not replace the airport during final or rollout.
    const timer = setTimeout(() => { if (!cancelled) { cancelled = true; setGroundState({ code: airportCode, value: null }); } }, 800);
    loadAirportGroundPackage(airportCode).then((value) => {
      if (!cancelled) { cancelled = true; clearTimeout(timer); setGroundState({ code: airportCode, value }); }
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [airportCode]);
  const groundReady = groundState?.code === airportCode;
  const runwayEnds = String(selectedRunway || '').split(/[/-]/).filter(Boolean);
  const currentHeading = flightData?.heading;
  const runwayName = runwayEnds.length > 1 && Number.isFinite(currentHeading)
    ? runwayEnds.reduce((best, end) => {
        const error = (name) => Math.abs((((Number(name.slice(0, 2)) * 10 - currentHeading) + 540) % 360) - 180);
        return error(end) < error(best) ? end : best;
      })
    : runwayEnds[0];
  const geometry = useMemo(() => airportCode && runwayName
    ? getVisualRunwayGeometry(airportCode, runwayName, airportService.getRunwayGeometry(airportCode, runwayName))
    : null, [airportCode, runwayName]);
  const airportRunways = useMemo(() => {
    if (!airportCode) return [];
    const all = airportService.getAirportByCode(airportCode)?.runways || [];
    return all.map((runway) => {
      const ends = String(runway.name || '').split(/[/-]/).filter(Boolean);
      const activeHeading = Number(runwayName?.slice(0, 2)) * 10;
      return ends.find((end) => Math.abs((((Number(end.slice(0, 2)) * 10 - activeHeading) + 540) % 360) - 180) <= 90) || ends[0];
    })
      .filter((end) => end !== runwayName)
      .map((end) => getVisualRunwayGeometry(airportCode, end, airportService.getRunwayGeometry(airportCode, end)))
      .filter(Boolean);
  }, [airportCode, runwayName]);

  return <section className="outside-flight-view" aria-label="Forward outside view">
    {geometry && groundReady && Number.isFinite(flightData?.position?.latitude) && Number.isFinite(flightData?.position?.longitude)
      ? <Suspense fallback={<div className="outside-flight-placeholder">Preparing outside view…</div>}>
          <OutsideFlightScene flightData={flightData} weatherData={weatherData} geometry={geometry} airportRunways={airportRunways} groundPackage={groundState.value} timeZulu={timeZulu} timeScale={timeScale} quality={quality} />
        </Suspense>
      : <div className="outside-flight-placeholder">{geometry && !groundReady ? 'Preparing airport scenery…' : 'Outside view available when runway position is known'}</div>}
    <div className="outside-flight-roof" /><div className="outside-flight-left" /><div className="outside-flight-right" /><div className="outside-flight-glare" />
    <div className="outside-flight-caption">{airportCode || 'AIRPORT'} · RWY {runwayName || '—'}</div>
    {groundReady && groundState.value?.source === 'openstreetmap' && <a className="outside-flight-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>}
  </section>;
}
