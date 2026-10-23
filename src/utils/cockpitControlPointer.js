// Each press owns a fresh drag. A late lost-capture event must not cancel a
// newer press (mouse pointer IDs are reused across presses).
export function createCockpitControlPointer(onMove, onRelease) {
  let drag = null;
  const end = event => {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const previous = drag;
    drag = null;
    onRelease();
    if (previous.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId);
  };
  return {
    begin(event, position, isAirbus) {
      if (drag) end();
      event.preventDefault();
      const target = event.currentTarget;
      drag = { pointerId: event.pointerId, target, rect: target.getBoundingClientRect(),
        x: event.clientX, y: event.clientY, position: { ...position }, isAirbus };
      target.setPointerCapture(event.pointerId);
    },
    move(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const { rect, position, isAirbus } = drag;
      const clamp = value => Math.max(-1, Math.min(1, value));
      onMove({
        x: clamp(position.x + (event.clientX - drag.x) / (rect.width * (isAirbus ? 0.45 : 0.35))),
        y: clamp(position.y + (event.clientY - drag.y) / (rect.height * 0.35))
      });
    },
    end,
    lost(event) {
      if (drag?.target.hasPointerCapture(drag.pointerId)) return;
      end(event);
    }
  };
}
