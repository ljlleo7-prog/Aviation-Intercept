/* eslint-disable react/prop-types */
import { Label, Plate, Knob, Push, Dial, Screw, useInstrumentData } from './main-panel-parts.jsx';

const seq = n => Array.from({ length:n }, (_,i) => i);

function EnginePage({ parts, count=4, tall=false }) {
  const d=useInstrumentData();
  const { GaugeFace } = parts;
  const columns = count===4 ? [17,45,73,101] : [29,66];
  return <g data-component={`${count}-engine-airbus-page`}>
    <Label x="60" y="7" className="cyan tiny">CLB       THR LIMIT  92.4%</Label>
    {columns.map((x,i)=><g key={x}>
      <Label x={x} y="16" className="tiny">{i+1}</Label>
      <GaugeFace cx={x} cy={28} r={count===4?10:13} value={Number(d.engineN1?.[i] ?? 22.1).toFixed(1)} green aspect={tall?110/158:113/99}/>
      <GaugeFace cx={x} cy={52} r={count===4?9:12} value={Math.round(d.engineEGT?.[i] ?? 416)} green aspect={tall?110/158:113/99}/>
      {!tall && <><Label x={x} y="71" className="green tiny">{Number(d.engineN2?.[i] ?? 62.8).toFixed(1)}</Label><Label x={x} y="81" className="green tiny">{Number(d.engineFuelFlow?.[i] ?? .6).toFixed(1)}</Label></>}
    </g>)}
    <path d={`M0 ${tall?67:88}h120`} stroke="#b4c5b4" strokeWidth=".5"/>
    <text x="3" y={tall?76:96} className="green tiny">SEAT BELTS</text><text x="3" y={tall?83:104} className="green tiny">NO PORTABLE DEVICES</text><text x="3" y={tall?90:112} className="green tiny">PARK BRK</text>
    <text x="84" y={tall?76:96} className="green tiny">APU AVAIL</text>
  </g>;
}

function FuelPage({ count=4 }) {
  const d=useInstrumentData();
  return <g data-component="fuel-system-page"><Label x="60" y="8" className="small">FUEL</Label><Label x="60" y="18" className="green tiny">TOTAL {Math.round(d.fuel ?? 42600)} KG</Label>
    {[20,45,75,100].map((x,i)=><g key={x}><rect x={x-8} y="28" width="16" height="20" fill="none" stroke="#bdc9bc" strokeWidth=".6"/><Label x={x} y="39" className="green tiny">{i%2?'12800':'8500'}</Label><path d={`M${x} 49v19`} stroke="#65d97d" strokeWidth=".8"/></g>)}
    <path d="M20 68h80M60 48v20" stroke="#65d97d" strokeWidth=".8"/>
    {seq(count).map(i=>{const x=20+i*80/(count-1);return <g key={i}><circle cx={x} cy="68" r="3" fill="#101a16" stroke="#65d97d" strokeWidth=".6"/><path d={`M${x} 72v23`} stroke="#65d97d"/><Label x={x} y="104" className="tiny">ENG {i+1}</Label></g>;})}
    <Label x="60" y="117" className="green tiny">FUEL TEMP +18°C</Label>
  </g>;
}

function Clock({ x,y,w=47 }) {
  return <Plate x={x} y={y} w={w} h={54}><rect x="5" y="6" width={w-10} height="40" rx="2" fill="#101d24"/><Label x={w/2} y="15" className="tiny">UTC</Label><Label x={w/2} y="27" className="digits" style={{fontSize:8}}>11:20:23</Label><Label x={w/2} y="40" className="tiny">ET 00:00</Label><Knob x={w-7} y={48} r={3}/></Plate>;
}

