import React, { useState } from 'react';
import { normalizeFailureSelection } from '../config/flightFailures.js';
import FlightFailureSettings from './FlightFailureSettings.jsx';
import './FlightInitialization.css';
import { randomFlightService } from '../services/randomFlightService.js';
import { useLanguage } from '../contexts/LanguageContext';

const FlightInitialization = ({
  difficulty, setDifficulty,
  preflightConfig, updatePreflightConfig,
  selectedDeparture, selectedArrival,
  aircraftSuggestions,
  handleInitializeFlight,
  tabletReadiness,
  resumeSave,
  resumeCheckLoading,
  resumeCheckError,
  onResumeFlight,
  onDiscardResumeSave,
  isLoggedIn,
  offlineMode = false
}) => {
  const { t, tx } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);

  const {
    crewCount,
    timeZulu,
    useRandomTime,
    season,
    useRandomSeason
  } = preflightConfig;

  const isValidNumber = (val, min, max) => {
    if (val === '' || val === null || val === undefined) return false;
    const num = parseFloat(val);
    return !Number.isNaN(num) && num >= min && num <= max;
  };

  const failureSelection = normalizeFailureSelection(preflightConfig.failureSelection);
  const isStep1Valid = () => !!difficulty && (failureSelection.mode === 'normal' || failureSelection.banks.length > 0);
  const isStep2Valid = () => (
    isValidNumber(crewCount, 1, 10) &&
    (useRandomTime || timeZulu.trim() !== '') &&
    (useRandomSeason || season)
  );
  const isReadyToFinalize = isStep2Valid() && tabletReadiness?.isFinalizeReady;

  const handleNextStep = () => {
    if (currentStep === 1 && isStep1Valid()) setCurrentStep(2);
  };

  const randomizeStep1 = () => {
    const difficulties = ['rookie', 'amateur', 'intermediate', 'advanced', 'pro', 'devil'];
    setDifficulty(difficulties[Math.floor(Math.random() * difficulties.length)]);
  };

  const randomizeStep2 = async () => {
    try {
      await randomFlightService.generateRandomFlightParameters();
      updatePreflightConfig({
        crewCount: Math.floor(Math.random() * 4) + 2,
        useRandomTime: true,
        useRandomSeason: true
      });
    } catch (error) {
      console.error('Error randomizing operations params:', error);
    }
  };

  const generateRandomTime = () => {
    const hours = Math.floor(Math.random() * 24).toString().padStart(2, '0');
    const minutes = Math.floor(Math.random() * 60).toString().padStart(2, '0');
    return `${hours}:${minutes}Z`;
  };

  const generateRandomSeason = () => {
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    return seasons[Math.floor(Math.random() * seasons.length)];
  };

  const lastSavedAt = resumeSave?.updated_at
    ? new Date(resumeSave.updated_at).toLocaleString()
    : null;

  return (
    <div className="flight-initialization">
      {!offlineMode && (
        <div className="dispatch-section" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 className="section-header" style={{ borderBottom: 'none', marginBottom: 0 }}>{tx("Resume Flight")}</h2>
            {resumeCheckLoading && <span className="intel-label">{tx("Checking cloud save…")}</span>}
          </div>

          {!isLoggedIn ? (
            <p className="intel-text">{tx("Log in to sync flight progress and resume later.")}</p>
          ) : resumeCheckError ? (
            <p className="intel-text" style={{ color: '#ff8a80' }}>{tx("Cloud save unavailable:")}{resumeCheckError}</p>
          ) : resumeSave ? (
            <div className="tablet-handoff-note" style={{ marginBottom: 0 }}>
              <div className="tablet-handoff-title">{tx("Previous Flight Found")}</div>
              <div className="tablet-handoff-text">
                {tx('${aircraft} ready to resume.', { aircraft: resumeSave?.data?.aircraftModel || tx('Aircraft') })}
                {lastSavedAt ? tx(' Last saved ${time}.', { time: lastSavedAt }) : ''}
              </div>
              <div className="dispatch-actions" style={{ borderTop: 'none', paddingTop: '0.75rem', gap: '0.75rem' }}>
                <button className="dispatch-btn primary" onClick={() => onResumeFlight?.(resumeSave)}>{tx("Resume Flight")}</button>
                <button className="dispatch-btn" onClick={onDiscardResumeSave}>{tx("Discard Save")}</button>
              </div>
            </div>
          ) : (
            <p className="intel-text">{tx("No saved in-progress flight found for this account.")}</p>
          )}
        </div>
      )}

      <div className="dispatch-section" style={{ opacity: currentStep === 1 ? 1 : 0.6, pointerEvents: currentStep === 1 ? 'auto' : 'none', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #30363d' }}>
          <h2 className="section-header" style={{ borderBottom: 'none', marginBottom: 0 }}>{t('initialization.steps.1')}</h2>
          <button className="dispatch-btn random" onClick={randomizeStep1} title={t('initialization.buttons.randomize_difficulty')}>🎲</button>
        </div>

        <div className="difficulty-grid">
          <div className="difficulty-buttons">
            {['rookie', 'amateur', 'intermediate', 'advanced', 'pro', 'devil'].map((level) => (
              <button
                key={level}
                className={`difficulty-btn ${level} ${difficulty === level ? 'active' : ''}`}
                onClick={() => setDifficulty(level)}
              >
                {t(`initialization.difficulty.${level}`)}
              </button>
            ))}
          </div>

          <div className="intel-panel">
            <div className="crew-intel-box">
              <span className="intel-label">{t('initialization.intel.label')}</span>
              <p className="intel-text">{t(`initialization.intel.descriptions.${difficulty}`) || 'Awaiting difficulty selection...'}</p>
            </div>
          </div>
        </div>

        <FlightFailureSettings difficulty={difficulty} selection={preflightConfig.failureSelection}
          onChange={failureSelection => updatePreflightConfig({ failureSelection })} />

        {currentStep === 1 && (
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="dispatch-btn primary" onClick={handleNextStep} disabled={!isStep1Valid()}>{tx("Continue")}</button>
          </div>
        )}
      </div>

      <div className="dispatch-section" style={{ opacity: currentStep === 2 ? 1 : 0.6, pointerEvents: currentStep === 2 ? 'auto' : 'none', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #30363d' }}>
          <h2 className="section-header" style={{ borderBottom: 'none', marginBottom: 0 }}>{tx("Operations & Environment")}</h2>
          <button className="dispatch-btn random" onClick={randomizeStep2} title={tx("Randomize operations")}>🎲</button>
        </div>

        <div className="dispatch-grid compact-grid">
          <div className="parameter-group">
            <label>{t('initialization.params.crew_count')}</label>
            <input type="number" value={crewCount} onChange={(e) => updatePreflightConfig({ crewCount: Number(e.target.value) })} className="dispatch-input" min="1" max="10" placeholder="1-10" />
          </div>
          <div className="parameter-group">
            <label>{t('initialization.params.zulu_time')}</label>
            <div className="checkbox-input-group stacked">
              <input type="text" value={timeZulu} onChange={(e) => updatePreflightConfig({ timeZulu: e.target.value })} className="dispatch-input" disabled={useRandomTime} placeholder="HH:MMZ" />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useRandomTime}
                  onChange={(e) => updatePreflightConfig({ useRandomTime: e.target.checked, timeZulu: e.target.checked ? generateRandomTime() : timeZulu })}
                /> {t('initialization.params.random')}
              </label>
            </div>
          </div>
          <div className="parameter-group">
            <label>{t('initialization.params.season')}</label>
            <div className="checkbox-input-group stacked">
              <select value={season} onChange={(e) => updatePreflightConfig({ season: e.target.value })} className="dispatch-select" disabled={useRandomSeason}>
                <option value="Spring">{t('initialization.params.seasons.Spring')}</option>
                <option value="Summer">{t('initialization.params.seasons.Summer')}</option>
                <option value="Autumn">{t('initialization.params.seasons.Autumn')}</option>
                <option value="Winter">{t('initialization.params.seasons.Winter')}</option>
              </select>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useRandomSeason}
                  onChange={(e) => updatePreflightConfig({ useRandomSeason: e.target.checked, season: e.target.checked ? generateRandomSeason() : season })}
                /> {t('initialization.params.random')}
              </label>
            </div>
          </div>
        </div>

        <div className="tablet-handoff-note">
          <div className="tablet-handoff-title">{tx("Dispatch Tablet")}</div>
          <div className="tablet-handoff-text">{tx("Use the tablet to validate airports, review route status, and edit passengers, payload, reserve factor, and cruise altitude.")}</div>
          <div className="tablet-handoff-status">
            <span className={`tablet-status-chip ${tabletReadiness?.isRouteReady ? 'ready' : ''}`}>{tx("ROUTE")}{selectedDeparture && selectedArrival ? tx("SET") : tx("OPEN")}</span>
            <span className={`tablet-status-chip ${tabletReadiness?.isLoadoutReady ? 'ready' : ''}`}>{tx("LOADOUT")}{tabletReadiness?.isLoadoutReady ? tx("SET") : tx("OPEN")}</span>
            <span className={`tablet-status-chip ${tabletReadiness?.isPerformanceReady ? 'ready' : ''}`}>{tx("PERF")}{tabletReadiness?.isPerformanceReady ? tx("READY") : tx("PENDING")}</span>
            <span className={`tablet-status-chip ${aircraftSuggestions?.length ? 'ready' : ''}`}>{tx("TABLET READY")}</span>
          </div>
        </div>

        <div className="dispatch-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
          <button className="dispatch-btn" onClick={() => setCurrentStep(1)}>{t('initialization.failures.edit')}</button>
          <button className="dispatch-btn primary" onClick={handleInitializeFlight} disabled={!isReadyToFinalize} style={{ width: '100%' }}>
            {isReadyToFinalize ? t('initialization.buttons.finalize') : tx("Complete route and loadout in tablet")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlightInitialization;
