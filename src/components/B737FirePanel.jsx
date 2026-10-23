import PropTypes from 'prop-types';
import './B737FirePanel.css';

export default function B737FirePanel({ fire = {}, onAction, disabled }) {
  const send = (action, value) => onAction?.('system-action', { system: 'fire', action, value });
  return <section className="b737-fire-panel" aria-label="737 engine and APU fire control panel">
    <div className="b737-fire-heading">ENGINE &amp; APU FIRE</div>
    <div className="b737-fire-handles">
      {['eng1', 'apu', 'eng2'].map(target => {
        const pulled = !!fire[`${target}Handle`];
        const label = target === 'apu' ? 'APU' : `ENG ${target.slice(3)}`;
        return <div key={target} className="b737-fire-station">
          <button type="button" className={`b737-fire-handle ${pulled ? 'pulled' : ''} ${fire[target] ? 'fire-detected' : ''}`} disabled={disabled} aria-label={`${label} fire handle`} aria-pressed={pulled}
            onClick={() => send(`${target}_handle`, !pulled)}>{label}<span>{pulled ? 'PULLED' : 'PULL'}</span></button>
          <div className="b737-fire-discharge">
            {(target === 'apu' ? [1] : [1, 2]).map(number => {
              const bottle = target === 'apu' ? 'apuBottle' : `bottle${number}`;
              const available = fire[bottle] > 0 && !fire[`${bottle}_discharge`];
              return <button key={number} type="button" disabled={disabled || !pulled || !available} aria-label={`${label} discharge bottle ${number}`}
                onClick={() => send(`${target}_bottle${number}`)}>{target === 'apu' ? 'TURN · DISCH' : `${number === 1 ? '↶' : '↷'} BTL ${number}`}<span>{available ? 'DISCH' : 'DISCHARGED'}</span></button>;
            })}
          </div>
        </div>;
      })}
    </div>
    <div className="b737-bottle-status">{['bottle1', 'bottle2', 'apuBottle'].map((bottle, index) => <span key={bottle}>{index === 2 ? 'APU BTL' : `BTL ${index + 1}`}: {fire[bottle] > 0 && !fire[`${bottle}_discharge`] ? 'READY' : 'DISCH'}</span>)}</div>
  </section>;
}
B737FirePanel.propTypes = { fire: PropTypes.object, onAction: PropTypes.func, disabled: PropTypes.bool };
