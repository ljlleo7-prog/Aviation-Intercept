import { getMapAirports, isAirportSuitableForMap } from '../services/airportMapData.js';
import useAirportResults from '../hooks/useAirportResults.js';
import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import LocalRouteMap from './LocalRouteMap';
import { airportService } from '../services/airportService';
import './FlightMapWorkspace.css';
import AirportSceneryMap from './AirportSceneryMap';
import { loadAirportGroundPackage } from '../services/airportGroundPackages';

const FlightMapWorkspace = ({ flightPlan, flightState, departure, arrival, routeDetails, aircraftData }) => {
  const { tx } = useLanguage();
  const [mode, setMode] = useState('route');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [runwayName, setRunwayName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [labels, setLabels] = useState(true);
  const waypoints = Array.isArray(flightPlan) ? flightPlan : flightPlan?.waypoints || routeDetails?.waypoints || [];
  const airports = waypoints.map(point => airportService.getAirportByCode(point.icao || point.label || '')).filter(Boolean);
  const origin = departure || airports[0];
  const destination = arrival || airports.at(-1);
  const currentAirport = getMapAirports(airportService.getAllAirports(), flightState?.latitude, flightState?.longitude, 8, aircraftData, 1)[0];
  const airport = [selected, currentAirport, origin, destination].find(candidate => isAirportSuitableForMap(candidate, aircraftData));
  const details = airportService.getAirportByCode(airport?.icao || '') || airport;
  const [scenery, setScenery] = useState(null);
  const [sceneryLoading, setSceneryLoading] = useState(false);
  const airportCode = details?.icao || details?.iata;
  useEffect(() => {
    let cancelled = false;
    setScenery(null);
    if (mode !== 'airport' || !airportCode) return;
    setSceneryLoading(true);
    loadAirportGroundPackage(airportCode).then(data => {
      if (!cancelled) { setScenery(data); setSceneryLoading(false); }
    });
    return () => { cancelled = true; };
  }, [airportCode, mode]);
  const runways = details?.runways || [];
  const activeRunway = runways.find(runway => runway.name === runwayName) || runways[0];
  const results = useAirportResults(query, 8, aircraftData);
  const chooseAirport = next => { setSelected(next); setRunwayName(''); setZoom(1); setQuery(''); setMode('airport'); };

  return <section className="flight-map-workspace">
    <div className="map-toolbar"><div><small>{tx("NAVIGATION WORKSPACE")}</small><h2>{mode === 'route' ? tx("Route overview") : tx("Airport briefing")}</h2></div><small>{tx("LOCAL DATA")}</small></div>
    <div className="map-toolbar">
      <div className="map-controls">{['route', 'airport'].map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'route' ? tx("Route map") : tx("Airport map")}</button>)}</div>
      <div className="map-controls">{currentAirport && <button onClick={() => chooseAirport(currentAirport)}>Current · {currentAirport.icao}</button>}{origin && <button onClick={() => chooseAirport(origin)}>{tx("DEP ·")}{origin.icao || origin.label}</button>}{destination && <button onClick={() => chooseAirport(destination)}>{tx("ARR ·")}{destination.icao || destination.label}</button>}</div>
    </div>
    {mode === 'route' ? <>
      <LocalRouteMap departure={origin} arrival={destination} waypoints={waypoints} routeObject={routeDetails} aircraftPosition={flightState} height={340} />
      <div className="map-stat-grid"><div><small>{tx("Departure")}</small><strong>{origin?.icao || tx("Unassigned")}</strong></div><div><small>{tx("Destination")}</small><strong>{destination?.icao || tx("Unassigned")}</strong></div><div><small>{tx("Route fixes")}</small><strong>{waypoints.length}</strong></div></div>
      <p className="map-note">{tx("Review route continuity and procedure segments. Diagram fits the route automatically; terrain and airspace are not depicted.")}</p>
    </> : <>
      <label className="map-search">{tx("Find an airport")}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={tx("ICAO, IATA or airport name")} /></label>
      {query.trim().length >= 2 && <div className="map-results">{results.length ? results.map(result => <button key={result.icao} onClick={() => chooseAirport(result)}><strong>{result.icao}</strong> {result.name}</button>) : <p>{tx("No matching airport in the local database.")}</p>}</div>}
      {details ? <>
        <h3>{details.icao} · {details.name}</h3>
        <div className="map-toolbar"><label>{tx("Runway")}<select value={activeRunway?.name || ''} onChange={event => setRunwayName(event.target.value)}>{runways.map(runway => <option key={runway.name}>{runway.name}</option>)}</select></label><div className="map-controls"><button aria-label={tx("Zoom out")} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button><button onClick={() => setZoom(1)}>{tx("Fit")}</button><button aria-label={tx("Zoom in")} onClick={() => setZoom(value => Math.min(3, value + 0.25))}>+</button><button aria-pressed={labels} onClick={() => setLabels(value => !value)}>{tx("Labels")}</button></div></div>
        {sceneryLoading ? <p className="map-note">Loading airport scenery…</p> : scenery ? <AirportSceneryMap key={scenery.airportCode} data={scenery} zoom={zoom} labels={labels} runwayName={activeRunway?.name} flightState={flightState} /> : <svg className="airport-briefing-map" viewBox="0 0 600 340" role="img" aria-label={`${details.icao} schematic runway diagram`}>
          <text x="560" y="30" fill="#8cbaca">N ↑</text>
          <g transform={`translate(300 170) scale(${zoom})`}>{runways.map((runway, index) => {
            const heading = Number(runway.bearing) || Number.parseInt(runway.name, 10) * 10;
            const length = Math.max(65, Math.min(220, (Number(runway.length) || 6000) / 60));
            const offset = (index - (runways.length - 1) / 2) * 32;
            return <g key={runway.name} transform={`translate(${offset} 0) rotate(${Number.isFinite(heading) ? heading : 0})`}><rect x="-7" y={-length / 2} width="14" height={length} rx="2" fill={runway === activeRunway ? '#60d8e7' : '#647b8e'} /><path d={`M 0 ${-length / 2 + 8} V ${length / 2 - 8}`} stroke="#0b1726" strokeDasharray="6 5" />{labels && <text y={-length / 2 - 12} textAnchor="middle" fill="#e3edf7" fontSize="12">{runway.name}</text>}</g>;
          })}</g>
          {!runways.length && <text x="300" y="170" fill="#a9bbce" textAnchor="middle">{tx("Runway data unavailable")}</text>}
        </svg>}
        <div className="map-stat-grid"><div><small>{tx("Selected runway")}</small><strong>{activeRunway?.name || tx("Unavailable")}</strong></div><div><small>{tx("Length")}</small><strong>{activeRunway?.length ? `${activeRunway.length.toLocaleString()} ft` : tx("Unavailable")}</strong></div><div><small>{tx("Surface")}</small><strong>{activeRunway?.surface || tx("Unavailable")}</strong></div></div>
        {!scenery && !sceneryLoading && <p className="map-note">Scenery data unavailable for this airport. {tx("Simulator schematic. Runway placement and heading are approximate. Taxiways, stands and obstacles are not shown; this is not a published airport chart.")}</p>}
      </> : <p className="map-note">{tx("Search for an airport to review its runways and briefing.")}</p>}
    </>}
  </section>;
};
FlightMapWorkspace.propTypes = { flightPlan: PropTypes.any, flightState: PropTypes.object, departure: PropTypes.object, arrival: PropTypes.object, routeDetails: PropTypes.object, aircraftData: PropTypes.object };
export default FlightMapWorkspace;
