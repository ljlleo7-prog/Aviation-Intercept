import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import { FAILURE_BANKS, normalizeFailureSelection } from '../config/flightFailures.js';
import './FlightInitialization.css';

export default function FlightFailureSettings({ selection, onChange, difficulty = 'rookie' }) {
  const { t } = useLanguage();
  const failureSelection = normalizeFailureSelection(selection);
  const setFailureSelection = patch => onChange({ ...failureSelection, ...patch });
  return (
        <fieldset className="flight-failure-settings">
          <legend>{t('initialization.failures.title')}</legend>
          <div className="failure-mode-buttons">
            {['normal', 'custom'].map(mode => (
              <button key={mode} type="button" aria-pressed={failureSelection.mode === mode}
                className={`difficulty-btn ${failureSelection.mode === mode ? 'active' : ''}`}
                onClick={() => setFailureSelection({ mode })}>{t(`initialization.failures.${mode}`)}</button>
            ))}
          </div>
          <div className="failure-options">
            <label className="failure-count">{t('initialization.failures.count')}
              <select className="dispatch-select" value={failureSelection.count} disabled={failureSelection.mode === 'normal'}
                onChange={event => setFailureSelection({ count: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 8, 10].map(count => <option key={count} value={count}>≈ {count}</option>)}
              </select>
            </label>
            <div className="failure-bank-options" role="group" aria-label={t('initialization.failures.banks')}>
              {FAILURE_BANKS.map(bank => <label key={bank}>
                <input type="checkbox" checked={failureSelection.banks.includes(bank)} disabled={failureSelection.mode === 'normal'}
                  onChange={event => setFailureSelection({ banks: event.target.checked
                    ? [...failureSelection.banks, bank] : failureSelection.banks.filter(value => value !== bank) })} />
                {t(`initialization.failures.${bank}`)}
              </label>)}
            </div>
          </div>
          <p className="failure-settings-note" role="status">{t(`initialization.failures.${failureSelection.mode === 'custom' && !failureSelection.banks.length ? 'empty' : failureSelection.mode === 'normal' ? 'normal_hint' : 'custom_hint'}`)}</p>
          {failureSelection.mode === 'custom' && <p className="failure-settings-note">{t(`initialization.failures.profiles.${difficulty}`)}</p>}
        </fieldset>
  );
}

FlightFailureSettings.propTypes = {
  selection: PropTypes.shape({ mode: PropTypes.string, count: PropTypes.number, banks: PropTypes.arrayOf(PropTypes.string) }),
  difficulty: PropTypes.string,
  onChange: PropTypes.func.isRequired
};
