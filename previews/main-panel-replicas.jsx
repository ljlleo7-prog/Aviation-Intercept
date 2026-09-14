/* eslint-disable react/prop-types */
import { InstrumentDataContext, useInstrumentData, routeGeometry, Label, Screw, Plate, Knob, Push, Toggle, Dial, LivePFD as PFD, ND } from './main-panel-parts.jsx';
import AdditionalPanel from './main-panel-additional-replicas.jsx';

const seq = n => Array.from({ length: n }, (_, i) => i);
const MODELS = {
  '747': { name: 'Boeing 747-400', image: '747-MAIN-PNL.jpg', color: '#c3a16f', shade: '#aa895d', height: 335, description: 'Five visible main displays, four-engine EICAS, analog standby column and center landing-gear controls.' },
  '757': { name: 'Boeing 757', image: '757-MAIN-PNL.jpg', color: '#ae9254', shade: '#8e743f', height: 365, description: 'Tall split flight displays, vertically stacked engine instruments, separate standby and radio instruments.' },
  '320': { name: 'Airbus A320', image: '320-MAIN-PNL.png', color: '#7293a4', shade: '#4d6c7d', height: 375, description: 'Airbus FCU and EFIS, circular attitude displays, two ECAM screens, ISIS, clock and folding tables.' },
  '787': { name: 'Boeing 787', image: '787-MAIN-PNL.jpg', color: '#81847b', shade: '#60655f', height: 310, description: 'Four wide display units, airport map, engine and system synoptics, central standby and gear column.' },
  '340': { name: 'Airbus A340', image: '340-MAIN-PNL.jpg', color: '#9aaeb6', shade: '#738d99', height: 375, description: 'Four-engine Airbus layout with paired flight displays, stacked ECAM and a center standby column.' },
  '350': { name: 'Airbus A350', image: '350-MAIN-PNL.jpeg', color: '#879da6', shade: '#627b87', height: 305, description: 'Wide flight and center displays, outboard information screens, and compact side control strips.' },
  '380': { name: 'Airbus A380', image: '380-FULL-PNL.jpg', color: '#879fae', shade: '#637e90', height: 500, description: 'Main-panel section: tall flight displays, four-engine warning display and three lower multifunction screens.' },
  '777': { name: 'Boeing 777', image: '777-MAIN-PNL.jpeg', color: '#bca170', shade: '#9c8050', height: 320, description: 'Paired flight displays around a compact EICAS, three standby instruments, and separate gear and flap controls.' },
};

function Definitions({ model }) {
  return <defs>
    <linearGradient id="metal" x2="0" y2="1"><stop stopColor={model.color}/><stop offset="1" stopColor={model.shade}/></linearGradient>
    <linearGradient id="lip" x2="0" y2="1"><stop stopColor="#55564d"/><stop offset=".5" stopColor="#30322d"/><stop offset="1" stopColor="#151c1e"/></linearGradient>
    <radialGradient id="knob" cx="35%" cy="25%"><stop stopColor="#e0e0d4"/><stop offset=".65" stopColor="#a5aaa6"/><stop offset="1" stopColor="#5d6364"/></radialGradient>
    <radialGradient id="blackKnob" cx="35%" cy="25%"><stop stopColor="#6d7272"/><stop offset="1" stopColor="#22282b"/></radialGradient>
    <pattern id="speaker" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#20292d"/><circle cx="1" cy="1" r=".7" fill="#090f12"/></pattern>
  </defs>;
}

function Display({ x, y, w, h = w, children, label, viewWidth=120, viewHeight=120 }) {
  const d=useInstrumentData();
  return <g transform={`translate(${x} ${y})`} data-component={label || 'display'}>
    <rect width={w} height={h} rx="4" fill="url(#metal)" stroke="#343a36" strokeWidth="1.5"/>
    <rect x="6" y="6" width={w-12} height={h-12} rx="3" fill="#080e10" stroke="#202522" strokeWidth="2"/>
    <svg x="9" y="9" width={w-18} height={h-18} viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="none" overflow="hidden" className="screen">{children}</svg>
    {label?.includes('navigation-display') && <RotatingCompassRim heading={d.heading} cx={w/2} cy={h*.91} radius={w*.69}/>} 
    {[[3,3],[w-3,3],[3,h-3],[w-3,h-3]].map(([a,b],i)=><Screw key={i} x={a} y={b}/>)}
  </g>;
}

function RotatingCompassRim({ heading=0, cx=69, cy=116, radius=88 }) {
  const normalized=((Number(heading)||0)%360+360)%360;
  return <g pointerEvents="none"><path d={`M${cx-radius} ${cy}a${radius} ${radius} 0 0 1 ${radius*2} 0`} fill="none" stroke="#080711" strokeWidth="13"/><g transform={`rotate(${-normalized} ${cx} ${cy})`}>{seq(36).map(i=>{const angle=i*10;return <g key={angle} transform={`rotate(${angle} ${cx} ${cy})`}><path d={`M${cx} ${cy-radius}v${i%3===0?7:4}`} stroke="#eef2ed" strokeWidth={i%3===0?1:.6}/>{i%3===0&&<text x={cx} y={cy-radius+13} textAnchor="middle" transform={`rotate(${-angle+normalized} ${cx} ${cy-radius+13})`} style={{fontSize:5,fill:'#eef2ed'}}>{angle/10}</text>}</g>;})}</g><path d={`m${cx} ${cy-radius-2}-4 7h8z`} fill="#f0d978"/></g>;
}

function FlightDisplay({ x,y,size=140,nav=false }) {
  const d=useInstrumentData();
  const Component = nav ? ND : PFD;
  return <g transform={`translate(${x} ${y}) scale(${size/139})`} data-component={nav?'navigation-display':'primary-flight-display'}><Component x={0} y={0}/>{nav&&<RotatingCompassRim heading={d.heading}/>}</g>;
}

