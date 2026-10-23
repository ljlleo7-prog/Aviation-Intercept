import FlightFailureSettings from './FlightFailureSettings.jsx';
import { normalizeFailureSelection } from '../config/flightFailures.js';
import useAirportResults from '../hooks/useAirportResults.js';
import { useLanguage } from '../contexts/LanguageContext';
import React, { useEffect, useState, useCallback } from 'react';
import './RouteSelectionFrame.css';
import './FlightInitialization.css';
import {
  generateSID, generateSTAR, generateGate, generateTaxiway,
  getLastProcedureWaypoint, getRunways, generateSmartRouteDetails, procedureMatchesWaypoint
} from '../utils/routeGenerator';
import LocalRouteMap from './LocalRouteMap';
import ProcedureMiniMap from './ProcedureMiniMap.jsx';
import { calculateDistance } from '../utils/distanceCalculator';

const calcRouteDistance = (departure, waypoints, arrival) => {
  const pts = [departure, ...(waypoints || []), arrival].filter(p => p?.latitude != null && p?.longitude != null);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += calculateDistance(pts[i].latitude, pts[i].longitude, pts[i+1].latitude, pts[i+1].longitude);
  }
  return Math.round(total);
};

const DEFAULT_ROUTE_DATA = {
  departureGate: '', departureTaxiway: '', departureRunway: '', sid: '',
  waypoints: [], star: '', landingRunway: '', landingTaxiway: '', arrivalGate: '',
  routeObject: null, routeSource: '', routeFallbackUsed: false, routeDebug: [],
  routeBilling: null, procedures: null, procedureSegments: [], routeAlternatives: [],
  selectedRouteAlternativeId: '', relaxAirwayLimitations: false
};

const buildRouteDataFromObject = ({ routeObject, currentRouteData = {}, departure, arrival, depRunways = [], arrRunways = [], difficulty = '', relaxAirways = false }) => {
  const waypoints = routeObject.waypoints || [];
  const sid = generateSID((waypoints[0] && waypoints[0].name) || 'ABC');
  const star = generateSTAR(getLastProcedureWaypoint(waypoints) || (waypoints[waypoints.length - 1]?.name) || 'ABC');
  const isEastward = arrival.longitude > departure.longitude;
  const bestDepRunway = depRunways.length > 0 ? [...depRunways].sort((a, b) => parseInt(a) - parseInt(b))[isEastward ? 0 : depRunways.length - 1] : '';
  const bestArrRunway = arrRunways.length > 0 ? [...arrRunways].sort((a, b) => parseInt(a) - parseInt(b))[isEastward ? 0 : arrRunways.length - 1] : '';
  const isAmateurOrHigher = ['amateur', 'intermediate', 'advanced', 'pro', 'devil'].includes(difficulty);
  const isAdvancedOrHigher = ['advanced', 'pro', 'devil'].includes(difficulty);

  return {
    ...currentRouteData,
    departureGate: currentRouteData.departureGate ?? (isAmateurOrHigher ? '' : generateGate()),
    departureTaxiway: currentRouteData.departureTaxiway || generateTaxiway(),
    departureRunway: currentRouteData.departureRunway ?? (isAmateurOrHigher ? '' : bestDepRunway),
    sid: currentRouteData.sid ?? (isAdvancedOrHigher ? '' : sid),
    waypoints,
    star: currentRouteData.star ?? (isAdvancedOrHigher ? '' : star),
    landingRunway: currentRouteData.landingRunway ?? (isAmateurOrHigher ? '' : bestArrRunway),
    landingTaxiway: currentRouteData.landingTaxiway || generateTaxiway(),
    arrivalGate: currentRouteData.arrivalGate ?? (isAmateurOrHigher ? '' : generateGate()),
    routeObject,
    routeSource: routeObject.source,
    routeFallbackUsed: routeObject.fallbackUsed,
    routeDebug: routeObject.debug || [],
    routeSourceChain: routeObject.sourceChain || [],
    routeBilling: routeObject.billing || null,
    procedures: routeObject.procedures || null,
    procedureSegments: routeObject.procedureSegments || [],
    routeAlternatives: routeObject.routeAlternatives || routeObject.metadata?.routeAlternatives || [],
    selectedRouteAlternativeId: routeObject.selectedRouteAlternativeId || routeObject.metadata?.selectedRouteAlternativeId || '',
    relaxAirwayLimitations: relaxAirways
  };
};

