import AipPackSettings from './AipPackSettings.jsx';
import { useState } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import { readVisualQuality, writeVisualQuality } from '../utils/visualQualityPreference.js';
import { readDisplayPreferences, writeDisplayPreferences } from '../utils/displayPreferences.js';
import { flightKeyboardHelp } from '../config/flightKeyboard.js';
import './SettingsPanel.css';
import SceneryPackSettings from './SceneryPackSettings.jsx';
import RadarSettings from './RadarSettings.jsx';
import ApiUsageSettings from './ApiUsageSettings.jsx';

export default function DisplaySettings({ visualQuality, onUpdateVisualQuality }) {
  const { tx, language, setLanguage } = useLanguage();
  const [localQuality, setLocalQuality] = useState(readVisualQuality);
  const [display, setDisplay] = useState(readDisplayPreferences);
  const updateDisplay = (patch) => setDisplay(writeDisplayPreferences({ ...display, ...patch }));
  return <div className="display-settings">
    <section className="settings-section">
      <h4>{tx('Visuals & accessibility')}</h4>
      <label>{tx('Outside Visual Quality')}
        <select value={visualQuality ?? localQuality} onChange={event => {
          const value = writeVisualQuality(event.target.value);
          setLocalQuality(value);
          onUpdateVisualQuality?.(value);
        }}>
          <option value="balanced">{tx('Balanced (default)')}</option>
          <option value="economy">{tx('Economy')}</option>
        </select>
      </label>
      <p>{tx('Balanced targets 30 fps. Economy lowers resolution and targets 20 fps. Balanced switches to Economy above 11,000 ft AGL and restores below 9,000 ft AGL.')}</p>
      <label>{tx('Interface motion')}
        <select value={display.motion} onChange={event => updateDisplay({ motion: event.target.value })}>
          <option value="system">{tx('Follow device preference')}</option>
          <option value="reduced">{tx('Reduce motion')}</option>
        </select>
      </label>
      <p>{tx('Reduces interface animations. Flight instruments and outside scenery continue updating.')}</p>
      <label>{tx('Settings contrast')}
        <select value={display.contrast} onChange={event => updateDisplay({ contrast: event.target.value })}>
          <option value="standard">{tx('Standard')}</option>
          <option value="high">{tx('High contrast')}</option>
        </select>
      </label>
      <p>{tx('Display preferences apply immediately. Browser storage is required to keep them after reload.')}</p>
    </section>
    <section className="settings-section">
      <h4>{tx('Language & controls')}</h4>
      <label>{tx('Language')}
        <select value={language} onChange={event => setLanguage(event.target.value)}>
          <option value="en">English</option><option value="zh">简体中文</option>
        </select>
      </label>
      <details><summary>{tx('Keyboard controls')}</summary><p>{tx(flightKeyboardHelp)}</p></details>
    </section>
    <RadarSettings />
    <ApiUsageSettings />
    <SceneryPackSettings />
    <AipPackSettings />
  </div>;
}

DisplaySettings.propTypes = {
  visualQuality: PropTypes.oneOf(['balanced', 'economy']),
  onUpdateVisualQuality: PropTypes.func
};
