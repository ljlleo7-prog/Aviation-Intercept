import { test } from 'node:test';
import assert from 'node:assert/strict';
import EnginePhysicsService from '../src/services/EnginePhysicsService.js';
import { isReverseThrustCommand, commandedEngines, rotationDelta, spinTrim, thrustLeverCommand, thrustLeverPosition } from '../src/utils/pedestalControls.js';

test('forward travel cannot command reverse until the reverse handle is selected', () => {
  assert.equal(thrustLeverCommand(-1, false), 0);
  assert.equal(thrustLeverCommand(1, false), 1);
  assert.equal(thrustLeverCommand(1, true), -0.7);
  assert.equal(thrustLeverPosition(-0.35, true), 0.5);
  assert.equal(thrustLeverPosition(0.6, false), 0.6);
});

test('synchronized levers drive every engine; independent levers leave other engines alone', () => {
  const engines = Array.from({ length: 4 }, () => new EnginePhysicsService());
  for (const target of commandedEngines(2, 0.8, engines.length, true)) engines[target.index].setThrottle(target.command);
  assert.deepEqual(engines.map(engine => engine.state.throttleCommand), [0.8, 0.8, 0.8, 0.8]);
  for (const target of commandedEngines(2, 0.2, engines.length, false)) engines[target.index].setThrottle(target.command);
  assert.deepEqual(engines.map(engine => engine.state.throttleCommand), [0.8, 0.8, 0.2, 0.8]);
});

test('synchronized reverse drives capable engines and leaves engines without reversers at idle', () => {
  assert.deepEqual(commandedEngines(1, -0.7, 4, true, [false, true, true, false]), [
    { index: 0, command: 0 }, { index: 1, command: -0.7 }, { index: 2, command: -0.7 }, { index: 3, command: 0 },
  ]);
});

test('reverse lever command produces negative physical thrust and forward selection restores positive thrust', () => {
  const engine = new EnginePhysicsService();
  engine.setStartupState(false, false, true, true);
  const reverseCommand = thrustLeverCommand(1, true);
  engine.setThrottle(reverseCommand);
  for (let frame = 0; frame < 200; frame++) engine.update(0.05, reverseCommand, 0, 0, 1, 15);
  assert.ok(engine.state.thrust < -1000);
  const forwardCommand = thrustLeverCommand(0.6, false);
  engine.setThrottle(forwardCommand);
  for (let frame = 0; frame < 200; frame++) engine.update(0.05, forwardCommand, 0, 0, 1, 15);
  assert.ok(engine.state.thrust > 1000);
});

test('spinning trim preserves the original revolution ratio and reverses direction', () => {
  const oneTurn = spinTrim(0, 360);
  assert.ok(Math.abs(oneTurn * 0.2 - 0.01) < 1e-12);
  assert.ok(Math.abs(spinTrim(oneTurn, -360)) < 1e-12);
  assert.equal(spinTrim(0.99, 360), 1);
  assert.equal(spinTrim(-0.99, -360), -1);
});

test('trim dragging crosses the angle wrap without a sudden full-turn jump', () => {
  assert.equal(rotationDelta(179, -179), 2);
  assert.equal(rotationDelta(-179, 179), -2);
  let trim = 0;
  for (const [previous, current] of [[0, 90], [90, 179], [179, -90], [-90, 0]]) trim = spinTrim(trim, rotationDelta(previous, current));
  assert.ok(Math.abs(trim * 0.2 - 0.01) < 1e-12);
});


test('forward idle clears reverse while reverse idle retains the selected reversers', () => {
  assert.equal(isReverseThrustCommand(-0.7), true);
  assert.equal(isReverseThrustCommand(thrustLeverCommand(0, true)), true);
  assert.equal(isReverseThrustCommand(0), false);
  assert.equal(isReverseThrustCommand(0.01), false);
});
