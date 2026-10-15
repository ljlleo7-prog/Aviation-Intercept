import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneManager, FlightPhases } from '../src/services/sceneManager.js';
import eventBus, { EventTypes } from '../src/services/eventBus.js';

function setup(t) {
  const manager = new SceneManager({
    id: 'continuous-flight-test', difficulty: 'rookie',
    phases: [
      { id: 'boarding', type: FlightPhases.BOARDING, durationSeconds: 1, physics: { mode: 'off' } },
      { id: 'takeoff', type: FlightPhases.TAKEOFF, durationSeconds: 1, physics: { mode: 'continuous', initialSpeed: 0, initialAltitude: 0 } }
    ]
  });
  t.after(() => {
    manager.unsubscribeClearance();
    manager.unsubscribeCommand();
    manager.unsubscribeFailureResolved();
  });
  const events = [];
  for (const type of [EventTypes.PHYSICS_INITIALIZE, EventTypes.PHASE_CHANGED, EventTypes.PHASE_COMPLETE]) {
    const unsubscribe = eventBus.subscribe(type, payload => events.push({ type, payload }));
    t.after(unsubscribe);
  }
  manager.start();
  events.length = 0;
  return { manager, events };
}

test('scene timeouts and manual advancement cannot reset a live flight', t => {
  const { manager, events } = setup(t);
  const flight = { position: { z: -3000 }, velocity: { u: 150, v: 0, w: 0 }, throttle: 0.8 };
  const original = structuredClone(flight);
  manager.update(7200, flight);
  manager.skipPhase();
  manager.nextPhase();
  manager.checkPhaseCompletion(7200, flight);
  manager.setPhaseInitialConditions(manager.scenario.phases[1], manager.currentPhase());
  assert.equal(manager.currentIndex, 0);
  assert.equal(manager.status, 'running');
  assert.equal(manager.completedPhases.size, 0);
  assert.equal(manager.userSkipped, false);
  assert.equal(manager.totalElapsed, 7200);
  assert.deepEqual(events, []);
  assert.deepEqual(flight, original);
});

test('physics stays active even when the narrative phase declares physics off', t => {
  const { manager } = setup(t);
  assert.equal(manager.physicsActive(), true);
  assert.equal(manager.getState().physicsActive, true);
});
