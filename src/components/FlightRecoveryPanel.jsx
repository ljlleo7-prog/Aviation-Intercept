import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import { decryptFlightData } from '../utils/flightDataCrypto';
import { validateFlightSave } from '../services/flightRecovery.js';
import './SettingsPanel.css';

export default function FlightRecoveryPanel({ save, loading, error, offline, onResume, onDiscard }) {
  const { tx } = useLanguage();
  const [fileError, setFileError] = useState(null);
  const [reading, setReading] = useState(false);
  const fileInput = useRef(null);
  const importFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError(null);
    setReading(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(tx('Save file is too large.'));
      const data = validateFlightSave(decryptFlightData(await file.text()));
      await onResume({ data });
    } catch (failure) {
      setFileError(failure.message);
    } finally {
      setReading(false);
    }
  };
  return <section className="settings-section" aria-label={tx('Recover flight')}>
    <h4>{tx('Recover flight')}</h4>
    <p>{tx('Resume a cloud flight or import a downloaded save file.')}</p>
    <p>{tx('Cloud recovery requires a signed-in account. Save files also work offline.')}</p>
    {offline && <p>{tx('Cloud saves are unavailable in offline mode.')}</p>}
    {loading && <p role="status">{tx('Checking cloud save…')}</p>}
    {!offline && !loading && !save && !error && <p>{tx('No cloud flight to resume.')}</p>}
    {save && !offline && <div>
      <p>{save.data?.aircraftModel} · {new Date(save.updated_at || save.created_at).toLocaleString()}</p>
      <button type="button" disabled={loading || reading} onClick={() => onResume(save)}>{tx('Resume flight')}</button>{' '}
      <button type="button" disabled={loading || reading} onClick={onDiscard}>{tx('Discard cloud save')}</button>
    </div>}
    <p>{tx('Import flight save')}</p>
    <button type="button" disabled={reading} onClick={() => fileInput.current?.click()}>{tx('Choose save file')}</button>
    <input ref={fileInput} type="file" accept=".acs" disabled={reading} onChange={importFile} hidden aria-label={tx('Import flight save')} />
    {(fileError || error) && <p role="alert">{tx(fileError || error)}</p>}
  </section>;
}

FlightRecoveryPanel.propTypes = {
  save: PropTypes.object, loading: PropTypes.bool, error: PropTypes.string,
  offline: PropTypes.bool, onResume: PropTypes.func.isRequired, onDiscard: PropTypes.func.isRequired
};
