import * as THREE from 'three';
import { createAirportBuildings } from './outsideAirportVisuals.js';
import { createProceduralGround, distanceToPath, pointInArea } from '../utils/airportGroundLayout.js';
import { projectGroundPoint } from '../utils/airportGroundCoordinates.js';

const KINDS = ['land', 'apron', 'taxiway', 'roads'];
const COLORS = { land: 0x718064, apron: 0x92958b, taxiway: 0x535954, roads: 0x62665e };
const distanceToBox = (point, box) => Math.hypot(Math.max(box.minX - point.x, 0, point.x - box.maxX), Math.max(box.minZ - point.z, 0, point.z - box.maxZ));

function makeMaterial(kind) {
  const material = new THREE.MeshLambertMaterial({ color: COLORS[kind] });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec2 vSurfacePosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfacePosition = position.xz;');
    const details = kind === 'apron'
      ? 'vec2 slab = abs(fract(vSurfacePosition / 6.0) - 0.5); float joint = max(smoothstep(0.485 - fwidth(slab.x), 0.5, slab.x), smoothstep(0.485 - fwidth(slab.y), 0.5, slab.y)); diffuseColor.rgb *= 1.0 - joint * 0.11;'
      : kind === 'land'
        ? 'diffuseColor.rgb *= 0.97 + 0.045 * sin(vSurfacePosition.x * 0.008 + sin(vSurfacePosition.y * 0.006)) + 0.015 * sin(vSurfacePosition.y * 0.18);'
        : 'diffuseColor.rgb *= 0.97 + 0.025 * sin(vSurfacePosition.x * 0.09) * sin(vSurfacePosition.y * 0.065);';
    shader.fragmentShader = `varying vec2 vSurfacePosition;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>\n${details}`);
  };
  material.customProgramCacheKey = () => `airport-ground-${kind}`;
  return material;
}