function ModernFlight({ parts,x,y,w=185,h=145,reverse=false }) {
  const { Display, AirbusPFD, AirbusND }=parts;
  return <Display x={x} y={y} w={w} h={h} viewWidth={w-18} viewHeight={h-18} label="combined-flight-display">
    <g transform={`translate(${reverse?(w-18)/2:0} 0) scale(${(w-18)/2/97})`}><svg width="97" height="97" viewBox="9 9 97 97" overflow="hidden"><AirbusPFD x={0} y={0}/></svg></g>
    <g transform={`translate(${reverse?0:(w-18)/2} 0) scale(${(w-18)/2/97})`}><svg width="97" height="97" viewBox="9 9 97 97" overflow="hidden"><AirbusND x={0} y={0}/></svg></g>
    <path d={`M${(w-18)/2} 0v${h-18}`} stroke="#657168" strokeWidth=".5"/>
    <path d={`M2 ${h-54}h${w-22}`} stroke="#819785" strokeWidth=".5"/>
    <Label x={(w-18)/4} y={h-43} className="green tiny">ILS 108.50</Label><Label x={(w-18)*.75} y={h-43} className="green tiny">DEST  18.2 NM</Label>
    <path d={`M${w*.54} ${h-28}h${w*.35}l-12-8-9 4-11-5-11 4z`} fill="#623b2b"/>
    <Label x={(w-18)/4} y={h-24} className="cyan tiny">QNH 1013</Label>
  </Display>;
}

function InformationPage({ map=false, parts }) {
  const { AirportMap }=parts;
  return <g data-component={map?'airport-information':'navigation-chart'}>
    {map ? <AirportMap/> : <><rect width="120" height="120" fill="#0c151a"/>{seq(9).map(i=><path key={i} d={`M${i*17-10} 0l${i%2?60:-35} 120M0 ${i*18}l120 -29`} stroke="#667065" strokeWidth=".5"/>)}<path d="M-3 88 22 61 49 73 64 41 91 47 120 14" fill="none" stroke="#42a9e7" strokeWidth="1.7"/>{[[22,61,'DAG'],[49,73,'HEC'],[91,47,'LAS']].map(([x,y,t])=><g key={t}><circle cx={x} cy={y} r="2" fill="#f1e39b"/><text x={x+3} y={y-3} className="tiny">{t}</text></g>)}</>}
    <rect width="120" height="10" fill="#263333"/><Label x="60" y="7" className="tiny">{map?'OIS  AIRPORT / CHARTS':'OIS  ENROUTE CHART'}</Label>
  </g>;
}

function ModernFCU({ parts,x=402,y=18,w=400 }) {
  const { AirbusFCU }=parts;
  return <g transform={`translate(${x} ${y}) scale(${w/447}) translate(-377 -23)`}><AirbusFCU/></g>;
}

function WingControls({ x, right=false }) {
  return <g transform={`translate(${x} 123) ${right?'scale(-1 1)':''}`}><path d="M0 0 54 15v104H0z" fill="url(#metal)" stroke="#405967"/>{[24,55,84].map(y=><Knob key={y} x={19} y={y} r={5}/>)}<rect x="37" y="39" width="8" height="17" fill="#202b30"/></g>;
}

