import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { importAipPack } from '../services/aipPackImport.js';
import { listAipPacks, removeAipPack } from '../services/aipPackStorage.js';

export default function AipPackSettings() {
  const { tx } = useLanguage();
  const downloadUrl = import.meta.env.VITE_AIP_PACK_DOWNLOAD_URL?.trim();
  const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    listAipPacks().then(value => { if (!cancelled) setPacks(value); })
      .catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  const run = async action => {
    setBusy(true); setError(''); setStatus('');
    try {
      await action(); setPacks(await listAipPacks());
      setStatus(tx('AIP data saved. Reload the simulator to apply changes.'));
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  return <section className="settings-section" aria-busy={busy}>
    <h4>{tx('AIP data packs')}</h4>
    <p>{tx('Import the World AIP ZIP to store airports, runways, frequencies, navaids, and routes in this browser. Installed data is used before cloud lookups and costs no credits.')}</p>
    <p>{tx('Cloud AIP requests require login and record 1 credit per request, with a shared quota of 10 requests per minute. Credits do not deduct tokens now; token settlement may be required later. Cached results are free.')}</p>
    {downloadUrl && <p><a href={downloadUrl} target="_blank" rel="noreferrer">{tx('Download World AIP ZIP')}</a></p>}
    <label>{tx('Import AIP ZIP')}
      <input type="file" accept=".zip,application/zip" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) run(() => importAipPack(file));
      }} />
    </label>
    {busy && <p role="status">{tx('Processing AIP data…')}</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    {!packs.length && <p>{tx('No optional AIP data pack installed.')}</p>}
    <ul>{packs.map(pack => <li key={pack.id}>
      <strong>{pack.name}</strong> · v{pack.version} · {pack.airportCount.toLocaleString()} {tx('airports')} · {(pack.bytes / 1048576).toFixed(1)} MiB
      <button type="button" disabled={busy} onClick={() => run(removeAipPack)}>{tx('Remove pack')}</button>
    </li>)}</ul>
    <p>{tx('Reload after importing or removing packs. Clearing browser data removes installed packs.')}</p>
  </section>;
}
