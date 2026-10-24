/**
 * Flight Physics Math Utilities
 * 
 * Contains Vector3, Quaternion, and other math helpers for 6-DOF physics.
 */

export class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }

    add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z); }
    scale(s) { return new Vector3(this.x * s, this.y * s, this.z * s); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) {
        return new Vector3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }
    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() {
        const m = this.magnitude();
        return m > 0 ? this.scale(1 / m) : new Vector3();
    }
    set(x, y, z) {
        this.x = x; this.y = y; this.z = z;
        return this;
    }
    clone() { return new Vector3(this.x, this.y, this.z); }
}

export class Quaternion {
    constructor(w = 1, x = 0, y = 0, z = 0) {
        this.w = w; this.x = x; this.y = y; this.z = z;
    }

    normalize() {
        const m = Math.sqrt(this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z);
        if (m > 0) {
            this.w /= m; this.x /= m; this.y /= m; this.z /= m;
        }
        return this;
    }

    // Rotate vector v by this quaternion
    rotate(v) {
        // v' = q * v * q_conjugate
        const qvec = new Vector3(this.x, this.y, this.z);
        const uv = qvec.cross(v);
        const uuv = qvec.cross(uv);
        
        return v.add(uv.scale(2 * this.w)).add(uuv.scale(2));
    }

    // Get Euler Angles (Roll, Pitch, Yaw) in Radians from Quaternion
    // Assumes standard aerospace sequence (Yaw -> Pitch -> Roll)
    toEuler() {
        // Roll (phi)
        const sinr_cosp = 2 * (this.w * this.x + this.y * this.z);
        const cosr_cosp = 1 - 2 * (this.x * this.x + this.y * this.y);
        const phi = Math.atan2(sinr_cosp, cosr_cosp);

        // Pitch (theta)
        const sinp = 2 * (this.w * this.y - this.z * this.x);
        let theta;
        if (Math.abs(sinp) >= 1)
            theta = Math.sign(sinp) * Math.PI / 2; // use 90 degrees if out of range
        else
            theta = Math.asin(sinp);

        // Yaw (psi)
        const siny_cosp = 2 * (this.w * this.z + this.x * this.y);
        const cosy_cosp = 1 - 2 * (this.y * this.y + this.z * this.z);
        const psi = Math.atan2(siny_cosp, cosy_cosp);

        return { phi, theta, psi };
    }

    static fromEuler(phi, theta, psi) {
        const cy = Math.cos(psi * 0.5);
        const sy = Math.sin(psi * 0.5);
        const cp = Math.cos(theta * 0.5);
        const sp = Math.sin(theta * 0.5);
        const cr = Math.cos(phi * 0.5);
        const sr = Math.sin(phi * 0.5);

        return new Quaternion(
            cr * cp * cy + sr * sp * sy,
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy
        );
    }
}

// Earth radius in meters for physics calculations
export const EARTH_RADIUS_METERS = 6371000;

export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = EARTH_RADIUS_METERS;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}
export function normalizeHeadingDegrees(heading) {
    if (!Number.isFinite(heading)) return 0;
    return ((heading % 360) + 360) % 360;
}

export function normalizeSignedHeadingDelta(delta) {
    if (!Number.isFinite(delta)) return 0;
    const normalized = ((delta + 540) % 360) - 180;
    return normalized === -180 ? 180 : normalized;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function projectToLocalMeters(referenceLat, referenceLon, latitude, longitude) {
    const latRad = referenceLat * Math.PI / 180;
    const metersPerLat = 111132.92;
    const metersPerLon = 111412.84 * Math.cos(latRad);
    return {
        x: (latitude - referenceLat) * metersPerLat,
        y: (longitude - referenceLon) * metersPerLon
    };
}

export function projectFromLocalMeters(referenceLat, referenceLon, x, y) {
    const latRad = referenceLat * Math.PI / 180;
    const metersPerLat = 111132.92;
    const metersPerLon = 111412.84 * Math.cos(latRad);
    return {
        latitude: referenceLat + (x / metersPerLat),
        longitude: referenceLon + (y / metersPerLon)
    };
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length < 1e-6) return null;
    return { x: vector.x / length, y: vector.y / length, length };
}

function rotateLeft(vector) {
    return { x: -vector.y, y: vector.x };
}

