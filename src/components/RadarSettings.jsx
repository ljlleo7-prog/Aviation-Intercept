import { useSyncExternalStore } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext.jsx';
import { GUEST_WEATHER } from '../utils/apiAccessMode.js';
import { RADAR_OPTIONS, getRadarPreferences, subscribeRadarPreferences, writeRadarPreferences } from '../utils/radarPreferences.js';

export default function RadarSettings() {
  const { tx } = useLanguage();
  const { user } = useAuth();
  const preferences = useSyncExternalStore(subscribeRadarPreferences, getRadarPreferences);
  const control = (name, label, format) => <label key={name}>{tx(label)}
    <select disabled={!user && name.startsWith('weather')} value={!user && name.startsWith('weather')
      ? ({ weatherSpacing: GUEST_WEATHER.spacing, weatherInterval: GUEST_WEATHER.interval, weatherRange: GUEST_WEATHER.range })[name]
      : preferences[name]} onChange={event => writeRadarPreferences({ ...preferences, [name]: Number(event.target.value) })}>
      {RADAR_OPTIONS[name].map(value => <option key={value} value={value}>{format(value)}</option>)}
      {name === 'weatherInterval' && !user && <option value={GUEST_WEATHER.interval}>{format(GUEST_WEATHER.interval)}</option>}
    </select>
  </label>;
  return <section className="settings-section radar-settings">
    <h4>{tx('Terrain & weather sampling')}</h4>
    {!user && <p>{tx('Online guests can use free weather at 0.25° spacing, at most one provider request per minute, and a 20 NM radar range. Sign in to adjust live weather sampling or use terrain and route APIs. Offline mode uses simulated weather.')}</p>}
    {control('terrainSpacing', 'Terrain sample spacing', value => `${value}° (~${(value * 111).toFixed(2)} km)`)}
    {control('terrainInterval', 'Terrain request interval', value => `${value} s`)}
    {control('terrainRange', 'Maximum terrain range', value => `${value} NM`)}
    {control('weatherSpacing', 'Weather sample spacing', value => `${value}° (~${(value * 111).toFixed(2)} km)`)}
    {control('weatherInterval', 'Weather request interval', value => `${value} s`)}
    {control('weatherRange', 'Maximum weather range', value => `${value} NM`)}
    <p>{tx('Applies immediately and saves on this device. Smaller spacing and larger ranges need more requests. Spacing distances are north/south estimates; finer weather samples cannot improve the source forecast resolution. Provider cooldowns may extend request intervals.')}</p>
    <p>{tx('Only visible views request radar data. Hidden pages and offline mode pause fetching. Weather samples refresh after five minutes.')}</p>
  </section>;
}
