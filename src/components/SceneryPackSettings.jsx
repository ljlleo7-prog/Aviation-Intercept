import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { importSceneryPack } from '../services/sceneryPackImport.js';
import { listSceneryPacks, removeSceneryPack } from '../services/sceneryPackStorage.js';

export default function SceneryPackSettings() {
  const { tx } = useLanguage();
  const downloadUrl = import.meta.env.VITE_SCENERY_PACK_DOWNLOAD_URL?.trim();
  const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);
  useEffect(() => {
    let cancelled = false;
    listSceneryPacks().then(value => { if (!cancelled) setPacks(value); })
      .catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  const run = async action => {
    setBusy(true); setError(''); setStatus('');
    try {
      await action(); setPacks(await listSceneryPacks());
      setStatus(tx('Scenery saved. Reload the simulator to apply changes.'));
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return <section className="settings-section" aria-busy={busy}>
    <h4>{tx('Scenery packs')}</h4>
    <p>{tx('Download a scenery ZIP, then import it here. Installed packs are stored in this browser. Bundled scenery remains available.')}</p>
    {downloadUrl && <p><a href={downloadUrl} target="_blank" rel="noreferrer">{tx('Download scenery ZIP')}</a></p>}
    <label>{tx('Import scenery ZIP')}
      <input ref={input} type="file" accept=".zip,application/zip" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        if (file) run(() => importSceneryPack(file));
      }} />
    </label>
    {busy && <p role="status">{tx('Processing scenery…')}</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{tx('Scenery operation failed:')} {error}</p>}
    {!packs.length && <p>{tx('No optional scenery packs installed.')}</p>}
    <ul>{packs.map(pack => <li key={pack.id}>
      <strong>{pack.name}</strong> · v{pack.version} · {(pack.bytes / 1048576).toFixed(1)} MiB
      <p>{pack.airportCodes.join(', ')}</p>
      <button type="button" disabled={busy} onClick={() => run(() => removeSceneryPack(pack.id))}>{tx('Remove pack')}</button>
    </li>)}</ul>
    <p>{tx('Reload after importing or removing packs. Clearing browser data removes installed packs.')}</p>
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL 1.0</a>
  </section>;
}
