import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { terrainRadarService } from '../services/TerrainRadarService.js';
import { nextAutoEconomy } from '../utils/visualQualityPreference.js';
import { createRunwayLighting } from '../services/outsideAirportVisuals.js';
import { createAirportGround } from '../services/outsideAirportGround.js';

const FT_TO_M = 0.3048;
const DEG = Math.PI / 180;
const normalizeVisibilityM = (value) => Number.isFinite(value)
  ? THREE.MathUtils.clamp(value <= 30 ? value * 1000 : value, 300, 20000)
  : 20000;

const parseZuluTime = (selectedTime, weatherTime) => {
  const raw = selectedTime || weatherTime;
  if (typeof raw === 'string' && /^\d{1,2}:\d{2}Z?$/i.test(raw)) {
    const [hours, minutes] = raw.replace(/Z$/i, '').split(':').map(Number);
    const date = new Date(); date.setUTCHours(hours, minutes, 0, 0); return date;
  }
  const parsed = raw ? new Date(raw) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

const daylightFactor = (date, latitude, longitude) => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const declination = 23.44 * DEG * Math.sin((2 * Math.PI * (day - 81)) / 365.25);
  const solarHour = date.getUTCHours() + date.getUTCMinutes() / 60 + longitude / 15;
  const hourAngle = (solarHour - 12) * 15 * DEG;
  const lat = latitude * DEG;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)) / DEG;
  return THREE.MathUtils.smoothstep(elevation, -6, 7);
};
// Runway-local X is right of the approach path; negative Z is down runway.
const runwayPoint = (lat, lon, origin, heading) => {
  const east = (lon - origin.longitude) * 111320 * Math.cos(origin.latitude * DEG);
  const north = (lat - origin.latitude) * 111320;
  const angle = heading * DEG;
  return new THREE.Vector3(east * Math.cos(angle) - north * Math.sin(angle), 0,
    -(east * Math.sin(angle) + north * Math.cos(angle)));
};

const disposeScene = (scene) => {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  scene.traverse((item) => {
    if (item.geometry) geometries.add(item.geometry);
    const entries = Array.isArray(item.material) ? item.material : [item.material];
    entries.filter(Boolean).forEach((material) => { materials.add(material); Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); }); });
  });
  textures.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); geometries.forEach((item) => item.dispose());
};