function Panel350({ parts }) {
  const { Display, Gear, GaugeFace }=parts;
  return <>
    <path d="M64 70V43h314l26-25h392l26 25h314v27l51 54v135H13V124z" fill="url(#metal)" stroke="#304650" strokeWidth="2"/>
    <path d="M65 38h310l27-26h396l27 26h310v9H820l-26-26H407l-26 26H65zM65 80h1070v12H65z" fill="url(#lip)"/>
    <ModernFCU parts={parts} x={407} y={21} w={388}/>
    {[85,840].map(x=><Plate key={x} x={x} y={51} w={273} h={28}>{[18,60,155,190,225].map(a=><Knob key={a} x={a} y={15} r={4} dark/>)}<Push x={87} y={8} label="WARN"/><Push x={114} y={8} label="CAUT"/></Plate>)}
    <Display x={65} y={95} w={191} h={154} label="captain-ois"><InformationPage parts={parts} map/></Display>
    <ModernFlight parts={parts} x={270} y={95} w={190} h={154}/>
    <Display x={498} y={95} w={202} h={154} viewWidth={184} viewHeight={136} label="a350-engine-warning-display">
      <svg width="92" height="136" viewBox="0 0 120 160" overflow="hidden"><Label x="60" y="8" className="green tiny">CLB  92.4%</Label>{[26,77].map(x=><g key={x}><GaugeFace cx={x} cy={30} r={16} value="22.1" green/><GaugeFace cx={x} cy={65} r={14} value="416" green/>{['N2 62.8','FF 0.6','OIL 92'].map((t,i)=><Label key={t} x={x} y={95+i*20} className="green tiny">{t}</Label>)}</g>)}</svg>
      <path d="M94 0v136M94 38h90" stroke="#9ba99a" strokeWidth=".5"/><Label x="139" y="13" className="tiny">WARNING / MEMO</Label><text x="99" y="48" className="green tiny">SEAT BELTS</text><text x="99" y="57" className="green tiny">PARK BRK</text><text x="99" y="66" className="green tiny">APU AVAIL</text>
    </Display>
    <ModernFlight parts={parts} x={739} y={95} w={190} h={154} reverse/>
    <Display x={944} y={95} w={191} h={154} label="first-officer-ois"><InformationPage parts={parts}/></Display>
    <Plate x={465} y={96} w={27} h={152}><Label x="13" y="12" className="tiny">SOURCE</Label><Knob x={13} y={84} r={6}/><Knob x={13} y={119} r={6}/></Plate>
    <Plate x={704} y={96} w={30} h={152}><Push x={7} y={10} w={16} h={9} label="GEAR"/><Gear x={-2} y={50} h={91}/></Plate>
    <WingControls x={12}/><WingControls x={1188} right/>
    {[15,1060].map(x=><Plate key={x} x={x} y={261} w={124} h={34}><rect x="43" y="7" width="46" height="20" fill="url(#speaker)"/><Knob x={15} y={16} r={5}/><Push x={102} y={11} w={12} h={12}/></Plate>)}
    <path d="M149 262h317m311 0h272" stroke="#adbec4" strokeWidth="4"/>
  </>;
}

function TallAirbusDisplay({ parts,x,nav=false }) {
  const { Display, AirbusPFD, AirbusND }=parts;
  const Instrument = nav ? AirbusND : AirbusPFD;
  return <Display x={x} y={139} w={128} h={176} viewWidth={110} viewHeight={158} label={nav?'a380-navigation-display':'a380-primary-flight-display'}>
    <svg width="110" height="111" viewBox="9 9 97 97" overflow="hidden"><Instrument x={0} y={0}/></svg>
    <path d="M0 118h110" stroke="#a3b3a3" strokeWidth=".5"/>
    {nav?<><path d="M0 149h110v-8l-19-8-16 4-21-13-13 8-16-1z" fill="#725230"/><path d="M0 142h110M55 120v36" stroke="#51809a" strokeWidth=".6"/><Label x="56" y="155" className="cyan tiny">VERTICAL DISPLAY</Label></>:<><Label x="20" y="130" className="green tiny">ILS</Label><Label x="79" y="130" className="cyan tiny">108.50</Label><path d="M55 132v20m-20-10h40" stroke="#dab5d6"/><Label x="22" y="156" className="green tiny">QNH 1013</Label></>}
  </Display>;
}

function FlightManagementPage() {
  return <g data-component="flight-management-page"><rect width="120" height="10" fill="#34413e"/><Label x="60" y="7" className="tiny">ACTIVE / F-PLN</Label>
    {['ORIGIN  KSEA','RWY 16L','DAG     35000','HEC     35000','LAS     12000','DEST    KLAS'].map((t,i)=><g key={t}><text x="5" y={23+i*13} className="green small">{t}</text><path d={`M4 ${27+i*13}h111`} stroke="#33473b" strokeWidth=".4"/></g>)}
    <Label x="60" y="115" className="cyan tiny">INIT  PERF  F-PLN  DATA</Label>
  </g>;
}

