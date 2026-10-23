import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import './CockpitSmoke.css';

// A small, tileable multi-scale noise field gives the haze depth without
// particle geometry, per-instrument filters, or another WebGL context.
function smokeTexture() {
  const tile = document.createElement('canvas'); tile.width = tile.height = 128;
  const context = tile.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(128, 128);
  let seed = 317;
  const grids = [4, 8, 16, 32].map(size => ({ size, values: Array.from({ length: size * size }, () => {
    seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296;
  }) }));
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    let noise = 0; let weight = .55;
    for (const { size, values } of grids) {
      const gx = x / 128 * size; const gy = y / 128 * size;
      const ix = Math.floor(gx); const iy = Math.floor(gy);
      const smooth = value => value * value * (3 - 2 * value);
      const fx = smooth(gx - ix); const fy = smooth(gy - iy);
      const at = (a, b) => values[(b % size) * size + a % size];
      const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
      const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
      noise += (top * (1 - fy) + bottom * fy) * weight; weight *= .5;
    }
    const index = (y * 128 + x) * 4;
    pixels.data[index] = 156; pixels.data[index + 1] = 166; pixels.data[index + 2] = 168;
    pixels.data[index + 3] = Math.round(Math.max(0, noise - .12) * 210);
  }
  context.putImageData(pixels, 0, 0);
  return tile;
}

export default function CockpitSmoke({ density = 0 }) {
  const canvasRef = useRef(null);
  const densityRef = useRef(density); densityRef.current = density;
  const active = density > .001;
  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return undefined;
    const texture = smokeTexture();
    if (!texture) return undefined;
    const resize = () => {
      canvas.width = Math.min(256, Math.max(80, Math.round(window.innerWidth / 6)));
      canvas.height = Math.max(45, Math.round(canvas.width * window.innerHeight / Math.max(1, window.innerWidth)));
    };
    resize(); window.addEventListener('resize', resize);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0; let previous = -Infinity; let disposed = false;
    const draw = now => {
      if (disposed || document.hidden) return;
      frame = requestAnimationFrame(draw);
      if (now - previous < (reducedMotion ? 250 : 1000 / 12)) return;
      previous = now;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const time = reducedMotion ? 0 : now / 1000;
      for (let layer = 0; layer < 3; layer++) {
        const size = 85 + layer * 43;
        const dx = (time * (1.3 + layer * .5) + layer * 31) % size;
        const dy = (time * (1 + layer * .4) + layer * 47) % size;
        context.globalAlpha = Math.min(1, Math.sqrt(Math.max(0, densityRef.current)) * 1.6);
        for (let y = -size; y < canvas.height + size; y += size) {
          for (let x = -size; x < canvas.width + size; x += size) context.drawImage(texture, x + dx, y - dy, size, size);
        }
      }
    };
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) frame = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', visibility);
    if (!document.hidden) frame = requestAnimationFrame(draw);
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
    };
  }, [active]);
  if (!active) return null;
  return createPortal(<canvas ref={canvasRef} className="cockpit-smoke" aria-hidden="true"
    style={{ backdropFilter: density > .2 ? `blur(${Math.min(1.4, density * 1.4).toFixed(2)}px)` : 'none' }} />, document.body);
}
CockpitSmoke.propTypes = { density: PropTypes.number };