export default function OutsideFlightScene({ flightData, weatherData, geometry, airportRunways = [], groundPackage = null, timeZulu, timeScale = 1, quality = 'balanced' }) {
  const hostRef = useRef(null);
  const latestRef = useRef({ flightData, weatherData, timeZulu, timeScale, quality });
  latestRef.current = { flightData, weatherData, timeZulu, timeScale, quality };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !geometry?.thresholdStart) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }); }
    catch { return undefined; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'economy' ? .75 : 1.1));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x91aab1);
    scene.fog = new THREE.FogExp2(0xa7b5ae, 0.00013);
    const hemi = new THREE.HemisphereLight(0xd5e8eb, 0x435139, 1.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe7c3, 2);
    sun.position.set(-3000, 4000, 2200); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(54, 1, 2.5, 20000);
    const airportGroup = new THREE.Group(); scene.add(airportGroup);
    const runwayLength = Math.max(300, geometry.length || 2500);
    const runwayWidth = Math.max(20, geometry.width || 45);
    const airportElevationM = (geometry.thresholdStart.elevation || 0) * FT_TO_M;

    const isHongKong = geometry.airportCode === 'VHHH' || geometry.airportCode === 'HKG';
    const baseSurface = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({
      color: isHongKong ? 0x36545a : 0x65745a, roughness: 1, depthWrite: true
    }));
    baseSurface.rotation.x = -Math.PI / 2;
    baseSurface.position.y = isHongKong ? -airportElevationM : -.2;
    baseSurface.renderOrder = -10;
    scene.add(baseSurface);
    const terrainSize = 18; const spacing = 1100;
    const terrainGeometry = new THREE.PlaneGeometry((terrainSize - 1) * spacing, (terrainSize - 1) * spacing, terrainSize - 1, terrainSize - 1);
    terrainGeometry.rotateX(-Math.PI / 2);
    const terrainPosition = terrainGeometry.attributes.position;
    const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ color: 0x65745a, roughness: 1 }));
    terrain.position.z = -runwayLength / 2;
    terrain.visible = false;
    airportGroup.add(terrain);
    const terrainCells = [];
    for (let i = 0; i < terrainPosition.count; i++) {
      const x = terrainPosition.getX(i); const z = terrainPosition.getZ(i) + terrain.position.z;
      const heading = geometry.heading * DEG;
      const east = x * Math.cos(heading) - z * Math.sin(heading);
      const north = -x * Math.sin(heading) - z * Math.cos(heading);
      terrainCells.push({
        latitude: geometry.thresholdStart.latitude + north / 111320,
        longitude: geometry.thresholdStart.longitude + east / (111320 * Math.cos(geometry.thresholdStart.latitude * DEG)),
        x, z
      });
    }
    terrainRadarService.update(geometry.airportLat, geometry.airportLon, 10, geometry.heading);
    let terrainCommitted = false; let terrainTimer;
    terrainTimer = window.setInterval(() => {
      if (terrainCommitted) return;
      const values = terrainCells.map((cell) => terrainRadarService.getTerrainHeight(cell.latitude, cell.longitude));
      const loaded = values.filter(Number.isFinite).length;
      if (loaded < values.length * .55) return;
      values.forEach((value, i) => {
        const { x, z } = terrainCells[i];
        const distance = airportGround.distanceFromFootprint(x, z);
        const blend = THREE.MathUtils.smoothstep(distance, 400, 2400);
        const relativeM = Number.isFinite(value) ? (value * FT_TO_M - airportElevationM) : 0;
        const height = THREE.MathUtils.lerp(-.2, relativeM, blend);
        terrainPosition.setY(i, isHongKong && Number.isFinite(value) && value <= 0 ? -airportElevationM - .2 : height);
      });
      terrainPosition.needsUpdate = true; terrainGeometry.computeVertexNormals(); terrainGeometry.computeBoundingSphere();
      terrain.visible = true;
      terrainCommitted = true; window.clearInterval(terrainTimer);
    }, 1000);

    const pavement = new THREE.Mesh(new THREE.PlaneGeometry(runwayWidth, runwayLength), new THREE.MeshStandardMaterial({ color: 0x454947, roughness: .9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    pavement.rotation.x = -Math.PI / 2; pavement.position.set(0, .04, -runwayLength / 2); airportGroup.add(pavement);
    const paint = new THREE.MeshBasicMaterial({ color: 0xe8e7db, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const marking = (x, z, width, length) => { const item = new THREE.Mesh(new THREE.PlaneGeometry(width, length), paint); item.rotation.x = -Math.PI / 2; item.position.set(x, .08, z); airportGroup.add(item); };
    for (let z = -90; z > -runwayLength + 60; z -= 65) marking(0, z, .8, 30);
    for (const x of [-runwayWidth * .3, -runwayWidth * .18, runwayWidth * .18, runwayWidth * .3]) marking(x, -30, 2.5, 27);
    for (const x of [-runwayWidth * .26, runwayWidth * .26]) marking(x, -300, 3, 45);
    marking(-runwayWidth * .46, -runwayLength / 2, .65, runwayLength - 35);
    marking(runwayWidth * .46, -runwayLength / 2, .65, runwayLength - 35);
    const runwayLighting = [createRunwayLighting(airportGroup, runwayLength, runwayWidth)];

    airportRunways.forEach((other, runwayIndex) => {
      if (!other?.thresholdStart) return;
      const otherLength = Math.max(300, other.length || runwayLength);
      const otherWidth = Math.max(20, other.width || runwayWidth);
      const group = new THREE.Group();
      const threshold = runwayPoint(other.thresholdStart.latitude, other.thresholdStart.longitude, geometry.thresholdStart, geometry.heading);
      group.position.copy(threshold);
      if (other.geometrySource !== 'local-aip' && geometry.geometrySource !== 'local-aip') group.position.x += 180 * (runwayIndex + 1);
      // Surface movement currently uses one flat airport datum.
      group.position.y = 0;
      group.rotation.y = -(other.heading - geometry.heading) * DEG;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(otherWidth, otherLength),
        new THREE.MeshStandardMaterial({ color: 0x474b49, roughness: .9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, .06, -otherLength / 2);
      group.add(strip);
      for (let z = -90; z > -otherLength + 60; z -= 65) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(.8, 30), paint);
        line.rotation.x = -Math.PI / 2; line.position.set(0, .1, z); group.add(line);
      }
      for (const x of [-otherWidth * .28, otherWidth * .28]) {
        const aiming = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 35), paint);
        aiming.rotation.x = -Math.PI / 2; aiming.position.set(x, .1, -300); group.add(aiming);
      }
      airportGroup.add(group);
      runwayLighting.push(createRunwayLighting(group, otherLength, otherWidth));
    });
    const airportGround = createAirportGround(airportGroup, geometry, [geometry, ...airportRunways], groundPackage, terrain.material);

    // A single low-poly radar tile follows the aircraft. Replace it only after
    // the next tile has data, then release the tile that has passed behind us.
    const enrouteSize = 19;
    const enrouteSpacing = 1000;
    const enrouteMaterial = new THREE.MeshStandardMaterial({ color: 0x65745a, roughness: 1 });
    let activeTile = null;
    let pendingTile = null;
    let enrouteMode = false;
    const disposeTile = (tile) => {
      if (!tile) return;
      scene.remove(tile.mesh);
      tile.mesh.geometry.dispose();
    };
    const makeTileRequest = (latitude, longitude) => {
      const origin = { latitude, longitude };
      const cells = [];
      const half = (enrouteSize - 1) / 2;
      const angle = geometry.heading * DEG;
      for (let row = 0; row < enrouteSize; row++) {
        for (let column = 0; column < enrouteSize; column++) {
          const x = (column - half) * enrouteSpacing;
          const z = (row - half) * enrouteSpacing;
          const east = x * Math.cos(angle) - z * Math.sin(angle);
          const north = -x * Math.sin(angle) - z * Math.cos(angle);
          cells.push({
            latitude: latitude + north / 111320,
            longitude: longitude + east / (111320 * Math.cos(latitude * DEG))
          });
        }
      }
      terrainRadarService.update(latitude, longitude, 10, geometry.heading);
      return { origin, cells };
    };
    const streamTerrain = () => {
      const position = latestRef.current.flightData?.position;
      if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return;
      if (!enrouteMode) {
        pendingTile = null;
        disposeTile(activeTile); activeTile = null;
        return;
      }
      const distanceFrom = (origin) => runwayPoint(position.latitude, position.longitude, origin, geometry.heading).length();
      if (pendingTile && distanceFrom(pendingTile.origin) > 10000) pendingTile = null;
      if (!pendingTile && (!activeTile || distanceFrom(activeTile.origin) > 6500)) {
        pendingTile = makeTileRequest(position.latitude, position.longitude);
      }
      if (!pendingTile) return;
      const values = pendingTile.cells.map((cell) => terrainRadarService.getTerrainHeight(cell.latitude, cell.longitude));
      if (values.filter(Number.isFinite).length < values.length * .45) return;
      const tileGeometry = new THREE.PlaneGeometry(
        (enrouteSize - 1) * enrouteSpacing, (enrouteSize - 1) * enrouteSpacing,
        enrouteSize - 1, enrouteSize - 1
      );
      tileGeometry.rotateX(-Math.PI / 2);
      const vertices = tileGeometry.attributes.position;
      values.forEach((value, index) => {
        // Empty radar cells borrow the closest sampled elevation, avoiding holes.
        let height = value;
        if (!Number.isFinite(height)) {
          const row = Math.floor(index / enrouteSize);
          const column = index % enrouteSize;
          let nearest = Infinity;
          values.forEach((candidate, otherIndex) => {
            if (!Number.isFinite(candidate)) return;
            const distance = Math.abs(row - Math.floor(otherIndex / enrouteSize))
              + Math.abs(column - otherIndex % enrouteSize);
            if (distance < nearest) { nearest = distance; height = candidate; }
          });
        }
        vertices.setY(index, (height * FT_TO_M) - airportElevationM);
      });
      vertices.needsUpdate = true;
      tileGeometry.computeVertexNormals();
      tileGeometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(tileGeometry, enrouteMaterial);
      const nextTile = { origin: pendingTile.origin, mesh };
      scene.add(mesh);
      disposeTile(activeTile);
      activeTile = nextTile;
      pendingTile = null;
    };
    const streamTimer = window.setInterval(streamTerrain, 1200);

    const daySky = new THREE.Color(0x91aab1); const nightSky = new THREE.Color(0x182536);
    const dayFog = new THREE.Color(0xa7b5ae); const nightFog = new THREE.Color(0x273545);
    let clockSource = null; let clockBase = new Date(); let clockStartedAt = performance.now();
    let lastLightUpdate = -Infinity;
    let daylight = 1;
    let appliedQuality = quality;
    let autoEconomy = false;
    let lastRenderAt = -Infinity;
    let lastDiagnosticsAt = -Infinity;
    let frameId; let hidden = false;
    const resize = () => { const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const visibility = () => { hidden = document.hidden; }; document.addEventListener('visibilitychange', visibility);
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (hidden) return;
      const { flightData: state, weatherData: weather, timeZulu: selectedTime, timeScale: scale, quality: selectedQuality } = latestRef.current;
      const now = performance.now();
      autoEconomy = nextAutoEconomy(autoEconomy, state?.derived?.altitude_agl_ft);
      const effectiveQuality = autoEconomy ? 'economy' : selectedQuality;
      if (effectiveQuality !== appliedQuality) {
        appliedQuality = effectiveQuality;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, effectiveQuality === 'economy' ? .75 : 1.1));
        resize();
      }
      if (effectiveQuality === 'economy' && now - lastRenderAt < 1000 / 30) return;
      const position = state?.position;
      if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return;
      const point = runwayPoint(position.latitude, position.longitude, geometry.thresholdStart, geometry.heading);
      const mslFt = state?.derived?.altitude_ft ?? state?.altitude;
      if (point.length() > 17000) enrouteMode = true;
      else if (point.length() < 13000) enrouteMode = false;
      const enroute = enrouteMode;
      airportGroup.visible = !enroute;
      baseSurface.visible = !enroute;
      if (activeTile) activeTile.mesh.visible = enroute;
      if (enroute && activeTile) {
        const offset = runwayPoint(position.latitude, position.longitude, activeTile.origin, geometry.heading);
        activeTile.mesh.position.set(-offset.x, 0, -offset.z);
      }
      camera.position.set(enroute ? 0 : point.x,
        Number.isFinite(mslFt) ? mslFt * FT_TO_M - airportElevationM + 3 : 3,
        enroute ? 0 : point.z);
      const headingError = ((state?.heading ?? geometry.heading) - geometry.heading) * DEG;
      const pitch = (state?.pitch ?? 0) * DEG;
      const roll = (state?.roll ?? 0) * DEG;
      camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, -headingError, -roll);
      const visibilityM = normalizeVisibilityM(weather?.visibility);
      if (camera.far !== visibilityM) { camera.far = visibilityM; camera.updateProjectionMatrix(); }
      scene.fog.density = 2.5 / visibilityM;
      const source = selectedTime || weather?.zuluTime || '';
      if (source !== clockSource || now - lastLightUpdate > 10000) {
        if (source !== clockSource) { clockSource = source; clockBase = parseZuluTime(selectedTime, weather?.zuluTime); clockStartedAt = now; }
        const visualTime = new Date(clockBase.getTime() + (now - clockStartedAt) * Math.max(1, scale || 1));
        const factor = daylightFactor(visualTime, geometry.airportLat, geometry.airportLon);
        daylight = factor;
        scene.background.copy(nightSky).lerp(daySky, factor);
        scene.fog.color.copy(nightFog).lerp(dayFog, factor);
        hemi.intensity = .35 + 1.45 * factor;
        sun.intensity = 2 * factor;
        renderer.toneMappingExposure = .75 + .3 * factor;
        lastLightUpdate = now;
      }
      airportGround.update(camera, visibilityM, daylight, effectiveQuality === 'economy', enroute, now);
      if (!enroute) runwayLighting.forEach((lighting) => lighting.update(camera, visibilityM, daylight, renderer.getPixelRatio()));
      renderer.render(scene, camera);
      if (now - lastDiagnosticsAt > 1200) {
        renderer.domElement.dataset.groundSource = groundPackage ? 'openstreetmap' : 'procedural';
        renderer.domElement.dataset.drawCalls = renderer.info.render.calls;
        renderer.domElement.dataset.triangles = renderer.info.render.triangles;
        renderer.domElement.dataset.geometries = renderer.info.memory.geometries;
        renderer.domElement.dataset.textures = renderer.info.memory.textures;
        lastDiagnosticsAt = now;
      }
      lastRenderAt = now;
    };
    frameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameId); window.clearInterval(terrainTimer); window.clearInterval(streamTimer);
      observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
      airportGround.dispose();
      disposeScene(scene); enrouteMaterial.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [geometry, groundPackage, airportRunways]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
