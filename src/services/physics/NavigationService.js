import {
    calculateBearing,
    calculateDistanceMeters,
    buildFlyByTurn,
    sampleFlyByRoute,
    projectToLocalMeters,
    projectFromLocalMeters,
    normalizeHeadingDegrees,
    clamp
} from '../../utils/flightMath.js';

export default class NavigationService {
    constructor() {
        this.flightPlan = [];
        this.currentWaypointIndex = 0;
        this.lastPath = [];
        this.lastGuidance = null;
        this.pathCache = null;
    }

    // Check values as well as identity: route editors may mutate waypoints in place.
    getSampledPath(waypoints, options = {}) {
        const radius = Math.max(150, options.turnRadiusMeters ?? 1852);
        const spacing = Math.max(50, options.sampleSpacingMeters ?? 250);
        const cache = this.pathCache;
        const matches = cache && Object.is(cache.radius, radius) && Object.is(cache.spacing, spacing)
            && cache.points.length === waypoints.length
            && waypoints.every((point, index) => {
                const previous = cache.points[index];
                return Object.is(point?.latitude, previous.latitude)
                    && Object.is(point?.longitude, previous.longitude)
                    && Object.is(point?.label, previous.label)
                    && Object.is(point?.name, previous.name)
                    && Object.is(point?.isHold, previous.isHold)
                    && Object.is(point?.flyOver, previous.flyOver)
                    && Object.is(point?.isFlyOver, previous.isFlyOver)
                    && Object.is(point?.sequencingMode, previous.sequencingMode);
            });
        if (matches) return cache.path;

        const path = sampleFlyByRoute(waypoints, options);
        this.pathCache = {
            radius, spacing, path,
            points: waypoints.map(point => ({
                latitude: point?.latitude, longitude: point?.longitude,
                label: point?.label, name: point?.name, isHold: point?.isHold,
                flyOver: point?.flyOver, isFlyOver: point?.isFlyOver, sequencingMode: point?.sequencingMode
            }))
        };
        return path;
    }

    updateFlightPlan(flightPlan, currentWaypointIndex) {
        let newWaypoints = [];
        if (Array.isArray(flightPlan)) {
            newWaypoints = flightPlan;
        } else if (flightPlan?.waypoints) {
            newWaypoints = flightPlan.waypoints;
        }

        const preserveIndex = Array.isArray(this.flightPlan) && this.flightPlan.length === newWaypoints.length;
        const fallbackIndex = Number.isInteger(currentWaypointIndex) ? currentWaypointIndex : this.currentWaypointIndex;
        const newIndex = preserveIndex ? fallbackIndex : 0;

        this.flightPlan = newWaypoints;
        this.currentWaypointIndex = Math.min(newIndex, Math.max(0, newWaypoints.length - 1));
        this.lastPath = this.getSampledPath(this.flightPlan);

        return {
            flightPlan: this.flightPlan,
            currentWaypointIndex: this.currentWaypointIndex,
            navigationPath: this.lastPath
        };
    }

    update(state = {}, options = {}) {
        const waypoints = Array.isArray(options.flightPlan) ? options.flightPlan : this.flightPlan;
        const hasPosition = Number.isFinite(state.latitude) && Number.isFinite(state.longitude);
        if (!hasPosition || waypoints.length === 0) {
            this.lastGuidance = {
                currentWaypointIndex: 0,
                targetHeading: null,
                activeWaypoint: null,
                navigationPath: this.getSampledPath(waypoints),
                activeTurn: null
            };
            return this.lastGuidance;
        }

        this.flightPlan = waypoints;
        if (!Number.isInteger(this.currentWaypointIndex)) {
            this.currentWaypointIndex = waypoints.length > 1 ? 1 : 0;
        }
        this.currentWaypointIndex = clamp(this.currentWaypointIndex, 0, Math.max(0, waypoints.length - 1));

        if (waypoints.length > 1 && this.currentWaypointIndex === 0) {
            this.currentWaypointIndex = 1;
        }

        const guidance = this.computeGuidance(state, options);
        this.currentWaypointIndex = guidance.currentWaypointIndex;
        this.lastPath = guidance.navigationPath;
        this.lastGuidance = guidance;
        return guidance;
    }

