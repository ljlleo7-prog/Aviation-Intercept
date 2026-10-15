import React, { useRef, useEffect, useState, useMemo } from 'react';
import LocalRouteMap from './LocalRouteMap';
import { calculateDistance } from '../utils/distanceCalculator';
import { airportService } from '../services/airportService';
import { terrainRadarService } from '../services/TerrainRadarService';
import { weatherRadarService } from '../services/WeatherRadarService';

// Navigation Panel Component
const NavigationPanel = ({ flightState, selectedArrival, flightPlan, npcs = [], runwayGeometry, autopilotMode, weatherData, theme, showRangeRings = true, planeStyle = 'filled', efisFontFamily }) => {
  const radarCanvasRef = useRef(null);
  const lastTerrainUpdateRef = useRef(0);
  const lastWeatherUpdateRef = useRef(0);
  const [mapRange, setMapRange] = useState(40); // Default 40nm
  const [displayMode, setDisplayMode] = useState('map');
  const [showLocalRouteMap, setShowLocalRouteMap] = useState(false);

  const groundSpeed = Number.isFinite(flightState?.groundSpeed)
    ? flightState.groundSpeed
    : (Number.isFinite(flightState?.derived?.groundSpeed) ? flightState.derived.groundSpeed : 0);
  const trueAirspeed = Number.isFinite(flightState?.trueAirspeed)
    ? flightState.trueAirspeed
    : (Number.isFinite(flightState?.derived?.trueAirspeed)
        ? flightState.derived.trueAirspeed
        : 0);
  const indicatedAirspeed = Number.isFinite(flightState?.indicatedAirspeed)
    ? flightState.indicatedAirspeed
    : (Number.isFinite(flightState?.derived?.indicatedAirspeed) ? flightState.derived.indicatedAirspeed : trueAirspeed);
  const heading = Number.isFinite(flightState?.heading) ? flightState.heading : 0;
  const altitude = Number.isFinite(flightState?.altitude) ? flightState.altitude : 0;

  const waypoints = useMemo(() => (
    Array.isArray(flightPlan?.fms?.activePlan?.waypoints)
      ? flightPlan.fms.activePlan.waypoints
      : (Array.isArray(flightPlan?.waypoints) ? flightPlan.waypoints : [])
  ), [flightPlan?.fms?.activePlan?.waypoints, flightPlan?.waypoints]);
  const navigationPath = useMemo(() => (
    Array.isArray(flightState?.navigationPath) ? flightState.navigationPath : []
  ), [flightState?.navigationPath]);

  // Range options (Exponential)
  const rangeOptions = [5, 10, 20, 40, 80, 160, 320, 640];

  const cycleRange = () => {
    const currentIndex = rangeOptions.indexOf(mapRange);
    const nextIndex = (currentIndex + 1) % rangeOptions.length;
    setMapRange(rangeOptions[nextIndex]);
  };

  const nearbyRunways = useMemo(() => {
    if (!flightState?.latitude || !flightState?.longitude) {
      return [];
    }

    return airportService.getAirportsWithinRadius(
      flightState.latitude,
      flightState.longitude,
      Math.max(mapRange, 20)
    );
  }, [flightState?.latitude, flightState?.longitude, mapRange]);

  // Effect to update Terrain Radar
  useEffect(() => {
    if (!flightState?.latitude || !flightState?.longitude) return;
    
    // Throttle updates to avoid heavy calculation every frame
    const now = Date.now();
    if (now - lastTerrainUpdateRef.current > 1000) {
        // Update terrain radar service with current position and range
        // Clamp range to 80nm to prevent massive queue buildup and lag
        // The user can zoom out to 640nm, but we only fetch detailed terrain within 80nm
        const fetchRange = Math.min(mapRange, 80);
        terrainRadarService.update(flightState.latitude, flightState.longitude, fetchRange, heading);
        lastTerrainUpdateRef.current = now;
    }
    
  }, [flightState?.latitude, flightState?.longitude, mapRange]);

  // Effect to update Weather Radar (throttled, coarser grid)
  useEffect(() => {
    if (!flightState?.latitude || !flightState?.longitude) return;
    const now = Date.now();
    if (now - lastWeatherUpdateRef.current > 30000) { // 30s — weather changes slowly
      weatherRadarService.update(flightState.latitude, flightState.longitude, Math.min(mapRange, 160));
      lastWeatherUpdateRef.current = now;
    }
  }, [flightState?.latitude, flightState?.longitude, mapRange]);

  const distanceToWaypoint = useMemo(() => {
    if (!flightState || !selectedArrival) {
      return 0;
    }

    const currentLat = flightState.latitude;
    const currentLon = flightState.longitude;
    const arrivalLat = selectedArrival.latitude;
    const arrivalLon = selectedArrival.longitude;

    if (currentLat === undefined || currentLon === undefined || arrivalLat === undefined || arrivalLon === undefined) {
      return 0;
    }

    return calculateDistance(currentLat, currentLon, arrivalLat, arrivalLon);
  }, [flightState?.latitude, flightState?.longitude, selectedArrival?.latitude, selectedArrival?.longitude]);

  const activeWaypointData = useMemo(() => {
    if (!flightState || waypoints.length === 0) {
      return { name: 'N/A', distance: 0 };
    }

    const currentLat = flightState.latitude;
    const currentLon = flightState.longitude;

    if (currentLat === undefined || currentLon === undefined) {
      return { name: 'N/A', distance: 0 };
    }

    const waypointIndex = Number.isInteger(flightState.currentWaypointIndex)
      ? flightState.currentWaypointIndex
      : (flightPlan?.fms?.currentWaypointIndex ?? flightPlan?.currentWaypointIndex ?? 0);
    const activeWaypoint = waypoints[waypointIndex];
    const distanceToActive = activeWaypoint && Number.isFinite(activeWaypoint.latitude) && Number.isFinite(activeWaypoint.longitude)
      ? calculateDistance(currentLat, currentLon, activeWaypoint.latitude, activeWaypoint.longitude)
      : 0;

    if (!activeWaypoint) {
      return { name: 'N/A', distance: 0 };
    }

    return {
      name: activeWaypoint.label || activeWaypoint.name || 'WPT',
      distance: Number.isFinite(distanceToActive) ? distanceToActive : 0
    };
  }, [flightState?.latitude, flightState?.longitude, flightState?.currentWaypointIndex, flightPlan?.currentWaypointIndex, flightPlan?.fms?.currentWaypointIndex, waypoints]);

  const currentNextWaypointName = activeWaypointData.name;
  const currentDistanceToNextWaypoint = activeWaypointData.distance;


  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const size = Math.min(canvas.width, canvas.height);
    if (size < 20) return;
    const center = size / 2;
    const arcOriginY = size - 20;
    const arcOriginX = center;
    const radius = Math.max(1, arcOriginY - 40);

    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const bearingTo = (lat1, lon1, lat2, lon2) => {
        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const Δλ = toRad(lon2 - lon1);
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    };
    
    // Terrain Gradient Color Helper
    const getTerrainColor = (height) => {
      const relativeAlt = altitude - height;
      
      // If we are high above terrain (> 5000ft), don't show or show very faint
      if (relativeAlt > 5000) return null;
      
      // Safety coloring
      if (height > altitude) return 'rgba(255, 0, 0, 0.8)'; // Terrain ABOVE us (Red)
      if (relativeAlt < 500) return 'rgba(255, 0, 0, 0.6)'; // < 500ft clearance (Red)
      if (relativeAlt < 1000) return 'rgba(255, 255, 0, 0.6)'; // < 1000ft clearance (Yellow)
      if (relativeAlt < 2000) return 'rgba(0, 255, 0, 0.4)'; // < 2000ft clearance (Green)
      
      // 2000ft to 5000ft: Fade out green
      const alpha = 0.4 * (1 - (relativeAlt - 2000) / 3000);
      return `rgba(0, 100, 0, ${alpha})`;
    };


    const drawRadar = () => {
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(arcOriginX, arcOriginY);
      ctx.rotate((-heading * Math.PI / 180));

      // --- Draw Terrain ---
      if (displayMode === 'terrain' && Number.isFinite(flightState?.latitude) && Number.isFinite(flightState?.longitude)) {
        // Map range is radius in NM.
        // Canvas radius is pixels.
        const pxPerNm = radius / mapRange;
        const degPerNm = 1/60; 
        
        const gridSizeDeg = terrainRadarService.GRID_SIZE;
        const gridSizeNm = gridSizeDeg * 60;
        const gridSizePx = Math.ceil(gridSizeNm * pxPerNm);
        
        // Optimization: Limit render range to prevent lag on large maps
        // We only fetch up to 80nm, so rendering beyond that is useless anyway
        // Also implement LOD (Level of Detail) stepping for large ranges
        const renderRange = Math.min(mapRange, 160); 
        const step = mapRange > 40 ? Math.ceil(mapRange / 40) : 1;
        
        const rangeDeg = renderRange / 60;
        const startLat = flightState.latitude - rangeDeg;
        const endLat = flightState.latitude + rangeDeg;
        const startLon = flightState.longitude - rangeDeg;
        const endLon = flightState.longitude + rangeDeg;
        
        const startIdx = terrainRadarService.getGridIndices(startLat, startLon);
        const endIdx = terrainRadarService.getGridIndices(endLat, endLon);
        
        // Iterate grid indices with stepping
        for (let i = startIdx.latIdx; i <= endIdx.latIdx; i += step) {
          for (let j = startIdx.lonIdx; j <= endIdx.lonIdx; j += step) {
            const tileLat = (i + 0.5) * gridSizeDeg;
            const tileLon = (j + 0.5) * gridSizeDeg;
            
            const height = terrainRadarService.getTerrainHeight(tileLat, tileLon);
            if (height !== null) {
              const color = getTerrainColor(height);
              if (color) {
                // Calculate position relative to aircraft
                const dLatNm = (tileLat - flightState.latitude) * 60;
                // Longitude correction for latitude
                const dLonNm = (tileLon - flightState.longitude) * 60 * Math.cos(flightState.latitude * Math.PI / 180);
                
                // Convert NM to Pixels (x is East/Lon, y is North/Lat)
                // Canvas coordinates: y is down (North is -y), x is right (East is +x)
                const x = dLonNm * pxPerNm;
                const y = -dLatNm * pxPerNm; // Inverted because canvas Y is down
                
                // Only draw if within circle
                if (x*x + y*y < radius*radius) {
                   ctx.fillStyle = color;
                   // Draw rectangle centered at x, y
                   // Scale rectangle size by step
                   const size = (gridSizePx * step) + (step > 1 ? 0.5 : 0); // Slight overlap to avoid gaps
                   ctx.fillRect(x - size/2, y - size/2, size, size);
                }
              }
            }
          }
        }
      }
      // --- End Draw Terrain ---

      // --- Draw Weather Radar (WXR mode) ---
      if (displayMode === 'weather' && flightState?.latitude && flightState?.longitude) {
        const pxPerNm = radius / mapRange;
        const gridSizeNm = weatherRadarService.GRID_SIZE * 60;
        const gridSizePx = Math.ceil(gridSizeNm * pxPerNm);
        const rangeDeg = mapRange / 60;
        const startIdx = weatherRadarService.getGridIndices(flightState.latitude - rangeDeg, flightState.longitude - rangeDeg);
        const endIdx   = weatherRadarService.getGridIndices(flightState.latitude + rangeDeg, flightState.longitude + rangeDeg);
        for (let i = startIdx.latIdx; i <= endIdx.latIdx; i++) {
          for (let j = startIdx.lonIdx; j <= endIdx.lonIdx; j++) {
            const tileLat = (i + 0.5) * weatherRadarService.GRID_SIZE;
            const tileLon = (j + 0.5) * weatherRadarService.GRID_SIZE;
            const wx = weatherRadarService.getWeather(tileLat, tileLon);
            if (!wx) continue;
            const dLatNm = (tileLat - flightState.latitude) * 60;
            const dLonNm = (tileLon - flightState.longitude) * 60 * Math.cos(flightState.latitude * Math.PI / 180);
            const x = dLonNm * pxPerNm;
            const y = -dLatNm * pxPerNm;
            if (x*x + y*y >= radius*radius) continue;
            // Color: green=light cloud, yellow=moderate, red=heavy precip
            let color = null;
            if (wx.precip > 5)       color = `rgba(255,0,0,${Math.min(0.85, 0.4 + wx.precip / 20)})`;
            else if (wx.precip > 1)  color = `rgba(255,200,0,${Math.min(0.75, 0.3 + wx.precip / 10)})`;
            else if (wx.cloud > 60)  color = `rgba(0,200,0,${Math.min(0.6, wx.cloud / 200)})`;
            if (color) {
              ctx.fillStyle = color;
              ctx.fillRect(x - gridSizePx/2, y - gridSizePx/2, gridSizePx, gridSizePx);
            }
          }
        }
      }
      // --- End Draw Weather Radar ---
      if (displayMode === 'tcas' && npcs && npcs.length > 0 && Number.isFinite(flightState?.latitude) && Number.isFinite(flightState?.longitude)) {
          npcs.forEach(npc => {
            // Calculate relative position
            const dLat = npc.latitude - flightState.latitude;
            const dLon = npc.longitude - flightState.longitude;
            
            // Convert to NM
            const dLatNm = dLat * 60;
            const dLonNm = dLon * 60 * Math.cos(flightState.latitude * Math.PI / 180);
            
            // Convert to Pixels (x is East, y is North-ish)
            // Canvas: y is down. North is -y.
            const pxPerNm = radius / mapRange;
            const x = dLonNm * pxPerNm;
            const y = -dLatNm * pxPerNm;
            
            // Distance
            const distNm = Math.sqrt(dLatNm*dLatNm + dLonNm*dLonNm);
            const dAlt = Math.abs(npc.altitude - altitude);
            
            // Skip if out of range (plus margin)
            if (distNm > mapRange * 1.2) return;
            
            // Check Critical
            const closingSpeed = (flightState.trueAirspeed || 0) + (npc.speed || 0);
            const timeToReach = closingSpeed > 0 ? distNm / (closingSpeed / 3600) : 999; 
            const isCritical = (
                altitude > 3000 && 
                dAlt < 1000 && 
                timeToReach * 3600 < 20
            );
            
            // Color
            let color = '#38bdf8'; // Default Cyan
            if (isCritical) {
                color = '#ff0000'; // Red
            } else {
                if (dAlt < 1000) {
                    color = '#fbbf24'; // Amber/Orange
                } else if (distNm < 10) {
                     color = '#facc15'; // Yellow
                }
            }
            
            // Draw
            ctx.save();
            ctx.translate(x, y);
            
            // Rotate to NPC heading
            ctx.rotate(npc.heading * Math.PI / 180);
            
            // Draw Triangle
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(4, 4);
            ctx.lineTo(-4, 4);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            
            // Text "FL XXX"
            // Reset rotation for text to be upright on screen
            ctx.rotate(-npc.heading * Math.PI / 180); // Back to North-Up
            ctx.rotate(heading * Math.PI / 180); // Back to Screen-Up
            
            ctx.fillStyle = color;
            ctx.font = '10px monospace';
            ctx.fillText(`FL ${Math.round(npc.altitude/100)}`, 8, 3);
            
            ctx.restore();
          });
      }


      // Background fill + outer ring
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = theme?.backgroundFill || 'rgba(0, 10, 20, 0.2)';
      ctx.fill();
      ctx.strokeStyle = theme?.outerRing || '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (showRangeRings) {
        ctx.strokeStyle = theme?.ringColor || 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        const ringCount = 4;
        for (let i = 1; i <= ringCount; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, radius * i / ringCount, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.fillStyle = theme?.outerRing || '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < 360; i += 10) {
        const angle = i * Math.PI / 180;
        const x = (radius + 5) * Math.sin(angle);
        const y = -(radius + 5) * Math.cos(angle);

        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, -radius - (i % 90 === 0 ? 10 : 5));
        ctx.stroke();
        ctx.restore();

        if (i % 90 === 0) {
          let label = '';
          if (i === 0) label = 'N';
          else if (i === 90) label = 'E';
          else if (i === 180) label = 'S';
          else if (i === 270) label = 'W';

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(heading * Math.PI / 180);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        } else if (i % 30 === 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(heading * Math.PI / 180);
          ctx.fillText(String(i / 10).padStart(2, '0'), 0, 0);
          ctx.restore();
        }
      }

      let alignmentBarData = null;
      const ilsData = flightState?.autopilotDebug?.ils || null;
      const ilsGuidanceActive = !!(ilsData?.active && Number.isFinite(ilsData?.locDeviationDeg));
      
      if (ilsGuidanceActive) {
        const relBearing = Math.max(-45, Math.min(45, -(ilsData.locDeviationDeg || 0) * 12));
        alignmentBarData = {
          relBearing,
          source: 'ILS',
          gsDeviationDeg: Number.isFinite(ilsData.gsDeviationDeg) ? ilsData.gsDeviationDeg : null,
          runway: ilsData.runway || ''
        };
      }
      if (nearbyRunways.length > 0 && typeof flightState?.latitude === 'number' && (displayMode === 'airport' || displayMode === 'map')) {
        let closestRw = null;
        let minRwDist = Infinity;
        
        nearbyRunways.forEach(airport => {
            // Draw Airport Symbol
            const distNm = calculateDistance(flightState.latitude, flightState.longitude, airport.latitude, airport.longitude);
            if (distNm < mapRange * 1.2) {
                 const brg = bearingTo(flightState.latitude, flightState.longitude, airport.latitude, airport.longitude) * Math.PI / 180;
                 const r = Math.min(mapRange * 2, distNm) / mapRange * radius;
                 const x = r * Math.sin(brg);
                 const y = -r * Math.cos(brg);
                 
                 // Draw Circle
                 ctx.beginPath();
                 ctx.arc(x, y, 4, 0, Math.PI * 2);
                 ctx.strokeStyle = '#00ffff'; // Cyan for airports
                 ctx.lineWidth = 1;
                 ctx.stroke();
                 
                 // Draw Label
                 ctx.save();
                 ctx.translate(x, y);
                 ctx.rotate(heading * Math.PI / 180);
                 ctx.fillStyle = '#00ffff';
                 ctx.font = '9px monospace';
                 ctx.textAlign = 'center';
                 ctx.fillText(airport.iata || airport.icao, 0, 10);
                 ctx.restore();
            }
            
            // Get runways for logic
            let airportRunways = [];
            if (airport.runways && Array.isArray(airport.runways)) {
                airportRunways = airport.runways;
            } else if (airport.runway) {
                airportRunways = [{ name: airport.runway, length: airport.runwayLength }];
            } else {
                airportRunways = [{ name: "09/27", length: 8000 }];
            }
            
            airportRunways.forEach(r => {
                const geom = airportService.getRunwayGeometry(airport.iata || airport.icao, r.name);
                if (geom) {
                    // Logic for alignment bar (find closest)
                    const midLat = (geom.thresholdStart.latitude + geom.thresholdEnd.latitude) / 2;
                    const midLon = (geom.thresholdStart.longitude + geom.thresholdEnd.longitude) / 2;
                    const d = calculateDistance(flightState.latitude, flightState.longitude, midLat, midLon);
                    if (d < minRwDist) {
                        minRwDist = d;
                        closestRw = { ...geom, midLat, midLon };
                    }
                    
                    // Draw Runway Line
                    if (distNm < mapRange * 1.2) {
                         ctx.strokeStyle = '#d8b4fe'; // Light Purple
                         ctx.lineWidth = 2;
                         
                         const brgStart = bearingTo(flightState.latitude, flightState.longitude, geom.thresholdStart.latitude, geom.thresholdStart.longitude) * Math.PI / 180;
                         const rStart = Math.min(mapRange * 2, calculateDistance(flightState.latitude, flightState.longitude, geom.thresholdStart.latitude, geom.thresholdStart.longitude) / mapRange * radius);
                         const xStart = rStart * Math.sin(brgStart);
                         const yStart = -rStart * Math.cos(brgStart);
    
                         const brgEnd = bearingTo(flightState.latitude, flightState.longitude, geom.thresholdEnd.latitude, geom.thresholdEnd.longitude) * Math.PI / 180;
                         const rEnd = Math.min(mapRange * 2, calculateDistance(flightState.latitude, flightState.longitude, geom.thresholdEnd.latitude, geom.thresholdEnd.longitude) / mapRange * radius);
                         const xEnd = rEnd * Math.sin(brgEnd);
                         const yEnd = -rEnd * Math.cos(brgEnd);
    
                         ctx.beginPath();
                         ctx.moveTo(xStart, yStart);
                         ctx.lineTo(xEnd, yEnd);
                         ctx.stroke();
                    }
                }
            });
        });

        if (closestRw && minRwDist < 10) {
          const bearingToCenter = bearingTo(flightState.latitude, flightState.longitude, closestRw.midLat, closestRw.midLon);
          let relBearing = (bearingToCenter - heading + 360) % 360;
          if (relBearing > 180) relBearing -= 360;

          // Store for drawing outside rotation context
          alignmentBarData = { relBearing, source: 'RUNWAY' };
        }
      }

      if (waypoints.length === 0 && navigationPath.length > 0 && typeof flightState?.latitude === 'number' && typeof flightState?.longitude === 'number') {
        const maxRangeNm = mapRange;
        const points = navigationPath.map((wp) => {
          const distNm = calculateDistance(flightState.latitude, flightState.longitude, wp.latitude, wp.longitude);
          const brg = bearingTo(flightState.latitude, flightState.longitude, wp.latitude, wp.longitude) * Math.PI / 180;
          const r = Math.min(1, distNm / maxRangeNm) * radius;
          const x = r * Math.sin(brg);
          const y = -r * Math.cos(brg);
          return { x, y, name: wp.name || wp.label || 'WPT', distNm };
        });
        if (points.length > 0) {
          ctx.strokeStyle = '#d8b4fe';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.moveTo(0, 0);
          for (let i = 0; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
        }
      } else if (Array.isArray(waypoints) && waypoints.length > 0 && typeof flightState?.latitude === 'number' && typeof flightState?.longitude === 'number') {
        const maxRangeNm = mapRange;
        const points = waypoints.map(wp => {
          const distNm = calculateDistance(flightState.latitude, flightState.longitude, wp.latitude, wp.longitude);
          const brg = bearingTo(flightState.latitude, flightState.longitude, wp.latitude, wp.longitude) * Math.PI / 180;
          const r = Math.min(1, distNm / maxRangeNm) * radius;
          const x = r * Math.sin(brg);
          const y = -r * Math.cos(brg);
          return { x, y, name: wp.label || wp.name || 'WPT', distNm };
        });
        if (points.length > 0) {
          ctx.strokeStyle = '#d8b4fe';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.moveTo(0, 0);
          for (let i = 0; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
          for (let i = 0; i < points.length; i++) {
            const isNext = points[i].name === currentNextWaypointName;
            if (isNext) {
              ctx.beginPath();
              ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2);
              ctx.fillStyle = '#d8b4fe';
              ctx.fill();
            }
          }
        }
      }

      // Draw ILS approach path when ILS mode active
      if (autopilotMode === 'ILS' && runwayGeometry && typeof flightState?.latitude === 'number') {
        const { thresholdStart, heading: rwHdg } = runwayGeometry;
        const approachHdg = (rwHdg + 180) % 360;
        const pathLengthNm = 15;
        const latRad = thresholdStart.latitude * Math.PI / 180;
        const mPerLat = 111132.92;
        const mPerLon = 111412.84 * Math.cos(latRad);
        const dNorth = Math.cos(approachHdg * Math.PI / 180) * pathLengthNm * 1852;
        const dEast = Math.sin(approachHdg * Math.PI / 180) * pathLengthNm * 1852;
        const farLat = thresholdStart.latitude + dNorth / mPerLat;
        const farLon = thresholdStart.longitude + dEast / mPerLon;

        const brgThresh = bearingTo(flightState.latitude, flightState.longitude, thresholdStart.latitude, thresholdStart.longitude) * Math.PI / 180;
        const distThreshNm = calculateDistance(flightState.latitude, flightState.longitude, thresholdStart.latitude, thresholdStart.longitude);
        const rThresh = Math.min(distThreshNm / mapRange, 2) * radius;
        const xThresh = rThresh * Math.sin(brgThresh);
        const yThresh = -rThresh * Math.cos(brgThresh);

        const brgFar = bearingTo(flightState.latitude, flightState.longitude, farLat, farLon) * Math.PI / 180;
        const distFarNm = calculateDistance(flightState.latitude, flightState.longitude, farLat, farLon);
        const rFar = Math.min(distFarNm / mapRange, 2) * radius;
        const xFar = rFar * Math.sin(brgFar);
        const yFar = -rFar * Math.cos(brgFar);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(xThresh, yThresh);
        ctx.lineTo(xFar, yFar);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px monospace';
        ctx.fillText(`ILS ${rwHdg}°`, xFar + 4, yFar);
      }

      ctx.restore();

      // Runway alignment bar intentionally omitted from ND for cleaner layout

      ctx.save();
      ctx.translate(arcOriginX, arcOriginY);

      // Draw Aircraft Symbol (Fixed Upwards)
      if (planeStyle === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6, 5);
        ctx.lineTo(-6, 5);
        ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (planeStyle === 'airbus') {
        // Small Airbus-like glyph resembling 士
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 8);
        ctx.moveTo(-7, -2);
        ctx.lineTo(7, -2);
        ctx.moveTo(-4, 5);
        ctx.lineTo(4, 5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6, 5);
        ctx.lineTo(-6, 5);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      // White centerline
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -radius);
      ctx.strokeStyle = theme?.centerline || '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
      
      // Draw Range and Mode Labels (Fixed on Screen)
      ctx.font = '10px monospace';
      ctx.fillStyle = '#00ff00';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`RANGE: ${mapRange}NM`, 5, 5);
      
      ctx.textAlign = 'right';
      ctx.fillText('HDG UP', size - 5, 5);
    };

    drawRadar();
  }, [flightState, heading, altitude, waypoints, navigationPath, currentNextWaypointName, mapRange, nearbyRunways, displayMode]);
  
  const panelStyle = {
    borderColor: theme?.panelBorder || '#666',
    background: theme?.panelBackground || 'linear-gradient(135deg, #080c10 0%, #1a2030 100%)',
    fontFamily: efisFontFamily || theme?.fontFamily || 'monospace'
  };
  const windDirection = Math.round(weatherData?.windDirection ?? flightState?.environment?.windDirection ?? 0);
  const windSpeed = Math.round(weatherData?.windSpeed ?? flightState?.environment?.windSpeed ?? 0);
  const infoColor = theme?.infoColor || '#ffffff';
  const accentColor = theme?.accentColor || '#d8b4fe';
  return React.createElement('div', { className: 'navigation-panel', style: panelStyle },
    React.createElement('div', { className: 'radar-display-container' },
      React.createElement('div', {
        className: 'radar-top-info',
        style: {
          color: infoColor,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px'
        }
      },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start', fontSize: '11px', color: infoColor } },
          React.createElement('div', null, `GS ${groundSpeed.toFixed(0)}   TAS ${trueAirspeed.toFixed(0)}`),
          React.createElement('div', null, `${String(((windDirection % 360) + 360) % 360).padStart(3, '0')}/${windSpeed}`)
        ),
        React.createElement('div', {
          className: 'radar-heading-info',
          style: {
            border: `1px solid ${theme?.headingBorder || '#ffffff'}`,
            padding: '2px 8px',
            borderRadius: '2px',
            color: theme?.headingText || '#ffffff',
            background: 'rgba(0,0,0,0.35)',
            fontWeight: 'bold',
            lineHeight: 1.1,
            textAlign: 'center'
          }
        },
          React.createElement('div', { style: { fontSize: '10px', color: accentColor } }, 'HDG'),
          React.createElement('div', { style: { fontSize: '18px' } }, `${Math.round(heading).toString().padStart(3, '0')}`)
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end', fontSize: '11px', color: infoColor } },
          React.createElement('div', null, currentNextWaypointName),
          React.createElement('div', null, `${currentDistanceToNextWaypoint.toFixed(1)} NM`)
        )
      ),
      React.createElement('canvas', {
        ref: radarCanvasRef,
        className: 'radial-radar-canvas',
        style: { display: showLocalRouteMap ? 'none' : 'block' }
      }),
      showLocalRouteMap && React.createElement('div', {
        style: {
          position: 'absolute',
          inset: 0,
          paddingTop: '54px',
          background: '#020617'
        }
      },
        React.createElement(LocalRouteMap, {
          departure: flightPlan?.departure,
          arrival: selectedArrival || flightPlan?.arrival,
          waypoints,
          routeObject: flightPlan?.routeObject,
          height: '100%',
          followAircraft: true,
          aircraftPosition: flightState
        })
      )
    ),
    React.createElement('div', {
      style: {
        marginTop: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: infoColor,
        fontSize: '11px',
        padding: '0 4px',
        gap: '8px'
      }
    },
      React.createElement('button', {
        onClick: cycleRange,
        style: {
          background: '#0b140b',
          border: `1px solid ${theme?.controlBorder || '#ffffff'}`,
          color: infoColor,
          borderRadius: '2px',
          padding: '2px 8px',
          fontSize: '10px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }
      }, `${mapRange} NM`),
      React.createElement('button', {
        onClick: () => setShowLocalRouteMap(prev => !prev),
        style: {
          background: showLocalRouteMap ? '#102a43' : '#0b140b',
          border: `1px solid ${theme?.controlBorder || '#ffffff'}`,
          color: infoColor,
          borderRadius: '2px',
          padding: '2px 8px',
          fontSize: '10px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }
      }, showLocalRouteMap ? 'MAP' : 'EFIS'),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'flex-end' } },
        [['map', 'MAP'], ['terrain', 'TERR'], ['weather', 'WXR'], ['tcas', 'TCAS'], ['airport', 'APT']].map(([mode, label]) =>
          React.createElement('button', {
            key: mode,
            type: 'button',
            onClick: () => setDisplayMode(mode),
            'aria-pressed': displayMode === mode,
            title: `${label} radar mode`,
            style: {
              background: displayMode === mode ? '#244a40' : '#0b140b',
              border: `1px solid ${theme?.controlBorder || '#ffffff'}`,
              color: infoColor,
              borderRadius: '2px',
              padding: '2px 5px',
              fontSize: '10px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }
          }, label)
        )
      )
    )
  );
};

export default NavigationPanel;