function Annunciators({ x,y,cols=3,labels=['AP','AT','FMC','IRS','FUEL','ELEC'],w=15 }) {
  return <g transform={`translate(${x} ${y})`}>{labels.map((t,i)=><g key={t+i} transform={`translate(${i%cols*(w+3)} ${Math.floor(i/cols)*10})`}><rect width={w} height="7" fill="#222827" stroke="#aaa487" strokeWidth=".5"/><Label x={w/2} y="5" className="tiny" style={{fill:'#b2a67e'}}>{t}</Label></g>)}</g>;
}

function EFIS({ x,y,w=89,airbus=false }) {
  return <Plate x={x} y={y} w={w} h={62}>
    <Label x="20" y="8" className="tiny">{airbus?'QNH':'MINIMUMS'}</Label><Label x={w-20} y="8" className="tiny">{airbus?'RANGE':'BARO'}</Label>
    <Knob x={20} y={21} r={7}/><Knob x={w-20} y={21} r={7}/>
    <Label x="24" y="37" className="tiny">{airbus?'ROSE ARC PLAN':'APP VOR MAP PLN'}</Label><Label x={w-22} y="37" className="tiny">10 20 40 80</Label>
    <Knob x={25} y={46} r={6}/><Knob x={w-23} y={46} r={6}/>
    {['WXR','STA','WPT','ARPT','DATA'].map((t,i)=><Push key={t} x={4+i*(w-8)/5} y={55} w={(w-13)/5} h={5} label={t}/>)}
  </Plate>;
}

function BoeingMCP({ x=410,y=17,w=375,classic=false }) {
  const d=useInstrumentData();
  const speed=String(Math.round(d.targetIas ?? 250)); const hdg=String(Math.round(d.heading ?? 175)).padStart(3,'0'); const vs=String(Math.round(d.targetVerticalSpeed ?? 2000)); const alt=String(Math.round(d.targetAltitude ?? 3000)).padStart(5,'0');
  const entries = classic ? [['NAV','116.80'],['CRS','088'],['IAS/MACH',speed],['HDG',hdg],['VERT SPD',vs],['ALTITUDE',alt],['NAV','116.80'],['CRS','088']] : [['IAS/MACH',speed],['HDG',hdg],['VERT SPD',vs],['ALTITUDE',alt]];
  return <Plate x={x} y={y} w={w} h={62}>
    {entries.map(([t,v],i)=>{const a=10+i*(w-20)/entries.length;return <g key={i}><Label x={a+16} y="8" className="tiny">{t}</Label><rect x={a} y="12" width="34" height="11" rx="1" fill="#171b19"/><Label x={a+17} y="21" className="digits" style={{fontSize:9}}>{v}</Label><Knob x={a+17} y={37} r={6}/>{!classic?<><Push x={a+39} y={12} w={17} h={10} label={['LNAV','VNAV','V/S','HOLD'][i]} lit={i<2}/><Push x={a+39} y={25} w={17} h={10} label={['SPD','SEL','APP','CMD'][i]}/><Push x={a+39} y={38} w={17} h={9} label="SEL"/></>:<><Push x={a+36} y={12} w={10} h={8} label="SEL"/><Push x={a+36} y={23} w={10} h={8} label="HLD"/><Toggle x={a+39} y={41}/></>}</g>;})}
    {['A/T ARM','VNAV','LNAV','FLCH','HDG SEL','V/S','ALT HOLD','LOC','APP','CMD L','CMD C','CMD R'].map((t,i)=><Push key={t} x={7+i*(w-13)/12} y={51} w={(w-24)/12} h={7} label={t} lit={[1,2,9].includes(i)}/>)}
  </Plate>;
}

function SideLights({ x,y,count=5 }) {
  return <g transform={`translate(${x} ${y})`} data-component="side-lighting-controls">{seq(count).map(i=><g key={i}><Label x="0" y={i*29-10} className="tiny">{['PNL','FLOOD','MAP','OUTBD','INBD'][i]}</Label><Knob x={0} y={i*29} r={7}/></g>)}</g>;
}

function WarningWing({ x,y,flip=false }) {
  return <g transform={`translate(${x} ${y}) ${flip?'scale(-1 1)':''}`}><path d="M0 0 45-17 32 54-17 63z" fill="url(#metal)" stroke="#4c4d40"/>{[[10,5],[28,-2],[3,20],[21,13],[-3,36],[16,31]].map(([a,b],i)=><Knob key={i} x={a} y={b} r={3.5}/>)}</g>;
}

function Gear({ x,y,h=99 }) {
  const d=useInstrumentData();
  const leverY=d.gearDown === false ? 23 : h-16;
  return <g transform={`translate(${x} ${y})`} data-component="landing-gear-lever">
    <Label x="17" y="0" className="tiny">LANDING GEAR</Label><rect x="12" y="10" width="9" height={h-13} rx="4" fill="#272d2b" stroke="#b5b2a0"/>
    <Label x="3" y="20" className="tiny">UP</Label><Label x="0" y={h/2} className="tiny">OFF</Label><Label x="1" y={h-6} className="tiny">DN</Label>
    <path d={`M17 ${leverY}v-14l9-7`} stroke="#b9bbb0" strokeWidth="5" fill="none"/><ellipse cx="26" cy={leverY-21} rx="6" ry="12" fill="url(#knob)" stroke="#55594f"/>
  </g>;
}

function GaugeFace({ cx,cy,value,label,r=15,green=false,aspect=1 }) {
  return <g transform={`translate(${cx} ${cy}) scale(1 ${aspect}) translate(${-cx} ${-cy})`}><path d={`M${cx-r*.8} ${cy+r*.6}a${r} ${r} 0 1 1 ${r*1.6} 0`} fill="none" stroke={green?'#5adb73':'#d7ddd6'} strokeWidth=".7"/>
    {seq(5).map(i=><path key={i} d={`M0 ${-r}v2`} transform={`translate(${cx} ${cy}) rotate(${-100+i*50})`} stroke="#aab7ae" strokeWidth=".5"/>)}
    <path d={`M${cx} ${cy}l${r*.5} ${-r*.65}`} stroke={green?'#5adb73':'#ddd'} strokeWidth=".9"/><Label x={cx} y={cy+8} style={{fontSize:6}} className={green?'green':undefined}>{value}</Label><Label x={cx} y={cy-r-3} className="tiny">{label}</Label>
  </g>;
}

