import * as THREE from 'three';
import { airportService } from './airportService.js';
import { getVisualRunwayGeometry, getSourcedRunwayNames } from '../data/visualRunwayCoordinates.js';

const DEG = Math.PI / 180;

// Lightweight land/runway coverage remains available without elevation API data.
export function createNearbyAirportScenery(scene, reference, service = airportService) {
  const airports = new Map();
  let revision = 0;
  const material = new THREE.MeshStandardMaterial({ color: 0x65745a, roughness: 1 });
  const pavement = new THREE.MeshStandardMaterial({ color: 0x454947, roughness: 0.9 });
  const project = (latitude, longitude) => {
    const north = (latitude - reference.thresholdStart.latitude) * 111320;
    const east = (longitude - reference.thresholdStart.longitude) * 111320 * Math.cos(reference.thresholdStart.latitude * DEG);
    const angle = reference.heading * DEG;
    return { x: east * Math.cos(angle) - north * Math.sin(angle), z: -(east * Math.sin(angle) + north * Math.cos(angle)) };
  };
  const remove = (entry) => {
    scene.remove(entry.group);
    entry.group.traverse(object => object.geometry?.dispose());
  };
  const api = {
    get revision() { return revision; },
    get count() { return airports.size; },
    update(latitude, longitude) {
      const nearby = service.getAirportsWithinRadius(latitude, longitude, 25);
      const desired = new Set();
      for (const airport of nearby) {
        const code = airport.icao || airport.iata;
        if (!code || !Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) continue;
        desired.add(code);
        if (airports.has(code)) continue;
        const sourcedNames = getSourcedRunwayNames(code);
        const names = sourcedNames.length ? sourcedNames : airport.runways?.map(runway => runway.name) || [airport.runway];
        const runways = names.filter(Boolean).map(name => {
          const end = String(name).split(/[/-]/)[0];
          return getVisualRunwayGeometry(code, end, service.getRunwayGeometry(code, end));
        }).filter(runway => runway?.thresholdStart && Number.isFinite(runway.heading));
        if (!runways.length) continue;
        const group = new THREE.Group();
        for (const runway of runways) {
          const strip = new THREE.Group();
          const origin = project(runway.thresholdStart.latitude, runway.thresholdStart.longitude);
          const elevation = (Number(runway.thresholdStart.elevation) || 0) * 0.3048;
          strip.position.set(origin.x, elevation - (reference.thresholdStart.elevation || 0) * 0.3048, origin.z);
          strip.rotation.y = -(runway.heading - reference.heading) * DEG;
          const length = Math.max(300, runway.length || 2500);
          const width = Math.max(20, runway.width || 45);
          const land = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1000, width + 600), length + 1000), material);
          land.rotation.x = -Math.PI / 2;
          land.position.set(0, -0.1, -length / 2);
          const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, length), pavement);
          surface.rotation.x = -Math.PI / 2;
          surface.position.set(0, 0.04, -length / 2);
          strip.add(land, surface);
          group.add(strip);
        }
        scene.add(group);
        airports.set(code, { group, runways });
        revision++;
      }
      for (const [code, entry] of airports) {
        if (!desired.has(code)) { remove(entry); airports.delete(code); revision++; }
      }
    },
    position(offsetX, offsetZ, activeCode, detailedAirportVisible) {
      for (const [code, entry] of airports) {
        entry.group.position.set(-offsetX, 0, -offsetZ);
        entry.group.visible = !detailedAirportVisible || ![code, ...entry.runways.map(runway => runway.airportCode)].includes(activeCode);
      }
    },
    terrainHeight(latitude, longitude, fallback) {
      for (const entry of airports.values()) {
        for (const runway of entry.runways) {
          const north = (latitude - runway.thresholdStart.latitude) * 111320;
          const east = (longitude - runway.thresholdStart.longitude) * 111320 * Math.cos(latitude * DEG);
          const angle = runway.heading * DEG;
          const along = north * Math.cos(angle) + east * Math.sin(angle);
          const across = Math.abs(east * Math.cos(angle) - north * Math.sin(angle));
          if (along >= -1500 && along <= runway.length + 1500 && across < 1500) {
            const elevation = (Number(runway.thresholdStart.elevation) || 0) * 0.3048 - (reference.thresholdStart.elevation || 0) * 0.3048;
            const distance = Math.max(across, -along, along - runway.length);
            const blend = THREE.MathUtils.smoothstep(distance, 600, 1500);
            return THREE.MathUtils.lerp(elevation - 0.2, fallback, blend);
          }
        }
      }
      return fallback;
    },
    dispose() {
      airports.forEach(remove);
      airports.clear();
      material.dispose(); pavement.dispose();
    }
  };
  return api;
}
