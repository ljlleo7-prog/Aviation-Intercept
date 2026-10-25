import { getRadarPreferences } from '../utils/radarPreferences.js';
import { useRadarView } from '../hooks/useRadarView.js';
import { getMapAirports } from '../services/airportMapData.js';
import { useEffect, useMemo, useState, useId, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { airportService } from '../services/airportService';
import { terrainRadarService } from '../services/TerrainRadarService';
import { weatherRadarService } from '../services/WeatherRadarService';
import { compassTicks } from '../utils/compassTicks';

const RAD = Math.PI / 180;
const normalize = value => ((value % 360) + 360) % 360;
const coordinate = (point, axis) => Number(point?.[axis] ?? point?.position?.[axis]);
const nameOf = point => point?.label || point?.name || point?.ident || point?.icao || 'WPT';

export default function B737NavigationDisplay({ data }) {
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const positionValid = Number.isFinite(latitude) && Number.isFinite(longitude);
  const heading = Number.isFinite(data.heading) ? normalize(data.heading) : 0;
  const altitude = Number.isFinite(data.altitude) ? data.altitude : 0;
  const range = data.radarRange || 40;
  const mode = data.radarMode || 'map';
  const [, setCacheFrame] = useState(0);
  const clipId = useId();
  const viewRef = useRef(null);
  useRadarView(terrainRadarService, viewRef, mode === 'terrain', latitude, longitude, range, heading);
  useRadarView(weatherRadarService, viewRef, mode === 'weather', latitude, longitude, range, heading);
  const waypoints = Array.isArray(data.waypoints) ? data.waypoints : [];
  const activeIndex = Number.isInteger(data.currentWaypointIndex) ? data.currentWaypointIndex : 0;
  const activeWaypoint = waypoints[activeIndex];

  useEffect(() => {
    if (!positionValid || (mode !== 'terrain' && mode !== 'weather')) return undefined;
    const timer = setInterval(() => setCacheFrame(frame => frame + 1), 2000);
    return () => clearInterval(timer);
  }, [positionValid, latitude, longitude, heading, range, mode]);

  const project = useCallback((lat, lon) => {
    const north = (lat - latitude) * 60;
    const east = (lon - longitude) * 60 * Math.cos(latitude * RAD);
    const right = east * Math.cos(heading * RAD) - north * Math.sin(heading * RAD);
    const forward = east * Math.sin(heading * RAD) + north * Math.cos(heading * RAD);
    return { x: 60 + right / range * 88, y: 106 - forward / range * 88, distance: Math.hypot(north, east) };
  }, [latitude, longitude, heading, range]);

  const route = positionValid ? waypoints.slice(activeIndex).map((point, index) => {
    const lat = coordinate(point, 'latitude');
    const lon = coordinate(point, 'longitude');
    return Number.isFinite(lat) && Number.isFinite(lon)
      ? { ...project(lat, lon), name: nameOf(point), index }
      : null;
  }).filter(Boolean) : [];
  const waypointDistance = activeWaypoint && positionValid
    ? project(coordinate(activeWaypoint, 'latitude'), coordinate(activeWaypoint, 'longitude')).distance
    : null;

  const airports = useMemo(() => positionValid && (mode === 'airport' || mode === 'map')
    ? getMapAirports(airportService.getAllAirports(), latitude, longitude, Math.min(range, 80), data.aircraftData || data.aircraftModel, 24)
    : [], [positionValid, latitude, longitude, range, mode, data.aircraftData, data.aircraftModel]);

  const radarTiles = (() => {
    if (!positionValid || (mode !== 'terrain' && mode !== 'weather')) return [];
    const service = mode === 'terrain' ? terrainRadarService : weatherRadarService;
    const tileRange = Math.min(range, getRadarPreferences()[mode === 'terrain' ? 'terrainRange' : 'weatherRange']);
    const longitudeRange = tileRange / 60 / Math.max(0.01, Math.cos(latitude * RAD));
    const { latIdx: firstLat, lonIdx: firstLon } = service.getGridIndices(latitude - tileRange / 60, longitude - longitudeRange);
    const { latIdx: lastLat, lonIdx: lastLon } = service.getGridIndices(latitude + tileRange / 60, longitude + longitudeRange);
    const tiles = [];
    const step = Math.max(1, Math.ceil(Math.sqrt((lastLat - firstLat + 1) * (lastLon - firstLon + 1) / 2500)));
    for (let latIndex = firstLat; latIndex <= lastLat; latIndex += step) {
      for (let lonIndex = firstLon; lonIndex <= lastLon; lonIndex += step) {
        const lat = (latIndex + 0.5) * service.GRID_SIZE;
        const lon = (lonIndex + 0.5) * service.GRID_SIZE;
        const point = project(lat, lon);
        if (point.distance > range || point.y > 106 || point.y < 17) continue;
        const value = mode === 'terrain' ? service.getTerrainHeight(lat, lon) : service.getWeather(lat, lon);
        if (value == null) continue;
        let color;
        if (mode === 'terrain') {
          const clearance = altitude - value;
          color = clearance < 500 ? '#ee3333' : clearance < 1000 ? '#e9d142' : clearance < 5000 ? '#38a34b' : null;
        } else {
          color = value.precip > 5 ? '#ee3333' : value.precip > 1 ? '#e9d142' : value.cloud > 60 ? '#38a34b' : null;
        }
        if (color) tiles.push({ ...point, color, size: Math.max(2, service.GRID_SIZE * 60 / range * 88 * step) });
      }
    }
    return tiles;
  })();

  const traffic = positionValid && mode === 'tcas' && Array.isArray(data.npcs)
    ? data.npcs.map(npc => {
      const lat = coordinate(npc, 'latitude');
      const lon = coordinate(npc, 'longitude');
      return Number.isFinite(lat) && Number.isFinite(lon) ? { ...project(lat, lon), altitude: npc.altitude } : null;
    }).filter(point => point && point.distance <= range && point.y >= 17 && point.y <= 106)
    : [];

  return <g ref={viewRef}>
    <text x="3" y="7" className="green small">GS {Math.round(data.groundSpeed || 0)} TAS {Math.round(data.trueAirspeed || 0)}</text>
    <text x="117" y="7" textAnchor="end" className="magenta small">{activeWaypoint ? nameOf(activeWaypoint) : 'N/A'} {waypointDistance === null || !Number.isFinite(waypointDistance) ? '--.-' : waypointDistance.toFixed(1)}NM</text>
    <text x="60" y="17" textAnchor="middle" className="small">{String(Math.round(heading)).padStart(3, '0')} MAG</text>
    <text x="4" y="24" className="cyan tiny">{mode.toUpperCase()} {range}NM</text>
    <defs><clipPath id={clipId}><path d="M0 18H120V106H0Z"/></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      {radarTiles.map((tile, index) => <rect key={index} x={tile.x - tile.size / 2} y={tile.y - tile.size / 2} width={tile.size} height={tile.size} fill={tile.color} opacity=".6"/>)}
      {[35, 65, 88].map(radius => <path key={radius} d={`M${60 - radius} 106a${radius} ${radius} 0 0 1 ${radius * 2} 0`} fill="none" stroke="#b6a8bc" strokeWidth=".6" strokeDasharray={radius === 35 ? '3 4' : undefined}/>)}
      {compassTicks(heading).map(tick => <g key={tick.bearing} transform={`translate(60 106) rotate(${tick.offset})`}><path d="M0-88v5" stroke="white" strokeWidth=".8"/><text x="0" y="-76" textAnchor="middle" transform={`rotate(${-tick.offset} 0 -76)`} className="small">{tick.label}</text></g>)}
      {(mode === 'map' || mode === 'airport') && airports.map(airport => {
        const center = project(airport.latitude, airport.longitude);
        const runways = Array.isArray(airport.runways) && airport.runways.length
          ? airport.runways
          : (airport.runway ? [{ name: airport.runway }] : []);
        return <g key={airport.icao || airport.iata}>
          <circle cx={center.x} cy={center.y} r="2" fill="none" stroke="#59d8e9" strokeWidth=".8"/>
          <text x={center.x + 3} y={center.y - 3} className="cyan tiny">{airport.icao || airport.iata}</text>
          {runways.map(runway => {
            const geometry = airportService.getRunwayGeometry(airport.iata || airport.icao, runway.name);
            if (!geometry?.thresholdStart || !geometry?.thresholdEnd) return null;
            const start = project(geometry.thresholdStart.latitude, geometry.thresholdStart.longitude);
            const end = project(geometry.thresholdEnd.latitude, geometry.thresholdEnd.longitude);
            return <path key={runway.name} d={`M${start.x} ${start.y}L${end.x} ${end.y}`} stroke="#d8b4fe" strokeWidth="1.4"/>;
          })}
        </g>;
      })}
      {route.length > 0 && <polyline points={`60,106 ${route.map(point => `${point.x},${point.y}`).join(' ')}`} fill="none" stroke="#e652d9" strokeWidth="1.4"/>}
      {route.map(point => <g key={`${point.name}-${point.index}`}><path d={`M${point.x} ${point.y - 3}l3 3-3 3-3-3z`} fill="none" stroke="#e652d9"/><text x={point.x + 4} y={point.y - 3} className="magenta tiny">{point.name}</text></g>)}
      {traffic.map((point, index) => <g key={index}><path d={`M${point.x - 3} ${point.y}h6`} stroke="#f4cf83" strokeWidth="1.5"/><text x={point.x + 4} y={point.y} className="amber tiny">{Math.round((point.altitude || 0) / 100)}</text></g>)}
      <path d="m60 99-4 10 4-2 4 2z" fill="none" stroke="white"/>
      <path d="M60 100V20" stroke="white" strokeWidth=".5" strokeDasharray="2 3"/>
    </g>
    <text x="15" y="115" className="cyan tiny">VOR 1</text><text x="92" y="115" className="cyan tiny">VOR 2</text>
  </g>;
}

B737NavigationDisplay.propTypes = { data: PropTypes.object.isRequired };
