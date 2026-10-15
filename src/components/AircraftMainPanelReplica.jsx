import PropTypes from 'prop-types';
import { Children, useMemo } from 'react';
import { resolveICAO } from '../data/aircraft/index.js';
import { Replica as B737Replica } from '../../previews/737-main-panel-replica.jsx';
import { AircraftPanelGraphic } from '../../previews/main-panel-replicas.jsx';
import './AircraftMainPanelReplica.css';
import CockpitPilotControls from './CockpitPilotControls.jsx';

const PANEL_BY_ICAO = {
  B738: '737',
  B744: '747',
  B752: '757',
  B77W: '777',
  A320: '320',
  A333: '320',
  A346: '340',
  A359: '350',
  A388: '380',
};
const LEGACY_CENTRAL_PANELS = new Set(['737', '777', '320', '340']);

export default function AircraftMainPanelReplica({ aircraftModel, flightState, flightPlan, npcs = [], onAutopilotAction, children }) {
  const panelKey = PANEL_BY_ICAO[resolveICAO(aircraftModel)];
  const boeingControls = ['737', '747', '757', '777'].includes(panelKey);
  const legacyCentralPanel = Children.toArray(children)[2];
  const instrumentData = useMemo(() => ({
    ias: flightState?.indicatedAirspeed,
    trueAirspeed: flightState?.trueAirspeed,
    groundSpeed: flightState?.groundSpeed,
    altitude: flightState?.altitude,
    heading: flightState?.heading,
    pitch: flightState?.pitch,
    roll: flightState?.roll,
    verticalSpeed: flightState?.verticalSpeed,
    baro: flightState?.localQNH ?? flightState?.altimeter,
    engineN1: flightState?.engineN1,
    engineN2: flightState?.engineN2,
    engineEGT: flightState?.engineEGT,
    engineFuelFlow: flightState?.engineFuelFlow,
    fuel: flightState?.fuel,
    flaps: flightState?.flaps ?? flightState?.flapsValue,
    gearDown: flightState?.gearDown ?? flightState?.gearValue > 0.5,
    autopilot: flightState?.autopilot,
    autopilotMode: flightState?.autopilotMode,
    vnavArmed: flightState?.vnavArmed,
    autothrottleArmed: flightState?.autothrottleArmed,
    autopilotTargets: flightState?.autopilotTargets,
    onAutopilotAction,
    fma: flightState?.autopilotFma?.summary || flightState?.autopilotMode,
    targetIas: flightState?.autopilotTargets?.ias ?? flightState?.autopilotTargets?.speed,
    targetAltitude: flightState?.autopilotTargets?.altitude,
    targetVerticalSpeed: flightState?.autopilotTargets?.vs,
    targetHeading: flightState?.autopilotTargets?.heading,
    nextWaypoint: flightState?.nextWaypoint,
    distanceToWaypoint: flightState?.distanceToWaypoint,
    warnings: flightState?.activeWarnings,
    hydraulicPressure: flightState?.hydraulicPressure,
    oilPressure: flightState?.oilPressure,
    flightPhase: flightState?.flightPhase,
    latitude: flightState?.latitude,
    longitude: flightState?.longitude,
    currentWaypointIndex: flightState?.currentWaypointIndex,
    navigationPath: flightState?.navigationPath,
    npcs,
    waypoints: Array.isArray(flightPlan) ? flightPlan : flightPlan?.fms?.activePlan?.waypoints || flightPlan?.waypoints || [],
  }), [flightPlan, flightState, npcs, onAutopilotAction]);

  if (!panelKey) return <div className="main-panels">{children}</div>;

  return <section className={`aircraft-main-panel aircraft-main-panel-${panelKey} ${boeingControls ? 'has-boeing-controls' : ''}`} aria-label={`${aircraftModel || panelKey} main instrument panel`}>
    <div className="aircraft-main-panel-scroll">
      <div className={`aircraft-main-panel-stage aircraft-main-panel-stage-${panelKey}`}>
        {panelKey === '737' ? <B737Replica className="aircraft-panel-svg" instrumentData={instrumentData}/> : <AircraftPanelGraphic modelKey={panelKey} className="aircraft-panel-svg" instrumentData={instrumentData}/>} 
        {boeingControls && <CockpitPilotControls flightState={flightState} onAction={onAutopilotAction} overlay/>}
        {LEGACY_CENTRAL_PANELS.has(panelKey) && <div className="aircraft-main-panel-legacy-central">{legacyCentralPanel}</div>}
      </div>
    </div>
  </section>;
}

AircraftMainPanelReplica.propTypes = {
  aircraftModel: PropTypes.string,
  flightState: PropTypes.object,
  flightPlan: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  npcs: PropTypes.array,
  onAutopilotAction: PropTypes.func,
  children: PropTypes.node.isRequired,
};
