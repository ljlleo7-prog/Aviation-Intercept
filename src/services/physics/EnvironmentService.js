import { Vector3 } from '../../utils/flightMath.js';

export default class EnvironmentService {
    constructor(constants, difficulty) {
        this.CONSTANTS = constants;
        this.difficulty = difficulty;
        this.environment = null;
    }

    calculateEnvironment(z_down) {
        const h = Math.max(0, -z_down);
        const envTempC = this.environment?.temperature;
        const surfaceTemp = Math.max(216.65, this.CONSTANTS.SEA_LEVEL_TEMP + (envTempC != null ? envTempC - 15 : 0));
        const lapse = this.CONSTANTS.TEMP_LAPSE_RATE;
        const tropopauseHeight = Math.min(11000, Math.max(0, (216.65 - surfaceTemp) / lapse));
        const tropopauseTemp = surfaceTemp + lapse * tropopauseHeight;
        const lapseHeight = Math.min(h, tropopauseHeight);
        const temp = surfaceTemp + lapse * lapseHeight;
        const lapsePressure = this.CONSTANTS.SEA_LEVEL_PRESSURE *
            Math.pow(temp / surfaceTemp, -this.CONSTANTS.G / (lapse * this.CONSTANTS.R_GAS));
        const pressure = h > tropopauseHeight
            ? lapsePressure * Math.exp(-this.CONSTANTS.G * (h - tropopauseHeight) / (this.CONSTANTS.R_GAS * tropopauseTemp))
            : lapsePressure;
        const density = pressure / (this.CONSTANTS.R_GAS * temp);
        const speedOfSound = Math.sqrt(this.CONSTANTS.GAMMA * this.CONSTANTS.R_GAS * temp);
        const wind = this.environment?.wind || new Vector3(0, 0, 0);
        const turbulence = this.environment?.turbulence || 0;

        return { density, pressure, temp, speedOfSound, wind, turbulence };
    }

    setEnvironment(envData) {
        if (!envData) return;

        const windSpeed = envData.windSpeed ?? this.environment?.windSpeed ?? 0;
        const windDirection = envData.windDirection ?? this.environment?.windDirection ?? 0;
        const windGust = envData.windGust ?? this.environment?.windGust ?? windSpeed;
        const windShear = envData.windShear ?? this.environment?.windShear ?? 0;
        const speedMs = windSpeed * 0.514444;
        const dirRad = windDirection * Math.PI / 180;
        const gustFloorMs = Math.max(0, speedMs);
        const gustCeilingMs = Math.max(gustFloorMs, windGust * 0.514444);
        const gustAmplitudeMs = Math.max(0, gustCeilingMs - gustFloorMs);
        const gustSpeed = Math.max(0, windGust - windSpeed);
        const shearInput = windShear;
        const shearStrengthMs = (shearInput > 0 ? shearInput : gustSpeed * 0.6) * 0.514444;
        const difficultyScale = this.getDifficultyScale();

        const windX = -speedMs * Math.cos(dirRad);
        const windY = -speedMs * Math.sin(dirRad);
        const baseWind = new Vector3(windX, windY, 0);

        this.environment = {
            ...this.environment,
            wind: baseWind,
            baseWind,
            gustStrength: gustAmplitudeMs * (1 + difficultyScale),
            gustFloorMs,
            gustCeilingMs,
            shearStrength: shearStrengthMs * (1 + difficultyScale),
            gust: this.environment?.gust || 0,
            gustTarget: this.environment?.gustTarget || 0,
            gustTimer: this.environment?.gustTimer || 0,
            shear: this.environment?.shear || new Vector3(0, 0, 0),
            shearTarget: this.environment?.shearTarget || new Vector3(0, 0, 0),
            shearTimer: this.environment?.shearTimer || 0,
            turbulence: envData.turbulence ?? this.environment?.turbulence ?? 0,
            precipitation: envData.precipitation ?? this.environment?.precipitation ?? 0,
            cloudCover: envData.cloudCover ?? this.environment?.cloudCover ?? 0,
            temperature: envData.temperature ?? this.environment?.temperature ?? null,
            windDirection,
            windSpeed,
            windGust,
            windShear,
            weatherCode: envData.weatherCode ?? this.environment?.weatherCode ?? 0
        };
    }

