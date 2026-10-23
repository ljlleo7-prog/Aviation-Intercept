import { useLanguage } from '../../contexts/LanguageContext';
import PropTypes from 'prop-types';
import { buildWeatherBriefing } from '../../services/efb/EFBDataService.js';
import { formatNumber } from '../../services/efb/UnitConversion.js';

const formatSigned = (value, digits = 0, suffix = '') => {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
  return `${value >= 0 ? '+' : '-'}${absolute}${suffix}`;
};

const buildOperationalNotes = (briefing) => {
  const notes = [];
  if (Number.isFinite(briefing.windDirection) || Number.isFinite(briefing.windSpeed)) {
    notes.push(`Wind ${Number.isFinite(briefing.windDirection) ? String(Math.round(briefing.windDirection)).padStart(3, '0') : '---'}° / ${formatNumber(briefing.windSpeed, 0)} kt`);
  }
  if (Number.isFinite(briefing.windGust) && briefing.windGust > briefing.windSpeed) {
    notes.push(`Gust ${formatNumber(briefing.windGust, 0)} kt`);
  }
  if (Number.isFinite(briefing.visibilityMeters)) {
    notes.push(`Visibility ${formatNumber(briefing.visibilityMeters / 1000, 1)} km`);
  }
  if (Number.isFinite(briefing.temperature)) {
    notes.push(`Temp ${formatNumber(briefing.temperature, 0)}°C`);
  }
  if (Number.isFinite(briefing.pressureHpa)) {
    notes.push(`QNH ${formatNumber(briefing.pressureHpa, 0)} hPa`);
  }
  return notes.join(' · ');
};

const FMCWeather = ({ weatherData, flightState }) => {
  const { tx } = useLanguage();
  const runwayHeading = Number(flightState?.heading) || null;
  const briefing = buildWeatherBriefing({ weatherData, runwayHeading });
  const notes = buildOperationalNotes(briefing);

  return (
    <div className="fmc-page efb-page">
      <h4 className="fmc-page-title">{tx("WEATHER / BRIEF")}</h4>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Operational weather")}</div>
            <div className="fmc-section-subtitle">{tx("Live weather summary for current conditions.")}</div>
          </div>
          <div className={`fmc-status-pill ${briefing.status === 'normal' ? 'ready' : ''}`}>
            {briefing.status === 'normal' ? 'Normal' : 'Caution'}
          </div>
        </div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Wind")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.windDirection) ? `${String(Math.round(briefing.windDirection)).padStart(3, '0')}° / ${formatNumber(briefing.windSpeed, 0)} kt` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Gust")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.windGust) && briefing.windGust > 0 ? `${formatNumber(briefing.windGust, 0)} kt` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Visibility")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.visibilityMeters) ? `${formatNumber(briefing.visibilityMeters / 1000, 1)} km` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Turbulence")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.turbulence) ? formatNumber(briefing.turbulence, 2) : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Pressure and temperature")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">QNH</span><span className="fmc-stat-value">{Number.isFinite(briefing.pressureHpa) ? `${formatNumber(briefing.pressureHpa, 0)} hPa` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Altimeter")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.pressureInHg) ? `${formatNumber(briefing.pressureInHg, 2)} inHg` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Temperature")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.temperature) ? `${formatNumber(briefing.temperature, 0)} °C` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Humidity")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.humidity) ? `${formatNumber(briefing.humidity, 0)} %` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Runway wind components")}</div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Headwind")}</span><span className="fmc-stat-value">{formatSigned(briefing.windComponents?.headwind, 0, ' kt')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Crosswind")}</span><span className="fmc-stat-value">{formatSigned(briefing.windComponents?.crosswind, 0, ' kt')}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Cloud cover")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.cloudCover) ? `${formatNumber(briefing.cloudCover, 0)} %` : '—'}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("Precipitation")}</span><span className="fmc-stat-value">{Number.isFinite(briefing.precipitation) ? `${formatNumber(briefing.precipitation, 1)} mm` : '—'}</span></div>
        </div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Cautions")}</div>
        {briefing.cautions.length > 0 ? (
          <div className="fmc-tag-row">
            {briefing.cautions.map((caution) => <span key={caution} className="fmc-tag warning">{caution}</span>)}
          </div>
        ) : (
          <div className="fmc-value">{tx("No caution flags.")}</div>
        )}
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("ATIS-style summary")}</div>
        <div className="fmc-briefing-copy">{notes || 'Weather data unavailable.'}</div>
      </div>
    </div>
  );
};

FMCWeather.propTypes = {
  weatherData: PropTypes.object,
  flightState: PropTypes.object
};

export default FMCWeather;
