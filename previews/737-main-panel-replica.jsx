/* eslint-disable react/prop-types, react-refresh/only-export-components, no-unused-vars */
import ReplicaAlertButton from '../src/components/ReplicaAlertButton.jsx';
import B737SystemAnnunciators from '../src/components/B737SystemAnnunciators.jsx';
import ReplicaLightingControl from '../src/components/ReplicaLightingControl.jsx';
import { useState } from 'react';
import { InstrumentDataContext, useInstrumentData, LivePFD, ND as LiveND } from './main-panel-parts.jsx';
import { replicaTargets } from '../src/utils/replicaAutopilot.js';
import ReplicaAutopilotDial from '../src/components/ReplicaAutopilotDial.jsx';

// Static reference study. Every position is in the same 1200 × 620 coordinate system.
const seq = (n) => Array.from({ length: n }, (_, i) => i);
function Live737Engine({ data }) {
  const n1=Array.isArray(data?.engineN1)?data.engineN1:[20.9,20.8];
  const egt=Array.isArray(data?.engineEGT)?data.engineEGT:[416,416];
  return <g transform="translate(539 268)" className="screen" pointerEvents="none"><rect width="119" height="119" rx="3" fill="#080711"/><Label x="38" y="9" className="green tiny">{data?.flightPhase || 'ENGINE'} · LIVE</Label>{[22,56].map((y,row)=><g key={y}><Label x="37" y={y-8} className="green tiny">{row?'EGT':'N1'}</Label>{[20,53].map((x,i)=><g key={x}><circle cx={x} cy={y} r="12" fill="none" stroke="#d9dfda" strokeWidth=".7"/><path d={`M${x} ${y}l${Math.max(2,Math.min(10,(row?egt[i]/80:n1[i]/10)))}-9`} stroke="#fff"/><Label x={x} y={y+4} style={{fontSize:5}}>{row?Math.round(egt[i] ?? 0):Number(n1[i] ?? 0).toFixed(1)}</Label></g>)}</g>)}<path d="M70 12v75" stroke="#52645a" strokeWidth=".5"/><Label x="95" y="22" className="green" style={{fontSize:4}}>ENGINE</Label><Label x="95" y="35" className="green" style={{fontSize:4}}>HYD {Math.round(data?.hydraulicPressure ?? 3000)}</Label><Label x="59" y="99" className="green tiny">FUEL {Math.round(data?.fuel ?? 0)} KG</Label><Label x="59" y="112" className="green tiny">FF {Number(data?.engineFuelFlow?.[0] ?? 0).toFixed(1)} / {Number(data?.engineFuelFlow?.[1] ?? 0).toFixed(1)}</Label></g>;
}
function Label({ x, y, children, ...props }) { return <text x={x} y={y} textAnchor="middle" {...props}>{children}</text>; }
function Screw({ x, y }) { return <g transform={`translate(${x} ${y})`}><circle r="2.3" fill="#292c2c" stroke="#919799" strokeWidth=".5" /><path d="M-1.3 1.3 1.3-1.3" stroke="#aaa" strokeWidth=".6" /></g>; }
function Plate({ x, y, w, h, children }) { return <g transform={`translate(${x} ${y})`}><rect width={w} height={h} rx="3" fill="url(#metal)" stroke="#252c30" />{[[5,5],[w-5,5],[5,h-5],[w-5,h-5]].map(([a,b],i)=><Screw key={i} x={a} y={b} />)}{children}</g>; }
function Knob({ x, y, r = 8, dark = false, angle = 0, implemented = false }) { return <g transform={`translate(${x} ${y}) rotate(${angle})`}><circle r={r+2} fill="#252a2d" stroke="#949a9b" strokeWidth=".5" /><circle r={r} fill={dark?'url(#blackKnob)':'url(#knob)'} stroke="#171b1c" />{seq(12).map(i=><path key={i} d={`M0 ${-r+1}v2`} transform={`rotate(${i*30})`} stroke={dark?'#525758':'#b6bbba'} strokeWidth="1" />)}<path d={`M0 ${-r+2}v${r*.65}`} stroke={dark?'#e1e5df':'#343a3b'} strokeWidth="2" /><Label x="0" y="2" style={{fontSize:3,fill:"#edc779"}}>{implemented ? null : "INOP"}</Label></g>; }
function Push({ x, y, w = 19, h = 13, label, lit = false, implemented = false }) { return <g transform={`translate(${x} ${y})`}><rect width={w} height={h} rx="1" fill="#242a2b" stroke="#a0a7a7" strokeWidth=".5" />{lit&&<rect x="3" y="2" width={w-6} height="2" fill="#6cd165" />}<Label x={w/2} y={h-3} className="tiny">{label}</Label><Label x={w/2} y={Math.max(3,h/2-1)} style={{fontSize:Math.min(3,h/3),fill:"#edc779"}}>{implemented ? null : "INOP"}</Label></g>; }
function Toggle({ x, y, label, implemented = false, up = true }) { return <g transform={`translate(${x} ${y})`}><Label x="0" y="-12" className="tiny">{label}</Label><circle r="4" fill="#1a2021" stroke="#b9babb" /><path d={up ? "M0 1 2-7" : "M0 -1 2 7"} stroke="#ddd" strokeWidth="3" strokeLinecap="round" /><Label x="0" y="8" style={{fontSize:3,fill:"#edc779"}}>{implemented ? null : "INOP"}</Label></g>; }
function Dial({ x, y, r=25, type='clock' }) { return <g transform={`translate(${x} ${y})`}><rect x={-r-5} y={-r-5} width={2*r+10} height={2*r+10} rx="4" fill="#353d40" stroke="#8c9494" /><circle r={r} fill="#101415" stroke="#161a1b" strokeWidth="3" />{type==='attitude'?<><path d={`M${-r+2} 0a${r-2} ${r-2} 0 0 1 ${2*r-4} 0`} fill="#428caf"/><path d={`M${-r+2} 0a${r-2} ${r-2} 0 0 0 ${2*r-4} 0`} fill="#765333"/><path d="M-16 1h11l5 4 5-4h11" fill="none" stroke="#f6cc49" strokeWidth="2" />{[-10,-5,8].map(n=><path key={n} d={`M-7 ${n}h14`} stroke="white" strokeWidth=".5" />)}</>:<>{seq(12).map(i=><g key={i} transform={`rotate(${i*30})`}><path d={`M0 ${-r+3}v3`} stroke="#ddd" /><text transform={`translate(0 ${-r+10}) rotate(${-i*30})`} textAnchor="middle" style={{fontSize:4}}>{i===0?12:i}</text></g>)}<path d={`M-9 8 0 0 5 ${-r+7}`} stroke="white" fill="none" /><circle r="2" fill="#ddd" /><Label x="0" y="12" className="tiny">{type==='clock'?'10:08':type==='speed'?'KNOTS':'ALT'}</Label></>}</g>; }
function Screen({ x, y, size=139, children }) { return <g transform={`translate(${x} ${y})`}><rect width={size} height={size} rx="5" fill="#343a3d" stroke="#a3a9a9" strokeWidth="1" /><rect x="6" y="6" width={size-12} height={size-12} rx="4" fill="#080711" stroke="#101114" strokeWidth="3" />{[[4,4],[size-4,4],[4,size-4],[size-4,size-4]].map(([a,b],i)=><Screw key={i} x={a} y={b}/>)}<svg className="screen" x="10" y="10" width={size-20} height={size-20} viewBox="0 0 120 120" overflow="hidden">{children}</svg></g>; }
function PFD({ x, y }) { return <Screen x={x} y={y}><Label x="60" y="7" className="green">N1    LNAV    VNAV PTH</Label><path d="M40 0v12m40-12v12" stroke="#ddd" strokeWidth=".5" /><Label x="60" y="17" className="green">CMD</Label><rect x="24" y="22" width="69" height="67" fill="#2466b6" /><rect x="24" y="55" width="69" height="34" fill="#8e5428" /><path d="M24 55h69" stroke="white" />{[-20,-10,10,20].map((n,i)=><g key={n}><path d={`M${i%2?46:41} ${55+n}h${i%2?25:35}`} stroke="white" strokeWidth=".7"/><Label x="37" y={57+n} style={{fontSize:5}}>{Math.abs(n)}</Label></g>)}<path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#111" strokeWidth="4" fill="none"/><path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#fff" strokeWidth="1.2" fill="none"/><path d="M59 26v57M29 56h60" stroke="#e355eb" strokeWidth="1.5" /><path d="M37 32Q59 12 81 32" fill="none" stroke="white" strokeWidth=".7"/><path d="m59 21-3 5h6z" fill="white"/><rect x="3" y="25" width="18" height="65" fill="#333740"/><rect x="96" y="25" width="19" height="65" fill="#333740"/>{seq(6).map(i=><g key={i}><Label x="11" y={33+i*10} style={{fontSize:6}}>{180-i*10}</Label><Label x="105" y={33+i*10} style={{fontSize:6}}>{'0'+(6-i)*20}</Label></g>)}<path d="M1 50h17l5 6-5 6H1zM118 50H99l-6 6 6 6h19z" fill="#07090b" stroke="white" strokeWidth=".6"/><Label x="11" y="59">145</Label><Label x="106" y="59">040</Label><Label x="12" y="21" className="magenta">145</Label><Label x="103" y="21" className="magenta">3000</Label><path d="M29 104q30-25 60 0" fill="none" stroke="white"/>{seq(7).map(i=><path key={i} d={`M${32+i*9} ${101-Math.sin(i/6*Math.PI)*10}v4`} stroke="white"/>)}<Label x="59" y="108">273</Label><Label x="101" y="98" className="green">29.92</Label><Label x="59" y="118" style={{fontSize:6}}>ILS 108.50     DME 8.2</Label></Screen>; }
function ND({ x, y }) { return <Screen x={x} y={y}><Label x="23" y="7" style={{fontSize:6}}>GS 142 TAS 148</Label><Label x="91" y="7" className="magenta">DAG  8.2NM</Label><Label x="60" y="17">273 MAG</Label>{[35,65,88].map(r=><path key={r} d={`M${60-r} 106a${r} ${r} 0 0 1 ${r*2} 0`} fill="none" stroke="#b6a8bc" strokeWidth=".6" strokeDasharray={r===35?'3 4':undefined}/>)}{seq(13).map(i=><g key={i} transform={`translate(60 106) rotate(${-80+i*13.3})`}><path d="M0-88v5" stroke="white"/><Label x="0" y="-76" style={{fontSize:6}}>{(19+i)%36}</Label></g>)}<path d="M60 108 64 74 47 41 56 20" fill="none" stroke="#e652d9" strokeWidth="1.4"/>{[[64,74,'DAG'],[47,41,'HEC']].map(([a,b,t])=><g key={t}><path d={`M${a} ${b-3}l3 3-3 3-3-3z`} fill="none" stroke="#e652d9"/><text x={a+5} y={b} className="magenta" style={{fontSize:6}}>{t}</text></g>)}<path d="m60 99-4 10 4-2 4 2z" fill="none" stroke="white"/><Label x="17" y="115" className="cyan">VOR 1</Label><Label x="101" y="115" className="cyan">VOR 2</Label></Screen>; }
function EngineDisplay({ x,y,lower=false }) { return <Screen x={x} y={y} size={139}>{lower?<><Label x="60" y="9">SYSTEM</Label>{['OIL PRESS','OIL TEMP','OIL QTY','VIB'].map((t,i)=><g key={t}><Label x="60" y={25+i*20} className="green" style={{fontSize:5}}>{t}</Label><Label x="27" y={31+i*20}>{[48,92,96,0.2][i]}</Label><Label x="93" y={31+i*20}>{[48,91,96,0.3][i]}</Label><path d={`M37 ${29+i*20}h10m26 0h10`} stroke="white"/></g>)}<Label x="60" y="113" className="green">HYD QTY 100 / 100</Label></>:<><Label x="38" y="8" className="green">21K · 98.2 / 98.2</Label>{[20,53].map((a,i)=><g key={a}>{[31,67].map((b,j)=><g key={b}><circle cx={a} cy={b} r="13" fill="none" stroke="white" strokeWidth=".7"/><path d={`M${a} ${b}l9-9`} stroke="white"/><rect x={a-8} y={b+2} width="22" height="8" fill="#080711" stroke="white" strokeWidth=".5"/><Label x={a+3} y={b+8} style={{fontSize:5}}>{j?'416':i?'20.8':'20.9'}</Label></g>)}</g>)}<Label x="37" y="29" className="green" style={{fontSize:5}}>N1</Label><Label x="37" y="65" className="green" style={{fontSize:5}}>EGT</Label><path d="M70 14v78" stroke="#52645a" strokeWidth=".5"/>{['ENG WARN','LOW OIL PRESS','ENG CONTROL','REVERSER','START VALVE'].map((t,i)=><g key={t}><Label x="98" y={22+i*14} className={i?'green':'cyan'} style={{fontSize:4}}>{t}</Label></g>)}<Label x="37" y="94" className="green" style={{fontSize:5}}>FUEL QTY — KGS</Label>{[17,39,61].map(a=><g key={a}><circle cx={a} cy="108" r="7" fill="none" stroke="white" strokeWidth=".6"/><Label x={a} y="110" style={{fontSize:4}}>2400</Label></g>)}</>}</Screen>; }
function EFIS({ x, mode, onModeChange, range, onRangeChange }) { return <Plate x={x} y={47} w={85} h={55}><Label x="21" y="8" className="tiny">MINIMUMS</Label><Label x="63" y="8" className="tiny">BARO</Label><Knob x={21} y={20} r={7}/><Knob x={63} y={20} r={7}/><Label x="20" y="35" className="tiny">DISPLAY MODE</Label><Label x="62" y="35" className="tiny">{range} NM</Label><Knob x={23} y={42} r={5} dark/><g onClick={onRangeChange} style={{cursor:'pointer'}} role="button" tabIndex={0} aria-label={`Change radar range, currently ${range} nautical miles`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ') onRangeChange();}}><Knob implemented x={61} y={42} r={5} dark/><circle cx="61" cy="42" r="8" fill="transparent"/></g>{[['map','MAP'],['terrain','TERR'],['weather','WXR'],['tcas','TCAS'],['airport','APT']].map(([value,label],i)=><g key={value} onClick={()=>onModeChange(value)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ') onModeChange(value);}} role="button" tabIndex={0} aria-label={`${label} radar mode`} aria-pressed={mode===value} style={{cursor:'pointer'}}><Push implemented x={2+i*16} y={49} w={16} h={6} label={label} lit={mode===value}/><rect x={2+i*16} y="49" width="16" height="6" fill="transparent"/></g>)}</Plate>; }
function MCPAction({ x, y, w = 25, h = 10, label, active, onActivate }) {
  return <g onClick={onActivate} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onActivate(); }} role="button" tabIndex={0} aria-label={label} aria-pressed={active} style={{ cursor: 'pointer' }}>
    <Push implemented x={x} y={y} w={w} h={h} label={label} lit={active}/>
    <path d={`M${x + 2} ${y + 2}H${x + w - 2}`} stroke="#d2d6d1" strokeWidth=".6" opacity=".7"/>
    <path d={`M${x + 2} ${y + h - 1}H${x + w - 2}`} stroke="#080b0d" strokeWidth="1"/>
    <rect x={x} y={y} width={w} height={h} fill="transparent"/>
  </g>;
}
function MCP() {
  const data = useInstrumentData();
  const [channel, setChannel] = useState('A');
  const targets = replicaTargets(data);
  const action = data.onAutopilotAction;
  const entries = [
    ['IAS/MACH', targets.ias, 'ias', 77],
    ['HEADING', String(Math.round(targets.heading)).padStart(3, '0'), 'heading', 150],
    ['ALTITUDE', String(Math.round(targets.altitude)).padStart(5, '0'), 'altitude', 229],
    ['VERT SPEED', Math.round(targets.vs), 'vs', 303]
  ];
  const mode = data.autopilotMode || 'HDG';
  const activateChannel = (kind, letter) => {
    if (data.autopilot && channel === letter && (data.couplingMode || 'CMD') === kind) {
      action?.('toggle-autopilot');
      return;
    }
    setChannel(letter);
    action?.('set-autopilot-coupling', kind);
    if (!data.autopilot) action?.('toggle-autopilot');
  };
  return <Plate x={408} y={45} w={355} h={64}>
    <Label x="24" y="8" className="tiny">F/D</Label>
    <g onClick={() => action?.('toggle-flight-director')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action?.('toggle-flight-director'); } }} role="switch" tabIndex={0} aria-label={data.labels?.flightDirector || "Flight director"} aria-checked={Boolean(data.flightDirector?.enabled)} style={{ cursor: 'pointer' }}>
      <Toggle x={24} y={30} implemented up={Boolean(data.flightDirector?.enabled)}/><circle cx="42" cy="30" r="2.5" fill={data.flightDirector?.enabled ? '#57ef68' : '#242a2b'}/><rect x="11" y="15" width="38" height="27" fill="transparent"/>
    </g>
    {entries.map(([label, value, field, x]) => <g key={field}>
      <Label x={x} y="8" className="tiny">{label}</Label>
      <rect x={x - 24} y="11" width="48" height="12" fill="#111817" stroke="#828c89" strokeWidth=".4"/>
      <Label x={x} y="21" className="digits">{value}</Label>
      <ReplicaAutopilotDial x={x} y={37} r={field === 'altitude' ? 8 : 7} field={field} targets={targets} onChange={next => action?.('set-autopilot-targets', next)}/>
    </g>)}
    <MCPAction x={7} y={49} w={30} label="HDG SEL" active={mode === 'HDG'} onActivate={() => action?.('set-autopilot-mode', 'HDG')}/>
    <MCPAction x={43} y={49} w={25} label="LNAV" active={mode === 'LNAV'} onActivate={() => action?.('set-autopilot-mode', 'LNAV')}/>
    <MCPAction x={74} y={49} w={25} label="APP" active={mode === 'ILS'} onActivate={() => action?.('set-autopilot-mode', 'ILS')}/>
    <MCPAction x={105} y={49} w={26} label="VNAV" active={data.vnavArmed} onActivate={() => action?.('toggle-vnav')}/>
    <MCPAction x={145} y={49} w={25} label="A/T" active={data.autothrottleArmed} onActivate={() => action?.('toggle-autothrottle-arm')}/>
    <MCPAction x={224} y={43} w={25} label="CMD A" active={data.autopilot && (data.couplingMode || 'CMD') === 'CMD' && channel === 'A'} onActivate={() => activateChannel('CMD', 'A')}/>
    <MCPAction x={253} y={43} w={25} label="CMD B" active={data.autopilot && (data.couplingMode || 'CMD') === 'CMD' && channel === 'B'} onActivate={() => activateChannel('CMD', 'B')}/>
    <MCPAction x={224} y={54} w={25} label="CWS A" active={data.autopilot && data.couplingMode === 'CWS' && channel === 'A'} onActivate={() => activateChannel('CWS', 'A')}/>
    <MCPAction x={253} y={54} w={25} label="CWS B" active={data.autopilot && data.couplingMode === 'CWS' && channel === 'B'} onActivate={() => activateChannel('CWS', 'B')}/>
  </Plate>;
}
function CDU({ x }) { const keys='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';return <Plate x={x} y={426} w={110} h={165}><rect x="13" y="10" width="84" height="64" rx="2" fill="#07160e" stroke="#191e20"/><Label className="screen" x="55" y="20" style={{fill:'#64bf74',fontSize:6}}>CDU · INOP</Label>{['USE FLIGHT COMPUTER','','','','',''].map((t,i)=><Label className="screen" key={i} x="55" y={29+i*8} style={{fill:'#64bf74',fontSize:5}}>{t}</Label>)}{seq(6).map(i=><g key={i}><Push x={3} y={19+i*9} w={7} h={5}/><Push x={100} y={19+i*9} w={7} h={5}/></g>)}{['INIT REF','RTE','CLB','CRZ','DES','MENU','LEGS','DEP ARR','HOLD','PROG','EXEC','N1 LIMIT'].map((t,i)=><Push key={t} x={5+i%6*17} y={80+Math.floor(i/6)*12} w={15} h={9} label={t}/>)}{[...keys].map((t,i)=><Push key={t} x={6+i%6*16.5} y={107+Math.floor(i/6)*8.5} w={13} h={7} label={t}/>)}</Plate>; }
function LandingGear() {
  const d = useInstrumentData();
  const leverY = d.gearDown === false ? 43 : 103;
  const toggle = () => d.onAutopilotAction?.('gear', !d.gearDown);
  return <Plate x={691} y={263} w={45} h={131}><g role="button" tabIndex={0} aria-label="Toggle landing gear" onClick={toggle} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }} style={{cursor:'pointer'}}><Label x="23" y="12">GEAR</Label><Label x="9" y="31" className="tiny">UP</Label><Label x="9" y="105" className="tiny">DN</Label><rect x="24" y="24" width="9" height="86" rx="4" fill="#1c2428"/><path d={`M29 ${leverY}v-18l10-7`} fill="none" stroke="#b0b4ad" strokeWidth="7"/><ellipse cx="39" cy={leverY-25} rx="8" ry="14" fill="#d4d5c9" stroke="#383d3d"/><rect width="45" height="131" fill="transparent"/></g></Plate>;
}
function LowerControls({ x, right=false }) {
  const data = useInstrumentData();
  const controls = ['panel', 'background', 'flood'];
  return <Plate x={x} y={423} w={274} h={68}>
    <Knob x={30} y={34} r={21}/><circle cx="30" cy="34" r="10" fill="#12191d"/>
    {['MAIN PANEL','BACKGROUND','AFDS FLOOD','OUTBD DU','INBD DU'].map((label,i) => <g key={label}>
      <Label x={82+i*40} y="12" className="tiny">{label}</Label>
      {controls[i] ? <ReplicaLightingControl label={`${right ? 'FO' : 'Captain'} ${label} lighting`} control={controls[i]} lighting={data.lighting} onAction={data.onAutopilotAction}>
        <Knob implemented x={82+i*40} y={29} r={7} angle={data.lighting?.[controls[i]] ? 45 : -45}/>
        <rect x={70+i*40} y="17" width="24" height="25" fill="transparent"/>
      </ReplicaLightingControl> : <Knob x={82+i*40} y={29} r={7}/>}
      {controls[i] ? <ReplicaLightingControl label={`${right ? 'FO' : 'Captain'} ${label} light switch`} control={controls[i]} lighting={data.lighting} onAction={data.onAutopilotAction}>
        <g transform={`translate(${82+i*40} 54)`}>
          <circle r="4" fill="#1a2021" stroke="#b9babb"/>
          <path d={data.lighting?.[controls[i]] ? 'M0 1 2-7' : 'M0 -1 2 7'} stroke="#ddd" strokeWidth="3" strokeLinecap="round"/>
          <rect x="-12" y="-10" width="24" height="20" fill="transparent"/>
        </g>
      </ReplicaLightingControl> : <Toggle x={82+i*40} y={54}/>}
    </g>)}
    <Label x="29" y="63" className="tiny">{right?'FO':'CAPT'} AIR</Label>
  </Plate>;
}
export function Replica({ className = 'replica', instrumentData }) { const [radarMode,setRadarMode]=useState('map'); const [radarRange,setRadarRange]=useState(40); const ranges=[5,10,20,40,80,160,320]; const displayData={...(instrumentData||{}),radarMode,radarRange}; const cycleRange=()=>setRadarRange(current=>ranges[(ranges.indexOf(current)+1)%ranges.length]); return <InstrumentDataContext.Provider value={displayData}><svg className={className} viewBox="0 0 1200 620" role="img" aria-label="Boeing 737 main instrument panel"><defs><linearGradient id="metal" x2="0" y2="1"><stop stopColor="#788286"/><stop offset="1" stopColor="#5c666c"/></linearGradient><radialGradient id="knob" cx="35%" cy="25%"><stop stopColor="#e0e0d4"/><stop offset=".65" stopColor="#a5aaa6"/><stop offset="1" stopColor="#5d6364"/></radialGradient><radialGradient id="blackKnob" cx="35%" cy="25%"><stop stopColor="#6d7272"/><stop offset="1" stopColor="#22282b"/></radialGradient></defs>
<path d="M203 82 304 39H896L997 82 900 115H300z" fill="#13191b" stroke="#384044" strokeWidth="3"/>
<EFIS x={318} mode={radarMode} onModeChange={setRadarMode} range={radarRange} onRangeChange={cycleRange}/><MCP/><EFIS x={768} mode={radarMode} onModeChange={setRadarMode} range={radarRange} onRangeChange={cycleRange}/>{[250,863].map((x,i)=><g key={x}><ReplicaAlertButton x={x} y={64} w={22} label="FIRE|WARN" group="fire" data={instrumentData}/><ReplicaAlertButton x={x+26} y={64} w={25} label="MASTER|CAUTION" group="caution" data={instrumentData}/><B737SystemAnnunciators x={x} data={instrumentData} firstOfficer={!!i}/><Label x={x+25} y="60" className="tiny">{i?'FO':'CAPT'}</Label></g>)}
<path d="M42 205 270 126 498 118H702L930 126 1158 205V416H42z" fill="url(#metal)" stroke="#252c30" strokeWidth="3"/>
<path d="M475 126v289m239-288v288M43 416h1114" stroke="#333e43" strokeWidth="2"/>
<LivePFD x={129} y={258}/><LiveND x={281} y={258}/><LiveND x={773} y={258}/><LivePFD x={925} y={258}/><EngineDisplay x={529} y={258}/><Live737Engine data={instrumentData}/>
<Dial x={79} y={289} r={24}/><Dial x={1118} y={289} r={24}/><Dial x={482} y={232} r={23} type="attitude"/><Dial x={482} y={303} r={23} type="speed"/><Dial x={482} y={374} r={23} type="alt"/>
<Plate x={532} y={169} w={111} h={74}>{['N1 SET','SPD REF','AUTO BRAKE'].map((t,i)=><g key={t}><Label x={19+i*36} y="12" className="tiny">{t}</Label><Knob x={19+i*36} y={28} r={8}/></g>)}<Toggle x={21} y={55} label="FUEL FLOW"/><Knob x={63} y={54} r={6}/><Push x={83} y={46} label="RESET"/></Plate>
<Dial x={674} y={205} r={17} type="flaps"/><Label x="674" y="180" className="tiny">FLAPS</Label>
<Plate x={697} y={184} w={31} h={74}>{['LEFT','NOSE','RIGHT'].map((t,i)=><g key={t}><rect x={5+i%2*13} y={13+Math.floor(i/2)*17} width="9" height="10" fill="#173c22"/><Label x="15" y={58+i*5} className="tiny">{t}</Label></g>)}</Plate>
<LandingGear/>
{[143,880].map(x=><g key={x}><Plate x={x} y={209} w={94} h={25}><Toggle x={24} y={15} label="MAIN PANEL DU"/><Toggle x={69} y={15} label="LOWER DU"/></Plate><rect x={x-37} y="216" width="19" height="12" fill="#313d2b"/></g>)}
{[337,800].map(x=><Plate key={x} x={x} y={169} w={59} h={26}>{seq(6).map(i=><Push key={i} x={7+i%3*16} y={5+Math.floor(i/3)*10} w={12} h={7}/>)}</Plate>)}<Plate x={414} y={164} w={25} h={28}><Knob x={12} y={14} r={7} dark/></Plate><Label x="482" y="153">BRAKE PRESS</Label><Knob x={482} y={167} r={10} dark/>
<LowerControls x={42}/><LowerControls x={884} right/><Plate x={319} y={423} w={93} h={68}><Label x="46" y="13">DISPLAY SELECT</Label><Knob x={24} y={34} r={9}/><Knob x={68} y={34} r={9}/><Toggle x={46} y={55}/></Plate><Plate x={779} y={423} w={100} h={68}>{seq(4).map(i=><g key={i}><Label x={15+i*23} y="13" className="tiny">{['LE FLAPS','TRANSIT','EXT','TEST'][i]}</Label><Push x={6+i*23} y={23} w={19} h={32}/></g>)}</Plate>
<CDU x={410}/><EngineDisplay x={529} y={438} lower/><CDU x={678}/>
{[185,970].map(x=><Plate key={x} x={x} y={493} w={81} h={82}><rect x="18" y="12" width="45" height="25" fill="#20292d"/><Label x="40" y="27" className="tiny">MIC / AUDIO</Label><Knob x={21} y={52} r={9} dark/><Knob x={61} y={52} r={9} dark/>{seq(5).map(i=><Push key={i} x={7+i*14} y={69} w={11} h={7}/>)}</Plate>)}
{[[49,209],[1149,209],[52,407],[1148,407],[450,140],[745,148],[277,408],[919,408]].map(([x,y],i)=><Screw key={i} x={x} y={y}/>)}
</svg></InstrumentDataContext.Provider>; }
export default function App(){return <main><header><div><h1>Boeing 737 — static main panel replica</h1><p>Component-built instrument and control study · full panel · fixed reference proportions</p></div><a href="./main-panel-replicas.html">747 · 757 · A320 · 787 replicas ↗</a></header><figure><figcaption>RECONSTRUCTION · SVG / REACT COMPONENTS</figcaption><div className="panel-scroll"><Replica/></div></figure><figure className="reference"><figcaption>SUPPLIED REFERENCE · 737-MAIN-PNL.jpg</figcaption><img src="../src/data/737-MAIN-PNL.jpg" alt="Supplied Boeing 737 main panel reference"/></figure><p className="footer">Static prototype. Controls and indications are illustrative. Small labels obscured in the source are approximated.</p></main>;}
