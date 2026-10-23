/* eslint-disable react/prop-types */
import './AirbusWidebodyOverhead.css';

// Only exact equivalents in the simulation are bound. Aircraft-specific buses,
// individual tank pumps and hydraulic circuits remain reference-only hardware.
const read = (state, path) => path?.split('.').reduce((value, key) => value?.[key], state);
const range = count => Array.from({ length: count }, (_, index) => index + 1);

function Control({ label, path, action, state, dispatch, kind = 'push', positions, status }) {
  const value = read(state, path);
  const enabled = Boolean(dispatch && path && value !== undefined && action);
  const powered = (state.electrical?.dcVolts ?? 0) > 15;
  const active = Boolean(value);
  const current = positions ? positions.indexOf(value) : Number(active);
  const next = positions ? positions[(current + 1) % positions.length] : !active;
  return <div className={`awb-control awb-${kind}`}>
    <span className="awb-label">{label}</span>
    <button type="button" disabled={!enabled} aria-label={label} aria-pressed={positions ? undefined : active}
      title={enabled ? `${label}: ${value}` : `${label} — not simulated`}
      onClick={() => dispatch(...action, next)} style={{ '--angle': `${(current - 1) * 35}deg` }}>
      {kind === 'rotary' ? <span className="awb-knob" /> : kind === 'toggle' ? <span className="awb-lever" data-on={active} /> : <>
        <span className={`awb-indicator ${powered && status ? 'awb-amber' : ''}`}>{status || (kind === 'fire' ? 'FIRE' : 'FAULT')}</span>
        <span className={`awb-indicator ${powered && enabled && !active ? 'awb-white' : ''}`}>{kind === 'fire' ? 'PUSH' : 'OFF'}</span>
      </>}
    </button>
    <span className="awb-position">{!enabled ? 'INOP' : positions ? value : kind === 'toggle' ? (active ? 'ON' : 'OFF') : '\u00a0'}</span>
  </div>;
}

function Module({ title, children, className = '' }) {
  return <section className={`awb-module ${className}`} aria-label={title}>
    <i className="awb-screw awb-tl" /><i className="awb-screw awb-tr" /><i className="awb-screw awb-bl" /><i className="awb-screw awb-br" />
    <h3>{title}</h3>{children}
  </section>;
}

function Bus({ labels }) {
  return <div className="awb-bus" aria-hidden="true">{labels.map(label => <span key={label}>{label}</span>)}</div>;
}

function FireSection({ count, control }) {
  return <Module title="FIRE"><div className="awb-row awb-fire-row">{range(count).map(n => <div key={n}>
    {control(`ENG ${n}`, null, { kind: 'fire' })}
    <div className="awb-row">{control('AGENT 1')}{control('AGENT 2')}</div>
  </div>)}</div></Module>;
}

function HydraulicSection({ model, count, control }) {
  const circuits = model === 'A330' ? ['GREEN', 'BLUE', 'YELLOW'] : ['GREEN', 'YELLOW'];
  return <Module title="HYD"><Bus labels={circuits} /><div className="awb-row">{circuits.map(color => <div key={color}>
    <div className="awb-row">{control(`${color} ELEC A`)}{control(`${color} ELEC B`)}</div>
  </div>)}</div><div className="awb-row">{range(count).map(n => control(`ENG ${n} PUMP`))}{control('RAT MAN ON', null, { kind: 'fire' })}</div></Module>;
}

function FuelSection({ model, count, control }) {
  const tanks = model === 'A380' ? ['FEED 1', 'FEED 2', 'FEED 3', 'FEED 4'] : ['L INNER', 'CTR', 'R INNER'];
  return <Module title="FUEL"><Bus labels={range(count).map(n => `ENG ${n}`)} />
    <div className="awb-row">{control('X FEED', 'fuel.crossfeed')}{model === 'A380' && control('X FEED 3 / 4')}</div>
    <div className="awb-tanks">{tanks.map(tank => <div className="awb-tank" key={tank}><h4>{tank}</h4><div className="awb-row">{control(`${tank} 1`)}{control(`${tank} 2`)}</div></div>)}</div>
    <div className="awb-row">{control('L OUTER XFR')}{control('MODE SEL')}{control('TRIM TK')}{control('R OUTER XFR')}</div>
  </Module>;
}

