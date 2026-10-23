import { useLanguage } from '../contexts/LanguageContext';
import React, { useState, useEffect } from 'react';
import './TimerPanel.css';

const TimerPanel = ({ 
  timeScale, 
  setTimeScale, 
  flightData, 
  flightPlan, 
  onClose 
}) => {
  const { tx } = useLanguage();
  const [autoDisengageUnstable, setAutoDisengageUnstable] = useState(true);
  const [autoDisengageWaypoint, setAutoDisengageWaypoint] = useState(true);
  const [autoDisengageTimer, setAutoDisengageTimer] = useState(false);
  const [timerDuration, setTimerDuration] = useState(5); // minutes
  const [timerRemaining, setTimerRemaining] = useState(0); // seconds
  const [isActive, setIsActive] = useState(false);

  // Sync internal active state with parent timeScale
  useEffect(() => {
    setIsActive(timeScale > 1);
  }, [timeScale]);

  // Timer Countdown Logic
  useEffect(() => {
    let interval;
    if (isActive && autoDisengageTimer && timerRemaining > 0) {
      interval = setInterval(() => {
        setTimerRemaining(prev => {
          if (prev <= 1) {
            setTimeScale(1);
            return 0;
          }
          return prev - 1;
        });
      }, 1000 / timeScale); // Run timer in accelerated time? 
      // User said "pre-set number of minutes". Usually flight time. 
      // If I set 5 minutes, it means 5 minutes of FLIGHT time or REAL time?
      // Usually "Skip 5 minutes of flight". So 5 minutes of accelerated time.
      // So if timeScale is 10, 1 real second = 10 flight seconds.
      // So we should decrement by timeScale per real second?
      // Or just count down derived flight time.
      // Let's decrement by 1 * timeScale every real second.
      // But setInterval runs in real time.
    }
    return () => clearInterval(interval);
  }, [isActive, autoDisengageTimer, timeScale, setTimeScale]);

  // Use a separate effect for stability checks to avoid cluttering the timer interval
  useEffect(() => {
    if (!isActive) return;

    // 1. Stability Check
    if (autoDisengageUnstable) {
      const isUnstable = 
        Math.abs(flightData.roll) > 45 || 
        Math.abs(flightData.pitch) > 25 || 
        !flightData.autopilotEngaged;
      
      if (isUnstable) {
        console.warn('⚠️ Auto-disengaging time accel: Unstable or AP off');
        setTimeScale(1);
      }
    }

    // 2. Waypoint Check
    if (autoDisengageWaypoint && flightData.currentWaypointIndex !== undefined) {
      // We need to track if waypoint index changes.
      // This requires a ref to store previous index.
    }
  }, [flightData, isActive, autoDisengageUnstable, setTimeScale]);

  // Waypoint Change Detection
  const prevWpIndexRef = React.useRef(flightData?.currentWaypointIndex);
  useEffect(() => {
    if (isActive && autoDisengageWaypoint) {
      if (flightData?.currentWaypointIndex !== prevWpIndexRef.current) {
        console.log('📍 Waypoint passed. Disengaging time accel.');
        setTimeScale(1);
      }
    }
    prevWpIndexRef.current = flightData?.currentWaypointIndex;
  }, [flightData?.currentWaypointIndex, isActive, autoDisengageWaypoint, setTimeScale]);

  const handleStart = () => {
    // Pre-flight checks
    if (!flightData.autopilotEngaged) {
      alert(tx("Autopilot must be engaged to enable time acceleration."));
      return;
    }
    
    // Stability Check
    if (Math.abs(flightData.roll) > 30 || Math.abs(flightData.pitch) > 15) {
        alert(tx("Aircraft is unstable. Cannot engage time acceleration."));
        return;
    }

    if (autoDisengageTimer) {
      setTimerRemaining(timerDuration * 60);
    }
    setTimeScale(10);
  };

  const handleStop = () => {
    setTimeScale(1);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="timer-panel">
      <div className="panel-header">
        <h3>{tx("Time Acceleration")}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        <div className="status-card">
            <div className={`status-indicator ${isActive ? 'active' : ''}`}>
                {isActive ? tx("10x SPEED") : tx("REAL TIME")}
            </div>
            <div className="controls">
                {!isActive ? (
                    <button className="start-btn" onClick={handleStart}>{tx("⏩ Engage 10x")}</button>
                ) : (
                    <button className="stop-btn" onClick={handleStop}>{tx("⏹️ Disengage")}</button>
                )}
            </div>
        </div>

        <div className="settings-section">
            <h4>{tx("Auto-Disengage Conditions")}</h4>
            
            <label className="checkbox-row">
                <input 
                    type="checkbox" 
                    checked={autoDisengageUnstable}
                    onChange={e => setAutoDisengageUnstable(e.target.checked)}
                />
                <span>{tx("Unstable / AP Disconnect")}</span>
            </label>

            <label className="checkbox-row">
                <input 
                    type="checkbox" 
                    checked={autoDisengageWaypoint}
                    onChange={e => setAutoDisengageWaypoint(e.target.checked)}
                />
                <span>{tx("Next Waypoint")}</span>
            </label>

            <label className="checkbox-row">
                <input 
                    type="checkbox" 
                    checked={autoDisengageTimer}
                    onChange={e => setAutoDisengageTimer(e.target.checked)}
                />
                <span>{tx('Timer (${minutes} min)', { minutes: timerDuration })}</span>
            </label>

            {autoDisengageTimer && (
                <div className="timer-input-row">
                    <input 
                        type="range" 
                        min="1" 
                        max="60" 
                        value={timerDuration}
                        onChange={e => setTimerDuration(parseInt(e.target.value))}
                        disabled={isActive}
                    />
                    <span>{tx('${minutes} min', { minutes: timerDuration })}</span>
                </div>
            )}
            
            {isActive && autoDisengageTimer && (
                <div className="countdown-display">{tx("Remaining:")}{formatTime(timerRemaining)}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default TimerPanel;
