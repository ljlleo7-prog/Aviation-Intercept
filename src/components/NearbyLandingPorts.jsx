import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { airportService } from '../services/airportService';
import { getMapAirports } from '../services/airportMapData.js';
import { airportGuidance } from '../utils/diversionNavigation.js';
import { useLanguage } from '../contexts/LanguageContext';

export default function NearbyLandingPorts({ flightState, aircraftData, onDivert, target }) {
  const { t } = useLanguage();
  const text = key => t(`ui.flight_computer.nearest.${key}`);
  const [radius, setRadius] = useState(150);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let cancelled = false;
    airportService.loadInstalledAirports().then(() => { if (!cancelled) setRevision(value => value + 1); });
    return () => { cancelled = true; };
  }, []);
  const airports = useMemo(() => {
    void revision; // Refresh after installed airport data loads or the pilot requests an update.
    return getMapAirports(airportService.getAllAirports(), flightState?.latitude, flightState?.longitude, radius, aircraftData, 20);
  }, [flightState?.latitude, flightState?.longitude, radius, aircraftData, revision]);
  const chosen = selected || target;
  const guidance = chosen && airportGuidance(flightState, chosen);
  const format = value => `${String(Math.round(value) % 360).padStart(3, '0')}°T`;
  return <div className="nearest-section">
    <label>{text('radius')} <select value={radius} onChange={event => setRadius(Number(event.target.value))}>{[50, 150, 300, 500].map(value => <option key={value} value={value}>{value} NM</option>)}</select></label>
    <p>{text('suitability')}</p>
    <svg viewBox="0 0 600 400" style={{ width: '100%', background: '#020617', borderRadius: 8 }} role="group" aria-label={text('map')}>
      {[60, 120, 170].map(r => <circle key={r} cx="300" cy="200" r={r} fill="none" stroke="#26374e" />)}
      <text x="300" y="20" textAnchor="middle" fill="#bae6fd">N ↑ · {radius} NM</text>
      <g transform={`translate(300 200) rotate(${flightState?.heading || 0})`}><path d="M0 -10 L7 8 L0 4 L-7 8 Z" fill="white" /></g>
      {airports.map(airport => {
        const nav = airportGuidance(flightState, airport);
        const x = 300 + Math.sin(nav.bearing * Math.PI / 180) * nav.distance / radius * 170;
        const y = 200 - Math.cos(nav.bearing * Math.PI / 180) * nav.distance / radius * 170;
        const active = chosen?.icao === airport.icao;
        return <g key={airport.icao} role="button" tabIndex={0} aria-label={`${airport.icao} ${airport.name}`} onClick={() => setSelected(airport)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(airport); } }} style={{ cursor: 'pointer' }}>
          <title>{airport.name} · {nav.distance.toFixed(1)} NM · {format(nav.bearing)}</title>
          {active && <line x1="300" y1="200" x2={x} y2={y} stroke="#e879f9" strokeDasharray="5 4" />}
          <circle cx={x} cy={y} r="12" fill={active ? '#e879f9' : '#38bdf8'} /><path d={`M${x - 6} ${y} h12 M${x} ${y - 6} v12`} stroke="#020617" strokeWidth="3" />
          <text x={x + 14} y={y + 4} fill="white" fontSize="12">{airport.icao}</text>
        </g>;
      })}
    </svg>
    {guidance && <div className="utils-block"><strong>{chosen.icao} · {chosen.name}</strong><p>{text('distance')} {guidance.distance.toFixed(1)} NM · {text('bearing')} {format(guidance.bearing)} {guidance.turn !== null && <>· <span style={{ display: 'inline-block', transform: `rotate(${guidance.turn}deg)` }}>↑</span> {Math.abs(guidance.turn).toFixed(0)}° {guidance.turn < 0 ? text('left') : text('right')}</>}</p><button className="direct-btn" onClick={() => onDivert(chosen)}>{text('divert')}</button></div>}
    {!airports.length && <p>{text('none')}</p>}
    <ul className="nearest-list">{airports.map(airport => {
      const nav = airportGuidance(flightState, airport);
      return <li key={airport.icao} className="nearest-item"><button className="direct-btn" onClick={() => setSelected(airport)}>{airport.icao} · {airport.name}</button><span>{nav.distance.toFixed(1)} NM · {format(nav.bearing)}</span><button className="direct-btn" onClick={() => { setSelected(airport); onDivert(airport); }}>{text('divert')}</button></li>;
    })}</ul>
    <button className="refresh-btn" onClick={() => setRevision(value => value + 1)}>{text('refresh')}</button>
  </div>;
}
NearbyLandingPorts.propTypes = { flightState: PropTypes.object, aircraftData: PropTypes.object, onDivert: PropTypes.func.isRequired, target: PropTypes.object };