function rotateRight(vector) {
    return { x: vector.y, y: -vector.x };
}

function sampleStraightSegment(start, end, spacingMeters, pointFactory) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) {
        return [pointFactory(end.x, end.y)];
    }
    const steps = Math.max(1, Math.ceil(length / Math.max(25, spacingMeters)));
    const points = [];
    for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        points.push(pointFactory(start.x + dx * t, start.y + dy * t));
    }
    return points;
}

function appendSampledPoints(target, sampledPoints) {
    for (const point of sampledPoints) {
        const last = target[target.length - 1];
        if (!last || Math.abs(last.latitude - point.latitude) > 1e-8 || Math.abs(last.longitude - point.longitude) > 1e-8) {
            target.push(point);
        }
    }
}

export function buildFlyByTurn(previousWaypoint, waypoint, nextWaypoint, options = {}) {
    if (!previousWaypoint || !waypoint || !nextWaypoint) return null;
    if (waypoint.isHold || waypoint.flyOver || waypoint.isFlyOver || waypoint.sequencingMode === 'manual') return null;
    const coordinates = [previousWaypoint, waypoint, nextWaypoint];
    if (coordinates.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) {
        return null;
    }

    const referenceLat = waypoint.latitude;
    const referenceLon = waypoint.longitude;
    const previousLocal = projectToLocalMeters(referenceLat, referenceLon, previousWaypoint.latitude, previousWaypoint.longitude);
    const currentLocal = { x: 0, y: 0 };
    const nextLocal = projectToLocalMeters(referenceLat, referenceLon, nextWaypoint.latitude, nextWaypoint.longitude);

    const inboundVectorRaw = {
        x: currentLocal.x - previousLocal.x,
        y: currentLocal.y - previousLocal.y
    };
    const outboundVectorRaw = {
        x: nextLocal.x - currentLocal.x,
        y: nextLocal.y - currentLocal.y
    };
    const inbound = normalizeVector(inboundVectorRaw);
    const outbound = normalizeVector(outboundVectorRaw);
    if (!inbound || !outbound) return null;

    const dot = clamp((inbound.x * outbound.x) + (inbound.y * outbound.y), -1, 1);
    const turnAngle = Math.acos(dot);
    const turnAngleDeg = turnAngle * 180 / Math.PI;
    if (!Number.isFinite(turnAngle) || turnAngle < 1 * Math.PI / 180 || turnAngle > 175 * Math.PI / 180) {
        return null;
    }

    const cross = (inbound.x * outbound.y) - (inbound.y * outbound.x);
    const turnDirection = cross >= 0 ? 'left' : 'right';
    const requestedRadius = Math.max(150, options.turnRadiusMeters ?? 1852);
    const inboundLength = inbound.length;
    const outboundLength = outbound.length;
    const desiredLead = requestedRadius * Math.tan(turnAngle / 2);
    const maxLead = Math.max(0, Math.min(inboundLength, outboundLength) * 0.45);
    const leadDistance = Math.min(desiredLead, maxLead);
    if (!Number.isFinite(leadDistance) || leadDistance < 25) {
        return null;
    }
    const radiusMeters = leadDistance / Math.tan(turnAngle / 2);

    const entry = {
        x: currentLocal.x - inbound.x * leadDistance,
        y: currentLocal.y - inbound.y * leadDistance
    };
    const exit = {
        x: currentLocal.x + outbound.x * leadDistance,
        y: currentLocal.y + outbound.y * leadDistance
    };

    const inwardNormal = turnDirection === 'left' ? rotateLeft(inbound) : rotateRight(inbound);
    const outwardNormal = turnDirection === 'left' ? rotateLeft(outbound) : rotateRight(outbound);
    const center = {
        x: entry.x + inwardNormal.x * radiusMeters,
        y: entry.y + inwardNormal.y * radiusMeters
    };
    const expectedCenter = {
        x: exit.x + outwardNormal.x * radiusMeters,
        y: exit.y + outwardNormal.y * radiusMeters
    };
    const centerError = Math.hypot(center.x - expectedCenter.x, center.y - expectedCenter.y);
    if (!Number.isFinite(centerError) || centerError > Math.max(20, radiusMeters * 0.2)) {
        return null;
    }

    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    let endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
    if (turnDirection === 'left' && endAngle <= startAngle) endAngle += Math.PI * 2;
    if (turnDirection === 'right' && endAngle >= startAngle) endAngle -= Math.PI * 2;
    const arcAngle = endAngle - startAngle;
    const arcLength = Math.abs(arcAngle) * radiusMeters;

    return {
        referenceLat,
        referenceLon,
        radiusMeters,
        leadDistance,
        desiredLead,
        turnAngleDeg,
        turnDirection,
        entry: {
            ...projectFromLocalMeters(referenceLat, referenceLon, entry.x, entry.y),
            x: entry.x,
            y: entry.y
        },
        exit: {
            ...projectFromLocalMeters(referenceLat, referenceLon, exit.x, exit.y),
            x: exit.x,
            y: exit.y
        },
        center: {
            ...projectFromLocalMeters(referenceLat, referenceLon, center.x, center.y),
            x: center.x,
            y: center.y
        },
        inboundCourseDeg: calculateBearing(previousWaypoint.latitude, previousWaypoint.longitude, waypoint.latitude, waypoint.longitude),
        outboundCourseDeg: calculateBearing(waypoint.latitude, waypoint.longitude, nextWaypoint.latitude, nextWaypoint.longitude),
        startAngle,
        endAngle,
        arcAngle,
        arcLength,
        waypoint: {
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            name: waypoint.label || waypoint.name || 'WPT'
        }
    };
}

