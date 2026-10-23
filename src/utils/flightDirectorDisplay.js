export function getFlightDirectorBars(director, pitch, roll) {
  if (!director?.enabled || ![director.targetPitch, director.targetRoll, pitch, roll].every(Number.isFinite)) return null;
  const clamp = (value, max) => Math.max(-max, Math.min(max, value));
  return {
    // Higher command pitch moves the horizontal bar up. Right bank moves the
    // vertical bar right; the pilot flies toward the command bars.
    pitchOffset: clamp((pitch - director.targetPitch) * 1.2, 22),
    rollOffset: clamp((director.targetRoll - roll) * 0.7, 24)
  };
}