function WarningColumn({ x=82, y=18, align='left' }) {
  const rows = [['STATUS','cyan'], ['ENG 1 OIL FILTER','amber'], ['PACK L','amber'], ['APU GEN OFF','amber'], ['FUEL CONFIG','amber']];
  return <g data-component="engine-status-column">
    <path d={`M${align==='left'?x-5:x+35} ${y-8}v83`} stroke="#63726a" strokeWidth=".45"/>
    {rows.map(([text,tone],i)=><g key={text}>
      {i===0 && <path d={`M${x} ${y+3}h31`} stroke="#63726a" strokeWidth=".45"/>}
      <Label x={x+15} y={y+i*15} className={`${tone} tiny`}>{text}</Label>
    </g>)}
  </g>;
}

function FlapSlatColumn() {
  return <g data-component="747-flap-slat-indicator">
    <path d="M78 12v96" stroke="#63726a" strokeWidth=".45"/><Label x="98" y="18" className="green tiny">FLAPS</Label>
    {[1,2,3,4].map((engine,i)=><g key={engine}><Label x={86+i*9} y="29" className="tiny">{engine}</Label><path d={`M${86+i*9} 34v35`} stroke="#d5ddd5" strokeWidth="1.2"/><path d={`m${82+i*9} 58 4 5 4-5`} fill="none" stroke="#59da70" strokeWidth="1"/></g>)}
    <Label x="99" y="79" className="green tiny">SLATS EXT</Label><path d="M84 88h30M87 94h24M91 100h16" stroke="#59da70" strokeWidth="1"/><Label x="99" y="112" className="tiny">UP  1  5  10</Label>
  </g>;
}

function FourEngineEICAS() {
  const d=useInstrumentData();
  const rows=[d.engineN1,d.engineEGT,d.engineN2,d.engineFuelFlow];
  return <><Label x="31" y="7" className="green small">{d.flightPhase || 'CLB'} {Number(d.engineN1?.[0] ?? 98.4).toFixed(1)}</Label><Label x="94" y="7" className="green tiny">LIVE</Label>
    {['N1','EGT','N2','FF'].map((t,row)=><g key={t}><Label x="4" y={20+row*23} className="tiny">{t}</Label>{seq(4).map(i=><g key={i} transform={`translate(${10+i*17} ${14+row*23})`}><rect width="14" height="8" fill="none" stroke="#c0c7bf" strokeWidth=".5"/><Label x="7" y="6" style={{fontSize:4.6}}>{Number(rows[row]?.[i] ?? ['61.1','394','81.5','2.1'][row]).toFixed(row===1?0:1)}</Label><path d="M7 11v9m-3-9h6" stroke="#eee" strokeWidth="1.1"/><path d="M11 11v9" stroke="#687d6c" strokeWidth=".5"/></g>)}</g>)}
    <FlapSlatColumn/>
    <Label x="38" y="113" className="green tiny">TOTAL FUEL {Math.round(d.fuel ?? 82400)}</Label></>;
}

function TwinEngineEICAS({ lower=false,airbus=false,gaugeAspect=1, gaugeSide='left', showWarnings=true }) {
  const d=useInstrumentData();
  const gaugeXs = gaugeSide === 'right' ? [68,98] : [22,52];
  return <><Label x="60" y="7" className="green small">{lower?'SECONDARY ENGINE':'CLB       98.2'}</Label>
    {(lower?['N2','OIL PRESS','OIL TEMP']:['N1','EGT','N2']).map((t,row)=><g key={t}>{gaugeXs.map((a,i)=><GaugeFace key={a} cx={a} cy={26+row*30} r={10} label={i===0?t:''} value={Number((lower?[d.engineN2,[d.oilPressure,d.oilPressure],[91,91]]:[d.engineN1,d.engineEGT,d.engineN2])[row]?.[i] ?? (lower?['84.3','48','91']:['22.1','416','62.8'])[row]).toFixed(row===1&&!lower?0:1)} green={airbus} aspect={gaugeAspect}/>)}</g>)}
    {showWarnings && <WarningColumn x={gaugeSide==='right'?4:71} y={20} align={gaugeSide==='right'?'right':'left'}/>}
    <Label x={gaugeSide==='right'?84:36} y="116" className="green tiny">{lower?`HYD ${Math.round(d.hydraulicPressure ?? 3000)}`:`FUEL ${Math.round(d.fuel ?? 12800)} · FF ${Number(d.engineFuelFlow?.[0] ?? .6).toFixed(1)}`}</Label></>;
}

function ControlsStrip({ x,y,w=100 }) {
  return <Plate x={x} y={y} w={w} h={33}>{['DSPL','MINS','BARO'].map((t,i)=><g key={t}><Label x={17+i*(w-28)/3} y="8" className="tiny">{t}</Label><Knob x={17+i*(w-28)/3} y={21} r={6}/></g>)}</Plate>;
}

