export function getIlsDisplayState(ils = {}, approachSelected = false) {
  const localizerValid = ils.active === true && Number.isFinite(ils.locDeviationDeg);
  const glideslopeValid = ils.active === true && Number.isFinite(ils.gsDeviationDeg);
  const clamp = value => Math.max(-1, Math.min(1, value));
  return {
    visible: approachSelected || localizerValid || glideslopeValid,
    localizerValid,
    glideslopeValid,
    // Positive LOC is aircraft right of center; positive GS is aircraft high.
    localizerOffset: localizerValid ? clamp(-ils.locDeviationDeg / 2.5) : null,
    glideslopeOffset: glideslopeValid ? clamp(ils.gsDeviationDeg / 0.7) : null
  };
}