function maskTerrain(material, root, layout) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
  const context = canvas.getContext('2d');
  const { minX, minZ, maxX, maxZ } = layout.bounds;
  const width = Math.max(1, maxX - minX); const height = Math.max(1, maxZ - minZ);
  context.setTransform(1024 / width, 0, 0, -1024 / height, -minX * 1024 / width, 1024 + minZ * 1024 / height);
  context.fillStyle = '#fff';
  for (const rings of layout.operatingArea) {
    context.beginPath();
    for (const ring of rings) { ring.forEach(([x, z], i) => i ? context.lineTo(x, z) : context.moveTo(x, z)); context.closePath(); }
    context.fill('evenodd');
  }
  const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.airportMask = { value: texture };
    shader.uniforms.airportInverse = { value: inverse };
    shader.uniforms.airportBounds = { value: new THREE.Vector4(minX, minZ, width, height) };
    shader.vertexShader = `uniform mat4 airportInverse; uniform vec4 airportBounds; varying vec2 vAirportUv;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAirportUv = ((airportInverse * modelMatrix * vec4(position, 1.0)).xz - airportBounds.xy) / airportBounds.zw;');
    shader.fragmentShader = `uniform sampler2D airportMask; varying vec2 vAirportUv;\n${shader.fragmentShader}`
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (all(greaterThanEqual(vAirportUv, vec2(0.0))) && all(lessThanEqual(vAirportUv, vec2(1.0))) && texture2D(airportMask, vAirportUv).r > 0.5) discard;');
  };
  material.customProgramCacheKey = () => 'airport-terrain-mask-v1'; material.needsUpdate = true;
  return texture;
}

export function createAirportGround(parent, geometry, runways, groundPackage, terrainMaterial) {
  const origin = groundPackage?.origin || {
    latitude: geometry.airportLat ?? geometry.thresholdStart.latitude,
    longitude: geometry.airportLon ?? geometry.thresholdStart.longitude
  };
  const layout = groundPackage || createProceduralGround(geometry.airportCode, runways, origin);
  const root = new THREE.Group();
  const heading = geometry.heading * Math.PI / 180;
  const offset = projectGroundPoint(origin.latitude, origin.longitude, geometry.thresholdStart);
  const east = offset[0] + (layout.visualAlignment?.x || 0);
  const south = offset[1] + (layout.visualAlignment?.z || 0);
  root.position.set(east * Math.cos(heading) + south * Math.sin(heading), 0, -east * Math.sin(heading) + south * Math.cos(heading));
  root.rotation.y = heading;
  parent.add(root);
  const mask = maskTerrain(terrainMaterial, root, layout);
  const buildings = createAirportBuildings(root, 0, 0, [], layout.buildings);
  const materials = Object.fromEntries(KINDS.map((kind) => [kind, makeMaterial(kind)]));
  const markMaterial = new THREE.MeshBasicMaterial({ color: 0xd9b851, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lightsMaterial = new THREE.PointsMaterial({ color: 0x3378e7, size: 2.5, sizeAttenuation: false, transparent: true,
    opacity: .8, depthWrite: false, toneMapped: false });
  let batches = []; let selectionKey = ''; let surfaceKey = ''; let surfacePositions = []; let lastUpdate = -Infinity; let detailMesh; let lightMesh;
  const retainedChunks = new Map();
  const localEye = new THREE.Vector3();
  const clearBatches = () => {
    batches.forEach((mesh) => { root.remove(mesh); mesh.geometry.dispose(); }); batches = [];
  };
  const clearDetails = () => {
    for (const mesh of [detailMesh, lightMesh]) if (mesh) { root.remove(mesh); mesh.geometry.dispose(); }
    detailMesh = null; lightMesh = null;
  };
  const buildDetails = (eye, economy) => {
    const vertices = []; const lamps = [];
    const detailRange = economy ? 1400 : 2800;
    for (const taxiway of layout.taxiways) {
      for (let i = 1; i < taxiway.path.length; i++) {
        const a = taxiway.path[i - 1]; const b = taxiway.path[i];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (Math.hypot(mid[0] - eye.x, mid[1] - eye.z) > detailRange) continue;
        if (layout.runways.some((strip) => distanceToPath(mid, strip.path) < strip.width / 2 + 2)) continue;
        if (!pointInArea(mid, layout.operatingArea)) continue;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / length; const nz = (b[0] - a[0]) / length;
        const half = .22;
        const points = [[a[0] + nx * half, a[1] + nz * half], [a[0] - nx * half, a[1] - nz * half], [b[0] + nx * half, b[1] + nz * half], [b[0] - nx * half, b[1] - nz * half]];
        [0, 2, 1, 1, 2, 3].forEach((j) => vertices.push(points[j][0], .015, points[j][1]));
        const count = Math.floor(length / (economy ? 100 : 60));
        for (let step = 0; step < count && lamps.length < 1800; step++) {
          const t = (step + .5) / Math.max(1, count);
          for (const side of [-1, 1]) lamps.push(a[0] + t * (b[0] - a[0]) + nx * taxiway.width / 2 * side, .6,
            a[1] + t * (b[1] - a[1]) + nz * taxiway.width / 2 * side);
        }
      }
    }
    const markGeometry = new THREE.BufferGeometry(); markGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    detailMesh = new THREE.Mesh(markGeometry, markMaterial); root.add(detailMesh);
    const lampGeometry = new THREE.BufferGeometry(); lampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
    lightMesh = new THREE.Points(lampGeometry, lightsMaterial); root.add(lightMesh);
  };

  return {
    layout,
    distanceFromFootprint(x, z) {
      const point = root.worldToLocal(new THREE.Vector3(x, 0, z));
      const pair = [point.x, point.z];
      if (pointInArea(pair, layout.operatingArea)) return 0;
      return Math.min(...layout.operatingArea.map(([ring]) => distanceToPath(pair, ring)));
    },
    update(camera, visibilityM, daylight, economy, enroute, now) {
      buildings.update(economy, daylight);
      lightsMaterial.opacity = .8 * (1 - daylight);
      if (lightMesh) lightMesh.visible = daylight < .6;
      if (enroute) { if (selectionKey) { clearBatches(); clearDetails(); retainedChunks.clear(); selectionKey = ''; surfaceKey = ''; surfacePositions = []; } return; }
      if (now - lastUpdate < 1200) return;
      lastUpdate = now;
      root.worldToLocal(localEye.copy(camera.position));
      const chosen = KINDS.map((kind) => layout.meshes[kind].chunks.map((chunk, index) => ({ chunk, index }))
        .filter(({ chunk, index }) => {
          const key = `${kind}:${index}`; const distance = distanceToBox(localEye, chunk);
          if (distance < visibilityM + 1200) { retainedChunks.set(key, now + 5000); return true; }
          if (distance < visibilityM + 2200 && (retainedChunks.get(key) || 0) > now) return true;
          retainedChunks.delete(key); return false;
        }));
      // Merge selected chunks by surface: at most four pavement/land draws.
      const key = `${economy}:${Math.floor(localEye.x / 500)}:${Math.floor(localEye.z / 500)}:${chosen.map((items) => items.map(({ index }) => index).join(',')).join('|')}`;
      const nextSurfaceKey = `${economy}:${chosen.map((items) => items.map(({ index }) => index).join(',')).join('|')}`;
      // Chunk numbers alone do not identify source data. Compare selected coordinates
      // too, so replacement/refined data cannot be hidden by an unchanged selection.
      const sameSurfaces = nextSurfaceKey === surfaceKey && chosen.every((items, kindIndex) => {
        const source = layout.meshes[KINDS[kindIndex]];
        const previous = surfacePositions[kindIndex];
        let offset = 0;
        for (const { chunk } of items) {
          for (const index of chunk.indices) {
            if (!Object.is(previous?.[offset], source.positions[index * 2])
                || !Object.is(previous?.[offset + 2], source.positions[index * 2 + 1])) return false;
            offset += 3;
          }
        }
        return previous?.length === offset;
      });
      if (key === selectionKey && sameSurfaces) return;
      selectionKey = key;
      clearDetails();
      if (!sameSurfaces) {
        surfaceKey = nextSurfaceKey;
        clearBatches();
        surfacePositions = [];
        KINDS.forEach((kind, kindIndex) => {
          const source = layout.meshes[kind]; const positions = [];
          chosen[kindIndex].forEach(({ chunk }) => chunk.indices.forEach((index) => positions.push(source.positions[index * 2], kind === 'land' ? -.12 : -.025, source.positions[index * 2 + 1])));
          surfacePositions[kindIndex] = positions;
          if (!positions.length) return;
          const meshGeometry = new THREE.BufferGeometry(); meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); meshGeometry.computeVertexNormals();
          const mesh = new THREE.Mesh(meshGeometry, materials[kind]); root.add(mesh); batches.push(mesh);
        });
      }
      buildDetails(localEye, economy);
    },
    dispose() {
      clearBatches(); clearDetails(); mask.dispose();
      Object.values(materials).forEach((material) => material.dispose()); markMaterial.dispose(); lightsMaterial.dispose();
      // Building resources remain in the scene and are disposed by its owner.
    }
  };
}
