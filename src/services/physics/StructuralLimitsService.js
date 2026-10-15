// Gameplay envelope defaults; aircraft data can override these values.
export default class StructuralLimitsService {
  constructor(aircraft = {}) {
    this.limits = {
      positiveG: aircraft.positiveGLimit ?? 2.5,
      negativeG: aircraft.negativeGLimit ?? -1,
      vmo: aircraft.maxOperatingSpeed ?? 340,
      mmo: aircraft.maxOperatingMach ?? 0.82
    };
    this.health = { wing: 1, aileron: 1, elevator: 1, rudder: 1 };
    this.events = [];
    this.overstressTime = 0;
    this.loadFactor = 1;
    this.mach = 0;
    this.overspeed = false;
    this.overload = false;
  }

  update({ loadFactor, dynamicPressure, mach, onGround, dt }, applyDamage) {
    this.loadFactor = loadFactor;
    this.mach = mach;
    const ias = Math.sqrt(2 * dynamicPressure / 1.225) * 1.94384;
    this.overspeed = ias > this.limits.vmo || mach > this.limits.mmo;
    this.overload = !onGround && (loadFactor > this.limits.positiveG || loadFactor < this.limits.negativeG);
    if (onGround || !Number.isFinite(dt) || dt <= 0) return;
    const gExcess = Math.max(0, loadFactor / this.limits.positiveG - 1,
      loadFactor < 0 ? loadFactor / this.limits.negativeG - 1 : 0);
    const speedExcess = Math.max(0, ias / this.limits.vmo - 1, mach / this.limits.mmo - 1);
    const stress = gExcess * gExcess * 0.12 + speedExcess * speedExcess * 0.8;
    if (!Number.isFinite(stress) || stress === 0) {
      this.overstressTime = 0;
      return;
    }
    // Allow brief maneuver transients; sustained exceedances accumulate damage.
    const previousExposure = this.overstressTime;
    this.overstressTime += dt;
    const damageTime = Math.max(0, this.overstressTime - 2) - Math.max(0, previousExposure - 2);
    if (damageTime === 0) return;
    Object.keys(this.health).forEach((part, index) => {
      const previous = this.health[part];
      this.health[part] = Math.max(0, previous - stress * damageTime * (1 + index * 0.15));
      if (previous > 0.9 && this.health[part] <= 0.9) {
        this.events.push({ id: `STRUCTURE_${part}_DAMAGE`, message: `${part.toUpperCase()} STRUCTURAL DAMAGE` });
      }
      if (previous > 0 && this.health[part] === 0) {
        this.events.push({ id: `STRUCTURE_${part}_DEPARTURE`, message: `${part.toUpperCase()} DEPARTED` });
      }
      if (part !== 'wing') applyDamage?.({ componentId: `controls.${part}`, type: 'envelope_overstress',
        severity: 1 - this.health[part], eventId: `structural-${part}` });
    });
  }

  getSnapshot() {
    return { ...this.limits, loadFactor: this.loadFactor, mach: this.mach,
      overspeed: this.overspeed, overload: this.overload, health: { ...this.health },
      events: this.events.map(event => ({ ...event })) };
  }
}
