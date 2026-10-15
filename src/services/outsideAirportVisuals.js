import * as THREE from 'three';
import { airportBuildingLayout, papiColors, runwayLightLayout } from '../utils/outsideAirportScenery.js';
import { pointInArea, triangulateGround } from '../utils/airportGroundLayout.js';

export function createRunwayLighting(parent, length, width) {
  const { lights, papi } = runwayLightLayout(length, width);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lights.flatMap(({ x, y, z }) => [x, y, z]), 3));
  const color = new THREE.Color();
  const colors = new THREE.Float32BufferAttribute(lights.flatMap((light) => color.setHex(light.color).toArray()), 3);
  geometry.setAttribute('color', colors);
  geometry.setAttribute('lampSize', new THREE.Float32BufferAttribute(lights.map((light) => light.size), 1));
  geometry.setAttribute('directional', new THREE.Float32BufferAttribute(lights.map((light) => Number(light.directional)), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { visibility: { value: 20000 }, brightness: { value: 1 }, pixelRatio: { value: 1 }, forwardVisible: { value: 1 } },
    vertexShader: `
      attribute vec3 color;
      attribute float lampSize;
      attribute float directional;
      uniform float pixelRatio;
      uniform float forwardVisible;
      varying vec3 lampColor;
      varying float distanceM;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        distanceM = length(mvPosition.xyz);
        lampColor = color * mix(1.0, forwardVisible, directional);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp((2.5 + 12.0 / max(distanceM / 100.0, 1.0)) * lampSize, 2.5, 10.0) * pixelRatio;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform float visibility;
      uniform float brightness;
      varying vec3 lampColor;
      varying float distanceM;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius > 1.0 || distanceM > visibility) discard;
        float glow = exp(-radius * radius * 5.0) * (1.0 - smoothstep(0.7, 1.0, radius));
        float transmission = exp(-2.0 * distanceM / visibility);
        gl_FragColor = vec4(lampColor * brightness, glow * transmission);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 5;
  parent.add(points);
  const eye = new THREE.Vector3();
  return {
    update(camera, visibilityM, daylight, pixelRatio) {
      parent.worldToLocal(eye.copy(camera.position));
      material.uniforms.visibility.value = visibilityM;
      material.uniforms.brightness.value = 1.4 - daylight * 1.1;
      material.uniforms.pixelRatio.value = pixelRatio;
      material.uniforms.forwardVisible.value = eye.z > 0 ? 1 : 0;
      const indications = papiColors(eye, width);
      papi.forEach((index, i) => { color.setHex(indications[i]); colors.setXYZ(index, color.r, color.g, color.b); });
      colors.needsUpdate = true;
    }
  };
}

export function createAirportBuildings(parent, length, width, otherStrips, groundBuildings) {
  const buildings = groundBuildings || airportBuildingLayout(length, width, otherStrips);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d');
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = 256; nightCanvas.height = 128;
  const nightContext = nightCanvas.getContext('2d');
  nightContext.fillStyle = '#000'; nightContext.fillRect(0, 0, 256, 128);
  context.fillStyle = '#606b70'; context.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 12; column++) {
    context.fillStyle = (row + column) % 4 ? '#a8c1c6' : '#3b4c56';
    context.fillRect(column * 21 + 3, row * 30 + 8, 13, 12);
    if ((row + column) % 4) {
      nightContext.fillStyle = '#ffd7a0'; nightContext.fillRect(column * 21 + 3, row * 30 + 8, 13, 12);
    }
    context.fillStyle = '#838d90'; context.fillRect(column * 21, 0, 2, 128);
  }
  const facade = new THREE.CanvasTexture(canvas); facade.colorSpace = THREE.SRGBColorSpace;
  const nightWindows = new THREE.CanvasTexture(nightCanvas); nightWindows.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [facade, nightWindows]) { texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; }
  const wall = new THREE.MeshStandardMaterial({ map: facade, emissiveMap: nightWindows, emissive: 0xffffff, emissiveIntensity: 0, roughness: .85 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x9b9b91, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Shared geometry and materials keep building batches inexpensive.
  const materials = [wall, wall, roof, roof, wall, wall];
  const primary = buildings.filter((item) => !item.detailed);
  const secondary = buildings.filter((item) => item.detailed);
  const makeBatch = (items) => {
    if (items.some((item) => item.footprint)) {
      const walls = []; const uv = []; const roofs = [];
      for (const item of items) {
        if (!item.footprint) continue;
        const top = triangulateGround(item.footprint);
        top.indices.forEach((index) => roofs.push(top.positions[index * 2], item.height, top.positions[index * 2 + 1]));
        for (const rings of item.footprint) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
          const [x, z] = ring[i - 1]; const [nextX, nextZ] = ring[i];
          const span = Math.hypot(nextX - x, nextZ - z) / 70; const levels = item.height / 14;
          walls.push(x, 0, z, nextX, 0, nextZ, x, item.height, z, x, item.height, z, nextX, 0, nextZ, nextX, item.height, nextZ);
          uv.push(0, 0, span, 0, 0, levels, 0, levels, span, 0, span, levels);
        }
      }
      const group = new THREE.Group();
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
      wallGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wallGeometry.computeVertexNormals();
      const roofGeometry = new THREE.BufferGeometry(); roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roofs, 3)); roofGeometry.computeVertexNormals();
      wall.side = THREE.DoubleSide; roof.side = THREE.DoubleSide;
      group.add(new THREE.Mesh(wallGeometry, wall), new THREE.Mesh(roofGeometry, roof));
      parent.add(group); return group;
    }
    const mesh = new THREE.InstancedMesh(box, materials, items.length);
    const matrix = new THREE.Matrix4(); const rotation = new THREE.Quaternion();
    items.forEach((item, index) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.heading || 0);
      matrix.compose(new THREE.Vector3(item.x, item.height / 2, item.z), rotation,
        new THREE.Vector3(item.width, item.height, item.depth));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.computeBoundingSphere(); parent.add(mesh); return mesh;
  };
  makeBatch(primary);
  const detail = makeBatch(secondary);
  const roofBuildings = buildings.filter((item) => !item.footprint || pointInArea([item.x, item.z], item.footprint));
  const rooftop = new THREE.InstancedMesh(box, roof, roofBuildings.length);
  const matrix = new THREE.Matrix4();
  roofBuildings.forEach((item, index) => {
    matrix.compose(new THREE.Vector3(item.x, item.height + 1, item.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.heading || 0),
      new THREE.Vector3(item.width * .22, 2, item.depth * .3));
    rooftop.setMatrixAt(index, matrix);
  });
  rooftop.computeBoundingSphere(); parent.add(rooftop);
  return {
    update(economy, daylight) {
      detail.visible = !economy;
      rooftop.visible = !economy;
      wall.emissiveIntensity = (1 - daylight) * .5;
    }
  };
}
