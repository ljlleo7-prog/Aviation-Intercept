const hazardPriority = warning => warning.id === 'GPWS_PULL_UP' ? -3 : /^(STALL|WINDSHEAR)/.test(warning.id) ? -2 : isFlightHazard(warning) ? -1 : 0;
const PRIORITY = { CRITICAL: 0, WARNING: 1, ADVISORY: 2 };
export const isFlightHazard = warning => /^(GPWS_|STALL$|OVERSPEED$|BANK_ANGLE$|WINDSHEAR|G_LIMIT$|TAIL_STRIKE$)/.test(warning.id);
export const alertGroup = warning => /^FIRE_|^ENG\d+_FIRE$/.test(warning.id) ? 'fire' : warning.level === 'CRITICAL' ? 'warning' : warning.level === 'WARNING' ? 'caution' : 'advisory';
export function annunciatorFor(warning) {
  if (/FIRE|OVERHEAT/.test(warning.id)) return 'OVHT/DET';
  if (/^HYD/.test(warning.id)) return 'HYD';
  if (/^ELEC/.test(warning.id)) return 'ELEC';
  if (/^FUEL/.test(warning.id)) return 'FUEL';
  if (/^ENG/.test(warning.id)) return 'ENG';
  if (/CABIN|PACK|PRESS/.test(warning.id)) return 'AIR COND';
  if (/ICE/.test(warning.id)) return 'ANTI-ICE';
  return null;
}

// Acknowledgement applies to an occurrence, never to future faults of the same type.
export default class CrewAlertState {
  constructor() { this.active = new Map(); this.recalled = false; }
  update(warnings = []) {
    const next = new Map();
    for (const warning of warnings) {
      const previous = this.active.get(warning.id);
      next.set(warning.id, { ...warning, acknowledged: previous?.level === warning.level && previous?.message === warning.message ? previous.acknowledged : false });
    }
    if ([...next.keys()].some(id => !this.active.has(id))) this.recalled = false;
    this.active = next;
    return this.snapshot();
  }
  acknowledge(group) {
    for (const warning of this.active.values()) {
      if (alertGroup(warning) === group && !isFlightHazard(warning)) warning.acknowledged = true;
    }
    this.recalled = false;
    return this.snapshot();
  }
  recall() { this.recalled = true; return this.snapshot(); }
  snapshot() {
    const warnings = [...this.active.values()].sort((a, b) => hazardPriority(a) - hazardPriority(b) || (PRIORITY[a.level] ?? 3) - (PRIORITY[b.level] ?? 3));
    const attention = warnings.filter(w => !w.acknowledged);
    return {
      warnings,
      fire: attention.some(w => alertGroup(w) === 'fire'),
      warning: attention.some(w => alertGroup(w) === 'warning'),
      caution: attention.some(w => alertGroup(w) === 'caution'),
      annunciators: [...new Set(warnings.filter(w => this.recalled || !w.acknowledged).map(annunciatorFor).filter(Boolean))],
      recalled: this.recalled,
      visualWarnings: warnings.filter(w => isFlightHazard(w) || (!w.acknowledged && (w.level === 'CRITICAL' || w.isFlashing))),
    };
  }
}
