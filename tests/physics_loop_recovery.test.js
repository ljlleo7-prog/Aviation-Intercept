import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePhysicsLoop } from '../src/hooks/usePhysicsLoop.js';

test('HOLD recovery stops accelerated substeps immediately and leaves subsequent updates at 1x', () => {
  let updates = 0;
  let recovering = false;
  let loop;
  const service = { update: () => {
    updates++;
    return { hasCrashed: false, autopilotDebug: { altitudeRecoveryActive: recovering } };
  } };
  function Harness() {
    loop = usePhysicsLoop(service);
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  loop.setTimeScale(8);
  loop.updatePhysics();
  assert.equal(updates, 8, 'ordinary V/S must retain selected acceleration');
  recovering = true;
  loop.updatePhysics();
  assert.equal(updates, 9, 'recovery must stop remaining accelerated substeps');
  recovering = false;
  loop.updatePhysics();
  assert.equal(updates, 10, 'normal speed must persist after recovery');
});
