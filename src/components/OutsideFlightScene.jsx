import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import { outsideAtmosphere } from '../utils/outsideAtmosphere.js';
import * as THREE from 'three';
import { terrainRadarService } from '../services/TerrainRadarService.js';
import { nextAutoEconomy, outsideRenderBudget, outsideLightRanges } from '../utils/visualQualityPreference.js';
import { createRunwayLighting, createRunwayMarkings } from '../services/outsideAirportVisuals.js';
import { createAirportGround } from '../services/outsideAirportGround.js';
import { resolveVisualRunways } from '../utils/airportGroundCoordinates.js';
import { terrainViewRange, terrainRequestCenter } from '../utils/outsideTerrain.js';
import { createNearbyAirportScenery } from '../services/nearbyAirportScenery.js';

import { cockpitVisualState, parseZuluTime, daylightFactor } from '../utils/cockpitVisualState.js';

const FT_TO_M = 0.3048;
const DEG = Math.PI / 180;
const EMPTY_RUNWAYS = Object.freeze([]);
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

export default function OutsideFlightScene({ flightData, weatherData, geometry, airportRunways = EMPTY_RUNWAYS, groundPackage = null, timeZulu, timeScale = 1, quality = 'balanced' }) {
  const { tx } = useLanguage();
  const [renderError, setRenderError] = useState(null);
  const hostRef = useRef(null);
  const latestRef = useRef({ flightData, weatherData, timeZulu, timeScale, quality });
  latestRef.current = { flightData, weatherData, timeZulu, timeScale, quality };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !geometry?.thresholdStart) return undefined;
    const initialQuality = latestRef.current.quality;
    let sceneRevision = 0;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'low-power' }); }
    catch {
      setRenderError('WebGL is unavailable. Enable hardware acceleration to show the outside view.');
      return undefined;
    }
    setRenderError(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(outsideRenderBudget(initialQuality, host.clientWidth, host.clientHeight, window.devicePixelRatio).pixelRatio);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x89999f);
    scene.fog = new THREE.FogExp2(0xa7b5ae, 0.00013);
    // Match distant terrain fog at the horizon, fading into the sky overhead.
    const horizonMaterial = new THREE.ShaderMaterial({
      uniforms: {
        skyColor: { value: scene.background },
        hazeColor: { value: scene.fog.color },
        hazeStrength: { value: 0 }
      },
      vertexShader: `
        varying vec3 skyDirection;
        void main() {
          skyDirection = position;
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = clip.xyww;
        }
      `,
      fragmentShader: `
        uniform vec3 skyColor;
        uniform vec3 hazeColor;
        uniform float hazeStrength;
        varying vec3 skyDirection;
        void main() {
          float elevation = normalize(skyDirection).y;
          float haze = 1.0 - smoothstep(-0.03, 0.22, elevation);
          gl_FragColor = vec4(mix(skyColor, hazeColor, haze * hazeStrength), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false
    });
    const horizonSky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), horizonMaterial);
    horizonSky.frustumCulled = false;
    horizonSky.renderOrder = -100;
    scene.add(horizonSky);
    const hemi = new THREE.HemisphereLight(0xd5e8eb, 0x435139, 1.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe7c3, 2);
    sun.position.set(-3000, 4000, 2200); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(54, 1, 2.5, 20000);
    scene.add(camera);
    const taxiLight = new THREE.SpotLight(0xffedc7, 0, 230, .36, .55, 1);
    const landingLight = new THREE.SpotLight(0xfff4dc, 0, 650, .25, .45, 1);
    taxiLight.position.set(0, -1, -3); taxiLight.target.position.set(0, -7, -95);
    landingLight.position.set(0, -1, -3); landingLight.target.position.set(0, -12, -320);
    const beaconLight = new THREE.PointLight(0xff2020, 0, 55, 1.5);
    beaconLight.position.set(0, 1, 5);
    const strobeLight = new THREE.PointLight(0xffffff, 0, 75, 1.5);
    strobeLight.position.set(0, 0, 3);
    const navLeft = new THREE.PointLight(0xff2020, 0, 30, 1.5);
    const navRight = new THREE.PointLight(0x20ff70, 0, 30, 1.5);
    navLeft.position.set(-12, -1, 4); navRight.position.set(12, -1, 4);
    const wingLight = new THREE.PointLight(0xffefda, 0, 65, 1.5);
    wingLight.position.set(0, -1, 12);
    const logoLight = new THREE.PointLight(0xffefda, 0, 35, 1.5);
    logoLight.position.set(0, 3, 22);
    const aircraftLights = [taxiLight, landingLight, beaconLight, strobeLight, wingLight, logoLight, navLeft, navRight];
    aircraftLights.forEach(light => { light.visible = false; });
    let lightRanges;
    camera.add(wingLight, logoLight);
    camera.add(taxiLight, taxiLight.target, landingLight, landingLight.target, beaconLight, strobeLight, navLeft, navRight);
    const airportGroup = new THREE.Group(); scene.add(airportGroup);
    const runwayLength = Math.max(300, geometry.length || 2500);
    const runwayWidth = Math.max(20, geometry.width || 45);
    const airportElevationM = (geometry.thresholdStart.elevation || 0) * FT_TO_M;

    const isHongKong = geometry.airportCode === 'VHHH' || geometry.airportCode === 'HKG';
    const baseSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
      color: isHongKong ? 0x36545a : 0x65745a, roughness: 1, depthWrite: true
    }));
    baseSurface.rotation.x = -Math.PI / 2;
    baseSurface.position.y = Math.min(-airportElevationM - .2, -.2);
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
      if (document.hidden || !inViewport) return;
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
      sceneRevision++;
      terrainCommitted = true; window.clearInterval(terrainTimer);
    }, 1000);

    const runwayLighting = [];
    const paint = new THREE.MeshBasicMaterial({ color: 0xe8e7db, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    if (!geometry.terrainOnly) {
      const pavement = new THREE.Mesh(new THREE.PlaneGeometry(runwayWidth, runwayLength), new THREE.MeshStandardMaterial({ color: 0x454947, roughness: .9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      pavement.rotation.x = -Math.PI / 2; pavement.position.set(0, .04, -runwayLength / 2); airportGroup.add(pavement);
      createRunwayMarkings(airportGroup, runwayLength, runwayWidth, paint);
      runwayLighting.push(createRunwayLighting(airportGroup, runwayLength, runwayWidth));
    }
    const visualRunways = geometry.terrainOnly ? [] : resolveVisualRunways(geometry, airportRunways);
    visualRunways.slice(1).forEach((other) => {
      if (!other?.thresholdStart) return;
      const otherLength = Math.max(300, other.length || runwayLength);
      const otherWidth = Math.max(20, other.width || runwayWidth);
      const group = new THREE.Group();
      const threshold = runwayPoint(other.thresholdStart.latitude, other.thresholdStart.longitude, geometry.thresholdStart, geometry.heading);
      group.position.copy(threshold);
      // Surface movement currently uses one flat airport datum.
      group.position.y = 0;
      group.rotation.y = -(other.heading - geometry.heading) * DEG;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(otherWidth, otherLength),
        new THREE.MeshStandardMaterial({ color: 0x474b49, roughness: .9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, .06, -otherLength / 2);
      group.add(strip);
      createRunwayMarkings(group, otherLength, otherWidth, paint);
      airportGroup.add(group);
      runwayLighting.push(createRunwayLighting(group, otherLength, otherWidth));
    });
    const airportGround = geometry.terrainOnly
      ? { distanceFromFootprint: () => Infinity, update() {}, dispose() {} }
      : createAirportGround(airportGroup, geometry, visualRunways, groundPackage, terrain.material);
    const nearbyAirports = createNearbyAirportScenery(scene, geometry);

    // Keep one active tile and one pending request; release superseded geometry.
    // Coverage extends ahead of the aircraft while the next samples load.
    const enrouteSize = 25;
    const enrouteSpacing = 2000;
    const enrouteMaterial = new THREE.MeshStandardMaterial({ color: 0x65745a, roughness: 1 });
    let activeTile = null;
    let pendingTile = null;
    let enrouteMode = Boolean(geometry.terrainOnly);
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
      return { origin, cells };
    };
    const streamTerrain = () => {
      if (document.hidden || !inViewport) return;
      const position = latestRef.current.flightData?.position;
      if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return;
      const previousRevision = nearbyAirports.revision;
      nearbyAirports.update(position.latitude, position.longitude);
      if (previousRevision !== nearbyAirports.revision) sceneRevision++;
      if (!enrouteMode) {
        pendingTile = null;
        disposeTile(activeTile); activeTile = null;
        return;
      }
      const distanceFrom = (origin) => runwayPoint(position.latitude, position.longitude, origin, geometry.heading).length();
      if (pendingTile && distanceFrom(pendingTile.origin) > 10000) pendingTile = null;
      if (!pendingTile && (!activeTile || distanceFrom(activeTile.origin) > 6500)) {
        const center = terrainRequestCenter(position.latitude, position.longitude, latestRef.current.flightData?.heading);
        pendingTile = makeTileRequest(center.latitude, center.longitude);
      }
      // Refresh the fetch queue as we move, including retries after provider failure.
      const requestOrigin = pendingTile?.origin || activeTile?.origin;
      if (requestOrigin) terrainRadarService.update(requestOrigin.latitude, requestOrigin.longitude, 20,
        latestRef.current.flightData?.heading ?? geometry.heading);
      if (activeTile) updateTileHeights(activeTile);
      if (!pendingTile) return;
      const values = pendingTile.cells.map((cell) => terrainRadarService.getTerrainHeight(cell.latitude, cell.longitude));
      if (!values.some(Number.isFinite)) return;
      const tileGeometry = new THREE.PlaneGeometry(
        (enrouteSize - 1) * enrouteSpacing, (enrouteSize - 1) * enrouteSpacing,
        enrouteSize - 1, enrouteSize - 1
      );
      tileGeometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(tileGeometry, enrouteMaterial);
      const nextTile = { ...pendingTile, mesh, signature: null };
      updateTileHeights(nextTile);
      scene.add(mesh);
      disposeTile(activeTile);
      activeTile = nextTile;
      sceneRevision++;
      pendingTile = null;
    };
    const updateTileHeights = (tile) => {
      const values = tile.cells.map(cell => terrainRadarService.getTerrainHeight(cell.latitude, cell.longitude));
      const signature = `${nearbyAirports.revision}:${values.join(',')}`;
      if (signature === tile.signature) return;
      tile.signature = signature;
      const vertices = tile.mesh.geometry.attributes.position;
      values.forEach((value, index) => {
        // Preserve existing heights for pending/evicted samples instead of dropping terrain.
        const fallback = Number.isFinite(value) ? value * FT_TO_M - airportElevationM
          : tile.initialized ? vertices.getY(index) : baseSurface.position.y;
        const cell = tile.cells[index];
        vertices.setY(index, nearbyAirports.terrainHeight(cell.latitude, cell.longitude, fallback));
      });
      tile.initialized = true;
      vertices.needsUpdate = true;
      tile.mesh.geometry.computeVertexNormals();
      tile.mesh.geometry.computeBoundingSphere();
      sceneRevision++;
    };
    const streamTimer = window.setInterval(streamTerrain, 1200);

    const daySky = new THREE.Color(0x89999f); const nightSky = new THREE.Color(0x182536);
    const dayFog = new THREE.Color(0xa7b5ae); const nightFog = new THREE.Color(0x273545);
    const cruiseSky = new THREE.Color(0x2873c7); const cruiseFog = new THREE.Color(0x96bce3);
    const atmosphereColor = new THREE.Color();
    let clockSource = null; let clockBase = new Date(); let clockStartedAt = performance.now();
    let lastLightUpdate = -Infinity;
    let daylight = 1;
    let appliedQuality = initialQuality;
    let autoEconomy = false;
    let lastRenderAt = -Infinity;
    let lastDiagnosticsAt = -Infinity;
    let renderedFrames = 0;
    let frameId = 0; let frameTimer = 0; let hidden = document.hidden; let inViewport = true; let disposed = false;
    let lastFingerprint = '';
    const resize = () => {
      const width = host.clientWidth; const height = host.clientHeight;
      if (!width || !height) return;
      const budget = outsideRenderBudget(appliedQuality, width, height, window.devicePixelRatio);
      renderer.setPixelRatio(budget.pixelRatio);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
      sceneRevision++;
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const syncVisibility = () => {
      cancelAnimationFrame(frameId); window.clearTimeout(frameTimer); frameId = 0; frameTimer = 0;
      if (!disposed && !hidden && inViewport) { sceneRevision++; frameId = requestAnimationFrame(animate); }
    };
    const visibility = () => { hidden = document.hidden; syncVisibility(); }; document.addEventListener('visibilitychange', visibility);
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; syncVisibility(); });
    intersection?.observe(host);
    const animate = () => {
      frameId = 0;
      if (disposed || hidden || !inViewport) return;
      const { flightData: state, weatherData: weather, timeZulu: selectedTime, timeScale: scale, quality: selectedQuality } = latestRef.current;
      const now = performance.now();
      autoEconomy = nextAutoEconomy(autoEconomy, state?.derived?.altitude_agl_ft);
      const effectiveQuality = autoEconomy ? 'economy' : selectedQuality;
      const budget = outsideRenderBudget(effectiveQuality, host.clientWidth, host.clientHeight, window.devicePixelRatio);
      frameTimer = window.setTimeout(() => {
        frameTimer = 0;
        if (!disposed && !hidden && inViewport) frameId = requestAnimationFrame(animate);
      }, Math.max(0, 1000 / budget.fps - 2));
      if (effectiveQuality !== appliedQuality) {
        appliedQuality = effectiveQuality;
        resize();
      }
      if (now - lastRenderAt < 1000 / budget.fps - 1) return;
      const position = state?.position;
      if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return;
      const point = runwayPoint(position.latitude, position.longitude, geometry.thresholdStart, geometry.heading);
      const mslFt = state?.derived?.altitude_ft ?? state?.altitude;
      if (point.length() > 17000) enrouteMode = true;
      else if (point.length() < 13000 && !geometry.terrainOnly) enrouteMode = false;
      const enroute = enrouteMode;
      airportGroup.visible = !enroute;
      nearbyAirports.position(enroute ? point.x : 0, enroute ? point.z : 0, geometry.airportCode, !enroute);
      // A moving distant surface keeps a horizon even when elevation data is unavailable.
      baseSurface.position.x = enroute ? 0 : point.x;
      baseSurface.position.z = enroute ? 0 : point.z;
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
      const visual = cockpitVisualState(state?.systems, weather, mslFt);
      const atmosphere = outsideAtmosphere(mslFt, weather);
      const precipitationVisibility = Number.isFinite(visual.visibilityLimit)
        ? visual.visibilityLimit + (80000 - visual.visibilityLimit) * atmosphere.cruiseBlend
        : Infinity;
      const visibilityM = Math.min(atmosphere.visibilityM, precipitationVisibility);
      lightRanges = outsideLightRanges(lightRanges, state?.derived?.altitude_agl_ft);
      taxiLight.visible = lightRanges.ground && visual.taxi;
      landingLight.visible = lightRanges.landing && visual.landing;
      beaconLight.visible = lightRanges.ground && visual.beacon;
      strobeLight.visible = lightRanges.ground && visual.strobe;
      wingLight.visible = lightRanges.ground && visual.wing;
      logoLight.visible = lightRanges.ground && visual.logo;
      navLeft.visible = navRight.visible = lightRanges.ground && visual.nav;
      // Keep visible steady during a flash cycle to reuse the same shaders.
      // Invisible lights are excluded from Three.js lighting calculations entirely.
      taxiLight.intensity = 1800;
      landingLight.intensity = 6500;
      beaconLight.intensity = beaconLight.visible && now % 1200 < 170 ? 12 : 0;
      strobeLight.intensity = strobeLight.visible && (now % 1100 < 65 || (now % 1100 > 140 && now % 1100 < 205)) ? 28 : 0;
      wingLight.intensity = 18;
      logoLight.intensity = 6;
      navLeft.intensity = navRight.intensity = 4;
      const viewRange = terrainViewRange(camera.position.y - baseSurface.position.y);
      baseSurface.scale.set(viewRange.surfaceSize, viewRange.surfaceSize, 1);
      if (camera.far !== viewRange.far) { camera.far = viewRange.far; camera.updateProjectionMatrix(); }
      scene.fog.density = 2.5 / visibilityM;
      const source = selectedTime || weather?.zuluTime || '';
      if (source !== clockSource || now - lastLightUpdate > 10000) {
        if (source !== clockSource) { clockSource = source; clockBase = parseZuluTime(selectedTime, weather?.zuluTime); clockStartedAt = now; }
        const visualTime = new Date(clockBase.getTime() + (now - clockStartedAt) * Math.max(1, scale || 1));
        const factor = daylightFactor(visualTime, geometry.airportLat, geometry.airportLon);
        daylight = factor;
        renderer.toneMappingExposure = .75 + .3 * factor;
        lastLightUpdate = now;
      }
      const groundLightScale = .85 + .15 * atmosphere.cruiseBlend;
      hemi.intensity = .35 + 1.45 * daylight * groundLightScale;
      sun.intensity = 2 * daylight * groundLightScale;
      atmosphereColor.copy(daySky).lerp(cruiseSky, atmosphere.cruiseBlend);
      scene.background.copy(nightSky).lerp(atmosphereColor, daylight);
      atmosphereColor.copy(dayFog).lerp(cruiseFog, atmosphere.cruiseBlend);
      scene.fog.color.copy(nightFog).lerp(atmosphereColor, daylight);
      horizonSky.position.copy(camera.position);
      horizonMaterial.uniforms.hazeStrength.value = 1 - THREE.MathUtils.smoothstep(visibilityM, 8000, 20000);
      const fingerprint = [position.latitude, position.longitude, mslFt, state?.heading, state?.pitch, state?.roll,
        visibilityM, source, daylight, aircraftLights.map(light => light.visible ? light.intensity : 0).join(','), effectiveQuality, enroute, sceneRevision].join(':');
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      airportGround.update(camera, visibilityM, daylight, effectiveQuality === 'economy', enroute, now);
      if (!enroute) runwayLighting.forEach((lighting) => lighting.update(camera, visibilityM, daylight, renderer.getPixelRatio()));
      renderer.render(scene, camera);
      renderer.domElement.dataset.renderedFrames = ++renderedFrames;
      if (now - lastDiagnosticsAt > 1200) {
        renderer.domElement.dataset.groundSource = groundPackage ? 'openstreetmap' : 'procedural';
        renderer.domElement.dataset.aircraftLights = aircraftLights.filter(light => light.visible).length;
        renderer.domElement.dataset.drawCalls = renderer.info.render.calls;
        renderer.domElement.dataset.triangles = renderer.info.render.triangles;
        renderer.domElement.dataset.geometries = renderer.info.memory.geometries;
        renderer.domElement.dataset.textures = renderer.info.memory.textures;
        renderer.domElement.dataset.targetFps = budget.fps;
        renderer.domElement.dataset.pixelRatio = renderer.getPixelRatio();
        lastDiagnosticsAt = now;
      }
      lastRenderAt = now;
    };
    frameId = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId); window.clearTimeout(frameTimer); window.clearInterval(terrainTimer); window.clearInterval(streamTimer);
      observer.disconnect(); intersection?.disconnect(); document.removeEventListener('visibilitychange', visibility);
      airportGround.dispose();
      nearbyAirports.dispose();
      disposeScene(scene); enrouteMaterial.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [geometry, groundPackage, airportRunways]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
    {renderError && <div className="outside-flight-placeholder" role="alert">{tx(renderError)}</div>}
  </div>;
}

OutsideFlightScene.propTypes = {
  flightData: PropTypes.object, weatherData: PropTypes.object, geometry: PropTypes.object,
  airportRunways: PropTypes.array, groundPackage: PropTypes.object, timeZulu: PropTypes.string,
  timeScale: PropTypes.number, quality: PropTypes.string
};
