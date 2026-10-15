// Physical key codes; edit this map to revise the default bindings.
export const flightKeyboardBindings = {
  KeyW: 'pitchDown', KeyS: 'pitchUp', KeyA: 'rollLeft', KeyD: 'rollRight',
  KeyQ: 'rudderLeft', KeyE: 'rudderRight', KeyB: 'brake',
  KeyG: 'gear', KeyF: 'flaps', KeyP: 'parkingBrake',
  Equal: 'throttleUp', Minus: 'throttleDown'
};

// Exponential response time constants: about 95% travel after three time constants.
export const flightKeyboardResponse = { pressSeconds: 0.22, releaseSeconds: 0.16 };

export const flightKeyboardHelp = 'Hold W/S: push/pull · A/D: roll · Q/E: rudder · B: brakes · G: gear · F/Shift+F: extend/retract flaps · +/−: throttle · P: parking brake';
