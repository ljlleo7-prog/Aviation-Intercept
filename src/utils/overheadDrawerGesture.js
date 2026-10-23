// Require a deliberate vertical pull; horizontal movement and taps do not
// accidentally change the drawer. Clicking the handle is handled separately.
export function overheadDrawerGesture(open, deltaX, deltaY) {
  const threshold = open && deltaY < 0 ? 32 : 64;
  if (Math.abs(deltaY) < threshold || Math.abs(deltaY) <= Math.abs(deltaX)) return open;
  return deltaY > 0;
}
