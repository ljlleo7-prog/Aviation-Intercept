import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { airportService } from '../services/airportService.js';
import { useLanguage } from '../contexts/LanguageContext';
import { localPoint, geographicPoint, interceptPoint, constrainIntercept, insertProcedurePoint, procedureEndpoint, procedureKey, MAX_PROCEDURE_POINTS } from '../utils/procedureEditor.js';
import './ProcedureMiniMap.css';

const ProcedureMiniMap = ({ airport, runwayName, procedureName = '', waypoints = [], side = 'departure', value, onChange }) => {
  const { tx } = useLanguage();
  const svg = useRef(null);
  const dragging = useRef(null);
  const [dragProjection, setDragProjection] = useState(null);
  const code = airport?.icao || airport?.iata;
  const endpoint = airport && procedureEndpoint(waypoints, airport, side);
  const runways = useMemo(() => {
    if (!airport) return [];
    return (airport.runways?.length ? airport.runways : airportService.getRunwayInfo(code)).map(runway => {
      const name = String(runway.name || '');
      const geometry = airportService.getRunwayGeometry(code, name.split(/[/-]/)[0]);
      if (geometry) return { ...geometry, name };
      const hasThresholds = [runway.startLatitude, runway.startLongitude, runway.endLatitude, runway.endLongitude].every(v => v != null && Number.isFinite(Number(v)));
      const thresholdStart = hasThresholds ? { latitude: Number(runway.startLatitude), longitude: Number(runway.startLongitude) } : null;
      const thresholdEnd = hasThresholds ? { latitude: Number(runway.endLatitude), longitude: Number(runway.endLongitude) } : null;
      const offset = hasThresholds ? localPoint(thresholdStart, thresholdEnd) : null;
      const heading = runway.bearing != null && Number.isFinite(Number(runway.bearing)) ? Number(runway.bearing) : offset ? (Math.atan2(offset.x, offset.y) * 180 / Math.PI + 360) % 360 : parseInt(name, 10) * 10;
      if (!Number.isFinite(heading)) return null;
      const half = (Number(runway.length) || 6000) * 0.3048 / 1852 / 2;
      return { name, heading, thresholdStart: thresholdStart || interceptPoint(airport, heading, half, 'arrival'), thresholdEnd: thresholdEnd || interceptPoint(airport, heading, half, 'departure') };
    }).filter(Boolean);
  }, [airport, code]);
  const selected = code && runwayName ? airportService.getRunwayGeometry(code, runwayName) : null;
  const reference = runways.find(runway => runway.name.split(/[/-]/).includes(runwayName));
  const reciprocal = reference && runwayName === reference.name.split(/[/-]/)[1];
  const geometry = selected || (reference && { ...reference, heading: (reference.heading + (reciprocal ? 180 : 0)) % 360, thresholdStart: reciprocal ? reference.thresholdEnd : reference.thresholdStart });
  const origin = geometry?.thresholdStart || airport;
  const key = airport && procedureKey(airport, runwayName, endpoint, side);
  const initial = geometry && endpoint ? [interceptPoint(origin, geometry.heading, side === 'departure' ? 8 : 12, side)] : [];
  const points = value?.key === key ? value.points : initial;
  useEffect(() => {
    if (onChange && geometry && endpoint && value?.key !== key) onChange({ key, endpoint, origin, points: initial, airportCode: code, runwayName });
  });
  const commit = next => onChange?.({ key, endpoint, origin, points: next, airportCode: code, runwayName });
  const chain = endpoint ? side === 'departure' ? [origin, ...points, endpoint] : [endpoint, ...points, origin] : [];
  const all = [...chain, ...runways.flatMap(runway => [runway.thresholdStart, runway.thresholdEnd])].filter(Boolean);
  const local = origin ? all.map(point => localPoint(origin, point)) : [];
  const xs = local.map(point => point.x); const ys = local.map(point => point.y);
  const minX = Math.min(-3, ...xs); const maxX = Math.max(3, ...xs);
  const minY = Math.min(-3, ...ys); const maxY = Math.max(3, ...ys);
  const projection = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.min(400 / (maxX - minX), 300 / (maxY - minY)) };
  // Keep the scale fixed throughout a drag.
  const activeProjection = dragProjection || projection;
  const project = point => {
    const p = localPoint(origin, point);
    return { x: 250 + (p.x - activeProjection.cx) * activeProjection.scale, y: 200 - (p.y - activeProjection.cy) * activeProjection.scale };
  };
  const path = list => list.map(point => { const p = project(point); return `${p.x},${p.y}`; }).join(' ');
  const move = event => {
    const drag = dragging.current;
    if (!drag || !svg.current) return;
    const screen = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.current.getScreenCTM().inverse());
    const coordinate = geographicPoint(origin, { x: (screen.x - 250) / drag.projection.scale + drag.projection.cx, y: (200 - screen.y) / drag.projection.scale + drag.projection.cy });
    const next = [...points];
    next[drag.index] = points[drag.index].kind === 'intercept' ? constrainIntercept(origin, geometry.heading, coordinate, side) : { ...points[drag.index], ...coordinate };
    commit(next);
  };
  const finish = event => { dragging.current = null; setDragProjection(null); if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId); };
  if (!airport) return <p>{tx('Select airport for procedure preview.')}</p>;
  return <div className="procedure-editor">
    <div className="procedure-editor-view">
      <svg ref={svg} viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet" onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label={`${side === 'departure' ? 'SID' : 'STAR'} ${code} ${runwayName}`}>
        <rect width="500" height="400" fill="#020617" /><text x="460" y="25" fill="#cbd5e1">N ↑</text>
        {geometry && <polyline points={path([origin, interceptPoint(origin, geometry.heading, Math.max(30, Math.hypot(maxX - minX, maxY - minY)), side)])} stroke="#64748b" strokeDasharray="5 5" fill="none" />}
        {origin && runways.map(runway => <g key={runway.name}><polyline points={path([runway.thresholdStart, runway.thresholdEnd])} stroke={runway.name.split(/[/-]/).includes(runwayName) ? '#facc15' : '#64748b'} strokeWidth="5" /><text x={project(runway.thresholdEnd).x + 5} y={project(runway.thresholdEnd).y - 5} fill="#94a3b8" fontSize="10">{runway.name}</text></g>)}
        {chain.length > 0 && <polyline points={path(chain)} stroke={side === 'departure' ? '#22c55e' : '#f59e0b'} strokeWidth="2" fill="none" />}
        {origin && <g><circle cx={project(origin).x} cy={project(origin).y} r="5" fill="white" /><text x={project(origin).x + 8} y={project(origin).y + 15} fill="white" fontSize="11">{code}</text></g>}
        {endpoint && <g><circle cx={project(endpoint).x} cy={project(endpoint).y} r="5" fill="#38bdf8" /><text x={project(endpoint).x + 8} y={project(endpoint).y} fill="white" fontSize="11">{endpoint.name || endpoint.label}</text></g>}
        {points.map((point, index) => { const p = project(point); return <g key={index}><circle cx={p.x} cy={p.y} r="10" fill={point.kind === 'intercept' ? '#facc15' : '#a78bfa'} style={{ cursor: 'grab' }} onPointerDown={event => { event.preventDefault(); dragging.current = { index, projection }; setDragProjection(projection); svg.current.setPointerCapture(event.pointerId); }} /><text x={p.x + 13} y={p.y - 9} fill="white" fontSize="11">{point.name}</text></g>; })}
      </svg>
      <small>{side === 'departure' ? 'SID' : 'STAR'} · {runwayName || 'RWY'} · {procedureName || 'CUSTOM'}</small>
    </div>
    <div className="procedure-editor-list">
      <strong>{tx('Reference points')} · {points.length}/{MAX_PROCEDURE_POINTS}</strong>
      <p>{tx('Drag INTCP along the runway extension (minimum 2 NM). Drag reference points freely.')}</p>
      {(!geometry || !endpoint) && <p>{tx('Select a runway and a route with waypoint coordinates to edit.')}</p>}
      {chain.map((point, index) => {
        const pointIndex = side === 'departure' ? index - 1 : index;
        const editable = points[pointIndex] === point;
        const canInsert = index < chain.length - 1 && !(side === 'departure' && index === 0) && !(side === 'arrival' && index === chain.length - 2);
        return <div key={index} className="procedure-editor-row"><span>{index + 1}. {point === origin ? code : point.name || point.label}</span>{editable && point.kind !== 'intercept' && <button aria-label={`${tx('Remove')} ${point.name}`} onClick={() => commit(points.filter((_, i) => i !== pointIndex))}>×</button>}{canInsert && <button disabled={points.length >= MAX_PROCEDURE_POINTS || !geometry} onClick={() => commit(insertProcedurePoint(points, index, origin, endpoint, side))}>{tx('Insert midpoint')}</button>}</div>;
      })}
      {!!initial.length && <button onClick={() => commit(initial)}>{tx('Reset points')}</button>}
    </div>
  </div>;
};
ProcedureMiniMap.propTypes = { airport: PropTypes.object, runwayName: PropTypes.string, procedureName: PropTypes.string, waypoints: PropTypes.array, side: PropTypes.string, value: PropTypes.object, onChange: PropTypes.func };
export default ProcedureMiniMap;
