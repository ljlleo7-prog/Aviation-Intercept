import { useLanguage } from '../contexts/LanguageContext';
import React, { useState } from 'react';
import { encryptFlightData, decryptFlightData } from '../utils/flightDataCrypto';
import { buildFlightSavePayload } from '../services/buildFlightSavePayload.js';
import { validateFlightSave } from '../services/flightRecovery.js';
import aircraftService from '../services/aircraftService.js';
import './SaveLoadPanel.css';

const SaveLoadPanel = ({ flightData, physicsState, physicsService, flightPlan, weatherData, aircraftModel, onClose, onLoadFlight }) => {
  const { tx } = useLanguage();
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const generateSaveData = () => {
    return buildFlightSavePayload({
      flightData,
      physicsState,
      physicsService,
      flightPlan,
      weatherData,
      aircraftModel
    });
  };

  const handleSave = () => {
    try {
      const data = generateSaveData();
      const encrypted = encryptFlightData(data);
      if (!encrypted) throw new Error(tx("Encryption failed"));

      const blob = new Blob([encrypted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flight_save_${new Date().toISOString().replace(/[:.]/g, '-')}.acs`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccessMsg(tx("Flight saved successfully!"));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(tx("Failed to save flight: ") + err.message);
    }
  };

  const handleLoad = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const data = decryptFlightData(content);
        if (!data) throw new Error(tx("Invalid save file or decryption failed"));
        
        validateFlightSave(data);
        if (!await aircraftService.getAircraftByModel(data.aircraftModel)) throw new Error(tx('Saved aircraft is not supported.'));

        onLoadFlight(data);
        setSuccessMsg(tx("Flight loaded successfully!"));
        setTimeout(() => {
            setSuccessMsg(null);
            onClose();
        }, 1500);
      } catch (err) {
        setError(tx("Failed to load flight: ") + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="save-load-panel">
      <div className="panel-header">
        <h3>{tx("Save & Load Flight")}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        <div className="flight-manifest">
            <h4>{tx("Current Flight Manifest")}</h4>
            <div className="manifest-details">
                <p><strong>{tx("Aircraft:")}</strong> {(typeof aircraftModel === 'string' ? aircraftModel : aircraftModel?.name) || tx("Unknown")}</p>
                <p><strong>{tx("Position:")}</strong> {flightData?.position?.latitude?.toFixed(4)}, {flightData?.position?.longitude?.toFixed(4)}</p>
                <p><strong>{tx("Altitude:")}</strong> {flightData?.altitude?.toFixed(0)} ft</p>
                <p><strong>{tx("Heading:")}</strong> {flightData?.heading?.toFixed(0)}°</p>
                <p><strong>{tx("Phase:")}</strong> {flightPlan ? tx("Active Flight Plan") : tx("Free Flight")}</p>
            </div>
        </div>

        <div className="actions-row">
            <div className="action-card">
                <h5>{tx("Save Flight")}</h5>
                <p>{tx("Encrypt and download current flight state.")}</p>
                <button className="action-btn save-btn" onClick={handleSave}>{tx("💾 Download Save File")}</button>
            </div>

            <div className="action-card">
                <h5>{tx("Load Flight")}</h5>
                <p>{tx("Restore flight from a previous save file.")}</p>
                <label className="action-btn load-btn">{tx("📂 Upload Save File")}<input type="file" accept=".acs" onChange={handleLoad} style={{ display: 'none' }} />
                </label>
            </div>
        </div>

        {error && <div className="status-msg error">{error}</div>}
        {successMsg && <div className="status-msg success">{successMsg}</div>}
      </div>
    </div>
  );
};

export default SaveLoadPanel;
