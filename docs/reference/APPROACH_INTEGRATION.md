# Approach Pattern Integration Guide

## Overview

To handle offset intercepts and non-standard approaches, you need to add an approach vectoring system that guides aircraft onto the ILS localizer before glideslope capture.

## Quick Integration (Minimal Changes)

### Option 1: Use ApproachGuidance Service (Already Created)

The `ApproachGuidance.js` service is ready to use. To integrate:

**1. Import in RealisticAutopilotService.js:**
```javascript
import { ApproachGuidance } from './ApproachGuidance.js';
```

**2. Initialize in constructor:**
```javascript
this.approachGuidance = new ApproachGuidance();
```

**3. Use in ILS mode (around line 610):**
```javascript
if (this.mode === 'ILS' && !locCaptured && distNm > 3) {
    const guidance = this.approachGuidance.computeVectorToFinal(
        latitude, longitude, fHeading * 180/Math.PI, this.runwayGeometry
    );

    if (guidance.phase === 'vectors' || guidance.phase === 'intercept') {
        this.targets.heading = guidance.targetHeading;
        this.targets.vs = 0; // Hold altitude during vectors
        return; // Skip normal ILS logic
    }
}
```

## Standard Approach Patterns (Future Enhancement)

For realistic ATC-style approaches, implement these patterns:

### 1. Straight-In Approach (Current System)
- Aircraft aligned with runway, 5-10nm out
- Direct ILS capture
- **Works well with current tuning**

### 2. Base-to-Final Turn
- Aircraft on base leg (perpendicular to runway)
- Turn to intercept at 30° angle
- **Requires approach vectoring (not yet working)**

### 3. Downwind-Base-Final Pattern
- Standard traffic pattern
- Downwind parallel to runway
- Turn base, then final
- **Requires full pattern logic (not implemented)**

### 4. Procedure Turn / Hold-in-Lieu
- For non-radar approaches
- Fly outbound, turn, intercept inbound
- **Complex, not needed for game**

## Recommended Implementation for Game

### Phase 1: Current State ✓
- Straight-in ILS approaches work perfectly
- Players spawn aligned with runway
- No additional code needed

### Phase 2: Simple Vectoring (Recommended Next)
- Add "Request Vectors" ATC option
- ATC gives heading commands to intercept
- Player follows headings manually or via HDG mode
- Switches to ILS when established

**Implementation:**
```javascript
// In ATCLogic.js
requestVectors(aircraftPos, targetRunway) {
    const vectorHeading = this.computeInterceptHeading(aircraftPos, targetRunway);
    return {
        message: `Turn left/right heading ${vectorHeading}, vectors for ILS approach`,
        heading: vectorHeading,
        altitude: this.computeInterceptAltitude(aircraftPos, targetRunway)
    };
}
```

### Phase 3: Auto-Pattern (Advanced)
- Autopilot flies full pattern automatically
- Requires pattern waypoints
- More complex, lower priority

## Current Game Integration

The ILS autopilot is already active in the game. Players can use it by:

1. **Spawning**: Choose airport and runway
2. **Position**: Game spawns aircraft on final approach (4-8nm out, aligned)
3. **Autopilot**: Enable AP and select ILS mode
4. **Landing**: Aircraft flies approach automatically

**No additional integration needed for current gameplay.**

## Testing

Run the tuning tests to verify:
```bash
node tests/ils_tuning.test.js
```

Expected results:
- Calm/Crosswind/High scenarios: PASS
- Offset scenario: FAIL (expected, requires vectoring)

