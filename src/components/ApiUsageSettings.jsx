import { useEffect, useState, useSyncExternalStore } from 'react';
import { getOnlineMode, subscribeOnlineMode } from '../utils/appNetworkMode.js';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getApiUsageSummary, subscribeApiUsage } from '../services/environmentApiClient.js';

const providerName = value => ({ open_elevation: 'Open-Elevation', open_topo_data: 'OpenTopoData',
  open_meteo: 'Open-Meteo', supabase_aip: 'Cloud AIP' }[value] || value);
const tokenAmount = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';

export default function ApiUsageSettings() {
  const { user } = useAuth();
  const online = useSyncExternalStore(subscribeOnlineMode, getOnlineMode, () => false);
  const { tx } = useLanguage();
  const [state, setState] = useState({ userId: null, data: null, error: '', loading: false });
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    let running = false;
    let timer;
    const load = async () => {
      if (!online || !user?.id || running || document.hidden) return;
      running = true;
      setState(previous => ({ ...previous, userId: user.id,
        data: previous.userId === user.id ? previous.data : null, error: '', loading: true }));
      try {
        const data = await getApiUsageSummary();
        if (active) setState({ userId: user.id, data: data.status === 'ok' ? data : null,
          error: data.status === 'ok' ? '' : 'API usage is unavailable.', loading: false });
      } catch {
        if (active) setState({ userId: user.id, data: null, error: 'API usage is unavailable. The server may need the API credits update.', loading: false });
      } finally { running = false; }
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 1500);
    };
    const unsubscribe = subscribeApiUsage(schedule);
    load();
    const poll = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load);
    return () => { active = false; unsubscribe(); clearTimeout(timer); clearInterval(poll); document.removeEventListener('visibilitychange', load); };
  }, [online, user?.id, refreshKey]);
  const data = online && user?.id === state.userId ? state.data : null;
  return <section className="settings-section api-usage-settings">
    <h4>{tx('Credits & API usage')}</h4>
    <p>{tx('Each signed-in API call records 1 credit. A terrain batch of up to 20 coordinates counts as one call. Cached results are free. Dispatched attempts still count if they fail or are cancelled. Guest weather is free at a fixed low rate and coarse resolution. Per-user limits and shared provider budgets apply.')}</p>
    <p>{tx('Default plan: up to ${limit} credits per UTC day across all metered APIs. At the daily limit, new credit-consuming calls stop until 00:00 UTC. Cached data stays available; provider limits may stop live requests sooner.', { limit: data?.dailyPlan?.limit ?? 2000 })}</p>
    <p className="api-credit-notice">{tx('Tokens are not deducted now. The first ${free} metered calls per UTC day are free but recorded. Additional calls record ${rate} token each for later payment. Cached data and guest weather are free.', { free: data?.dailyPlan?.freeLimit ?? 50, rate: data?.dailyPlan?.tokensPerBillableCredit ?? 0.2 })}</p>
    {!user ? <p>{tx('Sign in to view recorded API credits and your token balance. Terrain, route and cloud AIP APIs require login. Online guests can use free coarse weather; offline mode uses simulated weather. A token balance is not required while settlement is deferred.')}</p>
      : !online ? <p>{tx('Enable online mode to load your API usage. Offline mode uses imported packs and built-in data without API calls.')}</p> : <>
      <button type="button" disabled={state.loading} onClick={() => setRefreshKey(value => value + 1)}>{tx('Refresh usage')}</button>
      {state.loading && <p role="status">{tx('Loading usage…')}</p>}
      {state.error && state.userId === user.id && <p role="alert">{tx(state.error)}</p>}
      {data && <>
        <dl className="api-usage-totals">
          <dt>{tx('Token balance')}</dt><dd>{data.tokenBalance}</dd>
          <dt>{tx('Recorded credits')}</dt><dd>{data.totalCredits}</dd>
          <dt>{tx('Tokens per additional call')}</dt><dd>{data.dailyPlan?.tokensPerBillableCredit ?? 0.2}</dd>
          <dt>{tx('Recorded charges for later payment')}</dt><dd>{tokenAmount(data.recordedTokensDue)}</dd>
          <dt>{tx('Today (UTC)')}</dt><dd>{tx('${calls} API calls · ${credits} credits', data.today)}</dd>
          {data.dailyPlan && <>
            <dt>{tx('Daily credit allowance')}</dt><dd>{data.dailyPlan.used} / {data.dailyPlan.limit}</dd>
            <dt>{tx('Daily credits remaining')}</dt><dd>{data.dailyPlan.remaining}</dd>
            <dt>{tx('Free calls remaining today')}</dt><dd>{data.dailyPlan.freeRemaining ?? '—'}</dd>
            <dt>{tx('Charges recorded today')}</dt><dd>{tokenAmount(data.dailyPlan.recordedTokenCharge)} {tx('Tokens')}</dd>
            <dt>{tx('Daily allowance resets')}</dt><dd><time dateTime={data.dailyPlan.resetsAt}>{new Date(data.dailyPlan.resetsAt).toLocaleString()}</time></dd>
          </>}
          <dt>{tx('This month (UTC)')}</dt><dd>{tx('${calls} API calls · ${credits} credits', data.month)}</dd>
        </dl>
        {data.dailyPlan?.remaining === 0 && <p role="status">{tx('Daily credit limit reached. New live API calls resume after the UTC reset; cached data remains free.')}</p>}
        {data.month.tokens > 0 && <p>{tx('Historical token charges this month: ${tokens}. Recorded credits do not include these previous payments.', { tokens: data.month.tokens })}</p>}
        <div className="api-usage-table"><table>
          <caption>{tx('Usage by provider this month')}</caption>
          <thead><tr><th>{tx('Provider')}</th><th>{tx('API calls')}</th><th>{tx('Credits')}</th><th>{tx('Tokens recorded')}</th></tr></thead>
          <tbody>{(data.providers || []).map(row => <tr key={row.provider}><td>{providerName(row.provider)}</td><td>{row.calls}</td><td>{row.credits}</td><td>{tokenAmount(row.recordedTokenCharge)}</td></tr>)}</tbody>
        </table></div>
        <details><summary>{tx('Recent API calls')}</summary>
          {(data.recent || []).length === 0 ? <p>{tx('No API usage yet.')}</p> : <ol className="api-usage-recent">
            {data.recent.map((row, index) => <li key={`${row.created_at}-${index}`}>
              <strong>{providerName(row.provider)}</strong> · {row.operation}<br />
              <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time><br />
              {tx('${credits} credits', { credits: row.credits_consumed })} · {row.status}
              {row.recorded_tokens > 0 && <> · {tx('${tokens} tokens recorded', { tokens: row.recorded_tokens })}</>}
              {row.free_credits > 0 && <> · {tx('Free call')}</>}
              {row.charged_tokens > 0 && <> · {tx('${tokens} tokens', { tokens: row.charged_tokens })}</>}
            </li>)}
          </ol>}
        </details>
      </>}
    </>}
  </section>;
}
