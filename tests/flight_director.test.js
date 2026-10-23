import test from 'node:test';
import assert from 'node:assert/strict';
import RealisticAutopilotService from '../src/services/RealisticAutopilotService.js';
import { getFlightDirectorBars } from '../src/utils/flightDirectorDisplay.js';
import { getIlsDisplayState } from '../src/utils/ilsDisplay.js';

const state = { airspeed: 210, verticalSpeed: 0, pitch: 0, roll: 0, heading: 90, track: 90, altitude: 5000, altitudeAGL: 4000, latitude: 34, longitude: -118, groundSpeed: 210 };
const controls = { throttle: .5, elevator: 0, aileron: 0, rudder: 0, trim: 0 };

test('FD alone computes live guidance without applying AP outputs, and defaults to CWS', () => {
  const ap = new RealisticAutopilotService();
  ap.setFlightDirectorEnabled(true);
  assert.equal(ap.update(state, controls, .05), null);
  assert.equal(ap.engaged, false);
  assert.equal(ap.mode, 'CWS');
  assert.equal(ap.debugState.targetPitch, 0);
  assert.equal(ap.debugState.targetRoll, 0);
  ap.setTargets({ mode: 'HDG', heading: 120, altitude: 8000, speed: 240 });
  ap.update(state, controls, .05);
  assert.ok(ap.debugState.targetRoll > 0);
  assert.ok(ap.debugState.targetPitch > 0);
  ap.setCouplingMode('CWS');
  assert.equal(ap.mode, 'CWS', 'CWS uses stability guidance for both autopilot and FD');
  ap.update(state, controls, .05);
  assert.equal(ap.targets.heading, 90);
  assert.equal(ap.targets.altitude, 5000);
  ap.setTargets({ mode: 'LNAV' });
  assert.equal(ap.couplingMode, 'CMD');
});

test('FD bars disappear when disabled, move toward commanded attitude, and remain within PFD', () => {
  assert.equal(getFlightDirectorBars({ enabled: false, targetPitch: 5, targetRoll: 10 }, 0, 0), null);
  const bars = getFlightDirectorBars({ enabled: true, targetPitch: 5, targetRoll: 10 }, 0, 0);
  assert.ok(bars.pitchOffset < 0);
  assert.ok(bars.rollOffset > 0);
  assert.deepEqual(getFlightDirectorBars({ enabled: true, targetPitch: 90, targetRoll: -90 }, 0, 0), { pitchOffset: -22, rollOffset: -24 });
});

test('ILS dots and diamonds follow the tuned signal independently of AP capture', () => {
  assert.deepEqual(getIlsDisplayState({}, false).visible, false);
  const lost = getIlsDisplayState({ active: false, locDeviationDeg: 0, gsDeviationDeg: 0 }, true);
  assert.equal(lost.visible, true);
  assert.equal(lost.localizerOffset, null);
  const live = getIlsDisplayState({ active: true, locDeviationDeg: 1.25, gsDeviationDeg: .35 }, false);
  assert.equal(live.localizerOffset, -.5);
  assert.equal(live.glideslopeOffset, .5);
});
