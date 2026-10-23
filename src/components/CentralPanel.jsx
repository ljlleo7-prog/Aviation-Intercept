import React, { useState, useEffect } from 'react';
import { resolveICAO } from '../data/aircraft/index.js';

// Fallback panel (used when aircraft panel not found)
import DefaultPanel from '../data/aircraft/b738/eicasPanel.jsx';

const CentralPanel = ({ flightState, aircraftModel, efisFontFamily, onToggleBreakers }) => {
  const [Panel, setPanel] = useState(() => DefaultPanel);

  useEffect(() => {
    const icao = resolveICAO(aircraftModel);
    if (!icao) { setPanel(() => DefaultPanel); return; }
    const folder = icao.toLowerCase();
    import(`../data/aircraft/${folder}/eicasPanel.jsx`)
      .then(m => setPanel(() => m.default))
      .catch(() => setPanel(() => DefaultPanel));
  }, [aircraftModel]);

  return (
    <div className="central-panel" style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: efisFontFamily || 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
        <button onClick={onToggleBreakers} style={{ background: '#ffaa00', border: 'none', borderRadius: '4px', color: '#000', padding: '3px 7px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>CB</button>
      </div>
      <Panel flightState={flightState} efisFontFamily={efisFontFamily} />
    </div>
  );
};

export default CentralPanel;
