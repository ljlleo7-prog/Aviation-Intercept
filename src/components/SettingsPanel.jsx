import { useLanguage } from '../contexts/LanguageContext';
import PropTypes from 'prop-types';
import DisplaySettings from './DisplaySettings';

const INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30];

const panelStyle = {
  position: 'absolute',
  top: '60px',
  left: '80px',
  width: '360px',
  backgroundColor: 'rgba(20, 24, 30, 0.95)',
  border: '1px solid #444',
  borderRadius: '8px',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  color: '#f3f4f6'
};

const SettingsPanel = ({ settings, settingsError, autoSaveStatus, onUpdateSettings, visualQuality = 'balanced', onUpdateVisualQuality, onClose }) => {
  const { tx } = useLanguage();
  const lastSavedText = autoSaveStatus?.lastSavedAt
    ? new Date(autoSaveStatus.lastSavedAt).toLocaleTimeString()
    : tx("Not saved yet");

  return (
    <div className="flight-settings-panel" style={panelStyle} aria-label={tx("Settings")}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #333' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>{tx("Settings")}</h3>
        <button className="close-btn" aria-label={tx("Close settings")} onClick={onClose}>×</button>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <DisplaySettings visualQuality={visualQuality} onUpdateVisualQuality={onUpdateVisualQuality} />

        <fieldset disabled={!onUpdateSettings} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>{tx("Cloud Auto-Save")}</div>
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
      </div>
    </div>
  );
};

export default SettingsPanel;

SettingsPanel.propTypes = {
  settings: PropTypes.object,
  settingsError: PropTypes.string,
  autoSaveStatus: PropTypes.object,
  onUpdateSettings: PropTypes.func,
  visualQuality: PropTypes.oneOf(['balanced', 'economy']),
  onUpdateVisualQuality: PropTypes.func,
  onClose: PropTypes.func
};
