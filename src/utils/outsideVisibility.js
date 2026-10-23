// Scenario weather uses kilometers; live weather can supply meters.
export const normalizeVisibilityM = (value) => Number.isFinite(value)
  ? Math.min(20000, Math.max(1, value <= 30 ? value * 1000 : value))
  : 20000;
