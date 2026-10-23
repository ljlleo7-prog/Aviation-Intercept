import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { projectGroundPoint } from '../utils/airportGroundCoordinates';

// Scenery coordinates are metres east and south; keep their aspect ratio and north up.
const areaPath = area => (area || []).flatMap(polygon => polygon.map(ring =>
  ring.length ? `M${ring.map(point => point.join(',')).join('L')}Z` : ''
)).join('');
const linePath = points => `M${points.map(point => point.join(',')).join('L')}`;

const AirportSceneryMap = ({ data, zoom, labels, runwayName, flightState }) => {
  const [followAircraft, setFollowAircraft] = useState(false);
  const layers = useMemo(() => ({
    land: areaPath(data.land),
    apron: data.aprons.map(item => areaPath(item.area)).join(''),
    buildings: data.buildings.map(item => areaPath(item.footprint)).join('')
  }), [data]);
  const { minX, maxX, minZ, maxZ } = data.bounds;
  const scale = Math.min(550 / (maxX - minX), 290 / (maxZ - minZ)) * zoom;
  const own = Number.isFinite(flightState?.latitude) && Number.isFinite(flightState?.longitude)
    ? projectGroundPoint(flightState.latitude, flightState.longitude, data.origin) : null;
  const ownVisible = own && own[0] >= minX && own[0] <= maxX && own[1] >= minZ && own[1] <= maxZ;
  const centerX = followAircraft && ownVisible ? own[0] : (minX + maxX) / 2;
  const centerZ = followAircraft && ownVisible ? own[1] : (minZ + maxZ) / 2;
  const screenX = own ? 300 + (own[0] - centerX) * scale : 0;
  const screenY = own ? 170 + (own[1] - centerZ) * scale : 0;
  const onScreen = ownVisible && screenX >= 15 && screenX <= 585 && screenY >= 15 && screenY <= 325;
  return <>
    <div className="map-toolbar"><span className="map-note">{ownVisible ? '● Live aircraft position' : own ? 'Aircraft outside this airport' : 'Aircraft position unavailable'}</span><button disabled={!ownVisible} aria-pressed={followAircraft} onClick={() => setFollowAircraft(value => !value)}>Follow aircraft</button></div>
    <svg className="airport-briefing-map" viewBox="0 0 600 340" role="img" aria-label={`${data.airportCode} airport scenery map`}>
      <g transform={`translate(300 170) scale(${scale}) translate(${-centerX} ${-centerZ})`}>
        <path d={layers.land} fill="#183b3e" fillRule="evenodd" />
        <path d={layers.apron} fill="#46566a" fillRule="evenodd" />
        {data.roads.map((road, index) => <path key={index} d={linePath(road.path)} fill="none" stroke="#405360" strokeWidth={road.width || 8} />)}
        {data.taxiways.map((taxiway, index) => <path key={index} d={linePath(taxiway.path)} fill="none" stroke="#718391" strokeWidth={taxiway.width || 20} strokeLinejoin="round" />)}
        <path d={layers.buildings} fill="#a4b6c5" fillRule="evenodd" />
        {data.runways.map((runway, index) => {
          const selected = runway.ref?.split('/').some(end => runwayName?.split('/').includes(end));
          const middle = runway.path[Math.floor(runway.path.length / 2)];
          return <g key={index}>
            <path d={linePath(runway.path)} fill="none" stroke={selected ? '#60d8e7' : '#d3dce2'} strokeWidth={runway.width || 45} />
            <path d={linePath(runway.path)} fill="none" stroke="#172534" strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${5 / scale}`} />
            {labels && <text x={middle[0]} y={middle[1] - 10 / scale} textAnchor="middle" fill="#fff" stroke="#0a1928" strokeWidth={3 / scale} paintOrder="stroke" fontSize={11 / scale}>{runway.ref}</text>}
          </g>;
        })}
      </g>
      {onScreen && <g transform={`translate(${screenX} ${screenY})`} aria-label="Your aircraft position">
        <title>Your aircraft · heading {Math.round(flightState.heading || 0)}°</title>
        <circle r="17" fill="#fbbf24" fillOpacity="0.16" stroke="#fbbf24" strokeOpacity="0.6" />
        <path transform={`rotate(${flightState.heading || 0})`} d="M0 -13 L4 -2 L12 4 L12 7 L3 4 L3 10 L6 13 L-6 13 L-3 10 L-3 4 L-12 7 L-12 4 L-4 -2 Z" fill="#fbbf24" stroke="#101e2d" strokeWidth="1.5" />
        <text y="-25" textAnchor="middle" fill="#fbbf24" stroke="#0a1928" strokeWidth="4" paintOrder="stroke" fontSize="12" fontWeight="700">YOU</text>
      </g>}
      {ownVisible && !onScreen && <text x="300" y="320" textAnchor="middle" fill="#fbbf24" fontSize="12">Aircraft off screen · enable Follow aircraft</text>}
      <text x="560" y="30" fill="#8cbaca">N ↑</text>
    </svg>
    <p className="map-note">Scenery ground layout · Runways, taxiways, aprons and buildings. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · Not a published navigation chart.</p>
  </>;
};
AirportSceneryMap.propTypes = { data: PropTypes.object.isRequired, zoom: PropTypes.number.isRequired, labels: PropTypes.bool, runwayName: PropTypes.string, flightState: PropTypes.object };
export default AirportSceneryMap;
