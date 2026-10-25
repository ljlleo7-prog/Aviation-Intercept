import { useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import PropTypes from 'prop-types';
import DisplaySettings from './DisplaySettings';

const INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30];

const SettingsPage = ({ settings, settingsError, autoSaveStatus, onUpdateSettings, visualQuality,
  onUpdateVisualQuality, onBack, returnToFlight = false, showCloudSettings = false, offlineMode, onOfflineModeChange }) => {
  const { tx } = useLanguage();
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); window.scrollTo(0, 0); }, []);
  const lastSavedText = autoSaveStatus?.lastSavedAt
    ? new Date(autoSaveStatus.lastSavedAt).toLocaleTimeString()
    : tx("Not saved yet");

  return (
    <main className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-content">
        <header className="settings-page-header">
          <button type="button" className="settings-back" onClick={onBack}>
            {tx(returnToFlight ? '← Back to flight' : '← Back to main menu')}
          </button>
          <h1 id="settings-page-title" ref={titleRef} tabIndex={-1}>{tx('Settings')}</h1>
          {returnToFlight && <p>{tx('Flight paused while Settings is open.')}</p>}
        </header>
        <DisplaySettings visualQuality={visualQuality} onUpdateVisualQuality={onUpdateVisualQuality} />

        {onOfflineModeChange && <section className="settings-section">
          <h4>{tx('Network')}</h4>
          <label className="settings-checkbox"><input type="checkbox" checked={Boolean(offlineMode)} onChange={onOfflineModeChange} />{tx('Offline mode')}</label>
          <p>{tx('Disable multiplayer, cloud save, live weather, and network terrain fetches.')}</p>
        </section>}
        {showCloudSettings && <section className="settings-section settings-cloud-save">
        <h4>{tx('Cloud Auto-Save')}</h4>
        <fieldset disabled={!onUpdateSettings} style={{ border: 0, padding: 0, margin: 0 }}>
          {!onUpdateSettings && <p>{tx('Cloud saves are unavailable in offline mode.')}</p>}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.autoSaveEnabled)}
              onChange={(event) => onUpdateSettings?.({ autoSaveEnabled: event.target.checked })}
            />
            <span>{tx("Enable auto-save for this account")}</span>
          </label>
        </fieldset>

        <div>
          <label htmlFor="auto-save-interval" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>{tx("Save Interval")}</label>
          <select
            id="auto-save-interval"
            value={settings?.autoSaveIntervalMinutes ?? 5}
            disabled={!onUpdateSettings || !settings?.autoSaveEnabled}
            onChange={(event) => onUpdateSettings?.({ autoSaveIntervalMinutes: Number(event.target.value) })}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#111827', color: '#f9fafb', border: '1px solid #374151' }}
          >
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {tx('Every ${minutes} minutes', { minutes })}
              </option>
            ))}
          </select>
        </div>

        <div style={{ background: 'rgba(17, 24, 39, 0.85)', border: '1px solid #374151', borderRadius: '6px', padding: '10px 12px', fontSize: '13px' }}>
          <div>{tx("Saving:")}{autoSaveStatus?.isSaving ? tx("In progress") : tx("Idle")}</div>
          <div>{tx("Last save:")}{lastSavedText}</div>
          {autoSaveStatus?.saveError && <div style={{ color: '#fca5a5', marginTop: '6px' }}>{tx("Error:")}{autoSaveStatus.saveError}</div>}
          {settingsError && <div style={{ color: '#fcd34d', marginTop: '6px' }}>{tx("Settings:")}{settingsError}</div>}
        </div>
        </section>}
      </div>
    </main>
  );
};

export default SettingsPage;

SettingsPage.propTypes = {
  settings: PropTypes.object,
  settingsError: PropTypes.string,
  autoSaveStatus: PropTypes.object,
  onUpdateSettings: PropTypes.func,
  visualQuality: PropTypes.oneOf(['balanced', 'economy']),
  onUpdateVisualQuality: PropTypes.func,
  onBack: PropTypes.func.isRequired,
  returnToFlight: PropTypes.bool,
  showCloudSettings: PropTypes.bool,
  offlineMode: PropTypes.bool,
  onOfflineModeChange: PropTypes.func
};
