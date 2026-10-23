export function isNavFrequency(value) {
  return Number.isFinite(value) && value >= 108 && value <= 117.95
    && Math.abs(value * 20 - Math.round(value * 20)) < .00001;
}

export function approachReferenceStatus(reference, frequency) {
  if (!reference) return 'No approach runway selected';
  if (reference.headingSource === 'designator-estimate' || !Number.isFinite(reference.heading)) return 'Verified runway heading required';
  if (!isNavFrequency(reference.ilsFrequency)) return 'Approach frequency unavailable';
  if (!isNavFrequency(frequency) || Math.abs(frequency - reference.ilsFrequency) > .005) return 'NAV1 frequency does not match';
  return 'NAV1 tuned · APP ready';
}