function Panel747() {
  return <>
    <path d="M13 143V100L123 20h167l17-10h584l18 10h167l111 80v43l-40-4v181H773v-23H429v23H54V139z" fill="url(#metal)" stroke="#454639" strokeWidth="2"/>
    <path d="M15 105 125 21h164l18-11h584l18 11h167l110 84-38-11-89-42H142L48 93z" fill="url(#lip)"/>
    <WarningWing x={28} y={91}/><WarningWing x={1172} y={91} flip/>
    <EFIS x={324} y={12}/><BoeingMCP x={417} y={12} w={365}/><EFIS x={786} y={12}/>
    {[160,450,523,672,744,1035].map(x=><path key={x} d={`M${x} 76v222`} stroke="#8a754f" strokeWidth=".8"/>)}
    <ControlsStrip x={270} y={88}/><ControlsStrip x={542} y={88} w={126}/><ControlsStrip x={862} y={88}/>
    <FlightDisplay x={165} y={127} size={138}/><FlightDisplay x={312} y={127} size={138} nav/>
    <Display x={531} y={126} w={140} h={140} label="four-engine-eicas"><FourEngineEICAS/></Display>
    <FlightDisplay x={744} y={127} size={138} nav/><FlightDisplay x={892} y={127} size={138}/>
    <Plate x={461} y={108} w={63} h={181}><Dial x={31} y={30} r={22} type="attitude"/><Dial x={31} y={88} r={22} type="speed"/><Dial x={31} y={146} r={22} type="alt"/></Plate>
    <Dial x={125} y={170} r={24}/><Dial x={125} y={231} r={23} type="speed"/><Dial x={1068} y={170} r={24}/>
    <SideLights x={73} y={157}/><SideLights x={1125} y={157}/>
    <Plate x={674} y={108} w={68} h={189}><Label x="34" y="10" className="tiny">AUTOBRAKES</Label><Knob x={48} y={27} r={10}/><Gear x={4} y={43} h={109}/><Annunciators x={40} y={54} cols={1} labels={['UP','OFF','DN','DOORS']} w={21}/><Push x={38} y={149} w={23} label="ALTN"/><Push x={38} y={166} w={23} label="FLAPS"/></Plate>
    <Plate x={314} y={271} w={99} h={40}><Push x={7} y={15} w={17} label="TEST"/><Knob x={47} y={22} r={10} dark/><Label x="76" y="14" className="tiny">CLOCK</Label></Plate>
    <Plate x={785} y={276} w={98} h={39}>{['GEAR','FLAPS','CONFIG'].map((t,i)=><Push key={t} x={5+i*30} y={15} w={26} h={18} label={t}/>)}</Plate>
    {[177,1003].map(x=><g key={x}><rect x={x} y="29" width="51" height="9" rx="3" fill="#161b19"/>{seq(5).map(i=><path key={i} d={`M${x+6+i*9} 30l-4 7`} stroke="#c0bbaa" strokeWidth="3"/>)}</g>)}
  </>;
}

function SplitFlight({ x,y,w=103,h=156 }) {
  return <Display x={x} y={y} w={w} h={h} label="split-attitude-and-hsi">
    <rect width="120" height="58" fill="#458cda"/><rect y="32" width="120" height="26" fill="#a16834"/>
    <Label x="60" y="6" className="green small">SPD   LNAV   ALT</Label><path d="M27 32h22v3m43-3H70v3" stroke="#f7d77b" strokeWidth="2" fill="none"/>
    {[-15,-8,7,14].map(n=><path key={n} d={`M46 ${32+n}h28`} stroke="white" strokeWidth=".6"/>)}
    <path d="M60 11v39M30 32h60" stroke="#ed6dee" strokeWidth="1"/>
    {[0,102].map(a=><g key={a}><rect x={a} y="13" width="18" height="43" fill="#686975"/>{seq(5).map(i=><Label key={i} x={a+9} y={20+i*8} className="small">{a?'0'+(80-i*20):180-i*10}</Label>)}</g>)}
    <rect y="59" width="120" height="61" fill="#080e10"/>
    <g transform={`translate(60 94) scale(1 ${(w-18)/(h-18)}) translate(-60 -94)`}>
    <circle cx="60" cy="94" r="37" fill="none" stroke="#c9d4d5" strokeWidth=".6"/>
    {seq(12).map(i=><g key={i} transform={`translate(60 94) rotate(${i*30})`}><path d="M0-37v3" stroke="#ddd" strokeWidth=".5"/><Label x="0" y="-28" className="tiny">{i*3}</Label></g>)}
    </g>
    <path d="M60 66v51m-4-23 4-6 4 6m-12 0h16" stroke="#ec72ed" fill="none" strokeWidth=".8"/><Label x="16" y="68" className="tiny">DME 8.2</Label><Label x="101" y="68" className="tiny">273 MAG</Label>
  </Display>;
}

function TallND({ x,y }) {
  return <Display x={x} y={y} w={108} h={156} label="757-navigation-display">
    <Label x="60" y="7" className="green small">TRK  273  MAG</Label><path d="M-9 43Q60-7 129 43" fill="none" stroke="#ddd" strokeWidth=".6"/>
    {seq(11).map(i=><g key={i} transform={`translate(60 107) rotate(${-50+i*10})`}><path d="M0-92v4" stroke="#ddd" strokeWidth=".5"/><Label x="0" y="-81" className="tiny">{22+i}</Label></g>)}
    <path d="M60 107V31" stroke="#ed70e7" strokeWidth=".8"/><path d="m60 102-4 7h8z" fill="none" stroke="#eee" strokeWidth=".7"/>
    <Label x="99" y="46" className="tiny">DAG</Label><Label x="19" y="114" className="green tiny">VOR L</Label><Label x="100" y="114" className="green tiny">VOR R</Label>
  </Display>;
}

