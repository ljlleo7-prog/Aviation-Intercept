const buildModeCell = (label, armed = false) => ({
  label: label || '---',
  armed: Boolean(armed)
});

class FMAService {
  buildStatus({ engaged, autopilotMode, autopilotDebug = {}, targets = {}, vnavArmed = false, vnavPathAvailable = false, autothrottleArmed = true }) {
    const mode = autopilotMode || 'HDG';
    const ils = autopilotDebug.ils || {};
    const altitudeMode = autopilotDebug.altitudeMode || 'idle';

    let lateralActive = buildModeCell('HDG SEL');
    let lateralArmed = buildModeCell('', false);
    let verticalActive = buildModeCell('VS');
    let verticalArmed = buildModeCell('', false);
    let thrustActive = buildModeCell('SPD');

    if (mode === 'LNAV') {
      lateralActive = buildModeCell('LNAV');
    } else if (mode === 'CWS') {
      lateralActive = buildModeCell('CWS R');
      verticalActive = buildModeCell('CWS P');
    } else if (mode === 'ILS') {
      lateralActive = buildModeCell(ils.locCaptured ? 'LOC' : 'LOC ARM');
      lateralArmed = buildModeCell(ils.locCaptured ? '' : 'LOC', !ils.locCaptured);
      verticalActive = buildModeCell(ils.gsCaptured ? 'G/S' : 'G/S ARM');
      verticalArmed = buildModeCell(ils.gsCaptured ? '' : 'G/S', !ils.gsCaptured);
    }

    if (mode !== 'ILS' && (mode !== 'CWS' || vnavArmed)) {
      if (vnavArmed) {
        verticalActive = buildModeCell(vnavPathAvailable ? 'VNAV PTH' : 'VNAV ARM');
      } else if (altitudeMode === 'hold') {
        verticalActive = buildModeCell('ALT HOLD');
      } else if (altitudeMode === 'capture') {
        verticalActive = buildModeCell('ALT CAP');
        verticalArmed = buildModeCell('ALT', true);
      } else if (targets.altitude > 0) {
        verticalActive = buildModeCell('V/S');
        verticalArmed = buildModeCell('ALT', true);
      }
    }

    if (!engaged || !autothrottleArmed) {
      thrustActive = buildModeCell('A/T OFF');
    }

    return {
      ap: engaged ? 'AP' : 'FD',
      autothrottle: engaged && autothrottleArmed ? 'A/T' : 'OFF',
      lateral: {
        active: lateralActive,
        armed: lateralArmed
      },
      vertical: {
        active: verticalActive,
        armed: verticalArmed
      },
      thrust: {
        active: thrustActive
      },
      reason: ils.message || autopilotDebug.lnavMessage || '',
      sourceMode: mode
    };
  }
}

export default FMAService;
