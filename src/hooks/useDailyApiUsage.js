import { useEffect, useState } from 'react';
import { getDailyApiCreditUsage, subscribeApiUsage } from '../services/environmentApiClient.js';

export function useDailyApiUsage(enabled, userId) {
  const [state, setState] = useState({ userId: null, plan: null });
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let active = true;
    let running = false;
    let timer;
    const load = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const response = await getDailyApiCreditUsage();
        if (active) setState({ userId, plan: response.status === 'ok' ? response.dailyPlan : null });
      } catch {
        if (active) setState({ userId, plan: null });
      } finally { running = false; }
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 1500);
    };
    load();
    const unsubscribe = subscribeApiUsage(schedule);
    const poll = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load);
    return () => { active = false; unsubscribe(); clearTimeout(timer); clearInterval(poll); document.removeEventListener('visibilitychange', load); };
  }, [enabled, userId]);
  return enabled && userId && state.userId === userId ? state.plan : null;
}