function Panel757() {
  return <>
    <path d="M27 173 54 100 363 32H826l321 68 27 73v163H27z" fill="url(#metal)" stroke="#51482f" strokeWidth="3"/>
    <path d="m34 164 30-67 301-67h460l313 67 29 67-47-23-265-34H354L77 141z" fill="url(#lip)"/>
    <BoeingMCP x={367} y={36} w={466} classic/>
    <WarningWing x={65} y={113}/><WarningWing x={1139} y={113} flip/>
    <SplitFlight x={218} y={166}/><TallND x={326} y={166}/><TallND x={772} y={166}/><SplitFlight x={885} y={166}/>
    <Display x={549} y={142} w={104} h={96} label="757-upper-eicas"><TwinEngineEICAS gaugeAspect={86/78} gaugeSide="right"/></Display><Display x={549} y={241} w={104} h={93} label="757-lower-eicas"><TwinEngineEICAS lower gaugeAspect={86/75} gaugeSide="right"/></Display>
    <Plate x={442} y={143} w={101} h={191}><g transform="translate(4 8) scale(.36)"><PFD x={0} y={0}/></g><Annunciators x={59} y={10} cols={2} labels={['AP','AT','FMC','IRS','ELEC','HYD','FUEL','DOOR','ANTI ICE','ENG']} w={16}/><Push x={7} y={85} w={10} h={12} label="FD"/><Push x={7} y={102} w={10} label="G/S"/><rect x="41" y="91" width="46" height="42" fill="#232724" stroke="#b2a77c"/><Label x="64" y="101" className="tiny">110.20</Label><Label x="64" y="112" className="tiny">CRS 284</Label><Label x="64" y="123" className="tiny">DME 8.2</Label><Push x={7} y={140} label="TEST"/><Label x="65" y="152" className="tiny">INSTR SOURCE</Label><Knob x={62} y={169} r={11}/></Plate>
    <Plate x={658} y={143} w={108} h={191}><Toggle x={17} y={23} label="EICAS"/><Annunciators x={36} y={15} cols={3} labels={['L','NOSE','R','UP','GEAR','DN']} w={18}/><Gear x={63} y={53} h={102}/><Dial x={35} y={104} r={16} type="flaps"/><Knob x={32} y={144} r={10}/><Label x="32" y="130" className="tiny">AUTOBRAKES</Label><Annunciators x={11} y={167} cols={4} labels={['ALTN','FLAPS','ARM','TEST']} w={19}/></Plate>
    <SideLights x={65} y={226} count={2}/><SideLights x={1133} y={226} count={2}/>
    <Annunciators x={53} y={268} cols={1} labels={['GND','PROX','OVRD']} w={24}/><Annunciators x={1122} y={268} cols={1} labels={['GND','PROX','OVRD']} w={24}/>
    {[333,823].map(x=><g key={x}><Plate x={x} y={116} w={66} h={45}><Label x="33" y="9">C-DHKB</Label><Push x={18} y={22} w={31} label="MASTER" lit/></Plate><Push x={x-9} y={52} w={16} h={20} label="WARN"/></g>)}
    <Dial x={799} y={146} r={10}/>
    {[95,220,324,780,1000].map((x,i)=><rect key={x} x={x} y="327" width={i%2?99:104} height="5" rx="2" fill="#45483f" stroke="#d0c7a0" strokeWidth=".7"/>)}
  </>;
}

function AirbusFCU() {
  const d=useInstrumentData();
  const fcuValues=[['SPD',Math.round(d.targetIas ?? 100)],['HDG',String(Math.round(d.heading ?? 0)).padStart(3,'0')],['ALT',String(Math.round(d.targetAltitude ?? 100)).padStart(5,'0')],['V/S',Math.round(d.targetVerticalSpeed ?? 0)]];
  return <Plate x={377} y={23} w={447} h={66}>
    {[20,427].map(a=><g key={a}><rect x={a-13} y="12" width="26" height="11" fill="#151f24"/><Label x={a} y="21" className="digits">1013</Label><Knob x={a} y={40} r={8}/><Label x={a} y="58" className="tiny">QNH</Label></g>)}
    {[58,96,350,390].map((a,i)=><g key={a}><Label x={a} y="24" className="tiny">{i%2?'10 20 40 80':'ROSE ARC PLAN'}</Label><Knob x={a} y={38} r={9}/><Toggle x={a} y={56}/></g>)}
    {[46,338].map(a=><g key={a}>{['CSTR','WPT','VOR','NDB','ARPT'].map((t,i)=><Push key={t} x={a+i*12} y={8} w={11} h={7} label={t}/>)}</g>)}
    {fcuValues.map(([t,v],i)=><g key={t}><Label x={139+i*53} y="11" className="tiny">{t}</Label><rect x={121+i*53} y="16" width="39" height="12" fill="#182125"/><Label x={141+i*53} y="25" className="digits">{v}</Label><Knob x={140+i*53} y={44} r={9}/></g>)}
    {['AP1','AP2','A/THR','LOC','EXPED','APPR'].map((t,i)=><Push key={t} x={117+i*35} y={57} w={29} h={6} label={t}/>)}
  </Plate>;
}

function AirbusPFD({ x,y,size=115 }) {
  const d=useInstrumentData();
  const pitch=Math.max(-90,Math.min(90,Number(d.pitch ?? 0))); const roll=((Number(d.roll ?? 0)+180)%360+360)%360-180;
  return <Display x={x} y={y} w={size} label="airbus-primary-flight-display">
    <Label x="60" y="7" className="green small">{d.fma || 'THR CLB   CLB   NAV'}</Label><Label x="104" y="16" className="tiny">{d.autopilot ? 'AP 1' : '1 FD 2'}</Label>
    <svg x="22" y="25" width="77" height="70" viewBox="0 0 77 70"><defs><clipPath id={`airbus-attitude-${x}`}><circle cx="38.5" cy="35" r="34"/></clipPath></defs><g clipPath={`url(#airbus-attitude-${x})`}><g transform={`rotate(${-roll} 38.5 35) translate(0 ${pitch*.65})`}><rect x="-50" y="-100" width="177" height="135" fill="#168ed0"/><rect x="-50" y="35" width="177" height="135" fill="#a54529"/>{[-60,-40,-20,-10,0,10,20,40,60].map(n=><g key={n}><path d={`M${n?27:0} ${35+n}h${n?23:77}`} stroke="white" strokeWidth=".8"/><Label x="23" y={37+n} className="tiny">{Math.abs(n)}</Label></g>)}</g><path d="M38 12v45M12 35h53" stroke="#58e37e"/><path d="M9 36h17v4m43-4H51v4" fill="none" stroke="#e5db50" strokeWidth="2"/></g><path d="m38 1-3 5h6z" fill="#ffdc5b"/></svg>
    {[4,102].map(a=><g key={a}><rect x={a} y="29" width="13" height="61" fill="#646968"/>{seq(6).map(i=><Label key={i} x={a+6} y={36+i*10} className="tiny">{a===4?180-i*10:600-i*100}</Label>)}<rect x={a-1} y="54" width="15" height="11" fill="#111" stroke="#e3d969" strokeWidth=".6"/><Label x={a+6} y="62" className="small">{a===4?Math.round(d.ias ?? 145):Math.round(d.altitude ?? 100)}</Label></g>)}
    <rect x="29" y="105" width="62" height="10" fill="#454a47"/><Label x="60" y="112" className="small">26  27  28  29</Label><Label x="98" y="101" className="cyan tiny">QNH 1013</Label>
  </Display>;
}

