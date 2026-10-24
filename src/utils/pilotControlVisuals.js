const clamp = value => Math.max(-1, Math.min(1, value));
// Reverse useFlightControls' pilot-demand -> aerodynamic-deflection mapping.
export function pilotControlVisuals(controls, demand, mechanical) {
  if (!mechanical || !controls) return { ...demand };
  return {
    x: clamp((controls.roll ?? 0) / (0.3 * 30 * Math.PI / 180)),
    y: clamp(-(controls.pitch ?? 0) / (0.3 * 25 * Math.PI / 180)),
    rudder: clamp((controls.yaw ?? 0) / (30 * Math.PI / 180)),
    left: demand.left ?? 0, right: demand.right ?? 0
  };
}

// Compare against the DOM so React updates are respected between animation frames.
const setAttributeIfChanged = (node, name, value) => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};
const setTransformIfChanged = (node, value) => {
  if (node.style.transform !== value) node.style.transform = value;
};

export function paintPilotControls(root, visual, isAirbus) {
  if (!root) return;
  const { x, y, rudder } = visual;
  root.querySelectorAll('[data-control-grip]').forEach(node => {
    if (isAirbus) setTransformIfChanged(node, `perspective(420px) rotateX(${-y * 24}deg) rotateZ(${x * 20}deg)`);
    else setAttributeIfChanged(node, 'transform', `translate(0 ${y * 15}) rotate(${x * 40} 100 80)`);
  });
  root.querySelectorAll('[data-control-shaft]').forEach(node => setAttributeIfChanged(node, 'd', `M88 ${87 + y * 15}h24l7 100H81Z`));
  root.querySelectorAll('[data-control-pedal]').forEach(node => {
    setTransformIfChanged(node, `translateY(${rudder * (node.dataset.controlPedal === 'left' ? 9 : -9)}px)`);
  });
  root.querySelectorAll('[data-control-toe]').forEach(node => {
    setTransformIfChanged(node, `perspective(100px) rotateX(${(visual[node.dataset.controlToe] ?? 0) * -20}deg)`);
  });
}
