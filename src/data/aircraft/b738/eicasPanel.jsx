import React from 'react';
import { ArcGauge, BoxVal } from '../../../components/eicas/shared.jsx';

const AMB = '#ffcc00';
const WHT = '#ffffff';

const AnnCell = ({ label, active }) => (
  <div style={{
    fontSize: '9px', fontFamily: 'aptos', fontWeight: 'bold',
    color: active ? AMB : 'transparent',
    background: active ? '#1a1200' : 'transparent',
    border: `1px solid ${active ? AMB : 'transparent'}`,
    borderRadius: '2px', padding: '1px 4px', whiteSpace: 'nowrap',
    lineHeight: 1.4,
  }}>{label}</div>
);



const EICASPanel = ({ flightState }) => {
  const n1  = flightState?.engineN1  || [0, 0];
  const n2  = flightState?.engineN2  || [0, 0];
  const egt = flightState?.engineEGT || [0, 0];
  const ff  = flightState?.engineFuelFlow || [0, 0];
  const engineThrottles = Array.isArray(flightState?.engineThrottles) ? flightState.engineThrottles : [flightState?.throttle ?? 0, flightState?.throttle ?? 0];
  const reverseActive = [0, 1].map(i => (engineThrottles[i] ?? 0) < 0);
  const fuel = flightState?.fuel || 0;
  const startValveOpen  = flightState?.startValveOpen  || [false, false];
  const oilFilterBypass = flightState?.oilFilterBypass || [false, false];
  const lowOilPressure  = flightState?.lowOilPressure  || [false, false];

  return (
    <div style={{ background: '#000', border: '1px solid #333', borderRadius: '4px', padding: '6px', fontFamily: 'courier new', color: '#00ff00' }}>
      <div style={{ display: 'flex', gap: '6px' }}>

        {/* LEFT: engine gauges */}
        <div style={{ flex: '0 0 auto' }}>
          {/* N1 */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
            {[0, 1].map(i => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '8px', color: reverseActive[i] ? '#00ff00' : '#aaa', fontWeight: reverseActive[i] ? 'bold' : 'normal' }}>
                  {reverseActive[i] ? 'REV' : `ENG ${i+1}`}
                </div>
                <ArcGauge value={n1[i] || 0} max={110} label="N1" size={58} redline={104} yellowline={98} reverse={reverseActive[i]} />
              </div>
            ))}
          </div>
          {/* EGT */}
          <div style={{ fontSize: '8px', color: '#aaa', borderBottom: '1px solid #333', marginBottom: '2px' }}>EGT</div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            {[0, 1].map(i => (
              <ArcGauge key={i} value={egt[i]||0} max={1000} label="EGT" size={52} yellowline={flightState?.egtYellow || 750} redline={flightState?.egtRed || 850} />
            ))}
          </div>
          {/* N2 + FF boxed */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[0, 1].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <BoxVal label="N2" value={(n2[i]||0).toFixed(1)} />
                <BoxVal label="FF" value={(ff[i]||0).toFixed(2)} />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: annunciators + fuel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
            {[0, 1].map(i => (
              <div key={i} style={{ fontSize: '8px', color: '#aaa', textAlign: 'center', flex: 1 }}>ENG {i+1}</div>
            ))}
          </div>
          {[
            ['START VALVE OPEN',  startValveOpen],
            ['OIL FILTER BYPASS', oilFilterBypass],
            ['LOW OIL PRESSURE',  lowOilPressure],
          ].map(([label, states]) => (
            <div key={label} style={{ display: 'flex', gap: '4px' }}>
              {[0, 1].map(i => <AnnCell key={i} label={label} active={states[i]} />)}
            </div>
          ))}
          <div style={{ marginTop: 'auto', paddingTop: '6px', fontSize: '10px', color: '#ffaa00', textAlign: 'center' }}>
            FUEL {fuel.toFixed(0)} KG
          </div>
        </div>

      </div>
    </div>
  );
};

export default EICASPanel;
