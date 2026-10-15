// Representative visual aids when an airport has no detailed lighting survey.
// Coordinates use runway-local metres: threshold at zero, runway along -Z.
export function runwayLightLayout(length, width) {
  const lights = [];
  const add = (x, z, color, directional = false, size = 1) => lights.push({ x, y: .8, z, color, directional, size });
  for (let z = 0; z >= -length; z -= 60) {
    for (const x of [-width / 2 - 1, width / 2 + 1]) add(x, z, z < -length + 600 ? 0xffd45a : 0xfff2dc);
  }
  for (let x = -width / 2; x <= width / 2; x += 3) {
    add(x, 0, 0x40ff80, true);
    add(x, -length, 0xff3830);
  }
  for (let z = -30; z > -length; z -= 30) add(0, z, z < -length + 300 ? 0xff3830 : 0xfff2dc, false, .75);
  for (let z = 30; z <= 900; z += 30) {
    for (const x of [-1.5, 0, 1.5]) add(x, z, 0xfff2dc, true);
  }
  for (const z of [150, 300]) for (let x = -15; x <= 15; x += 3) add(x, z, 0xfff2dc, true);
  const papi = [];
  for (let i = 0; i < 4; i++) {
    papi.push(lights.length);
    add(-width / 2 - 16 - i * 9, -300, 0xffffff, true, 1.5);
  }
  return { lights, papi };
}

export function papiColors(eye, width, glideAngle = 3) {
  const dx = eye.x + width / 2 + 29.5;
  const dz = eye.z + 300;
  if (eye.z <= 0 || Math.abs(Math.atan2(dx, dz) * 180 / Math.PI) > 10) return [0, 0, 0, 0];
  const angle = Math.atan2(eye.y - .8, Math.hypot(dx, dz)) * 180 / Math.PI;
  return [-.5, -1 / 6, 1 / 6, .5].map((offset) => angle >= glideAngle + offset ? 0xfff5e6 : 0xff3020);
}

export function airportBuildingLayout(length, width, otherStrips = []) {
  const strips = [{ x: 0, z: 0, heading: 0, length, width }, ...otherStrips];
  const buildings = [];
  for (let i = 0; i < 36; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (310 + (Math.floor(i / 2) % 3) * 235);
    const z = -320 - Math.floor(i / 6) * Math.max(180, (length - 700) / 6);
    const w = i % 6 === 0 ? 160 : 65 + (i % 3) * 22;
    const d = i % 6 === 0 ? 65 : 45 + (i % 4) * 12;
    const radius = Math.hypot(w, d) / 2 + 85;
    const blocked = strips.some((strip) => {
      const angle = strip.heading * Math.PI / 180;
      const dx = x - strip.x; const dz = z - strip.z;
      const localX = dx * Math.cos(angle) + dz * Math.sin(angle);
      const localZ = -dx * Math.sin(angle) + dz * Math.cos(angle);
      return Math.abs(localX) < strip.width / 2 + radius
        && localZ < 1000 + radius && localZ > -strip.length - 200 - radius;
    });
    if (!blocked) buildings.push({ x, z, width: w, depth: d, height: 10 + (i % 5) * 4, detailed: i % 3 !== 0 });
  }
  return buildings;
}
