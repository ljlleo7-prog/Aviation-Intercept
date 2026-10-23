import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import './HomePage.css'; // We'll create this CSS file

const HomePage = ({ onStartSinglePlayer, onStartTutorial, onStartChallenges, onOpenSettings, onRecoverFlight }) => {
  const { tx } = useLanguage();
  const [destination, setDestination] = useState(null);
  useEffect(() => {
    if (!destination) return;
    const reduced = document.documentElement.dataset.motion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(destination.action, reduced ? 0 : 850);
    return () => window.clearTimeout(timer);
  }, [destination]);
  const enter = (label, action) => {
    if (!destination) setDestination({ label, action });
  };
  return (
    <div className={`homepage-container${destination ? ' homepage-departing' : ''}`}>
      <div className="home-atmosphere" aria-hidden="true"><div className="home-horizon" /><div className="home-orbit" /><div className="home-route"><i /></div></div>
      <div className="homepage-content" aria-busy={Boolean(destination)}>
        <h1 className="game-title">AVIATION <span>INTERCEPT</span></h1>
        <h2 className="game-subtitle">{tx("FLIGHT SIMULATOR")}</h2>

        <div className="menu-options">
          <button className="menu-btn" disabled={Boolean(destination)} onClick={() => enter(tx("Opening flight planning"), onStartSinglePlayer)}>
            <span className="btn-icon">01 /</span>
            <span className="btn-text">{tx("SINGLE PLAYER")}</span>
            <span className="btn-desc">{tx("Start a new flight simulation")}</span>
          </button>

          <button className="menu-btn disabled" disabled title={tx("Coming Soon")}>
            <span className="btn-icon">— /</span>
            <span className="btn-text">{tx("MULTIPLAYER")}</span>
            <span className="btn-desc">{tx("Join pilots worldwide (Coming Soon)")}</span>
          </button>

          <button className="menu-btn" disabled={Boolean(destination)} onClick={() => enter(tx("Entering flight academy"), onStartTutorial)}>
            <span className="btn-icon">02 /</span>
            <span className="btn-text">{tx("TUTORIAL")}</span>
            <span className="btn-desc">{tx("Learn the basics of flight")}</span>
          </button>

          <button className="menu-btn" disabled={Boolean(destination)} onClick={() => enter(tx("Opening challenges"), onStartChallenges)}>
            <span className="btn-icon">03 /</span>
            <span className="btn-text">{tx("CHALLENGES")}</span>
            <span className="btn-desc">{tx("Pure fun scenarios with no guides")}</span>
          </button>

          <button className="menu-btn" disabled={Boolean(destination)} onClick={() => enter(tx('Opening flight recovery'), onRecoverFlight)}>
            <span className="btn-icon">04 /</span>
            <span className="btn-text">{tx('RECOVER FLIGHT')}</span>
            <span className="btn-desc">{tx('Resume a cloud flight or import a save file')}</span>
          </button>

          <button className="menu-btn" disabled={Boolean(destination)} onClick={onOpenSettings}>
            <span className="btn-icon">05 /</span>
            <span className="btn-text">{tx("SETTINGS")}</span>
            <span className="btn-desc">{tx("Configure game options")}</span>
          </button>
        </div>
      </div>

      <div className="homepage-footer">
        <p>v2.0.1 Beta | ©2026 GeeksProductionStudio</p>
      </div>
      <div className="home-entry-status" role="status">{destination?.label}</div>
    </div>
  );
};

HomePage.propTypes = {
  onRecoverFlight: PropTypes.func.isRequired,
  onStartSinglePlayer: PropTypes.func.isRequired,
  onStartTutorial: PropTypes.func.isRequired,
  onStartChallenges: PropTypes.func.isRequired,
  onOpenSettings: PropTypes.func.isRequired
};

export default HomePage;