function ElectricalSection({ count, control, state }) {
  return <Module title="ELEC"><div className="awb-row"><output className="awb-meter" aria-label="DC voltage">{(state.electrical?.dcVolts ?? 0) > 15 ? state.electrical.dcVolts.toFixed(1) : '—'}</output>
    {control('BAT', 'electrical.battery')}{control('APU BAT')}{control('AC ESS FEED')}{control('COMMERCIAL')}
  </div><Bus labels={range(count).map(n => `AC BUS ${n}`)} /><div className="awb-row">
    {range(count).map(n => control(`GEN ${n}`, `electrical.gen${n}`))}{control('APU GEN', 'electrical.apuGen')}{control('EXT A')}{control('EXT B')}
  </div><div className="awb-row">{range(count).map(n => control(`IDG ${n}`, null, { kind: 'fire' }))}{control('BUS TIE')}</div></Module>;
}

function AirSection({ count, control }) {
  return <Module title="AIR"><div className="awb-row">{control('PACK 1', 'pressurization.packL')}{control('PACK FLOW', null, { kind: 'rotary' })}{control('COCKPIT', null, { kind: 'rotary' })}{control('CABIN', null, { kind: 'rotary' })}{control('PACK 2', 'pressurization.packR')}</div>
    <Bus labels={['AIR', 'X BLEED', 'AIR']} /><div className="awb-row">{range(count).map(n => control(`ENG ${n} BLEED`, `pressurization.bleed${n}`))}{control('APU BLEED', 'apu.bleed')}{control('HOT AIR')}</div>
  </Module>;
}

function LowerSection({ count, control }) {
  return <><Module title="ANTI ICE / CABIN PRESS"><div className="awb-row">{control('WING', 'ice.wingAntiIce')}{range(count).map(n => control(`ENG ${n}`, `ice.eng${n}AntiIce`))}{control('PROBE HEAT', 'ice.probeHeat')}{control('LDG ELEV', null, { kind: 'rotary' })}{control('DITCHING', null, { kind: 'fire' })}</div></Module>
    <Module title="EXT LT / APU / INT LT"><div className="awb-row">{[['STROBE', 'strobe'], ['BEACON', 'beacon'], ['NAV & LOGO', 'nav'], ['LAND', 'landing'], ['NOSE', 'taxi']].map(([label, key]) => control(label, `lighting.${key}`, { kind: 'toggle' }))}
      {control('MASTER SW', 'apu.master')}{control('START', 'apu.start', { status: '' })}{control('OVHD INTEG', null, { kind: 'rotary' })}
    </div><div className="awb-row">{control('SEAT BELTS', 'signs.seatBelts', { kind: 'toggle' })}{control('NO SMOKING', 'signs.noSmoking', { kind: 'toggle' })}{control('EMER EXIT LT', 'lighting.emergencyLights', { kind: 'toggle' })}{control('DOME', 'lighting.dome', { kind: 'toggle' })}</div></Module></>;
}

