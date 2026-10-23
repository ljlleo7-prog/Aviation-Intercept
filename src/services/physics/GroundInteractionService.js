import { Quaternion, Vector3 } from '../../utils/flightMath.js';
import { airportSurfaceAt } from '../../utils/airportGroundSurface.js';

export default class GroundInteractionService {
    getNormalForce(gear, depth, verticalSpeed, mass) {
        if (depth <= 0) return 0;
        // Fade the damper in as the tire/strut loads. A full damper force at
        // zero compression creates an impulse when one main touches first.
        const contactFraction = Math.min(1, depth / 0.03);
        const dampingBlend = contactFraction * contactFraction * (3 - 2 * contactFraction);
        const load = gear.k * depth + gear.c * verticalSpeed * dampingBlend;
        return load > 0 ? -Math.min(load, mass * 9.81 * 4) : 0;
    }

    getContactPoints(gearHeight, gearDown = true, stiffness = 3000000) {
        const height = gearDown ? gearHeight : Math.min(0.75, gearHeight);
        const dampingScale = stiffness / 3000000;
        return [
            { name: 'nose', pos: new Vector3(14, 0, height), k: stiffness * 0.2, c: 35000 * dampingScale },
            { name: 'mainL', pos: new Vector3(-2, -3.5, height), k: stiffness * 0.4, c: 150000 * dampingScale },
            { name: 'mainR', pos: new Vector3(-2, 3.5, height), k: stiffness * 0.4, c: 150000 * dampingScale }
        ];
    }

    resolveSurfaceContact(state, groundZ, gearHeight, gearDown) {
        const points = this.getContactPoints(gearHeight, gearDown);
        const lowestOffset = Math.max(...points.map(point => state.quat.rotate(point.pos).z));
        const penetration = state.pos.z + lowestOffset - groundZ;
        const sinkRate = state.quat.rotate(state.vel).z;
        const maxCompression = gearDown ? 0.35 : 0;
        if (penetration > maxCompression) {
            state.pos.z -= penetration - maxCompression;
            // Remove only downward Earth-frame motion, preserving horizontal rollout.
            if (sinkRate > 0) {
                const inverse = new Quaternion(state.quat.w, -state.quat.x, -state.quat.y, -state.quat.z);
                state.vel = state.vel.sub(inverse.rotate(new Vector3(0, 0, sinkRate)));
            }
        }
        return { contact: penetration >= -1e-6, sinkRate };
    }

    updateGroundStatus(state, runwayGeometry, terrainElevation, airportElevation) {
        if (!runwayGeometry) {
            const groundHeightAMSL = terrainElevation ?? airportElevation;
            return {
                groundStatus: { status: 'UNKNOWN', remainingLength: 0 },
                currentGroundZ: -(groundHeightAMSL - airportElevation)
            };
        }

        const { thresholdStart, heading, length, width } = runwayGeometry;
        const latRad = state.geo.lat * Math.PI / 180;
        const metersPerLat = 111132.92;
        const metersPerLon = 111412.84 * Math.cos(latRad);

        const dLat = state.geo.lat - thresholdStart.latitude;
        const dLon = state.geo.lon - thresholdStart.longitude;
        const x_north = dLat * metersPerLat;
        const y_east = dLon * metersPerLon;

        const hRad = heading * Math.PI / 180;
        const cosH = Math.cos(hRad);
        const sinH = Math.sin(hRad);
        const distAlong = x_north * cosH + y_east * sinH;
        const distCross = Math.abs(x_north * sinH - y_east * cosH);
        const speed = typeof state.vel?.magnitude === 'function' ? state.vel.magnitude() : 0;
        const nearGround = Math.abs(state.pos?.z ?? 0) <= 6;
        const lowSpeed = speed <= 35;
        const runwayWidthTolerance = nearGround && lowSpeed ? width : width / 2;
        const grassWidthTolerance = nearGround && lowSpeed ? width * 3 : width * 2;
        const alongBuffer = nearGround && lowSpeed ? 800 : 500;

        let status = 'OBJECTS';
        if (distAlong >= -50 && distAlong <= length + 50 && distCross <= runwayWidthTolerance) {
            status = 'RUNWAY';
        } else if (distAlong >= -alongBuffer && distAlong <= length + alongBuffer && distCross <= grassWidthTolerance) {
            status = 'GRASS';
        }
        const mappedSurface = airportSurfaceAt(state.geo, this.airportLayout);
        if (mappedSurface && status !== 'RUNWAY') status = mappedSurface;

        let remaining = 0;
        if (distAlong < 0) remaining = length;
        else if (distAlong > length) remaining = 0;
        else remaining = length - distAlong;

        const runwayElevation = thresholdStart.elevation == null ? NaN : Number(thresholdStart.elevation);
        let groundHeightAMSL = Number.isFinite(runwayElevation) ? runwayElevation * 0.3048 : airportElevation;
        if (!['RUNWAY', 'GRASS', 'TAXIWAY', 'APRON', 'PAVED'].includes(status) && Number.isFinite(terrainElevation)) {
            groundHeightAMSL = terrainElevation;
        }

        return {
            groundStatus: { status, remainingLength: remaining },
            currentGroundZ: -(groundHeightAMSL - airportElevation)
        };
    }

