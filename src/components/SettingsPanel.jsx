import React from 'react';

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
  const lastSavedText = autoSaveStatus?.lastSavedAt
    ? new Date(autoSaveStatus.lastSavedAt).toLocaleTimeString()
    : 'Not saved yet';

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #333' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Settings</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label htmlFor="outside-visual-quality" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Outside Visual Quality</label>
          <select
            id="outside-visual-quality"
            value={visualQuality}
            onChange={(event) => onUpdateVisualQuality?.(event.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#111827', color: '#f9fafb', border: '1px solid #374151' }}
          >
            <option value="balanced">Balanced (default)</option>
            <option value="economy">Economy</option>
          </select>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '5px' }}>
            Economy lowers outside-view resolution and targets 30 fps. Balanced switches to Economy above 11,000 ft AGL and restores below 9,000 ft AGL.
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Cloud Auto-Save</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.autoSaveEnabled)}
              onChange={(event) => onUpdateSettings?.({ autoSaveEnabled: event.target.checked })}
            />
            <span>Enable auto-save for this account</span>
          </label>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Save Interval</div>
          <select
            value={settings?.autoSaveIntervalMinutes ?? 5}
            disabled={!settings?.autoSaveEnabled}
            onChange={(event) => onUpdateSettings?.({ autoSaveIntervalMinutes: Number(event.target.value) })}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#111827', color: '#f9fafb', border: '1px solid #374151' }}
          >
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                Every {minutes} minute{minutes === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>

        <div style={{ background: 'rgba(17, 24, 39, 0.85)', border: '1px solid #374151', borderRadius: '6px', padding: '10px 12px', fontSize: '13px' }}>
          <div>Saving: {autoSaveStatus?.isSaving ? 'In progress' : 'Idle'}</div>
          <div>Last save: {lastSavedText}</div>
          {autoSaveStatus?.saveError && <div style={{ color: '#fca5a5', marginTop: '6px' }}>Error: {autoSaveStatus.saveError}</div>}
          {settingsError && <div style={{ color: '#fcd34d', marginTop: '6px' }}>Settings: {settingsError}</div>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