    computeGuidance(state, options) {
        const waypoints = this.flightPlan;
        let activeIndex = clamp(this.currentWaypointIndex, 0, Math.max(0, waypoints.length - 1));
        let activeWaypoint = waypoints[activeIndex] || null;

        if (!activeWaypoint) {
            return {
                currentWaypointIndex: 0,
                targetHeading: null,
                activeWaypoint: null,
                navigationPath: this.getSampledPath(waypoints),
                activeTurn: null
            };
        }

        const navigationPath = this.getSampledPath(waypoints, options);
        const currentPosition = { latitude: state.latitude, longitude: state.longitude };
        let distToWaypoint = calculateDistanceMeters(state.latitude, state.longitude, activeWaypoint.latitude, activeWaypoint.longitude);
        let previousWaypoint = activeIndex > 0 ? waypoints[activeIndex - 1] : null;
        let nextWaypoint = activeIndex < waypoints.length - 1 ? waypoints[activeIndex + 1] : null;
        let activeTurn = (!activeWaypoint?.isHold && previousWaypoint && nextWaypoint)
            ? buildFlyByTurn(previousWaypoint, activeWaypoint, nextWaypoint, options)
            : null;

        if (!activeWaypoint?.isHold && activeTurn) {
            const afterTurn = this.isPastTurnExit(currentPosition, activeTurn, nextWaypoint);
            if (afterTurn && activeIndex < waypoints.length - 1) {
                activeIndex += 1;
                activeWaypoint = waypoints[activeIndex] || activeWaypoint;
                previousWaypoint = activeIndex > 0 ? waypoints[activeIndex - 1] : null;
                nextWaypoint = activeIndex < waypoints.length - 1 ? waypoints[activeIndex + 1] : null;
                distToWaypoint = calculateDistanceMeters(state.latitude, state.longitude, activeWaypoint.latitude, activeWaypoint.longitude);
                activeTurn = (!activeWaypoint?.isHold && previousWaypoint && nextWaypoint)
                    ? buildFlyByTurn(previousWaypoint, activeWaypoint, nextWaypoint, options)
                    : null;
            }
        }

        if (!activeWaypoint?.isHold && !activeTurn) {
            const movingAway = Number.isFinite(options.previousDistanceToWaypoint)
                ? distToWaypoint > options.previousDistanceToWaypoint + 50
                : false;
            const wasClose = distToWaypoint < 4000;
            if ((distToWaypoint < 2000 || (movingAway && wasClose)) && activeIndex < waypoints.length - 1) {
                activeIndex += 1;
                activeWaypoint = waypoints[activeIndex] || activeWaypoint;
                previousWaypoint = activeIndex > 0 ? waypoints[activeIndex - 1] : null;
                nextWaypoint = activeIndex < waypoints.length - 1 ? waypoints[activeIndex + 1] : null;
                distToWaypoint = calculateDistanceMeters(state.latitude, state.longitude, activeWaypoint.latitude, activeWaypoint.longitude);
                activeTurn = (!activeWaypoint?.isHold && previousWaypoint && nextWaypoint)
                    ? buildFlyByTurn(previousWaypoint, activeWaypoint, nextWaypoint, options)
                    : null;
            }
        }

        const targetHeading = activeWaypoint?.isHold
            ? this.computeHoldHeading(currentPosition, activeWaypoint)
            : this.computeTargetHeading(currentPosition, previousWaypoint, activeWaypoint, nextWaypoint, activeTurn, state, options);

        return {
            currentWaypointIndex: activeIndex,
            targetHeading,
            activeWaypoint,
            distanceToWaypoint: distToWaypoint,
            navigationPath,
            activeTurn
        };
    }

    computeHoldHeading(currentPosition, waypoint) {
        const bearing = calculateBearing(currentPosition.latitude, currentPosition.longitude, waypoint.latitude, waypoint.longitude);
        const distance = calculateDistanceMeters(currentPosition.latitude, currentPosition.longitude, waypoint.latitude, waypoint.longitude);
        const holdRadius = 3000;
        const convergenceGain = 0.001;
        const distError = distance - holdRadius;
        const correction = Math.atan(distError * convergenceGain);
        return normalizeHeadingDegrees(bearing + 90 - (correction * 180 / Math.PI));
    }