    getRunwayBrakingData(runwayGeometry = {}, environment = {}) {
        const stages = [
            { index: 1, label: 'NIL', brakeScale: 0.2, gripScale: 0.2 },
            { index: 2, label: 'POOR', brakeScale: 0.35, gripScale: 0.35 },
            { index: 3, label: 'MEDIUM/POOR', brakeScale: 0.5, gripScale: 0.5 },
            { index: 4, label: 'MEDIUM', brakeScale: 0.65, gripScale: 0.65 },
            { index: 5, label: 'GOOD/MEDIUM', brakeScale: 0.85, gripScale: 0.8 },
            { index: 6, label: 'GOOD', brakeScale: 1.0, gripScale: 1.0 }
        ];

        let stageIndex = 6;
        const runway = runwayGeometry || {};
        const env = environment || {};
        const tempC = Number.isFinite(env.temperature) ? env.temperature : null;
        const precip = env.precipitation || 0;
        const code = env.weatherCode || 0;
        const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
        const isFreezing = (code >= 56 && code <= 57) || (code >= 66 && code <= 67);

        if (typeof runway.brakingAction === 'string') {
            const value = runway.brakingAction.toLowerCase();
            if (value.includes('nil')) stageIndex = 1;
            else if (value.includes('poor')) stageIndex = value.includes('medium') ? 3 : 2;
            else if (value.includes('medium')) stageIndex = value.includes('good') ? 5 : 4;
            else if (value.includes('good')) stageIndex = 6;
        } else if (typeof runway.frictionCoefficient === 'number') {
            const mu = runway.frictionCoefficient;
            if (mu < 0.15) stageIndex = 1;
            else if (mu < 0.25) stageIndex = 2;
            else if (mu < 0.35) stageIndex = 3;
            else if (mu < 0.45) stageIndex = 4;
            else if (mu < 0.55) stageIndex = 5;
            else stageIndex = 6;
        } else {
            if (tempC !== null && tempC <= 0) {
                if (precip > 4 || isFreezing) stageIndex = 1;
                else if (precip > 1 || isSnow) stageIndex = 2;
                else if (precip > 0.2) stageIndex = 3;
                else stageIndex = 4;
            } else {
                if (precip > 6) stageIndex = 3;
                else if (precip > 2) stageIndex = 4;
                else if (precip > 0.2) stageIndex = 5;
                else stageIndex = 6;
            }
        }

        return stages[Math.max(0, Math.min(stages.length - 1, stageIndex - 1))];
    }
}