    getDifficultyScale() {
        const scales = { rookie: 0, amateur: 0.1, intermediate: 0.2, advanced: 0.3, pro: 0.45, devil: 0.6 };
        return scales[this.difficulty] ?? 0.2;
    }

    updateDynamicWeather(dt) {
        if (!this.environment) return;
        const { gustStrength, shearStrength } = this.environment;

        if (gustStrength > 0) {
            this.environment.gustTimer -= dt;
            if (this.environment.gustTimer <= 0) {
                this.environment.gustTimer = 0.6 + Math.random() * 1.6;
                this.environment.gustTarget = Math.random() * gustStrength;
            }
            const gustBlend = 1 - Math.exp(-dt * 2.2);
            this.environment.gust += (this.environment.gustTarget - this.environment.gust) * gustBlend;
        } else {
            this.environment.gust = 0;
            this.environment.gustTarget = 0;
        }

        if (shearStrength > 0) {
            this.environment.shearTimer -= dt;
            if (this.environment.shearTimer <= 0) {
                this.environment.shearTimer = 1.2 + Math.random() * 2.4;
                const angle = Math.random() * Math.PI * 2;
                const vertical = (Math.random() * 2 - 1) * 0.6;
                const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
                this.environment.shearTarget = new Vector3(
                    Math.cos(angle) * horizontal * shearStrength,
                    Math.sin(angle) * horizontal * shearStrength,
                    vertical * shearStrength
                );
            }
            const shearBlend = 1 - Math.exp(-dt * 1.4);
            this.environment.shear = this.environment.shear.add(
                this.environment.shearTarget.sub(this.environment.shear).scale(shearBlend)
            );
        } else {
            this.environment.shear = new Vector3(0, 0, 0);
            this.environment.shearTarget = new Vector3(0, 0, 0);
        }

        const baseWind = this.environment.baseWind || new Vector3(0, 0, 0);
        const baseMag = baseWind.magnitude();
        let gustVector = new Vector3(0, 0, 0);
        if (Math.abs(this.environment.gust) > 0.01) {
            const dir = baseMag > 0.01
                ? baseWind.normalize()
                : new Vector3(-Math.cos(this.environment.windDirection * Math.PI / 180), -Math.sin(this.environment.windDirection * Math.PI / 180), 0);
            gustVector = dir.scale(this.environment.gust);
        }
        const steadyWind = baseMag > 0.01 ? baseWind.normalize().scale(this.environment.gustFloorMs || baseMag) : baseWind;
        this.environment.wind = steadyWind.add(gustVector).add(this.environment.shear || new Vector3(0, 0, 0));
    }

    updateIcing(dt, systems, onGround, icingState) {
        const env = this.environment || {};
        const tempC = env.temperature;
        const precip = env.precipitation || 0;
        const cloud = env.cloudCover || 0;
        const icingCondition = tempC != null && tempC <= 0 && (precip > 0.2 || cloud > 70);
        const antiIceOn = !!(systems?.ice?.wingAntiIce || systems?.ice?.eng1AntiIce || systems?.ice?.eng2AntiIce);

        let rate = 0;
        if (icingCondition && !antiIceOn) {
            const precipFactor = Math.min(1, precip / 4);
            const cloudFactor = cloud > 70 ? (cloud - 70) / 30 : 0;
            rate = 0.002 + 0.01 * Math.max(precipFactor, cloudFactor);
        } else if (antiIceOn) {
            rate = -0.01;
        } else {
            rate = -0.002;
        }

        icingState.level = Math.max(0, Math.min(1, icingState.level + rate * dt));
        icingState.rate = rate;

        if (systems?.ice) {
            systems.ice.icingLevel = icingState.level;
            systems.ice.deicingRequired = !!(onGround && icingState.level > 0.2);
        }
    }

    applyWindShear(intensity = 0.5) {
        if (!this.environment) return;
        const shearStrength = Math.max(this.environment.shearStrength || 0, 1) * (0.5 + intensity);
        const angle = Math.random() * Math.PI * 2;
        const vertical = (Math.random() * 2 - 1) * 0.7;
        const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        this.environment.shearTarget = new Vector3(
            Math.cos(angle) * horizontal * shearStrength,
            Math.sin(angle) * horizontal * shearStrength,
            vertical * shearStrength
        );
        this.environment.shearTimer = 0.3;
    }
}