function SideColumn({ side, model, control }) {
  return <aside className="awb-column awb-side">
    <Module title="RESET"><div className="awb-breakers">{range(24).map(n => <div key={n}><span>{['COM', 'NAV', 'FWS', 'ELEC', 'AIR', 'FUEL'][n % 6]} {Math.ceil(n / 6)}</span><i /></div>)}</div></Module>
    {side === 'left' ? <>
      <Module title="APU FIRE">{control('APU', null, { kind: 'fire' })}<div className="awb-row">{control('AGENT')}{control('TEST')}</div></Module>
      <Module title="ADIRS"><div className="awb-row">{range(3).map(n => control(`IR ${n}`, n < 3 ? `adirs.ir${n}` : null, { kind: 'rotary', positions: ['OFF', 'NAV'] }))}</div><div className="awb-row">{range(3).map(n => control(`ADR ${n}`))}</div></Module>
      <Module title="FLT CTL"><div className="awb-row">{control('PRIM 1')}{control('SEC 1')}{control('FAC 1')}</div></Module>
      <Module title="EMER ELEC PWR"><div className="awb-row">{control('MAN ON', null, { kind: 'fire' })}{control('GEN TEST')}</div></Module>
      <Module title="OXYGEN / CALLS"><div className="awb-row">{control('CREW SUPPLY')}{control('MASK MAN ON', null, { kind: 'fire' })}</div><div className="awb-row">{control('MECH')}{control('FWD')}{control('AFT')}{control('ALL')}</div></Module>
    </> : <>
      <Module title="CVR / GND CTL"><div className="awb-row">{control('TEST')}{control('ERASE')}{control('GND CTL')}</div></Module>
      <Module title="AUDIO"><div className="awb-row">{['VHF 1', 'VHF 2', 'VHF 3'].map(label => control(label, null, { kind: 'rotary' }))}</div><div className="awb-radio">{model === 'A380' ? 'DATA / AUDIO' : 'VHF 1     ———.———'}</div><div className="awb-row">{control('INT')}{control('CAB')}{control('PA')}</div></Module>
      <Module title="FLT CTL"><div className="awb-row">{control('PRIM 2')}{control('SEC 2')}{control('PRIM 3')}</div></Module>
      <Module title="CARGO AIR COND"><div className="awb-row">{control('ISOL VALVES')}{control('HOT AIR')}</div><div className="awb-row">{control('FWD', null, { kind: 'rotary' })}{control('AFT', null, { kind: 'rotary' })}</div></Module>
      <Module title="CARGO SMOKE"><div className="awb-row">{control('FWD AGENT', null, { kind: 'fire' })}{control('AFT AGENT', null, { kind: 'fire' })}</div></Module>
      <Module title="VENTILATION"><div className="awb-row">{control('EXTRACT')}{control('CAB FANS')}</div></Module>
    </>}
    <Module title={`${side === 'left' ? 'L' : 'R'} WIPER`}>{control('WIPER', `wipers.${side}`, { kind: 'toggle' })}</Module>
  </aside>;
}

export default function AirbusWidebodyOverhead({ model = 'A330', flightState = {}, onSystemAction }) {
  const state = flightState.systems || {};
  const count = model === 'A380' ? 4 : 2;
  const control = (label, path, options = {}) => <Control key={label} label={label} path={path} action={path ? [path.split('.')[0], path.split('.').slice(1).join('.')] : undefined} state={state} dispatch={onSystemAction} {...options} />;
  return <div className={`awb-overhead awb-${model.toLowerCase()}`}>
    <div className="awb-heading">AIRBUS {model} <span>OVERHEAD</span></div>
    <div className="awb-layout"><SideColumn side="left" model={model} control={control} />
      <main className="awb-column awb-center"><Module title="MAINTENANCE / SYSTEM CONTROL"><div className="awb-row">{control('ENG FADEC')}{control('ELEC')}{control('FUEL')}{control('GND COOLING', null, { kind: 'rotary' })}</div></Module>
        <div className="awb-speaker"><i /><span>COCKPIT</span></div>
        <FireSection count={count} control={control} /><HydraulicSection model={model} count={count} control={control} /><FuelSection model={model} count={count} control={control} /><ElectricalSection count={count} control={control} state={state} /><AirSection count={count} control={control} /><LowerSection count={count} control={control} />
      </main><SideColumn side="right" model={model} control={control} /></div>
    <p className="awb-note">INOP: reference control, not simulated. Individual Airbus hydraulic circuits, tank pumps and fire protection are not yet modeled.</p>
  </div>;
}
