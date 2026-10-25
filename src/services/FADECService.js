import { takeoffThrustFraction } from './flightPerformancePlanning.js';
/**
 * FADECService — Airbus thrust lever / FADEC detent logic.
 *
 * Detent profiles vary by aircraft family:
 *   A320 family : IDLE, CLB, FLEX/MCT, TOGA          (no CRZ)
 *   A330/A340   : IDLE, CLB, MCT, TOGA               (no CRZ, no FLEX on A340)
 *   A350/A380   : IDLE, CRZ, CLB, MCT, TOGA          (full modern set)
 *
 * Lever is 0–1 normalized. Reverse (<0) is passed through unchanged.
 */

// Per-family detent tables  { name, lever, n1Frac }
const PROFILES = {
    // A320 family (CFM56 / IAE V2500)
    A320: [
        { name: 'IDLE', lever: 0.00, n1Frac: 0.22 },
        { name: 'CLB',  lever: 0.55, n1Frac: 0.87 },
        { name: 'FLEX', lever: 0.75, n1Frac: 1.00 },
        { name: 'MCT',  lever: 0.85, n1Frac: 0.95 },
        { name: 'TOGA', lever: 1.00, n1Frac: 1.00 },
    ],
    // A330 / A340 (older EIS1 — no CRZ, A340 has no FLEX)
    A330: [
        { name: 'IDLE', lever: 0.00, n1Frac: 0.22 },
        { name: 'CLB',  lever: 0.55, n1Frac: 0.87 },
        { name: 'MCT',  lever: 0.80, n1Frac: 0.95 },
        { name: 'TOGA', lever: 1.00, n1Frac: 1.00 },
    ],
    A340: [
        { name: 'IDLE', lever: 0.00, n1Frac: 0.22 },
        { name: 'CLB',  lever: 0.55, n1Frac: 0.87 },
        { name: 'MCT',  lever: 0.80, n1Frac: 0.95 },
        { name: 'TOGA', lever: 1.00, n1Frac: 1.00 },
    ],
    // A350 / A380 (EIS2/EIS3 — full set including CRZ)
    A350: [
        { name: 'IDLE', lever: 0.00, n1Frac: 0.22 },
        { name: 'CRZ',  lever: 0.40, n1Frac: 0.80 },
        { name: 'CLB',  lever: 0.60, n1Frac: 0.87 },
        { name: 'MCT',  lever: 0.80, n1Frac: 0.95 },
        { name: 'TOGA', lever: 1.00, n1Frac: 1.00 },
    ],
    A380: [
        { name: 'IDLE', lever: 0.00, n1Frac: 0.22 },
        { name: 'CRZ',  lever: 0.40, n1Frac: 0.80 },
        { name: 'CLB',  lever: 0.60, n1Frac: 0.87 },
        { name: 'MCT',  lever: 0.80, n1Frac: 0.95 },
        { name: 'TOGA', lever: 1.00, n1Frac: 1.00 },
    ],
};

// Map ICAO family strings (from static.json "family" field or icao prefix) to profile keys
function resolveProfile(family) {
    if (!family) return PROFILES.A320;
    const f = family.toUpperCase();
    if (f.includes('380') || f === 'A380') return PROFILES.A380;
    if (f.includes('350') || f === 'A350') return PROFILES.A350;
    if (f.includes('340') || f === 'A340') return PROFILES.A340;
    if (f.includes('330') || f === 'A330') return PROFILES.A330;
    return PROFILES.A320; // A320 family default
}

export class FADECService {
    /**
     * @param {string} family  e.g. 'A320', 'A330', 'A350', 'A380'
     */
    constructor(family) {
        this.detents = resolveProfile(family);
        this.flexTemp = null;
        this.mode = 'IDLE';
    }

    setFlexTemp(temp) { this.flexTemp = temp === null ? null : Number(temp); }

    setPerformanceContext(context) { this.performanceContext = context; }

    getModeBand(lever) {
        if (lever <= this.detents[0].lever) {
            return { mode: this.detents[0].name, lower: this.detents[0], upper: this.detents[0], t: 0 };
        }
        for (let i = 0; i < this.detents.length - 1; i++) {
            const lower = this.detents[i];
            const upper = this.detents[i + 1];
            if (lever <= upper.lever) {
                const span = Math.max(0.0001, upper.lever - lower.lever);
                const t = Math.max(0, Math.min(1, (lever - lower.lever) / span));
                return { mode: upper.name, lower, upper, t };
            }
        }
        const last = this.detents[this.detents.length - 1];
        return { mode: last.name, lower: last, upper: last, t: 1 };
    }

    applyModeAdjustments(mode, n1Frac, altitude) {
        let adjusted = n1Frac;
        if (mode === 'FLEX' && this.flexTemp !== null) {
            const fraction = takeoffThrustFraction({ ...this.performanceContext, assumedTemperature: this.flexTemp });
            // Engine thrust follows approximately N1^2.5, so derate thrust, not N1 linearly.
            adjusted = 0.05 + (adjusted - 0.05) * Math.pow(fraction, 1 / 2.5);
        }
        if (mode === 'CLB' && altitude > 10000) {
            adjusted = Math.max(0.82, adjusted - 0.02);
        }
        return adjusted;
    }

    targetN1(lever, maxN1, altitude = 0) {
        if (lever < 0) return maxN1 * this.detents[0].n1Frac;

        const band = this.getModeBand(lever);
        this.mode = band.mode;

        const lowerFrac = this.applyModeAdjustments(band.lower.name, band.lower.n1Frac, altitude);
        const upperFrac = this.applyModeAdjustments(band.upper.name, band.upper.n1Frac, altitude);
        const commandedFrac = lowerFrac + (upperFrac - lowerFrac) * band.t;

        return maxN1 * commandedFrac;
    }

    getMode() { return this.mode; }

    /** Returns detent names available on this aircraft */
    getDetentNames() { return this.detents.map(d => d.name); }
}

export default FADECService;
