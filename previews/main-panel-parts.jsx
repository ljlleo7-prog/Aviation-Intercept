import { createContext, useContext, useId } from 'react';

// Preview defaults are replaced by simulator values when these parts are used in game.
/* eslint-disable react/prop-types, react-refresh/only-export-components */
const seq = (n) => Array.from({ length: n }, (_, i) => i);
export const InstrumentDataContext = createContext({});
export const useInstrumentData = () => useContext(InstrumentDataContext);
const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
const whole = (value, fallback) => Math.round(number(value, fallback));
const heading = value => String(((whole(value, 273) % 360) + 360) % 360).padStart(3, '0');
const normalizedRoll = value => ((number(value, 0) + 180) % 360 + 360) % 360 - 180;
const coordinate = (point, axis) => Number(point?.[axis] ?? point?.position?.[axis] ?? point?.coordinates?.[axis === 'latitude' ? 1 : 0]);
const waypointName = point => point?.name || point?.ident || point?.label || point?.icao || 'WPT';
export function routeGeometry(data) {
  const latitude=number(data.latitude,NaN); const longitude=number(data.longitude,NaN);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)) return [];
  const radians=Math.PI/180; const rotation=number(data.heading,0)*radians; const range=40;
  const source=Array.isArray(data.navigationPath)&&data.navigationPath.length?data.navigationPath:data.waypoints;
  return (Array.isArray(source)?source:[]).map(point=>{const lat=coordinate(point,'latitude'); const lon=coordinate(point,'longitude'); if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null; const north=(lat-latitude)*60; const east=(lon-longitude)*60*Math.cos(latitude*radians); const right=east*Math.cos(rotation)-north*Math.sin(rotation); const forward=east*Math.sin(rotation)+north*Math.cos(rotation); return {x:60+right/range*78,y:105-forward/range*78,name:waypointName(point)};}).filter(point=>point&&point.x>-18&&point.x<138&&point.y>15&&point.y<116);
}
export function Label({ x, y, children, ...props }) { return <text x={x} y={y} textAnchor="middle" {...props}>{children}</text>; }
export function Screw({ x, y }) { return <g transform={`translate(${x} ${y})`}><circle r="2.3" fill="#292c2c" stroke="#919799" strokeWidth=".5" /><path d="M-1.3 1.3 1.3-1.3" stroke="#aaa" strokeWidth=".6" /></g>; }
export function Plate({ x, y, w, h, children }) { return <g transform={`translate(${x} ${y})`}><rect width={w} height={h} rx="3" fill="url(#metal)" stroke="#252c30" />{[[5,5],[w-5,5],[5,h-5],[w-5,h-5]].map(([a,b],i)=><Screw key={i} x={a} y={b} />)}{children}</g>; }
export function Knob({ x, y, r = 8, dark = false, angle = 0 }) { return <g transform={`translate(${x} ${y}) rotate(${angle})`}><circle r={r+2} fill="#252a2d" stroke="#949a9b" strokeWidth=".5" /><circle r={r} fill={dark?'url(#blackKnob)':'url(#knob)'} stroke="#171b1c" />{seq(12).map(i=><path key={i} d={`M0 ${-r+1}v2`} transform={`rotate(${i*30})`} stroke={dark?'#525758':'#b6bbba'} strokeWidth="1" />)}<path d={`M0 ${-r+2}v${r*.65}`} stroke={dark?'#e1e5df':'#343a3b'} strokeWidth="2" /></g>; }
export function Push({ x, y, w = 19, h = 13, label, lit = false }) { return <g transform={`translate(${x} ${y})`}><rect width={w} height={h} rx="1" fill="#242a2b" stroke="#a0a7a7" strokeWidth=".5" />{lit&&<rect x="3" y="2" width={w-6} height="2" fill="#6cd165" />}<Label x={w/2} y={h-3} className="tiny">{label}</Label></g>; }
export function Toggle({ x, y, label }) { return <g transform={`translate(${x} ${y})`}><Label x="0" y="-12" className="tiny">{label}</Label><circle r="4" fill="#1a2021" stroke="#b9babb" /><path d="M0 1 2-7" stroke="#ddd" strokeWidth="3" strokeLinecap="round" /></g>; }
export function Dial({ x, y, r=25, type='clock' }) {
  const ticks = type === 'flaps' ? ['UP','1','5','15','20','25','30'] : type === 'speed' ? ['60','100','150','200','250','300','350','400'] : type === 'alt' ? ['0','1','2','3','4','5','6','7','8','9'] : ['12','1','2','3','4','5','6','7','8','9','10','11'];
  return <g transform={`translate(${x} ${y})`}>
    <rect x={-r-4} y={-r-4} width={2*r+8} height={2*r+8} rx="4" fill="url(#metal)" stroke="#aaa98c" strokeWidth=".7"/>
    <circle r={r} fill="#101718" stroke="#333c39" strokeWidth="2"/>
    {type === 'attitude' ? <>
      <path d={`M${-r+2} 0a${r-2} ${r-2} 0 0 1 ${2*r-4} 0`} fill="#408da9"/>
      <path d={`M${-r+2} 0a${r-2} ${r-2} 0 0 0 ${2*r-4} 0`} fill="#836136"/>
      {[-10,-5,6,11].map(n=><path key={n} d={`M-7 ${n}h14`} stroke="white" strokeWidth=".5"/>)}
      <path d="M-16 1h11l5 4 5-4h11" fill="none" stroke="#f6cc49" strokeWidth="2"/>
    </> : <>
      {ticks.map((t,i)=>{ const angle=type==='flaps'?-125+i*250/(ticks.length-1):i*360/ticks.length; return <g key={t} transform={`rotate(${angle})`}>
        <path d={`M0 ${-r+3}v3`} stroke="#ddd" strokeWidth=".7"/>
        <text transform={`translate(0 ${-r+9}) rotate(${-angle})`} textAnchor="middle" style={{fontSize:type==='speed'?3:4}}>{t}</text>
      </g>;})}
      <path d={`M0 0 5 ${-r+8}`} stroke="white" strokeWidth="1.2"/>
      {type==='clock' && <path d="M0 0-9 6" stroke="white" strokeWidth="1.4"/>}
      <circle r="1.5" fill="#ddd"/>
      {type==='alt' && <rect x="-9" y="5" width="18" height="6" fill="#353c39"/>}
      <Label x="0" y={type==='alt'?10:12} className="tiny">{type==='clock'?'10:08':type==='speed'?'KNOTS':type==='flaps'?'FLAPS':'00400'}</Label>
    </>}
  </g>;
}
export function Screen({ x, y, size=139, children }) { return <g transform={`translate(${x} ${y})`}><rect width={size} height={size} rx="5" fill="#343a3d" stroke="#a3a9a9" strokeWidth="1" /><rect x="6" y="6" width={size-12} height={size-12} rx="4" fill="#080711" stroke="#101114" strokeWidth="3" />{[[4,4],[size-4,4],[4,size-4],[size-4,size-4]].map(([a,b],i)=><Screw key={i} x={a} y={b}/>)}<svg className="screen" x="10" y="10" width={size-20} height={size-20} viewBox="0 0 120 120" overflow="hidden">{children}</svg></g>; }
export function PFD({ x, y }) { const d=useInstrumentData(); const pitch=Math.max(-25,Math.min(25,number(d.pitch,2.5))); const roll=Math.max(-60,Math.min(60,number(d.roll,.5))); const ias=whole(d.ias,145); const alt=whole(d.altitude,4000); return <Screen x={x} y={y}><Label x="60" y="7" className="green">{d.fma || 'N1    LNAV    VNAV PTH'}</Label><path d="M40 0v12m40-12v12" stroke="#ddd" strokeWidth=".5" /><Label x="60" y="17" className="green">{d.autopilot ? 'CMD' : 'FD'}</Label><g transform={`rotate(${-roll} 59 55) translate(0 ${pitch*.75})`}><rect x="24" y="-20" width="69" height="75" fill="#2466b6" /><rect x="24" y="55" width="69" height="75" fill="#8e5428" /><path d="M24 55h69" stroke="white" />{[-20,-10,10,20].map((n,i)=><g key={n}><path d={`M${i%2?46:41} ${55+n}h${i%2?25:35}`} stroke="white" strokeWidth=".7"/><Label x="37" y={57+n} style={{fontSize:5}}>{Math.abs(n)}</Label></g>)}</g><path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#111" strokeWidth="4" fill="none"/><path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#fff" strokeWidth="1.2" fill="none"/><path d="M59 26v57M29 56h60" stroke="#e355eb" strokeWidth="1.5" /><path d="M37 32Q59 12 81 32" fill="none" stroke="white" strokeWidth=".7"/><path d="m59 21-3 5h6z" fill="white"/><rect x="3" y="25" width="18" height="65" fill="#333740"/><rect x="96" y="25" width="19" height="65" fill="#333740"/><path d="M1 50h17l5 6-5 6H1zM118 50H99l-6 6 6 6h19z" fill="#07090b" stroke="white" strokeWidth=".6"/><Label x="11" y="59">{ias}</Label><Label x="106" y="59">{String(Math.max(0,alt)).padStart(5,'0')}</Label><Label x="12" y="21" className="magenta">{whole(d.targetIas,ias)}</Label><Label x="103" y="21" className="magenta">{whole(d.targetAltitude,alt)}</Label><path d="M29 104q30-25 60 0" fill="none" stroke="white"/>{seq(7).map(i=><path key={i} d={`M${32+i*9} ${101-Math.sin(i/6*Math.PI)*10}v4`} stroke="white"/>)}<Label x="59" y="108">{heading(d.heading)}</Label><Label x="101" y="98" className="green">{number(d.baro,29.92).toFixed(2)}</Label><Label x="59" y="118" style={{fontSize:6}}>V/S {whole(d.verticalSpeed,0)} FPM</Label></Screen>; }
export function LivePFD({ x, y }) {
  const d=useInstrumentData(); const clipId=useId();
  const pitch=Math.max(-90,Math.min(90,number(d.pitch,0))); const roll=normalizedRoll(d.roll);
  const ias=whole(d.ias,145); const altitude=whole(d.altitude,4000);
  return <Screen x={x} y={y}><defs><clipPath id={clipId}><rect x="24" y="22" width="69" height="67"/></clipPath></defs><Label x="60" y="7" className="green">{d.fma || 'LNAV    VNAV PTH'}</Label><Label x="60" y="17" className="green">{d.autopilot?'CMD':'FD'}</Label><g clipPath={`url(#${clipId})`}><g transform={`rotate(${-roll} 58.5 55.5) translate(0 ${pitch*.72})`}><rect x="-70" y="-140" width="260" height="195" fill="#2466b6"/><rect x="-70" y="55" width="260" height="195" fill="#8e5428"/><path d="M-70 55h260" stroke="white" strokeWidth="1.2"/>{[-60,-40,-20,-10,0,10,20,40,60].map(value=><g key={value}><path d={`M${value?44:30} ${55+value}h${value?29:57}`} stroke="white" strokeWidth=".7"/><Label x="39" y={57+value} style={{fontSize:4}}>{Math.abs(value)}</Label><Label x="78" y={57+value} style={{fontSize:4}}>{Math.abs(value)}</Label></g>)}</g></g><path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#111" strokeWidth="4" fill="none"/><path d="M31 55h17v4m38-4H69v4M55 55h7" stroke="#fff" strokeWidth="1.2" fill="none"/><rect x="3" y="25" width="18" height="65" fill="#333740"/><rect x="96" y="25" width="19" height="65" fill="#333740"/><path d="M1 50h17l5 6-5 6H1zM118 50H99l-6 6 6 6h19z" fill="#07090b" stroke="white" strokeWidth=".6"/><Label x="11" y="59">{ias}</Label><Label x="106" y="59">{String(Math.max(0,altitude)).padStart(5,'0')}</Label><Label x="12" y="21" className="magenta">{whole(d.targetIas,ias)}</Label><Label x="103" y="21" className="magenta">{whole(d.targetAltitude,altitude)}</Label><path d="M29 104q30-25 60 0" fill="none" stroke="white"/><Label x="59" y="108">{heading(d.heading)}</Label><Label x="101" y="98" className="green">{number(d.baro,29.92).toFixed(2)}</Label><Label x="59" y="118" style={{fontSize:6}}>P {whole(d.pitch,0)}° R {whole(roll,0)}°</Label></Screen>;
}

export function ND({ x, y }) {
  const d=useInstrumentData(); const hdg=heading(d.heading); const waypoint=d.nextWaypoint || 'N/A'; const projectedRoute=routeGeometry(d); const route=projectedRoute.length?projectedRoute:[{x:-1000,y:-1000,name:''}];
  return <Screen x={x} y={y}><Label x="23" y="7" style={{fontSize:6}}>GS {whole(d.groundSpeed,142)} TAS {whole(d.trueAirspeed,148)}</Label><Label x="91" y="7" className="magenta">{waypoint} {number(d.distanceToWaypoint,8.2).toFixed(1)}NM</Label><Label x="60" y="17">{hdg} MAG</Label>{[35,65,88].map(r=><path key={r} d={`M${60-r} 106a${r} ${r} 0 0 1 ${r*2} 0`} fill="none" stroke="#b6a8bc" strokeWidth=".6" strokeDasharray={r===35?'3 4':undefined}/>)}{seq(13).map(i=><g key={i} transform={`translate(60 106) rotate(${-80+i*13.3})`}><path d="M0-88v5" stroke="white"/><Label x="0" y="-76" style={{fontSize:6}}>{(Math.round(number(d.heading,273)/10)-8+i+36)%36}</Label></g>)}{route.length>1&&<polyline points={`60,105 ${route.map(point=>`${point.x},${point.y}`).join(' ')}`} fill="none" stroke="#e652d9" strokeWidth="1.4"/>}{route.map((point,i)=><g key={`${point.name}-${i}`}><path d={`M${point.x} ${point.y-3}l3 3-3 3-3-3z`} fill="none" stroke="#e652d9"/><text x={point.x+4} y={point.y-3} className="magenta" style={{fontSize:5}}>{point.name}</text></g>)}{route.length===0&&<path d="M60 108 64 74 47 41 56 20" fill="none" stroke="#e652d9" strokeWidth="1.4"/>}<path d="m60 99-4 10 4-2 4 2z" fill="none" stroke="white"/><Label x="17" y="115" className="cyan">VOR 1</Label><Label x="101" y="115" className="cyan">VOR 2</Label></Screen>;
}