function Panel380({ parts }) {
  const { Display, AirbusPFD, Gear, ECAM }=parts;
  return <>
    <path d="M16 92 340 75l50-37h420l50 37 324 17v41l-9-1v219H829v140H390V351H24V132l-8 1z" fill="url(#metal)" stroke="#314954" strokeWidth="2"/>
    <path d="M16 88 338 70l51-38h422l51 38 322 18v7L860 78l-50-39H392l-50 39L16 96z" fill="url(#lip)"/>
    <ModernFCU parts={parts} x={385} y={45} w={429}/>
    {[30,850].map(x=><Plate key={x} x={x} y={96} w={316} h={29}><Knob x={22} y={16} r={6}/><Push x={52} y={10} label="WARN"/><Label x="163" y="18" className="tiny">A380 — FLIGHT DECK</Label><Push x={275} y={10} label="CAUT"/></Plate>)}
    <TallAirbusDisplay parts={parts} x={128}/><TallAirbusDisplay parts={parts} x={265} nav/><TallAirbusDisplay parts={parts} x={806} nav/><TallAirbusDisplay parts={parts} x={943}/>
    <Display x={543} y={139} w={128} h={176} label="a380-four-engine-warning-display"><EnginePage parts={parts} tall/></Display>
    <Plate x={411} y={139} w={123} h={176}><Label x="24" y="13" className="tiny">SWITCHING</Label>{['ATT HDG','AIR DATA','FMS'].map((t,i)=><g key={t}><Label x="23" y={38+i*49} className="tiny">{t}</Label><Knob x={23} y={51+i*49} r={6}/></g>)}<AirbusPFD x={58} y={7} size={57}/><Dial x={86} y={102} r={24} type="alt"/><Push x={58} y={145} w={57} h={20} label="LDG GRAVITY"/></Plate>
    <Plate x={680} y={139} w={117} h={176}><Label x="40" y="11" className="tiny">LDG GEAR</Label>{seq(3).map(i=><Push key={i} x={8+i*22} y={20} w={20} label="▼"/>)}<Label x="30" y="49" className="tiny">AUTO BRK</Label><Knob x={57} y={61} r={8}/><Push x={86} y={45} w={21} label="BRK FAN"/><Push x={86} y={64} w={21} label="A/SKID"/><Gear x={16} y={97} h={71}/><Clock x={59} y={108} w={48}/><Dial x={92} y={17} r={13} type="flaps"/></Plate>
    {[40,1092].map(x=><Plate key={x} x={x} y={149} w={75} h={163}>{[0,1].map(row=><g key={row}>{[0,1,2].map(col=><Knob key={col} x={14+col*23} y={20+row*28} r={5}/>)}</g>)}<circle cx="37" cy="110" r="31" fill="url(#speaker)"/></Plate>)}
    {[32,817].map(x=><g key={x}><rect x={x} y="325" width="356" height="26" fill="#1b282d"/><path d={`M${x+5} 330h346`} stroke="#a4b6bd" strokeWidth="3"/><rect x={x+74} y="334" width="202" height="28" rx="3" fill="#29373e" stroke="#142129"/></g>)}
    <Display x={402} y={367} w={127} h={116} label="captain-multifunction-display"><FlightManagementPage/></Display><Display x={543} y={367} w={128} h={116} label="a380-system-display"><ECAM lower/></Display><Display x={684} y={367} w={128} h={116} label="first-officer-multifunction-display"><FlightManagementPage/></Display>
    {[36,1092].map(x=><Plate key={x} x={x} y={368} w={71} h={30}><Label x="35" y="10" className="tiny">CONSOLE LT</Label><Knob x={35} y={21} r={5}/></Plate>)}
  </>;
}

function BoeingEnginePage({ parts }) {
  const d=useInstrumentData();
  const { GaugeFace }=parts;
  return <g data-component="777-engine-warning-page"><Label x="42" y="8" className="green tiny">{d.flightPhase || 'CLB'} LIVE</Label>{[22,53].map((x,i)=><g key={x}><GaugeFace cx={x} cy={28} r={12} value={Number(d.engineN1?.[i] ?? 22.1).toFixed(1)}/><GaugeFace cx={x} cy={62} r={11} value={Math.round(d.engineEGT?.[i] ?? 416)}/></g>)}
    <Label x="37" y="89" className="green tiny">N2 {Number(d.engineN2?.[0] ?? 62.8).toFixed(1)} / {Number(d.engineN2?.[1] ?? 62.8).toFixed(1)}</Label><Label x="38" y="101" className="green tiny">FF {Number(d.engineFuelFlow?.[0] ?? .6).toFixed(1)} / {Number(d.engineFuelFlow?.[1] ?? .6).toFixed(1)}</Label>
    <text x="79" y="18" className="tiny">STATUS</text><Label x="92" y="79" className="green tiny">FLAPS {Math.round(d.flaps ?? 0)}</Label><path d="M87 85v23m10-23v23m-12-12h14" stroke="#b7cbb2" strokeWidth=".8"/><Label x="40" y="117" className="green tiny">FUEL {Math.round(d.fuel ?? 18600)}</Label>
  </g>;
}

