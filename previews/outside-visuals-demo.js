import * as THREE from 'three';
import { terrainRadarService } from '../src/services/TerrainRadarService.js';
import './outside-visuals-demo.css';
import './outside-visuals-cockpit.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="demo">
    <div class="outside-view"></div><div class="vignette"></div>
    <div class="cockpit"><div class="roof"></div><div class="pillar left"></div><div class="pillar right"></div><div class="glareshield"></div><div class="screen left"></div><div class="screen right"></div></div>
    <div class="controls"><button data-action="replay" class="active">Replay approach</button><button data-weather="clear" class="active">Clear</button><button data-weather="haze">Haze</button><button data-weather="dusk">Dusk</button><button data-quality>Balanced</button></div>
    <div class="hud"><div class="flight-data"><span>RAD ALT</span><b data-alt>1200 FT</b><span>DISTANCE</span><b data-dist>4.1 NM</b></div><div class="confidence">Runway data · Tier A</div></div>
    <div class="label"><strong>VHHH · Runway 25R</strong><span data-terrain-status>Loading terrain-radar cells around Hong Kong…</span></div><div class="perf" data-perf>-- FPS · -- draws</div>
  </main>`;

const host = document.querySelector('.outside-view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91aab2);
scene.fog = new THREE.FogExp2(0xa7b4ad, 0.000105);

const camera = new THREE.PerspectiveCamera(54, 1, 2.5, 26000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
host.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xcce3e8, 0x4a4634, 2.0);
const sun = new THREE.DirectionalLight(0xffeed3, 2.5);
sun.position.set(-4000, 6500, 2500);
scene.add(hemi, sun);

let seed = 737;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const canvasTexture = (width, height, painter) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); painter(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
};

// Local Y=0 is the surveyed runway/airport elevation (20 ft AMSL at VHHH).
// The surrounding water therefore sits 20 ft lower, at true sea level.
const seaLevelLocalM = -20 * .3048;
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(26000, 26000),
  new THREE.MeshStandardMaterial({ color: 0x334f55, roughness: .72, metalness: .04, depthWrite: false })
);
water.rotation.x = -Math.PI / 2;
water.position.y = seaLevelLocalM;
water.renderOrder = -10;
scene.add(water);

// VHHH is built on reclaimed land. Keep the elevation-zero surface limited to
// the airport footprint instead of extending it across the surrounding water.
const airportFill = new THREE.Mesh(
  new THREE.BoxGeometry(2200, Math.abs(seaLevelLocalM) - .15, 4300),
  new THREE.MeshStandardMaterial({ color: 0x4f5946, roughness: 1 })
);
airportFill.position.set(0, seaLevelLocalM + (Math.abs(seaLevelLocalM) - .15) / 2, -1750);
scene.add(airportFill);

const asphalt = canvasTexture(512, 1024, (ctx, w, h) => {
  ctx.fillStyle = '#343837'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 16000; i++) { const c = 65 + Math.floor(random() * 32); ctx.fillStyle = `rgba(${c},${c},${c},${.12 + random() * .16})`; ctx.fillRect(random() * w, random() * h, 1.5, 1.5); }
  for (let i = 0; i < 42; i++) { ctx.strokeStyle = `rgba(15,16,16,${.02 + random() * .035})`; ctx.lineWidth = 2 + random() * 7; ctx.beginPath(); const x = w * (.33 + random() * .34); ctx.moveTo(x, 0); ctx.lineTo(x + (random() - .5) * 35, h); ctx.stroke(); }
});
asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(1, 7);
const runway = new THREE.Mesh(new THREE.PlaneGeometry(46, 3200), new THREE.MeshStandardMaterial({ map: asphalt, roughness: .84, metalness: .02, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
runway.rotation.x = -Math.PI / 2; runway.position.set(0, .02, -1600); scene.add(runway);

const paint = new THREE.MeshBasicMaterial({ color: 0xecebe1, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
const mark = (x, z, width, length, material = paint) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .045, z); scene.add(mesh); };
for (let z = -145; z > -3100; z -= 61) mark(0, z, .9, 31);
for (const x of [-17, -11, -5, 5, 11, 17]) mark(x, -20, 3.4, 32);
for (const x of [-13.5, -8.5, 8.5, 13.5]) { mark(x, -310, 3.4, 45); mark(x, -460, 2.4, 24); mark(x, -610, 2.4, 24); }
mark(-20.6, -1600, .7, 3120); mark(20.6, -1600, .7, 3120);

const labelTexture = canvasTexture(512, 256, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#efeee4'; ctx.font = 'bold 190px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('27', w / 2, h / 2); });
const label = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
label.rotation.x = -Math.PI / 2; label.rotation.z = Math.PI; label.position.set(0, .055, -92); scene.add(label);

const lightGeometry = new THREE.SphereGeometry(.28, 5, 4);
const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f1d0, toneMapped: false });
const edges = new THREE.InstancedMesh(lightGeometry, edgeMaterial, 82 * 2); const matrix = new THREE.Matrix4(); let index = 0;
for (let z = 0; z > -3200; z -= 40) for (const x of [-23.4, 23.4]) { matrix.makeTranslation(x, .25, z); edges.setMatrixAt(index++, matrix); }
scene.add(edges);
const approachMaterial = new THREE.MeshBasicMaterial({ color: 0xf7f4db, toneMapped: false });
const approach = new THREE.InstancedMesh(lightGeometry, approachMaterial, 96); index = 0;
for (let z = 40; z < 920; z += 30) { matrix.makeTranslation(0, .25, z); approach.setMatrixAt(index++, matrix); if (z % 150 === 40) for (const x of [-12, -8, -4, 4, 8, 12]) { matrix.makeTranslation(x, .25, z); approach.setMatrixAt(index++, matrix); } }
approach.count = index; scene.add(approach);

const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x777b75, roughness: .9 });
const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMaterial, 54); index = 0;
for (let i = 0; i < 54; i++) { const side = random() > .5 ? 1 : -1; const x = side * (180 + random() * 780); const z = -200 - random() * 3500; const sx = 25 + random() * 110; const sy = 7 + random() * 27; const sz = 18 + random() * 75; matrix.compose(new THREE.Vector3(x, sy / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (random() - .5) * .18, 0)), new THREE.Vector3(sx, sy, sz)); buildings.setMatrixAt(index++, matrix); }
scene.add(buildings);

// VHHH is a useful terrain test: Lantau's mountains are close to the airport.
const AIRPORT = { lat: 22.3080006, lon: 113.9189987, elevationFt: 20, runwayHeadingDeg: 250 };
const RADAR_COLS = 19;
const RADAR_ROWS = 17;
const RADAR_SPACING_M = 1100;
const radarHeights = Array.from({ length: RADAR_ROWS }, () => Array(RADAR_COLS).fill(0));

const smoothstep = value => value * value * (3 - 2 * value);
const boundedRadarHeightM = (gridX, gridY) => {
  const x0 = Math.max(0, Math.min(RADAR_COLS - 2, Math.floor(gridX)));
  const y0 = Math.max(0, Math.min(RADAR_ROWS - 2, Math.floor(gridY)));
  const tx = smoothstep(Math.max(0, Math.min(1, gridX - x0)));
  const ty = smoothstep(Math.max(0, Math.min(1, gridY - y0)));
  const samples = [radarHeights[y0][x0], radarHeights[y0][x0 + 1], radarHeights[y0 + 1][x0], radarHeights[y0 + 1][x0 + 1]];
  const north = THREE.MathUtils.lerp(samples[0], samples[1], tx);
  const south = THREE.MathUtils.lerp(samples[2], samples[3], tx);
  const interpolatedFt = THREE.MathUtils.lerp(north, south, ty);
  return THREE.MathUtils.clamp(interpolatedFt, Math.min(...samples), Math.max(...samples)) * .3048;
};

// One rendered vertex per source radar cell. Smooth normals and GPU triangle
// interpolation provide continuity without adding detail the source does not know.
const terrainColumns = RADAR_COLS - 1;
const terrainRows = RADAR_ROWS - 1;
const terrainWidthM = (RADAR_COLS - 1) * RADAR_SPACING_M;
const terrainDepthM = (RADAR_ROWS - 1) * RADAR_SPACING_M;
const terrainGeometry = new THREE.PlaneGeometry(terrainWidthM, terrainDepthM, terrainColumns, terrainRows);
const terrainPosition = terrainGeometry.attributes.position;
const updateTerrainGeometry = () => {
  for (let i = 0; i < terrainPosition.count; i++) {
    const eastM = terrainPosition.getX(i);
    const planeY = terrainPosition.getY(i);
    const gridX = eastM / RADAR_SPACING_M + (RADAR_COLS - 1) / 2;
    const gridY = -planeY / RADAR_SPACING_M + (RADAR_ROWS - 1) / 2;
    const worldNorthM = -planeY - 5200;
    const closestRunwayNorthM = THREE.MathUtils.clamp(worldNorthM, -3900, 700);
    const distanceFromAirportM = Math.hypot(eastM, worldNorthM - closestRunwayNorthM);
    const radarElevationM = boundedRadarHeightM(gridX, gridY);
    const radarBlend = THREE.MathUtils.smoothstep(distanceFromAirportM, 1800, 5000);
    terrainPosition.setZ(i, THREE.MathUtils.lerp(.02, radarElevationM, radarBlend));
  }
  terrainPosition.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  terrainGeometry.attributes.normal.needsUpdate = true;
  terrainGeometry.computeBoundingSphere();
};
updateTerrainGeometry();
const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({
  color: 0x64735a,
  roughness: 1,
  transparent: true,
  opacity: 0,
  clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -seaLevelLocalM - .25)]
}));
terrain.rotation.x = -Math.PI / 2;
terrain.position.set(0, -0.12, -5200);
scene.add(terrain);

const scenePointToCoordinates = (sceneEastM, sceneNorthM) => {
  const heading = THREE.MathUtils.degToRad(AIRPORT.runwayHeadingDeg);
  const forwardM = -sceneNorthM;
  const eastM = sceneEastM * Math.cos(heading) + forwardM * Math.sin(heading);
  const northM = -sceneEastM * Math.sin(heading) + forwardM * Math.cos(heading);
  return {
    lat: AIRPORT.lat + northM / 111320,
    lon: AIRPORT.lon + eastM / (111320 * Math.cos(THREE.MathUtils.degToRad(AIRPORT.lat)))
  };
};

terrainRadarService.update(AIRPORT.lat, AIRPORT.lon, 10, AIRPORT.runwayHeadingDeg);
let loadedTerrainCells = 0;
let terrainSnapshotCommitted = false;
let terrainFadeStartedAt = null;
let lastTerrainChangeAt = performance.now();
const terrainStatus = document.querySelector('[data-terrain-status]');
const terrainUpdateTimer = window.setInterval(() => {
  let loaded = 0;
  for (let row = 0; row < RADAR_ROWS; row++) {
    for (let column = 0; column < RADAR_COLS; column++) {
      const sceneEastM = (column - (RADAR_COLS - 1) / 2) * RADAR_SPACING_M;
      const sceneNorthM = (row - (RADAR_ROWS - 1) / 2) * RADAR_SPACING_M - 5200;
      const coordinates = scenePointToCoordinates(sceneEastM, sceneNorthM);
      const elevationFt = terrainRadarService.getTerrainHeight(coordinates.lat, coordinates.lon);
      if (Number.isFinite(elevationFt)) {
        loaded++;
        const relativeElevationFt = elevationFt - AIRPORT.elevationFt;
        if (radarHeights[row][column] !== relativeElevationFt) {
          radarHeights[row][column] = relativeElevationFt;
        }
      }
    }
  }
  if (loaded !== loadedTerrainCells) {
    loadedTerrainCells = loaded;
    lastTerrainChangeAt = performance.now();
    terrainStatus.textContent = `Terrain radar · ${loaded}/${RADAR_ROWS * RADAR_COLS} VHHH cells · 1.1 km grid`;
  }
  const snapshotStable = performance.now() - lastTerrainChangeAt >= 1600;
  const enoughCellsForSnapshot = loaded >= Math.ceil(RADAR_ROWS * RADAR_COLS * .55);
  if (!terrainSnapshotCommitted && enoughCellsForSnapshot && (snapshotStable || loaded === RADAR_ROWS * RADAR_COLS)) {
    updateTerrainGeometry();
    terrainSnapshotCommitted = true;
    terrainFadeStartedAt = performance.now();
    terrainStatus.textContent = `Terrain radar · frozen VHHH snapshot · ${loaded}/${RADAR_ROWS * RADAR_COLS} cells`;
    window.clearInterval(terrainUpdateTimer);
  }
}, 800);

let weather = 'clear', quality = 'balanced', running = true, start = performance.now();
const profiles = { balanced: { dpr: 1.25, buildings: true }, economy: { dpr: .8, buildings: false } };
const applyQuality = () => { const profile = profiles[quality]; renderer.setPixelRatio(Math.min(devicePixelRatio, profile.dpr)); buildings.visible = profile.buildings; resize(); document.querySelector('[data-quality]').textContent = quality === 'balanced' ? 'Balanced' : 'Economy'; };
const applyWeather = () => {
  const modes = { clear: [0x91aab2, 0xa7b4ad, .000105, 1.05, 2.5, 20000], haze: [0xaeb5af, 0xb8b9ad, .00027, .92, 1.7, 7000], dusk: [0x5f6d79, 0x7b776c, .00015, .68, 1.25, 14000] };
  const [sky, fog, density, exposure, sunlight, visibilityM] = modes[weather]; scene.background.setHex(sky); scene.fog.color.setHex(fog); scene.fog.density = density; renderer.toneMappingExposure = exposure; sun.intensity = sunlight; hemi.intensity = weather === 'dusk' ? 1.05 : 2; edgeMaterial.color.setHex(weather === 'dusk' ? 0xffffd0 : 0xf4f1d0); camera.far = visibilityM; camera.updateProjectionMatrix();
};
const resize = () => { const { clientWidth: width, clientHeight: height } = host; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
new ResizeObserver(resize).observe(host); applyQuality(); applyWeather();

document.querySelector('[data-action="replay"]').onclick = () => { start = performance.now(); running = true; };
document.querySelector('[data-quality]').onclick = () => { quality = quality === 'balanced' ? 'economy' : 'balanced'; applyQuality(); };
document.querySelectorAll('[data-weather]').forEach(button => button.onclick = () => { weather = button.dataset.weather; document.querySelectorAll('[data-weather]').forEach(item => item.classList.toggle('active', item === button)); applyWeather(); });

let frames = 0, fpsTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  if (terrainFadeStartedAt !== null && terrain.material.opacity < 1) {
    terrain.material.opacity = THREE.MathUtils.smoothstep(now - terrainFadeStartedAt, 0, 1400);
  }
  const duration = 42; const t = running ? Math.min(1, (now - start) / 1000 / duration) : 1; if (t >= 1) running = false;
  const smooth = t * t * (3 - 2 * t); const z = THREE.MathUtils.lerp(7600, -2350, smooth);
  const approachHeight = Math.max(4.1, z * Math.tan(THREE.MathUtils.degToRad(3)) + 4.1);
  const flare = THREE.MathUtils.smoothstep(t, .72, .84); const y = THREE.MathUtils.lerp(approachHeight, 4.1, flare);
  const lateral = (1 - t) * 42 * Math.sin(t * 8.2) + 4 * Math.sin(t * 21) * (1 - t);
  camera.position.set(lateral, y, z); camera.lookAt(lateral * .34, Math.max(3, y - 56), z - 1100); camera.rotateZ(THREE.MathUtils.degToRad(-Math.sin(t * 8.2) * 2.1 * (1 - t)));
  renderer.render(scene, camera);
  document.querySelector('[data-alt]').textContent = `${Math.max(0, Math.round((y - 4.1) * 3.28084))} FT`;
  document.querySelector('[data-dist]').textContent = `${Math.max(0, z / 1852).toFixed(1)} NM`;
  frames++; if (now - fpsTime > 700) { const fps = Math.round(frames * 1000 / (now - fpsTime)); document.querySelector('[data-perf]').textContent = `${fps} FPS · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`; frames = 0; fpsTime = now; }
}
requestAnimationFrame(animate);