    computeTargetHeading(currentPosition, previousWaypoint, activeWaypoint, nextWaypoint, activeTurn, state = {}, options = {}) {
        if (!activeWaypoint) return null;
        if (!previousWaypoint) {
            return calculateBearing(currentPosition.latitude, currentPosition.longitude, activeWaypoint.latitude, activeWaypoint.longitude);
        }
        // Follow the local route, never home back to an entry point already passed.
        // This bounded polyline uses 24 arc chords regardless of enroute leg length.
        const geographicPath = [previousWaypoint];
        if (activeTurn && nextWaypoint) {
            geographicPath.push(activeTurn.entry);
            for (let i = 1; i <= 24; i++) {
                const angle = activeTurn.startAngle + activeTurn.arcAngle * i / 24;
                const x = activeTurn.center.x + Math.cos(angle) * activeTurn.radiusMeters;
                const y = activeTurn.center.y + Math.sin(angle) * activeTurn.radiusMeters;
                geographicPath.push(projectFromLocalMeters(activeTurn.referenceLat, activeTurn.referenceLon, x, y));
            }
            geographicPath.push(nextWaypoint);
        } else {
            geographicPath.push(activeWaypoint);
            if (nextWaypoint && !activeWaypoint.flyOver && !activeWaypoint.isFlyOver && activeWaypoint.sequencingMode !== 'manual') geographicPath.push(nextWaypoint);
        }
        const path = geographicPath.map(point => projectToLocalMeters(currentPosition.latitude, currentPosition.longitude, point.latitude, point.longitude));
        let closest = null;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i]; const b = path[i + 1];
            const dx = b.x - a.x; const dy = b.y - a.y;
            const length = Math.hypot(dx, dy);
            if (length < 0.01) continue;
            const t = clamp(-(a.x * dx + a.y * dy) / (length * length), 0, 1);
            const point = { x: a.x + t * dx, y: a.y + t * dy };
            const distanceSq = point.x * point.x + point.y * point.y;
            if (!closest || distanceSq < closest.distanceSq) closest = { index: i, point, distanceSq };
        }
        if (!closest) return null;
        const speed = Math.max(0, Number(state.groundSpeed) || Number(state.airspeed) || 0) * 0.514444;
        let remaining = clamp(options.lookAheadMeters ?? speed * 18, 500, 6000);
        let target = closest.point;
        for (let i = closest.index; i < path.length - 1; i++) {
            const end = path[i + 1];
            const dx = end.x - target.x; const dy = end.y - target.y;
            const length = Math.hypot(dx, dy);
            if (length >= remaining && length > 0) {
                target = { x: target.x + dx * remaining / length, y: target.y + dy * remaining / length };
                remaining = 0; break;
            }
            remaining -= length;
            target = end;
        }
        // Extend the final course rather than commanding a reversal after passing it.
        if (remaining > 0 && !activeWaypoint.flyOver && !activeWaypoint.isFlyOver && activeWaypoint.sequencingMode !== 'manual') {
            const a = path.at(-2); const b = path.at(-1);
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length > 0) {
                remaining += Math.max(0, (-b.x * (b.x - a.x) - b.y * (b.y - a.y)) / length);
                target = { x: b.x + (b.x - a.x) * remaining / length, y: b.y + (b.y - a.y) * remaining / length };
            }
        }
        return normalizeHeadingDegrees(Math.atan2(target.y, target.x) * 180 / Math.PI);
    }

    getTurnProgress(currentPosition, turn) {
        const local = projectToLocalMeters(turn.referenceLat, turn.referenceLon, currentPosition.latitude, currentPosition.longitude);
        const angle = Math.atan2(local.y - turn.center.y, local.x - turn.center.x);
        if (turn.turnDirection === 'left') {
            const total = turn.endAngle - turn.startAngle;
            const travelled = clamp(angle >= turn.startAngle ? angle - turn.startAngle : angle + Math.PI * 2 - turn.startAngle, 0, total);
            return total > 1e-6 ? travelled / total : 0;
        }
        const total = turn.startAngle - turn.endAngle;
        const travelled = clamp(angle <= turn.startAngle ? turn.startAngle - angle : turn.startAngle + Math.PI * 2 - angle, 0, total);
        return total > 1e-6 ? travelled / total : 0;
    }

    isPastTurnExit(currentPosition, turn, nextWaypoint) {
        if (!turn || !nextWaypoint) return false;
        const referenceLat = turn.exit.latitude;
        const referenceLon = turn.exit.longitude;
        const nextLocal = projectToLocalMeters(referenceLat, referenceLon, nextWaypoint.latitude, nextWaypoint.longitude);
        const currentLocal = projectToLocalMeters(referenceLat, referenceLon, currentPosition.latitude, currentPosition.longitude);
        const direction = Math.hypot(nextLocal.x, nextLocal.y);
        if (direction < 1e-6) return false;
        const unitX = nextLocal.x / direction;
        const unitY = nextLocal.y / direction;
        const alongTrack = currentLocal.x * unitX + currentLocal.y * unitY;
        const crossTrack = Math.abs(currentLocal.x * unitY - currentLocal.y * unitX);
        return alongTrack > 50 && crossTrack < Math.max(1852, turn.radiusMeters * 2);
    }
}