function Panel777({ parts }) {
  const { Display, FlightDisplay, BoeingMCP, EFIS, Gear }=parts;
  return <>
    <path d="M67 130 343 17h514l276 113-17 14v145H745v-13H453v13H88V144z" fill="url(#metal)" stroke="#5c503a" strokeWidth="2"/>
    <path d="M64 128 341 11h518l276 117-12 14-266-116H344L76 142z" fill="url(#lip)"/>
    <EFIS x={352} y={25} w={86}/><BoeingMCP x={444} y={25} w={318}/><EFIS x={768} y={25} w={86}/>
    <FlightDisplay x={197} y={111} size={125}/><FlightDisplay x={333} y={111} size={125} nav/><FlightDisplay x={742} y={111} size={125} nav/><FlightDisplay x={878} y={111} size={125}/>
    <Display x={550} y={111} w={128} h={125} label="777-eicas"><BoeingEnginePage parts={parts}/></Display>
    <Plate x={475} y={110} w={61} h={151}><g transform="translate(5 5) scale(.44)"><FlightDisplay x={0} y={0} size={115}/></g><Dial x={30} y={80} r={20} type="speed"/><Dial x={30} y={129} r={20} type="alt"/></Plate>
    <Plate x={685} y={110} w={48} h={151}><Label x="24" y="11" className="tiny">GEAR</Label>{seq(3).map(i=><Push key={i} x={4+i*14} y={18} w={12} h={9} label="▼"/>)}<Gear x={7} y={37} h={88}/><Knob x={25} y={137} r={8}/></Plate>
    <Dial x={156} y={148} r={22}/><Dial x={1045} y={148} r={22}/>
    {[99,1078].map(x=><g key={x}>{['MAIN','LOWER','DSPL'].map((t,i)=><Push key={t} x={x} y={151+i*19} w={14} h={13} label={t}/>)}</g>)}
    {[32,1100].map((x,i)=><g key={x} transform={`translate(${x} 188) rotate(${i?16:-16})`}><Plate x={-21} y={-28} w={91} h={57}>{seq(6).map(n=><Knob key={n} x={15+n%3*27} y={15+Math.floor(n/3)*25} r={4}/>)}</Plate></g>)}
    {[141,1037].map((x,i)=><g key={x} transform={`translate(${x} 113) rotate(${i?22:-22})`}><Plate x={0} y={-19} w={49} h={21}><Knob x={13} y={-8+19} r={4}/><Knob x={36} y={11} r={4}/></Plate></g>)}
    {[265,826].map(x=><Plate key={x} x={x} y={247} w={150} h={37}><Knob x={26} y={21} r={9} dark/><Label x="68" y="11" className="tiny">DISPLAY SOURCE</Label><Knob x={98} y={22} r={6}/><Push x={128} y={14} w={15} label="TEST"/></Plate>)}
    <Label x="609" y="257" className="dark-ink">BOEING 777</Label>
    {[201,460,741,1003].map(x=><Screw key={x} x={x} y={243}/>)}
  </>;
}

export default function AdditionalPanel({ modelKey,parts }) {
  if(modelKey==='340') { const { Panel320 }=parts; return <Panel320 widebody enginePage={<EnginePage parts={parts}/>} lowerPage={<FuelPage/>}/>; }
  if(modelKey==='350') return <Panel350 parts={parts}/>;
  if(modelKey==='380') return <Panel380 parts={parts}/>;
  return <Panel777 parts={parts}/>;
}
