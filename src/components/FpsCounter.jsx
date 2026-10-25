import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getOnlineMode, subscribeOnlineMode } from '../utils/appNetworkMode.js';
import { formatDailyApiUsage } from '../utils/dailyApiUsage.js';
import { useDailyApiUsage } from '../hooks/useDailyApiUsage.js';
import './FpsCounter.css';

export default function FpsCounter() {
  const [fps, setFps] = useState(null);
  const { user } = useAuth();
  const online = useSyncExternalStore(subscribeOnlineMode, getOnlineMode, () => false);
  const dailyPlan = useDailyApiUsage(online, user?.id);
  const daily = formatDailyApiUsage(dailyPlan);
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

  return <div className="fps-counter" title={online ? daily.title : 'Browser frames per second'} aria-label={`Frames per second: ${fps ?? 'measuring'}${online ? `; ${daily.title}` : ''}`}>
    <span>{fps ?? '—'}</span> FPS
    {online && <span className={`fps-daily-usage${daily.exhausted ? ' is-exhausted' : ''}`}> · {daily.label}</span>}
  </div>;
}