export function sampleFlyByRoute(waypoints = [], options = {}) {
    const validWaypoints = (Array.isArray(waypoints) ? waypoints : []).filter(
        (point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
    );
    if (validWaypoints.length === 0) return [];

    const spacingMeters = Math.max(50, options.sampleSpacingMeters ?? 250);
    const sampledPath = [{
        latitude: validWaypoints[0].latitude,
        longitude: validWaypoints[0].longitude,
        name: validWaypoints[0].label || validWaypoints[0].name || 'WPT'
    }];

    const turnsByIndex = new Map();
    for (let i = 1; i < validWaypoints.length - 1; i++) {
        const turn = buildFlyByTurn(validWaypoints[i - 1], validWaypoints[i], validWaypoints[i + 1], options);
        if (turn) turnsByIndex.set(i, turn);
    }

    for (let segmentIndex = 0; segmentIndex < validWaypoints.length - 1; segmentIndex++) {
        const startWaypoint = validWaypoints[segmentIndex];
        const endWaypoint = validWaypoints[segmentIndex + 1];
        const startTurn = turnsByIndex.get(segmentIndex);
        const endTurn = turnsByIndex.get(segmentIndex + 1);

        const referenceLat = startWaypoint.latitude;
        const referenceLon = startWaypoint.longitude;
        const startLocal = startTurn
            ? projectToLocalMeters(referenceLat, referenceLon, startTurn.exit.latitude, startTurn.exit.longitude)
            : { x: 0, y: 0 };
        const endLocal = endTurn
            ? projectToLocalMeters(referenceLat, referenceLon, endTurn.entry.latitude, endTurn.entry.longitude)
            : projectToLocalMeters(referenceLat, referenceLon, endWaypoint.latitude, endWaypoint.longitude);

        appendSampledPoints(
            sampledPath,
            sampleStraightSegment(startLocal, endLocal, spacingMeters, (x, y) => {
                const point = projectFromLocalMeters(referenceLat, referenceLon, x, y);
                return {
                    ...point,
                    name: endWaypoint.label || endWaypoint.name || 'WPT'
                };
            })
        );

        if (endTurn) {
            const arcSteps = Math.max(6, Math.ceil(endTurn.arcLength / spacingMeters));
            const arcPoints = [];
            for (let step = 1; step <= arcSteps; step++) {
                const t = step / arcSteps;
                const angle = endTurn.startAngle + (endTurn.arcAngle * t);
                const x = endTurn.center.x + Math.cos(angle) * endTurn.radiusMeters;
                const y = endTurn.center.y + Math.sin(angle) * endTurn.radiusMeters;
                arcPoints.push({
                    ...projectFromLocalMeters(endTurn.referenceLat, endTurn.referenceLon, x, y),
                    name: endTurn.waypoint.name
                });
            }
            appendSampledPoints(sampledPath, arcPoints);
        }
    }

    return sampledPath;
}