function AirbusND({ x,y }) {
  const d=useInstrumentData(); const route=routeGeometry(d);
  return <Display x={x} y={y} w={115} label="airbus-navigation-display"><Label x="60" y="8" className="green tiny">GS {Math.round(d.groundSpeed ?? 0)} TAS {Math.round(d.trueAirspeed ?? 0)}</Label>{[33,57,81].map(r=><path key={r} d={`M${60-r} 100a${r} ${r} 0 0 1 ${r*2} 0`} fill="none" stroke="#c1c9c4" strokeWidth=".8" strokeDasharray="2 2"/>)}{seq(11).map(i=><g key={i} transform={`translate(60 100) rotate(${-70+i*14})`}><path d="M0-81v4" stroke="white" strokeWidth=".7"/><Label x="0" y="-71" className="tiny">{(Math.round((d.heading ?? 0)/10)-5+i+36)%36}</Label></g>)}{route.length>1&&<polyline points={`60,100 ${route.map(point=>`${point.x},${point.y}`).join(' ')}`} fill="none" stroke="#ef62e8" strokeWidth="1.3"/>}{route.map((point,i)=><g key={`${point.name}-${i}`}><circle cx={point.x} cy={point.y} r="2" fill="none" stroke="#ef62e8"/><text x={point.x+3} y={point.y-2} className="magenta" style={{fontSize:5}}>{point.name}</text></g>)}<path d="M60 94v13m-5-7h10" stroke="#f4cf83" strokeWidth="1.5"/><Label x="21" y="66" className="cyan tiny">80 NM</Label><Label x="105" y="114" className="green tiny">ADF2</Label></Display>;
}

function ECAM({ lower=false }) {
  const d=useInstrumentData();
  return lower ? <>
    <Label x="60" y="8" className="small">DOOR/OXY</Label><Label x="99" y="17" className="green tiny">OXY 1700 PSI</Label>
    <path d="M54 99V25q6-21 12 0v74zM54 52 30 67h24m12-15 24 15H66M54 87l-11 11h11m12-11 11 11H66" fill="none" stroke="#afbdad" strokeWidth=".8"/>
    {[27,48,70,89].map(y=><g key={y}>{[53,64].map(x=><rect key={x} x={x} y={y} width="3" height="5" fill="#132c22" stroke="#58d176" strokeWidth=".5"/>)}</g>)}
    <path d="M0 104h120m40 0v16m40-16v16" stroke="#bbc9b7" strokeWidth=".5"/><Label x="19" y="112" className="green tiny">TAT +21°C</Label><Label x="60" y="112" className="green tiny">11 H 20</Label><Label x="100" y="112" className="green tiny">GW 59.0</Label>
  </> : <>
    <Label x="99" y="8" className="cyan tiny">{d.flightPhase || 'CLB'}</Label>{[31,82].map((a,i)=><g key={a}><GaugeFace cx={a} cy={22} r={13} value={Number(d.engineN1?.[i] ?? 22.1).toFixed(1)} green/><GaugeFace cx={a} cy={47} r={12} value={Math.round(d.engineEGT?.[i] ?? 416)} green/><Label x={a} y="69" className="green small">{Number(d.engineN2?.[i] ?? 62.8).toFixed(1)}</Label><Label x={a} y="81" className="green small">{Number(d.engineFuelFlow?.[i] ?? .6).toFixed(1)}</Label></g>)}
    {['N1','EGT','N2','FF'].map((t,i)=><Label key={t} x="57" y={23+i*19} className="tiny">{t}</Label>)}
    <path d="M0 88h120m76 0v32" stroke="#b9c4b3" strokeWidth=".5"/><text x="3" y="96" className="green tiny">FOB: 6420 KG</text><text x="3" y="104" className="green tiny">SEAT BELTS</text><text x="3" y="112" className="green tiny">NO PORTABLE DEVICES</text><text x="80" y="99" className="green tiny">PARK BRK</text><text x="80" y="107" className="green tiny">APU AVAIL</text>
  </>;
}

function FoldingTable({ x }) {
  return <g transform={`translate(${x} 257)`} data-component="folding-table"><rect width="310" height="16" rx="3" fill="#1d292f" stroke="#81949a"/><rect x="17" y="4" width="276" height="6" fill="#111c22"/><path d="M3 17h90v39H0v-25zM217 17h90l4 14v25h-94z" fill="url(#metal)" stroke="#253c46" strokeWidth="2"/><path d="M94 18h120v48H94z" fill="#3b4d57" stroke="#17252d"/><path d="M154 18v48" stroke="#15232b"/><path d="M4 33h83m138 0h80" stroke="#a2bcc5" strokeWidth="3"/></g>;
}

function AirbusControls({ x }) {
  return <Plate x={x} y={146} w={60} h={65}><Label x="30" y="8" className="tiny">PFD / ND</Label><Knob x={13} y={24} r={7}/><Knob x={47} y={24} r={7}/><Knob x={13} y={51} r={7}/><Knob x={47} y={51} r={7}/><Knob x={30} y={39} r={5} dark/></Plate>;
}

function RadioPanel({ x }) {
  return <Plate x={x} y={314} w={95} h={54}><rect x="18" y="6" width="59" height="40" fill="#0c191f"/><path d="M18 33h59m-28 0v13" stroke="#787e72" strokeWidth=".5"/>{seq(4).map(i=><g key={i}><Push x={4} y={9+i*9} w={10} h={6}/><Push x={81} y={9+i*9} w={10} h={6}/></g>)}</Plate>;
}

