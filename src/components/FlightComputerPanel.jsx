import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { airportService } from '../services/airportService';
import { useLanguage } from '../contexts/LanguageContext';
import './FlightComputerPanel.css';
import FlightMapWorkspace from './FlightMapWorkspace';
import NearbyLandingPorts from './NearbyLandingPorts';
import { createDiversionPlan } from '../utils/diversionNavigation.js';
import { getActiveWaypoints } from '../services/activeFlightPlan.js';

const FlightComputerPanel = ({ onClose, flightPlan, onUpdateFlightPlan, flightState, onActionRequest, aircraftModel, aircraftData }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('maps');
  const [waypoints, setWaypoints] = useState([]);
  
  // Manual Input State
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchType, setSearchType] = useState('all'); // 'all', 'normal', 'emergency'
  
  // Nearest State


  // Utils State
  const [utilsTargetAlt, setUtilsTargetAlt] = useState(35000);
  const [convertVal, setConvertVal] = useState('');
  const [convertFrom, setConvertFrom] = useState('ft');
  const [convertTo, setConvertTo] = useState('m');
  const [convertResult, setConvertResult] = useState(null);
  const [nav1FreqInput, setNav1FreqInput] = useState('');

  // Auto-convert when inputs change
  useEffect(() => {
    const val = parseFloat(convertVal);
    if (isNaN(val)) {
        setConvertResult(null);
        return;
    }
    
    let res = 0;
    // Conversions
    if (convertFrom === 'ft' && convertTo === 'm') res = val * 0.3048;
    else if (convertFrom === 'm' && convertTo === 'ft') res = val / 0.3048;
    else if (convertFrom === 'kts' && convertTo === 'kmh') res = val * 1.852;
    else if (convertFrom === 'kmh' && convertTo === 'kts') res = val / 1.852;
    else if (convertFrom === 'inHg' && convertTo === 'hPa') res = val * 33.8639;
    else if (convertFrom === 'hPa' && convertTo === 'inHg') res = val / 33.8639;
    else if (convertFrom === 'nm' && convertTo === 'km') res = val * 1.852;
    else if (convertFrom === 'km' && convertTo === 'nm') res = val / 1.852;
    else if (convertFrom === convertTo) res = val;
    
    setConvertResult(res);
  }, [convertVal, convertFrom, convertTo]);

  const calculatePredictions = () => {
     // Time to WPT
     let timeToWpt = '---';
     let distToWpt = '---';
     let nextWpLabel = '---';
     
     if (waypoints.length > 0 && flightState.groundSpeed > 10) {
         // flightState.currentWaypointIndex might be undefined if not passed yet, handle gracefully
         let nextIdx = flightState.currentWaypointIndex || 0;
         
         // If index is past end, we are done
         if (nextIdx < waypoints.length) {
             const wp = waypoints[nextIdx];
             nextWpLabel = wp.label || `WP${nextIdx+1}`;
             
             // Simple haversine or use service
             // We can use airportService.calculateDistance even for non-airports if we pass {latitude, longitude}
             const dist = airportService.calculateDistance(
                 {latitude: flightState.latitude, longitude: flightState.longitude},
                 {latitude: wp.latitude, longitude: wp.longitude}
             );
             distToWpt = dist.toFixed(1) + ' nm';
             
             // Time = Dist / Speed
             const hours = dist / flightState.groundSpeed;
             const mins = Math.floor(hours * 60);
             const secs = Math.floor((hours * 3600) % 60);
             timeToWpt = `${mins}m ${secs}s`;
         } else {
             nextWpLabel = 'End of Flight Plan';
         }
     }
     
     // Fuel
     let timeFuel = '---';
     const totalFlow = (flightState.engineFuelFlow || [0,0]).reduce((a,b)=>a+b, 0); // kg/s
     let flowKgH = 0;
     if (totalFlow > 0.01) {
         flowKgH = totalFlow * 3600;
         const fuelKg = flightState.fuel || 0;
         const hours = fuelKg / flowKgH;
         const mins = Math.floor(hours * 60);
         timeFuel = `${Math.floor(hours)}h ${mins%60}m`;
     }
     
     // Altitude
     let timeAlt = '---';
     const vs = flightState.verticalSpeed; // ft/min
     if (Math.abs(vs) > 50) {
         const diff = utilsTargetAlt - (flightState.altitude || 0);
         // If moving in right direction
         if ((diff > 0 && vs > 0) || (diff < 0 && vs < 0)) {
             const mins = Math.abs(diff / vs);
             timeAlt = `${Math.floor(mins)}m ${Math.floor((mins%1)*60)}s`;
         } else {
             timeAlt = 'Wrong VS Direction';
         }
     } else {
         timeAlt = 'Stable';
     }
     
     return { timeToWpt, distToWpt, nextWpLabel, timeFuel, timeAlt, totalFlow: flowKgH };
  };

  const preds = calculatePredictions();

  // Initialize local state from props
  useEffect(() => {
    if (flightPlan) {
      // Handle both array and object formats
      if (Array.isArray(flightPlan)) {
        setWaypoints(flightPlan);
      } else {
        setWaypoints(getActiveWaypoints(flightPlan));
      }
    }
  }, [flightPlan]);

  // Sync changes to parent
  const updateParent = (newWaypoints) => {
    setWaypoints(newWaypoints);
    if (onUpdateFlightPlan) {
      // Send as object to be explicit, or array?
      // Physics service now handles both. Let's send array to match initial state structure in FlightInProgress.
      // Wait, FlightInProgress expects whatever setWaypoints accepts.
      // If we send array, it's fine.
      onUpdateFlightPlan(newWaypoints);
    }
  };

  const handleDeleteWaypoint = (index) => {
    const newWaypoints = [...waypoints];
    newWaypoints.splice(index, 1);
    updateParent(newWaypoints);
  };

  const handleToggleHold = (index) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = { 
      ...newWaypoints[index], 
      isHold: !newWaypoints[index].isHold 
    };
    updateParent(newWaypoints);
  };

  const handleAddManual = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      alert(t('ui.flight_computer.errors.invalid_coordinates'));
      return;
    }
    
    const newWaypoint = {
      latitude: lat,
      longitude: lon,
      label: manualLabel || `WPT${waypoints.length + 1}`,
      type: 'user'
    };
    
    const newWaypoints = [...waypoints, newWaypoint];
    updateParent(newWaypoints);
    
    // Reset inputs
    setManualLat('');
    setManualLon('');
    setManualLabel('');
    setActiveTab('waypoints');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (searchQuery.length < 2) return;
    
    const results = await airportService.searchAirportsRemote(searchQuery, { 
      type: searchType === 'all' ? 'all' : searchType,
      includeEmergency: searchType === 'emergency' || searchType === 'all'
    });
    setSearchResults(results);
  };

  const calculateApproachFix = (airport, runwayName) => {
    // Default to airport coordinates if no runway specified
    if (!runwayName) {
      return {
        latitude: airport.latitude,
        longitude: airport.longitude,
        label: airport.iata || airport.icao
      };
    }

    const geometry = airportService.getRunwayGeometry(airport.iata || airport.icao, runwayName);
    
    if (geometry) {
       // Calculate 12nm fix on reciprocal heading
       // geometry.heading is the runway heading (e.g. 240 for 24R)
       // We want to go back 12nm from thresholdStart
       // This is equivalent to moving 12nm in direction (heading + 180)
       
       const lat1 = geometry.thresholdStart.latitude * Math.PI / 180;
       const lon1 = geometry.thresholdStart.longitude * Math.PI / 180;
       const headingRad = (geometry.heading + 180) * Math.PI / 180;
       // Increased to 15nm to ensure safe terrain clearance and glideslope intercept from below
       const distanceNm = 15.0; 
       const R = 3440.065; // Earth radius in NM
       
       const lat2 = Math.asin(Math.sin(lat1)*Math.cos(distanceNm/R) + Math.cos(lat1)*Math.sin(distanceNm/R)*Math.cos(headingRad));
       const lon2 = lon1 + Math.atan2(Math.sin(headingRad)*Math.sin(distanceNm/R)*Math.cos(lat1), Math.cos(distanceNm/R)-Math.sin(lat1)*Math.sin(lat2));
       
       // Target 4000ft AGL for safe intercept (approx 15nm * 300ft/nm = 4500ft, so 4000ft is a good capture from below)
       // Ensure airport.elevation is treated as number (feet)
       const elevation = Number(airport.elevation) || 0;
       const targetAlt = elevation + 4000;

       return {
         latitude: lat2 * 180 / Math.PI,
         longitude: lon2 * 180 / Math.PI,
         altitude: targetAlt,
         label: `${airport.iata || airport.icao}`
       };
    }
    
    // Fallback if geometry not found
    return {
      latitude: airport.latitude,
      longitude: airport.longitude,
      label: airport.iata || airport.icao
    };
  };

  const handleAddAirport = (airport) => {
    // Extract individual runway designators (e.g. "08L/26R" -> ["08L", "26R"])
    const runwayOptions = [];
    if (airport.runways) {
      airport.runways.forEach(r => {
        const parts = r.name.split('/');
        parts.forEach(p => runwayOptions.push(p.trim()));
      });
    } else if (airport.runway) {
      const parts = airport.runway.split('/');
      parts.forEach(p => runwayOptions.push(p.trim()));
    } else {
      runwayOptions.push("09");
      runwayOptions.push("27");
    }

    // Smart Runway Selection: Pick the runway best aligned with our current bearing to the airport
    let selectedRunway = runwayOptions.length > 0 ? runwayOptions[0] : null;
    
    if (flightState && flightState.latitude && flightState.longitude && runwayOptions.length > 1) {
        // Calculate bearing from Plane to Airport
        const lat1 = flightState.latitude * Math.PI / 180;
        const lon1 = flightState.longitude * Math.PI / 180;
        const lat2 = airport.latitude * Math.PI / 180;
        const lon2 = airport.longitude * Math.PI / 180;
        
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const bearingRad = Math.atan2(y, x);
        const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360; // 0-360
        
        // Find runway with heading closest to bearingDeg
        // e.g. Bearing 360 (North) -> Want Runway 36 (Heading 360)
        let bestDiff = 360;
        
        runwayOptions.forEach(r => {
            // Parse heading from name (e.g. "36R" -> 360)
            const match = r.match(/^(\d{2})/);
            if (match) {
                const rHdg = parseInt(match[1]) * 10;
                let diff = Math.abs(bearingDeg - rHdg);
                if (diff > 180) diff = 360 - diff;
                
                if (diff < bestDiff) {
                    bestDiff = diff;
                    selectedRunway = r;
                }
            }
        });
    }

    const fix = calculateApproachFix(airport, selectedRunway);

    const newWaypoint = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      label: fix.label,
      type: 'airport',
      details: airport,
      availableRunways: runwayOptions,
      selectedRunway: selectedRunway
    };
    
    const newWaypoints = [...waypoints, newWaypoint];
    updateParent(newWaypoints);
    setActiveTab('waypoints');
  };

  const handleRunwayChange = (index, runway) => {
    const newWaypoints = [...waypoints];
    const wp = newWaypoints[index];
    
    // Recalculate fix for new runway
    const fix = calculateApproachFix(wp.details, runway);
    
    newWaypoints[index] = { 
        ...wp, 
        selectedRunway: runway,
        latitude: fix.latitude,
        longitude: fix.longitude,
        label: fix.label 
    };
    updateParent(newWaypoints);
  };

  const handleDivert = airport => {
    const plan = createDiversionPlan(flightPlan, airport);
    setWaypoints(plan.waypoints);
    onUpdateFlightPlan?.(plan);
  };

  return (
    <div className="flight-computer-panel">
      <div className="fc-header">
        <div>
          <h3>{t('ui.flight_computer.title')}</h3>
          <div className="fc-aircraft-label">{aircraftData?.name || aircraftModel || 'Unknown aircraft'}</div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      
      <div className="fc-tabs">
        <button className={activeTab === 'maps' ? 'active' : ''} onClick={() => setActiveTab('maps')}>Maps</button>
        <button className={activeTab === 'waypoints' ? 'active' : ''} onClick={() => setActiveTab('waypoints')}>{t('ui.flight_computer.tabs.plan')}</button>
        <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>{t('ui.flight_computer.tabs.add')}</button>
        <button className={activeTab === 'nearest' ? 'active' : ''} onClick={() => setActiveTab('nearest')}>{t('ui.flight_computer.tabs.nearest')}</button>
        <button className={activeTab === 'utils' ? 'active' : ''} onClick={() => setActiveTab('utils')}>{t('ui.flight_computer.tabs.perf')}</button>
      </div>
      
      <div className="fc-content">
        {activeTab === 'maps' && <><button className="direct-btn" onClick={() => setActiveTab('nearest')}>{t('ui.flight_computer.nearest.open')}</button><FlightMapWorkspace aircraftData={aircraftData} flightPlan={flightPlan} flightState={flightState} /></>}
        {activeTab === 'waypoints' && (
          <div className="waypoints-list">
            {waypoints.length === 0 ? (
              <div className="empty-state">{t('ui.flight_computer.empty.no_waypoints')}</div>
            ) : (
              <>
                {waypoints.length > 1 && (() => {
                  const lats = waypoints.map(w => w.latitude).filter(v => Number.isFinite(v));
                  const lons = waypoints.map(w => w.longitude).filter(v => Number.isFinite(v));
                  if (lats.length < 2) return null;

                  const minLat = Math.min(...lats);
                  const maxLat = Math.max(...lats);
                  const minLon = Math.min(...lons);
                  const maxLon = Math.max(...lons);
                  const latRange = maxLat - minLat || 1;
                  const lonRange = maxLon - minLon || 1;
                  const padding = 0.1;

                  const mapWidth = 320;
                  const mapHeight = 140;

                  const toX = (lon) => ((lon - minLon) / lonRange) * (mapWidth * (1 - 2 * padding)) + mapWidth * padding;
                  const toY = (lat) => mapHeight - (((lat - minLat) / latRange) * (mapHeight * (1 - 2 * padding)) + mapHeight * padding);

                  const currentIdx = flightState?.currentWaypointIndex ?? 0;
                  const aircraftLat = flightState?.latitude;
                  const aircraftLon = flightState?.longitude;

                  return (
                    <div className="route-mini-map">
                      <svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
                        <rect width={mapWidth} height={mapHeight} fill="rgba(0,0,0,0.3)" />
                        {waypoints.map((wp, i) => {
                          if (i === 0 || !Number.isFinite(wp.latitude) || !Number.isFinite(wp.longitude)) return null;
                          const prev = waypoints[i - 1];
                          if (!Number.isFinite(prev.latitude) || !Number.isFinite(prev.longitude)) return null;
                          const isPassed = i <= currentIdx;
                          const isActive = i === currentIdx;
                          return (
                            <line
                              key={`leg-${i}`}
                              x1={toX(prev.longitude)}
                              y1={toY(prev.latitude)}
                              x2={toX(wp.longitude)}
                              y2={toY(wp.latitude)}
                              stroke={isActive ? '#4facfe' : isPassed ? '#555' : '#0f0'}
                              strokeWidth={isActive ? 2 : 1}
                              opacity={isPassed && !isActive ? 0.4 : 1}
                            />
                          );
                        })}
                        {waypoints.map((wp, i) => {
                          if (!Number.isFinite(wp.latitude) || !Number.isFinite(wp.longitude)) return null;
                          const isActive = i === currentIdx;
                          const isDeparture = i === 0;
                          const isArrival = i === waypoints.length - 1;
                          const showLabel = isDeparture || isArrival || isActive;
                          return (
                            <g key={`wp-${i}`}>
                              <circle
                                cx={toX(wp.longitude)}
                                cy={toY(wp.latitude)}
                                r={isActive ? 4 : 3}
                                fill={isActive ? '#4facfe' : isDeparture || isArrival ? '#fff' : '#0f0'}
                              />
                              {showLabel && (
                                <text
                                  x={toX(wp.longitude)}
                                  y={toY(wp.latitude) - 8}
                                  fill={isActive ? '#4facfe' : '#fff'}
                                  fontSize="10"
                                  textAnchor="middle"
                                  fontFamily="monospace"
                                >
                                  {wp.label || wp.name || `WP${i + 1}`}
                                </text>
                              )}
                            </g>
                          );
                        })}
                        {aircraftLat != null && aircraftLon != null && Number.isFinite(aircraftLat) && Number.isFinite(aircraftLon) && (
                          <g>
                            <circle cx={toX(aircraftLon)} cy={toY(aircraftLat)} r="5" fill="none" stroke="#ff0" strokeWidth="2" />
                            <circle cx={toX(aircraftLon)} cy={toY(aircraftLat)} r="2" fill="#ff0" />
                          </g>
                        )}
                      </svg>
                    </div>
                  );
                })()}
                <ul>
                {waypoints.map((wp, index) => {
                  // Determine status based on flightState.currentWaypointIndex
                  const currentIdx = flightState && flightState.currentWaypointIndex !== undefined ? flightState.currentWaypointIndex : 0;
                  const isPassed = index < currentIdx;
                  const isActive = index === currentIdx;
                  
                  return (
                    <li key={index} className="waypoint-item" style={{
                        opacity: isPassed ? 0.5 : 1,
                        borderLeft: isActive ? '3px solid #4facfe' : '1px solid rgba(255, 255, 255, 0.05)',
                        background: isActive ? 'rgba(79, 172, 254, 0.1)' : 'rgba(255, 255, 255, 0.03)'
                    }}>
                        <span className="wp-index" style={{ color: isActive ? '#4facfe' : '#666' }}>{index + 1}</span>
                        <div className="wp-info">
                        <span className="wp-label" style={{ color: isActive ? '#fff' : (isPassed ? '#888' : '#e0e0e0') }}>
                            {wp.label} {isActive && <small style={{color: '#4facfe', marginLeft: '5px'}}>({t('ui.flight_computer.tags.active')})</small>}
                        </span>
                        <span className="wp-coords">{wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}</span>
                        {wp.type === 'airport' && (wp.availableRunways || wp.details?.runways) && (
                            <select 
                            value={wp.selectedRunway || ''} 
                            onChange={(e) => handleRunwayChange(index, e.target.value)}
                            className="runway-select"
                            onClick={(e) => e.stopPropagation()}
                            style={{ 
                                marginLeft: '8px', 
                                padding: '2px 4px', 
                                fontSize: '11px',
                                background: '#333',
                                color: '#0f0',
                                border: '1px solid #0f0',
                                borderRadius: '3px'
                            }}
                        >
                          {(wp.availableRunways || (wp.details?.runways ? wp.details.runways.flatMap(r => r.name.split('/').map(p => p.trim())) : [])).map(r => (
                            <option key={r} value={r}>RWY {r}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button 
                      className="hold-btn" 
                      onClick={() => handleToggleHold(index)}
                      style={{
                        marginLeft: '8px',
                        background: wp.isHold ? '#eab308' : '#334155',
                        color: wp.isHold ? 'black' : 'white',
                        border: '1px solid #475569',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        padding: '2px 6px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s'
                      }}
                      title={t('ui.flight_computer.actions.toggle_hold_title')}
                    >
                      {wp.isHold ? t('ui.flight_computer.actions.holding') : t('ui.flight_computer.actions.hold')}
                    </button>
                    <button className="delete-btn" onClick={() => handleDeleteWaypoint(index)}>🗑️</button>
                  </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
        )}
        
        {activeTab === 'add' && (
          <div className="add-waypoint-section">
            <div className="manual-input">
              <h4>{t('ui.flight_computer.add.manual_entry')}</h4>
              <div className="input-group">
                <input 
                  type="text" 
                  placeholder={t('ui.flight_computer.add.placeholders.lat')} 
                  value={manualLat} 
                  onChange={(e) => setManualLat(e.target.value)} 
                />
                <input 
                  type="text" 
                  placeholder={t('ui.flight_computer.add.placeholders.lon')} 
                  value={manualLon} 
                  onChange={(e) => setManualLon(e.target.value)} 
                />
              </div>
              <input 
                type="text" 
                placeholder={t('ui.flight_computer.add.placeholders.label')} 
                value={manualLabel} 
                onChange={(e) => setManualLabel(e.target.value)} 
                className="label-input"
              />
              <button className="action-btn" onClick={handleAddManual}>{t('ui.flight_computer.add.add_coordinates')}</button>
            </div>
            
            <div className="divider">{t('ui.flight_computer.add.or')}</div>
            
            <div className="search-input">
              <h4>{t('ui.flight_computer.search.title')}</h4>
              <form onSubmit={handleSearch}>
                <input 
                  type="text" 
                  placeholder={t('ui.flight_computer.search.placeholder')} 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
                <div className="search-options">
                   <label>
                     <input 
                       type="radio" 
                       checked={searchType === 'all'} 
                       onChange={() => setSearchType('all')} 
                     /> {t('ui.flight_computer.search.options.all')}
                   </label>
                   <label>
                     <input 
                       type="radio" 
                       checked={searchType === 'normal'} 
                       onChange={() => setSearchType('normal')} 
                     /> {t('ui.flight_computer.search.options.normal')}
                   </label>
                   <label>
                     <input 
                       type="radio" 
                       checked={searchType === 'emergency'} 
                       onChange={() => setSearchType('emergency')} 
                     /> {t('ui.flight_computer.search.options.emergency')}
                   </label>
                </div>
                <button type="submit" className="action-btn secondary">{t('ui.flight_computer.search.submit')}</button>
              </form>
              
              <div className="search-results">
                {searchResults.map(airport => (
                  <div key={airport.icao} className="search-result-item">
                    <div className="airport-info">
                      <span className="airport-code">{airport.iata}/{airport.icao}</span>
                      <span className="airport-name">{airport.name}</span>
                    </div>
                    <button className="add-btn" onClick={() => handleAddAirport(airport)}>+</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'nearest' && <NearbyLandingPorts flightState={flightState} aircraftData={aircraftData} onDivert={handleDivert} target={flightPlan?.diversionAirport} />}

        {activeTab === 'radio' && (
          <div className="radio-section" style={{ padding: '10px', color: '#e2e8f0' }}>
            <div className="utils-block" style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #475569', paddingBottom: '5px' }}>{t('ui.flight_computer.radio.nav_title')}</h4>
              
              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>{t('ui.flight_computer.radio.current_nav1')}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4ade80', fontFamily: 'monospace' }}>
                  {flightState?.autopilotDebug?.nav1Frequency ? flightState.autopilotDebug.nav1Frequency.toFixed(2) : '---'} <span style={{fontSize: '14px', color: '#64748b'}}>MHz</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>{t('ui.flight_computer.radio.set_freq')}</label>
                  <input 
                    type="number" 
                    step="0.05"
                    placeholder="108.00 - 117.95"
                    value={nav1FreqInput}
                    onChange={(e) => setNav1FreqInput(e.target.value)}
                    style={{ 
                      width: '100%', 
                      background: '#1e293b', 
                      border: '1px solid #475569', 
                      color: 'white', 
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '16px'
                    }}
                  />
                </div>
                <button 
                  onClick={() => {
                    const freq = parseFloat(nav1FreqInput);
                    if (!isNaN(freq) && freq >= 108 && freq <= 118) {
                      if (onActionRequest) {
                        onActionRequest('set-nav-frequency', freq);
                        setNav1FreqInput(''); // Clear input on success
                      }
                    } else {
                      alert(t('ui.flight_computer.radio.invalid_freq'));
                    }
                  }}
                  style={{
                    background: '#0ea5e9',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    height: '38px' // Match input height roughly
                  }}
                >
                  {t('ui.flight_computer.radio.tune')}
                </button>
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>{t('ui.flight_computer.radio.common_ils')}</div>
            </div>
          </div>
        )}
        
        {activeTab === 'utils' && (
          <div className="utils-section" style={{ padding: '10px', color: '#e2e8f0' }}>
            
            <div className="utils-block" style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #475569', paddingBottom: '5px' }}>{t('ui.flight_computer.utils.predictions')}</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.next_wp')}</div>
                <div style={{ textAlign: 'right', fontWeight: 'bold' }}>{preds.nextWpLabel}</div>
                
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.distance')}</div>
                <div style={{ textAlign: 'right' }}>{preds.distToWpt}</div>
                
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.ete_to_wpt')}</div>
                <div style={{ textAlign: 'right', color: '#4ade80' }}>{preds.timeToWpt}</div>
                
                <div style={{ borderTop: '1px solid #334155', gridColumn: '1/-1', margin: '4px 0' }}></div>
                
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.fuel_flow')}</div>
                <div style={{ textAlign: 'right' }}>{preds.totalFlow.toFixed(0)} kg/h</div>
                
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.time_to_empty')}</div>
                <div style={{ textAlign: 'right', color: '#f59e0b' }}>{preds.timeFuel}</div>
                
                <div style={{ borderTop: '1px solid #334155', gridColumn: '1/-1', margin: '4px 0' }}></div>
                
                <div style={{ color: '#94a3b8', alignSelf: 'center' }}>{t('ui.flight_computer.utils.target_alt')}</div>
                <div style={{ textAlign: 'right' }}>
                  <input 
                    type="number" 
                    value={utilsTargetAlt} 
                    onChange={(e) => setUtilsTargetAlt(parseFloat(e.target.value))}
                    style={{ width: '60px', background: '#1e293b', border: '1px solid #475569', color: 'white', padding: '2px' }}
                  />
                </div>
                
                <div style={{ color: '#94a3b8' }}>Time to Alt:</div>
                <div style={{ color: '#94a3b8' }}>{t('ui.flight_computer.utils.time_to_alt')}</div>
              </div>
            </div>

            <div className="utils-block" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #475569', paddingBottom: '5px' }}>{t('ui.flight_computer.utils.converter.title')}</h4>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input 
                  type="number" 
                  value={convertVal} 
                  onChange={(e) => setConvertVal(e.target.value)}
                  placeholder={t('ui.flight_computer.utils.converter.value')}
                  style={{ flex: 1, background: '#1e293b', border: '1px solid #475569', color: 'white', padding: '4px' }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <select 
                  value={convertFrom} 
                  onChange={(e) => setConvertFrom(e.target.value)}
                  style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', padding: '4px', flex: 1 }}
                >
                  <option value="ft">Feet (ft)</option>
                  <option value="m">Meters (m)</option>
                  <option value="kts">Knots (kts)</option>
                  <option value="kmh">Km/h</option>
                  <option value="inHg">inHg</option>
                  <option value="hPa">hPa</option>
                  <option value="nm">Naut. Miles</option>
                  <option value="km">Kilometers</option>
                </select>
                
                <span>→</span>
                
                <select 
                  value={convertTo} 
                  onChange={(e) => setConvertTo(e.target.value)}
                  style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', padding: '4px', flex: 1 }}
                >
                  <option value="ft">Feet (ft)</option>
                  <option value="m">Meters (m)</option>
                  <option value="kts">Knots (kts)</option>
                  <option value="kmh">Km/h</option>
                  <option value="inHg">inHg</option>
                  <option value="hPa">hPa</option>
                  <option value="nm">Naut. Miles</option>
                  <option value="km">Kilometers</option>
                </select>
              </div>
              
              <div style={{ textAlign: 'center', padding: '10px', background: '#0f172a', borderRadius: '4px', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{t('ui.flight_computer.utils.converter.result_label')} </span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
                  {convertResult !== null ? convertResult.toFixed(2) : '---'}
                </span>
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
};

FlightComputerPanel.propTypes = {
  onClose: PropTypes.func.isRequired,
  flightPlan: PropTypes.oneOfType([
    PropTypes.arrayOf(
      PropTypes.shape({
        latitude: PropTypes.number.isRequired,
        longitude: PropTypes.number.isRequired,
        label: PropTypes.string,
        type: PropTypes.string
      })
    ),
    PropTypes.shape({
      waypoints: PropTypes.arrayOf(
        PropTypes.shape({
          latitude: PropTypes.number.isRequired,
          longitude: PropTypes.number.isRequired,
          label: PropTypes.string,
          type: PropTypes.string
        })
      )
    })
  ]),
  onUpdateFlightPlan: PropTypes.func,
  flightState: PropTypes.shape({
    latitude: PropTypes.number,
    longitude: PropTypes.number,
    groundSpeed: PropTypes.number,
    currentWaypointIndex: PropTypes.number,
    verticalSpeed: PropTypes.number,
    altitude: PropTypes.number,
    engineFuelFlow: PropTypes.arrayOf(PropTypes.number),
    fuel: PropTypes.number,
    autopilotDebug: PropTypes.shape({
      nav1Frequency: PropTypes.number
    })
  }),
  onActionRequest: PropTypes.func,
  aircraftModel: PropTypes.string,
  aircraftData: PropTypes.shape({
    name: PropTypes.string,
    model: PropTypes.string,
    emptyWeight: PropTypes.number,
    mass: PropTypes.number
  })
};

export default FlightComputerPanel;