const applyRouteAlternative = (routeData, candidateId) => {
  const candidate = (routeData.routeAlternatives || []).find(e => e.candidateId === candidateId);
  if (!candidate) return routeData;
  return {
    ...routeData,
    waypoints: candidate.waypoints || [],
    routeObject: routeData.routeObject ? {
      ...routeData.routeObject,
      waypoints: candidate.waypoints || [],
      legs: candidate.legs || routeData.routeObject.legs || [],
      metadata: {
        ...(routeData.routeObject.metadata || {}),
        routeId: candidate.routeId || '',
        routeCode: candidate.routeCode || '',
        routeString: candidate.routeString || '',
        selectedRouteAlternativeId: candidate.candidateId,
        routeAlternatives: routeData.routeAlternatives || []
      }
    } : null,
    selectedRouteAlternativeId: candidate.candidateId
  };
};

// Inline airport search field
const AirportSearchField = ({ label, value, onSelect }) => {
  const { tx } = useLanguage();
  const [query, setQuery] = useState(value ? `${value.iata || value.icao} – ${value.name}` : '');
  const results = useAirportResults(query, 8);
  const [open, setOpen] = useState(false);

  const search = useCallback((q) => {
    setQuery(q);
    setOpen(true);
  }, []);

  const pick = (airport) => {
    setQuery(`${airport.iata || airport.icao} – ${airport.name}`);
    setOpen(false);
    onSelect(airport);
  };

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{label}</label>
      <input
        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={tx("Search by IATA, ICAO, city…")}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', zIndex: 100, maxHeight: '200px', overflowY: 'auto' }}>
          {results.map(a => (
            <div
              key={a.icao || a.iata}
              onMouseDown={() => pick(a)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0' }}
            >
              <strong>{a.iata || a.icao}</strong> · {a.name} <span style={{ color: '#64748b', fontSize: '11px' }}>{a.city}, {a.country}</span>
            </div>
          ))}
        </div>
      )}
      {value && (
        <div style={{ fontSize: '11px', color: '#4CAF50', marginTop: '3px' }}>
          {value.icao} · {value.city || value.country} · {value.elevation != null ? `${value.elevation} ft` : ''}
        </div>
      )}
    </div>
  );
};

// Section header with step number
const Section = ({ step, title, children }) => (
  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
      <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>{step}</span>
      <h3 style={{ margin: 0, color: '#60a5fa', fontSize: '15px' }}>{title}</h3>
    </div>
    {children}
  </div>
);

