import { useEffect, useState } from 'react';
import './FpsCounter.css';

export default function FpsCounter() {
  const [fps, setFps] = useState(null);
  useEffect(() => {
    let frameId;
    let frames = 0;
    let startedAt;
    const measure = now => {
      if (startedAt === undefined) startedAt = now;
      else frames++;
      const elapsed = now - startedAt;
      if (elapsed >= 1000) {
        setFps(Math.round(frames * 1000 / elapsed));
        frames = 0;
        startedAt = now;
      }
      frameId = requestAnimationFrame(measure);
    };
    const resume = () => {
      cancelAnimationFrame(frameId);
      frames = 0;
      startedAt = undefined;
      setFps(null);
      if (!document.hidden) frameId = requestAnimationFrame(measure);
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return <div className="fps-counter" title="Browser frames per second" aria-label={`Frames per second: ${fps ?? 'measuring'}`}>
    <span>{fps ?? '—'}</span> FPS
  </div>;
}