function Panel320({ enginePage, lowerPage, widebody=false }) {
  return <>
    <path d="M12 85 427 9h346l415 76v59l-57 16 25 76 32 32v61h-96v-61H766v100H431V268H106v61H12v-60l34-35 29-74-63-16z" fill="url(#metal)" stroke="#233844" strokeWidth="3"/>
    <path d="M12 79 427 7h346l415 72v11L773 21H427L12 91zM12 131l363-33h453l360 33v14l-359-34H375L12 145z" fill="url(#lip)"/>
    <AirbusFCU/>
    {[135,830].map(x=><Plate key={x} x={x} y={67} w={233} h={37}><Push x={13} y={13} w={17} h={16}/><Knob x={83} y={21} r={6} dark/><Knob x={134} y={18} r={6} dark/><Push x={202} y={12} w={18} h={14}/></Plate>)}
    <AirbusControls x={105}/><AirbusControls x={1035}/>
    <AirbusPFD x={174} y={143}/><AirbusND x={294} y={143}/><AirbusND x={789} y={143}/><AirbusPFD x={909} y={143}/>
    <Display x={526} y={140} w={131} h={117} label="upper-ecam">{enginePage || <ECAM/>}</Display><Display x={526} y={261} w={131} h={107} label="lower-ecam">{lowerPage || <ECAM lower/>}</Display>
    {widebody ? <><AirbusPFD x={465} y={142} size={48}/><Dial x={489} y={216} r={20} type="alt"/><Dial x={489} y={272} r={20}/></> : <><AirbusPFD x={464} y={190} size={51}/><Plate x={463} y={245} w={51} h={62}/><Label x="485" y="161" className="tiny">D-AFBW | AG-LR</Label><Label x="486" y="175" className="tiny">LIMITATIONS</Label></>}
    <Plate x={668} y={140} w={77} h={44}><Label x="38" y="8" className="tiny">LDG GEAR</Label>{seq(3).map(i=><g key={i}><Push x={5+i*23} y={13} w={20} h={10} label="▼"/><Push x={5+i*23} y={28} w={20} h={10} label={['LO','MED','MAX'][i]}/></g>)}</Plate>
    <Plate x={670} y={191} w={53} h={52}><rect x="7" y="8" width="39" height="33" fill="#11222a"/><Label x="27" y="17" className="tiny">UTC</Label><Label x="27" y="29" className="digits">11:20</Label><Label x="27" y="38" className="tiny">CHR 00:00</Label><Knob x={7} y={44} r={3}/></Plate>
    <Gear x={674} y={257} h={53}/><Dial x={731} y={294} r={17} type="speed"/>
    <RadioPanel x={433}/><RadioPanel x={663}/><FoldingTable x={111}/><FoldingTable x={786}/>
    {[31,1146].map(x=><g key={x}><path d={`M${x} 274l16-13 19 11v31l-17 16-18-12z`} fill="url(#speaker)" stroke="#17262d"/><circle cx={x+15} cy="235" r="16" fill="url(#speaker)"/></g>)}
    {[119,406,794,1093].map(x=><Screw key={x} x={x} y={250}/>)}
  </>;
}

function AirportMap() {
  return <>
    <rect width="120" height="120" fill="#101715"/><Label x="60" y="7" className="green tiny">AIRPORT MAP     KSEA</Label>
    <g transform="rotate(32 60 65)">
      {[31,47,73].map(x=><g key={x}><rect x={x} y="14" width="6" height="94" fill="#59625d" stroke="#c7c8b7" strokeWidth=".6"/><path d={`M${x+3} 18v85`} stroke="white" strokeWidth=".4" strokeDasharray="3 3"/></g>)}
      {[27,40,60,78,91].map(y=><path key={y} d={`M22 ${y}h64`} stroke="#929c90" strokeWidth="2"/>)}
      <path d="M88 23v72H59V52h28M10 17v93h80M19 10v107" stroke="#808b7d" fill="none" strokeWidth="1.5"/>
      <path d="M62 30v19h22V26M63 60h22v22H63" stroke="#60d5dd" strokeWidth="2" fill="none"/>
      <path d="M63 34h9m-9 5h9m-9 5h9m12-10h-7m7 7h-7M63 65h9m-9 7h9m12-6h-7" stroke="#60d5dd" strokeWidth="1.3"/>
    </g>
    <path d="m61 64-3 7h6z" fill="#f4d96e"/><Label x="22" y="116" className="green tiny">RANGE 0.5</Label><Label x="99" y="116" className="cyan tiny">NORTH UP</Label>
  </>;
}

function WideFlight({ x }) {
  return <Display x={x} y={116} w={214} h={169} label="787-wide-flight-display">
    <rect width="35" height="120" fill="#242f2c"/><Label x="17" y="8" className="tiny">RADIO</Label><Label x="17" y="18" className="green tiny">VHF L</Label><Label x="17" y="27" className="tiny">124.850</Label><Label x="17" y="37" className="cyan tiny">STANDBY</Label><Label x="17" y="46" className="tiny">121.500</Label>
    <svg x="36" y="0" width="84" height="76" viewBox="10 10 119 119" preserveAspectRatio="none" overflow="hidden"><PFD x={0} y={0}/></svg>
    <svg x="36" y="77" width="84" height="43" viewBox="10 47 119 82" preserveAspectRatio="none" overflow="hidden"><ND x={0} y={0}/></svg>
  </Display>;
}