const RouteSelectionFrame = ({
  isOpen, onConfirm, onSkip, onChange, difficulty, onSetDifficulty,
  departure: externalDeparture, arrival: externalArrival,
  onSelectDeparture, onSelectArrival,
  routeData: externalRouteData, routeAuthState = 'guest', aircraftType = '',
  preflightConfig = {}, updatePreflightConfig, aircraftSuggestions = []
}) => {
  const { tx, t } = useLanguage();
  const [departure, setDeparture] = useState(externalDeparture || null);
  const [arrival, setArrival] = useState(externalArrival || null);
  const [routeData, setRouteData] = useState(DEFAULT_ROUTE_DATA);
  const [availableRunwaysDep, setAvailableRunwaysDep] = useState([]);
  const [availableRunwaysArr, setAvailableRunwaysArr] = useState([]);
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [manualWaypoints, setManualWaypoints] = useState('');
  const [relaxAirways, setRelaxAirways] = useState(false);

  // sync external airports
  useEffect(() => { if (externalDeparture) setDeparture(externalDeparture); }, [externalDeparture]);
  useEffect(() => { if (externalArrival) setArrival(externalArrival); }, [externalArrival]);

  useEffect(() => {
    if (externalRouteData) {
      setRouteData({ ...DEFAULT_ROUTE_DATA, ...externalRouteData });
      setRelaxAirways(Boolean(externalRouteData.relaxAirwayLimitations));
      if (externalRouteData.waypoints?.length) {
        setManualWaypoints(externalRouteData.waypoints.map(w => typeof w === 'string' ? w : w.name).join(' '));
      }
    }
  }, [externalRouteData]);

  const fetchRoute = useCallback(async (dep, arr, relax) => {
    if (!dep || !arr) return;
    const depRunways = getRunways(dep);
    const arrRunways = getRunways(arr);
    setAvailableRunwaysDep(depRunways);
    setAvailableRunwaysArr(arrRunways);
    setIsGeneratingRoute(true);
    const routeObject = await generateSmartRouteDetails(dep, arr, {
      authState: routeAuthState, aircraftType,
      localAip: { relaxAirwayLimitations: relax },
    });
    const next = buildRouteDataFromObject({ routeObject, currentRouteData: {}, departure: dep, arrival: arr, depRunways, arrRunways, difficulty, relaxAirways: relax });
    setRouteData(next);
    onChange?.(next);
    setManualWaypoints(next.waypoints.map(w => typeof w === 'string' ? w : w.name).join(' '));
    setIsGeneratingRoute(false);
  }, [routeAuthState, aircraftType, difficulty, onChange]);

  // auto-fetch when both airports set
  useEffect(() => {
    if (!isOpen || !departure || !arrival) return;
    const shouldHydrate = !externalRouteData || (!externalRouteData.waypoints?.length && !externalRouteData.departureRunway && !externalRouteData.landingRunway);
    if (shouldHydrate) fetchRoute(departure, arrival, relaxAirways);
    else {
      setAvailableRunwaysDep(getRunways(departure));
      setAvailableRunwaysArr(getRunways(arrival));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, departure, arrival]);

  const handleChange = (field, value) => {
    const next = { ...routeData, [field]: value };
    setRouteData(next);
    onChange?.(next);
  };

  const handleRelaxAirwaysChange = (checked) => {
    setRelaxAirways(checked);
    onChange?.({ ...routeData, relaxAirwayLimitations: checked });
  };

  const handleRouteAlternativeChange = (candidateId) => {
    const next = applyRouteAlternative(routeData, candidateId);
    setRouteData(next);
    setManualWaypoints((next.waypoints || []).map(w => typeof w === 'string' ? w : w.name).join(' '));
    onChange?.(next);
  };

  const handleManualWaypointsChange = (value) => {
    setManualWaypoints(value);
    const wps = value.split(/[\s,]+/).filter(Boolean).map(name => ({ name, type: 'WAYPOINT' }));
    const next = { ...routeData, waypoints: wps };
    setRouteData(next);
    onChange?.(next);
  };

  const handleSelectDeparture = (airport) => {
    setDeparture(airport);
    setAvailableRunwaysDep(getRunways(airport));
    onSelectDeparture?.(airport);
    setRouteData(DEFAULT_ROUTE_DATA);
  };

  const handleSelectArrival = (airport) => {
    setArrival(airport);
    setAvailableRunwaysArr(getRunways(airport));
    onSelectArrival?.(airport);
    setRouteData(DEFAULT_ROUTE_DATA);
  };

  const failureSelection = normalizeFailureSelection(preflightConfig.failureSelection);
  const isFailureSelectionValid = failureSelection.mode === 'normal' || failureSelection.banks.length > 0;

  const isFormValid = () => {
    if (!isFailureSelectionValid) return false;
    if (difficulty === 'rookie') return Boolean(departure && arrival);
    if (!departure || !arrival || !routeData.departureGate || !routeData.departureRunway || !routeData.arrivalGate || !routeData.landingRunway) return false;
    if (['intermediate', 'advanced', 'pro', 'devil'].includes(difficulty) && routeData.waypoints.length === 0) return false;
    if (['advanced', 'pro', 'devil'].includes(difficulty) && (!routeData.sid || !routeData.star)) return false;
    const firstWaypoint = routeData.waypoints[0]?.name || routeData.waypoints[0] || '';
    const lastWaypoint = getLastProcedureWaypoint(routeData.waypoints) || '';
    if (routeData.sid && firstWaypoint && !procedureMatchesWaypoint(routeData.sid, firstWaypoint)) return false;
    if (routeData.star && lastWaypoint && !procedureMatchesWaypoint(routeData.star, lastWaypoint)) return false;
    return true;
  };

  if (!isOpen) return null;

  const showWaypoints = ['rookie', 'intermediate', 'advanced', 'pro', 'devil'].includes(difficulty);
  const showSidStar = ['rookie', 'advanced', 'pro', 'devil'].includes(difficulty);
  const hasPublishedProcedures = Boolean(routeData.procedureSegments?.length || routeData.procedures?.sid || routeData.procedures?.star);
  const routeAlternatives = routeData.routeAlternatives || [];
  const selectedAlternative = routeAlternatives.find(c => c.candidateId === routeData.selectedRouteAlternativeId) || routeAlternatives[0] || null;
  const routeDistance = departure && arrival ? calcRouteDistance(departure, routeData.waypoints, arrival) : null;

  return (
    <div style={{ width: '100%', maxWidth: '680px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{tx("Flight Plan")}</h2>
          <span style={{ background: 'rgba(255,255,255,0.1)', padding: '3px 12px', borderRadius: '20px', fontSize: '11px', color: '#94a3b8', letterSpacing: '1px' }}>{t(`initialization.difficulty.${difficulty || 'rookie'}`)}</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 1rem' }}>{tx("Scroll through each section to configure your route")}</p>

        {/* 0 — Difficulty */}
        {onSetDifficulty && (
          <Section step="0" title={tx("Difficulty")}>
            <div className="difficulty-buttons" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['rookie', 'amateur', 'intermediate', 'advanced', 'pro', 'devil'].map(level => (
                <button
                  key={level}
                  className={`difficulty-btn ${level} ${difficulty === level ? 'active' : ''}`}
                  onClick={() => onSetDifficulty(level)}
                >
                  {t(`initialization.difficulty.${level}`)}
                </button>
              ))}
            </div>
            {updatePreflightConfig && <FlightFailureSettings difficulty={difficulty}
              selection={preflightConfig.failureSelection}
              onChange={failureSelection => updatePreflightConfig({ failureSelection })}
            />}
          </Section>
        )}

        {/* 1 — Airports */}
        <Section step="1" title={tx("Airports")}>
          <AirportSearchField label={tx("Departure")} value={departure} onSelect={handleSelectDeparture} />
          <AirportSearchField label={tx("Arrival")} value={arrival} onSelect={handleSelectArrival} />
          {departure && arrival && (
            <button
              className="action-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => fetchRoute(departure, arrival, relaxAirways)}
              disabled={isGeneratingRoute}
            >
              {isGeneratingRoute ? tx("Generating route…") : tx("Generate Route")}
            </button>
          )}
        </Section>

        {/* 1.5 — Aircraft & Operations */}
        {updatePreflightConfig && (
          <Section step="1.5" title={tx("Aircraft & Operations")}>
            <div className="dispatch-grid compact-grid">
              <div className="parameter-group">
                <label>{tx("Aircraft")}</label>
                <input
                  list="aircraft-suggestions"
                  className="dispatch-input"
                  value={preflightConfig.aircraftModel || ''}
                  onChange={e => updatePreflightConfig({ aircraftModel: e.target.value })}
                  placeholder="e.g. B737-800"
                />
                <datalist id="aircraft-suggestions">
                  {aircraftSuggestions.map(a => <option key={a.model || a} value={a.model || a} />)}
                </datalist>
              </div>
              <div className="parameter-group">
                <label>{tx("Airline")}</label>
                <input className="dispatch-input" value={preflightConfig.airline || ''} onChange={e => updatePreflightConfig({ airline: e.target.value })} placeholder={tx("Airline name")} />
              </div>
              <div className="parameter-group">
                <label>{tx("Callsign")}</label>
                <input className="dispatch-input" value={preflightConfig.callsign || ''} onChange={e => updatePreflightConfig({ callsign: e.target.value })} placeholder="e.g. TEST001" />
              </div>
              <div className="parameter-group">
                <label>{tx("Crew")}</label>
                <input type="number" className="dispatch-input" value={preflightConfig.crewCount || 2} min="1" max="10" onChange={e => updatePreflightConfig({ crewCount: Number(e.target.value) })} />
              </div>
              <div className="parameter-group">
                <label>{tx("Passengers")}</label>
                <input type="number" className="dispatch-input" value={preflightConfig.pax || ''} onChange={e => updatePreflightConfig({ pax: Number(e.target.value) })} placeholder="e.g. 150" />
              </div>
              <div className="parameter-group">
                <label>{tx("Payload (kg)")}</label>
                <input type="number" className="dispatch-input" value={preflightConfig.payload || ''} onChange={e => updatePreflightConfig({ payload: Number(e.target.value) })} placeholder="e.g. 20000" />
              </div>
              <div className="parameter-group">
                <label>{tx("Cruise Alt (ft)")}</label>
                <input type="number" className="dispatch-input" value={preflightConfig.cruiseHeight || ''} onChange={e => updatePreflightConfig({ cruiseHeight: Number(e.target.value) })} placeholder="e.g. 35000" />
              </div>
              <div className="parameter-group">
                <label>{tx("Fuel Reserve (hr)")}</label>
                <input type="number" step="0.1" className="dispatch-input" value={preflightConfig.fuelReserve ?? ''} onChange={e => updatePreflightConfig({ fuelReserve: Number(e.target.value) })} placeholder="e.g. 0.1" />
              </div>
            </div>
          </Section>
        )}

        {/* 2 — Route */}
        {departure && arrival && showWaypoints && (
          <Section step="2" title={`${tx('Enroute')} ${routeDistance ? `· ${routeDistance} nm` : ''}`}>
            {routeAlternatives.length > 1 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Route Alternatives (")}{routeAlternatives.length})
                </label>
                <select
                  value={selectedAlternative?.candidateId || ''}
                  onChange={e => handleRouteAlternativeChange(e.target.value)}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '13px' }}
                >
                  {routeAlternatives.map((c, i) => (
                    <option key={c.candidateId || i} value={c.candidateId}>
                      {c.summary || c.routeCode || `Route ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Waypoints")}<span style={{ color: '#475569' }}>{tx("(space-separated)")}</span>
              </label>
              <input
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                value={manualWaypoints}
                onChange={e => handleManualWaypointsChange(e.target.value)}
                placeholder="e.g. ALPHA BRAVO CHARLIE"
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8', marginBottom: '1rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={relaxAirways} onChange={e => handleRelaxAirwaysChange(e.target.checked)} />{tx("Relax airway limits (direct fallback legs)")}</label>

            <LocalRouteMap
              departure={departure} arrival={arrival} waypoints={routeData.waypoints}
              routeObject={{ ...(routeData.routeObject || {}), procedureSegments: routeData.procedureSegments || [], waypoints: routeData.routeObject?.waypoints || routeData.waypoints }}
            />

            {routeData.routeSource && (
              <div style={{ marginTop: '0.75rem', fontSize: '11px', color: '#475569' }}>
                {routeData.routeSource}{routeData.routeFallbackUsed ? ' · fallback' : ''} · {routeData.routeBilling?.chargedTokens || 0} tokens
                {routeData.routeDebug?.map((entry, i) => (
                  <div key={i} style={{ color: entry.status === 'ok' ? '#4CAF50' : '#475569' }}>
                    {entry.provider}: {entry.status} · {entry.message}
                  </div>
                ))}
                {routeData.routeSource === 'built-in' && routeData.routeFallbackUsed && (
                  <div style={{ marginTop: '6px', padding: '6px 8px', background: 'rgba(255,193,7,0.08)', borderLeft: '2px solid #FFC107' }}>{tx("Local AIP covers CN/SG/HK/FR/DE/GB/RU/JP/CA. Try ZBAA–ZSPD or VHHH–WSSS for published routes.")}</div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* 3 — Departure procedures */}
        {departure && (
          <Section step="3" title={`${tx('Departure')} · ${departure.iata || departure.icao}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Gate/Ramp")}</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.departureGate} onChange={e => handleChange('departureGate', e.target.value)} placeholder="A12" />
                  <button className="generate-btn" onClick={() => handleChange('departureGate', generateGate())}>🎲</button>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Taxiway")}</label>
                <input style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} value={routeData.departureTaxiway} onChange={e => handleChange('departureTaxiway', e.target.value)} placeholder="A" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Runway")}</label>
                <select style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.departureRunway} onChange={e => handleChange('departureRunway', e.target.value)}>
                  <option value="">{tx("Select Runway")}</option>
                  {availableRunwaysDep.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {showSidStar && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                    SID <span style={{ color: '#475569' }}>({hasPublishedProcedures ? tx("published") : tx("synthetic")})</span>
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.sid} onChange={e => handleChange('sid', e.target.value)} placeholder="OMA12D" />
                    <button className="generate-btn" onClick={() => handleChange('sid', generateSID((routeData.waypoints[0]?.name) || 'ABC'))}>🎲</button>
                  </div>
                </div>
              )}
            </div>
            <ProcedureMiniMap airport={departure} runwayName={routeData.departureRunway} procedureName={routeData.sid} procedureSegments={routeData.procedureSegments || []} waypoints={routeData.waypoints || []} side="departure" />
          </Section>
        )}

        {/* 4 — Arrival procedures */}
        {arrival && (
          <Section step="4" title={`${tx('Arrival')} · ${arrival.iata || arrival.icao}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {showSidStar && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                    STAR <span style={{ color: '#475569' }}>({hasPublishedProcedures ? tx("published") : tx("synthetic")})</span>
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.star} onChange={e => handleChange('star', e.target.value)} placeholder="DXB45A" />
                    <button className="generate-btn" onClick={() => handleChange('star', generateSTAR(getLastProcedureWaypoint(routeData.waypoints) || (routeData.waypoints.at(-1)?.name) || 'ABC'))}>🎲</button>
                  </div>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Runway")}</label>
                <select style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.landingRunway} onChange={e => handleChange('landingRunway', e.target.value)}>
                  <option value="">{tx("Select Runway")}</option>
                  {availableRunwaysArr.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Taxiway")}</label>
                <input style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} value={routeData.landingTaxiway} onChange={e => handleChange('landingTaxiway', e.target.value)} placeholder="B" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{tx("Gate/Ramp")}</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', color: '#fff', fontSize: '13px' }} value={routeData.arrivalGate} onChange={e => handleChange('arrivalGate', e.target.value)} placeholder="D05" />
                  <button className="generate-btn" onClick={() => handleChange('arrivalGate', generateGate())}>🎲</button>
                </div>
              </div>
            </div>
            <ProcedureMiniMap airport={arrival} runwayName={routeData.landingRunway} procedureName={routeData.star} procedureSegments={routeData.procedureSegments || []} waypoints={routeData.waypoints || []} side="arrival" />
          </Section>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #1e293b' }}>
          {difficulty === 'rookie' && (
            <button className="skip-btn" style={{ flex: 1 }} onClick={onSkip} disabled={!isFailureSelectionValid}>{tx("Skip (Use Defaults)")}</button>
          )}
          <button
            className="confirm-btn"
            style={{ flex: 2 }}
            onClick={() => onConfirm({ ...routeData, departure, arrival })}
            disabled={!isFormValid()}
          >{tx("Confirm Flight Plan")}</button>
        </div>
    </div>
  );
};

export default RouteSelectionFrame;
