import { createPlanModel } from './fms/FlightPlanModel.js';

export const getActiveWaypoints = plan => Array.isArray(plan) ? plan : plan?.fms?.activePlan?.waypoints || plan?.waypoints || [];

// Activate one route for physics, FMC, and maps, discarding a stale pending route.
export function activateFlightRoute(plan, waypoints, index = 0) {
  const currentWaypointIndex = Math.max(0, Math.min(index, Math.max(0, waypoints.length - 1)));
  const model = createPlanModel({ waypoints, currentWaypointIndex });
  const segments = [];
  for (const point of waypoints) {
    const kind = point.segment || (point.type === 'SID_FIX' ? 'sid' : point.type === 'STAR_FIX' ? 'star' : point.type === 'RUNWAY_FIX' ? 'runway' : 'enroute');
    if (segments.at(-1)?.kind !== kind) segments.push({ kind, waypoints: segments.length ? [segments.at(-1).waypoints.at(-1)] : [] });
    segments.at(-1).waypoints.push(point);
  }
  return {
    ...plan, waypoints, currentWaypointIndex, procedureSegments: segments,
    routeObject: { ...(plan?.routeObject || {}), waypoints, procedureSegments: segments },
    fms: { ...(plan?.fms || {}), execPending: false, currentWaypointIndex,
      activePlan: { ...(plan?.fms?.activePlan || {}), waypoints, legs: model.fms.activePlan.legs },
      temporaryPlan: { ...(plan?.fms?.temporaryPlan || {}), waypoints, legs: model.fms.temporaryPlan.legs } }
  };
}