function SystemSynoptic() {
  return <>
    <Label x="62" y="9" className="small">FUEL</Label><Label x="62" y="18" className="green tiny">TOTAL FUEL  18.6</Label>
    {[22,60,99].map(x=><g key={x}><rect x={x-9} y="28" width="18" height="13" fill="none" stroke="#b6c5b4" strokeWidth=".7"/><Label x={x} y="36" className="cyan tiny">6.2</Label></g>)}
    <path d="M22 42v26h77V42M60 42v51M22 69v29m77-29v29M16 98h13m63 0h14" fill="none" stroke="#72b739" strokeWidth="1"/>
    {[22,60,99].map(x=><g key={x}><circle cx={x} cy="68" r="4" fill="#101715" stroke="#72b739" strokeWidth=".7"/><path d={`M${x} 64v8`} stroke="#72b739"/></g>)}
    <path d="M13 78h18v12H13zM89 78h18v12H89z" fill="none" stroke="#b7c5b3" strokeWidth=".7"/><Label x="60" y="112" className="green tiny">FUEL PUMPS ON</Label>
  </>;
}

function Panel787() {
  return <>
    <path d="m14 144 91-53L413 9h374l308 82 91 53v154H733v-10H466v10H14z" fill="url(#metal)" stroke="#383d36" strokeWidth="3"/>
    <path d="m14 144 91-53L413 9h374l308 82 91 53-32 18-85-58H131l-85 58z" fill="url(#lip)"/>
    <EFIS x={414} y={14} w={77}/><BoeingMCP x={495} y={14} w={275}/><EFIS x={774} y={14} w={77}/>
    <Push x={386} y={39} w={18} h={22} label="WARN"/><Push x={859} y={39} w={18} h={22} label="WARN"/>
    <WideFlight x={153}/><Display x={377} y={116} w={221} h={169} label="787-airport-map"><AirportMap/></Display>
    <Display x={668} y={116} w={220} h={169} label="787-engine-and-system-display"><svg width="53" height="120" viewBox="0 0 120 120" preserveAspectRatio="none"><TwinEngineEICAS gaugeAspect={53/120*202/151}/></svg><path d="M55 0v120" stroke="#586357" strokeWidth=".5"/><svg x="57" width="63" height="120" viewBox="0 0 120 120" preserveAspectRatio="none"><SystemSynoptic/></svg></Display>
    <WideFlight x={900}/>
    <Plate x={604} y={112} w={59} h={176}><g transform="translate(8 7) scale(.31)"><PFD x={0} y={0}/></g><Label x="29" y="62" className="tiny">STANDBY DISPLAY</Label><Gear x={6} y={77} h={66}/><Label x="34" y="149" className="tiny">AUTOBRAKE</Label><Knob x={33} y={162} r={9}/></Plate>
    <SideLights x={124} y={213} count={2}/><SideLights x={1142} y={213} count={2}/>
    {[34,1166].map((x,i)=><g key={x} transform={`translate(${x} 243) rotate(${i?20:-20})`}><Plate x={-15} y={-12} w={67} h={54}>{seq(6).map(n=><Knob key={n} x={n%3*21} y={Math.floor(n/3)*23} r={4}/>)}</Plate></g>)}
    {[116,1084].map((x,i)=><g key={x} transform={`translate(${x} 100) rotate(${i?25:-25})`}><rect x="-24" y="-10" width="65" height="22" rx="9" fill="url(#metal)" stroke="#353d35"/>{seq(3).map(n=><Knob key={n} x={-11+n*18} y={0} r={4}/>)}</g>)}
    <circle cx="30" cy="147" r="12" fill="url(#speaker)"/><circle cx="1170" cy="147" r="12" fill="url(#speaker)"/>
  </>;
}

const PANELS = { '747': Panel747, '757': Panel757, '320': Panel320, '787': Panel787 };
const PARTS = { Display, FlightDisplay, AirbusPFD, AirbusND, AirbusFCU, BoeingMCP, EFIS, Gear, GaugeFace, Panel320, ECAM, AirportMap, SystemSynoptic, FoldingTable, SideLights, Annunciators };

export function AircraftPanelGraphic({ modelKey, className = 'replica', instrumentData }) {
  const key = Object.hasOwn(MODELS, modelKey) ? modelKey : '747';
  const model = MODELS[key];
  const Panel = PANELS[key] || AdditionalPanel;
  return <InstrumentDataContext.Provider value={instrumentData || {}}><svg className={className} viewBox={`0 0 1200 ${model.height}`} role="img" aria-label={`${model.name} main instrument panel`}><Definitions model={model}/><Panel modelKey={key} parts={PARTS}/></svg></InstrumentDataContext.Provider>;
}

export default function App() {
  const requested = new URLSearchParams(window.location.search).get('model') || '747';
  const key = Object.hasOwn(MODELS,requested) ? requested : '747';
  const model = MODELS[key];
  return <main><header><div><h1>{model.name} — static main panel replica</h1><p>{model.description}</p></div><nav aria-label="Aircraft replicas"><a href="./737-main-panel-replica.html">737</a>{Object.entries(MODELS).map(([id,item])=><a key={id} href={`?model=${id}`} aria-current={id===key?'page':undefined}>{item.name.replace('Boeing ','').replace('Airbus ','').replace('-400','')}</a>)}</nav></header>
    <figure><figcaption>RECONSTRUCTION · STATIC SVG / REACT COMPONENTS</figcaption><div className="panel-scroll"><AircraftPanelGraphic modelKey={key}/></div></figure>
    <figure className="reference"><figcaption><span>SUPPLIED REFERENCE · {model.image}</span><a href={`../src/data/${model.image}`} target="_blank" rel="noreferrer">Open original ↗</a></figcaption>{key==='380' ? <><svg className="reference-crop" viewBox="50 1160 1574 630" role="img" aria-label="A380 main-panel portion of the supplied cockpit poster"><image href={`../src/data/${model.image}`} width="1674" height="2560"/></svg><details><summary>View full cockpit poster</summary><img src={`../src/data/${model.image}`} alt="A380 full cockpit reference poster"/></details></> : <img src={`../src/data/${model.image}`} alt={`${model.name} supplied main panel reference`}/>}</figure>
    <p className="footer">Static visual study. Instruments, controls and panel surfaces are drawn components. Indications and small labels obscured in the reference are approximated; controls are not connected to the simulation.</p>
  </main>;
}
