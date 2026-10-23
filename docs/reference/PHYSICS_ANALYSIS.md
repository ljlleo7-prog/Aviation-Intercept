# RealisticFlightPhysicsService.js - Detailed Analysis

This document provides an extreme-detail analysis of `RealisticFlightPhysicsService.js`, breaking down every model, calculation method, and function.

## 1. File Overview
- **Path:** `src/services/RealisticFlightPhysicsService.js`
- **Length:** ~2900 lines
- **Primary Responsibility:** Core 6-DOF flight dynamics, system simulation, and world interaction for the aircraft.
- **Dependencies:** `flightMath.js` (Vector3, Quaternion), `RealisticAutopilotService`, `EnginePhysicsService`, `FailureHandler`.

## 2. Core State & Coordinate Systems
The service maintains a central `this.state` object:
- **Coordinate System:** North-East-Down (NED) for position/velocity.
  - X: North
  - Y: East
  - Z: Down (Altitude = -Z)
- **Attitude:** Quaternion-based (`this.state.quat`).
- **Body Frame:** Forward-Right-Down (FRD).
- **Units:** Metric (Meters, Meters/sec, Radians) internally; converted to Imperial for display/inputs often.

## 3. Detailed Function Analysis

### 3.1. Core Loop: `update(dt)`
**Purpose:** Main simulation tick.
**Flow:**
1.  **Pause Check:** Returns if `dt` is zero or game is paused.
2.  **Autopilot:** Calls `autopilot.update(dt)`.
3.  **Sub-stepping:**
    -   **Model:** Uses a fixed sub-step `dt_step = 0.01` (100Hz) to ensure stability of stiff suspension forces.
    -   **Implementation:** Loop `accumulatedTime` until consumed.
    -   **Critical Logic:** Inside the sub-step loop, it calls `processInputs`, `calculateAerodynamicCoefficients`, `updateEngines`, `updateGroundPhysics`, and `integrate`.
4.  **Systems Update:** `updateSystems(dt)` is called *outside* the sub-step loop (once per frame).
5.  **Failure Update:** `failureSystem.update(dt)` called once per frame.
6.  **Radio Tuning:** `handleRadioTuning` checks for ILS proximity.

### 3.2. Dynamics: `integrate(forces, moments, dt)`
**Model:** 6-DOF Rigid Body Dynamics (Newton-Euler Equations).
**Logic:**
-   **Translation:** $F = ma \rightarrow a = F/m$.
    -   Includes Coriolis term: $a_{coriolis} = \omega \times v$.
-   **Rotation:** Euler's Equations for rigid body rotation.
    -   $\dot{p} = (L - (I_z - I_y)qr) / I_x$
    -   $\dot{q} = (M - (I_x - I_z)pr) / I_y$
    -   $\dot{r} = (N - (I_y - I_x)pq) / I_z$
-   **Kinematics:**
    -   Position: $\dot{x} = v_{earth}$ (Quat rotation of body velocity).
    -   Attitude: Quaternion derivative $\dot{q} = 0.5 \cdot q \otimes \omega$.
-   **Normalization:** Quaternion is re-normalized every step to prevent drift.

### 3.3. Aerodynamics: `calculateAerodynamicCoefficients(...)`
**Model:** Linear Stability Derivatives + Non-linear stalls.
**Inputs:** Airspeed ($V$), Angle of Attack ($\alpha$), Sideslip ($\beta$), Angular Rates ($p, q, r$).
**Calculations:**
1.  **Lift ($C_L$):**
    -   Linear: $C_{L0} + C_{L\alpha} \cdot \alpha$.
    -   Control: Elevator effectiveness, Flaps, Spoilers.
    -   **Stall:** `Math.sin` based drop-off when $|\alpha| > 0.3$ rad.
2.  **Drag ($C_D$):**
    -   Parasitic: $C_{D0}$.
    -   Induced: $k \cdot C_L^2 \cdot \text{GroundEffect}$.
    -   Add-ons: Flaps, Gear, Spoilers.
3.  **Side Force ($C_Y$):** Linear $\beta$ and Rudder.
4.  **Moments ($C_l, C_m, C_n$):**
    -   **Pitch ($C_m$):** $C_{m0} + C_{m\alpha}\alpha + C_{mq}q + C_{m\delta e}\delta_e$.
    -   **Roll ($C_l$):** $C_{l\beta}\beta + C_{lp}p + C_{l\delta a}\delta_a$.
    -   **Yaw ($C_n$):** $C_{n\beta}\beta + C_{nr}r + C_{n\delta r}\delta_r$.
    -   **Yaw-Roll Coupling:** Hardcoded $dCl_{yaw}$ term based on yaw rate (line ~2040).
5.  **Ground Effect:** Simple geometric function $h/b$ reducing induced drag.

### 3.4. Propulsion: `updateEngines(dt)`
**Model:** Turbofan simplified logic (delegates to `EnginePhysicsService`).
**Logic:**
-   Iterates through `this.engines`.
-   **Thrust Application:**
    -   Thrust vector is assumed to be along Body X-axis.
    -   Position offset `enginePosition` (z-offset mostly) creates pitch moment ($F \cdot z_{arm}$).
    -   Lateral offset creates yaw moment ($F \cdot y_{arm}$) for differential thrust.

### 3.5. Ground Physics: `updateGroundPhysics(dt)`
**Model:** Multi-point spring-damper suspension + Friction.
**Logic:**
1.  **Gear Points:** Defines Nose, Left Main, Right Main gear positions relative to CG.
2.  **Compression:** Calculates height of each gear point above ground.
3.  **Forces:**
    -   **Normal Force:** $F_n = k \cdot x + c \cdot \dot{x}$ (Spring + Damper).
    -   **Friction:**
        -   Uses `frictionCoeff` (0.02 rolling, 0.4 braking).
        -   **Anisotropic:** Lateral friction is higher (skid prevention) than longitudinal.
4.  **Steering:** Rotates the nose gear friction vector based on `rudder` input.
5.  **Braking:** Applies braking force to Main gears only.
6.  **"Ground Clamp":** If speed < 0.5 m/s and throttle low, forces velocity to zero (Stop sliding).

### 3.6. Systems: `updateSystems(dt)` & `performSystemAction`
**Model:** Finite State Machine / Boolean Logic.
**Components:**
-   **Hydraulics:** Pressure decay/build-up based on Engine N2 or Elec Pumps.
-   **Electrical:** Bus tie logic, Gen on/off, Battery drain.
-   **Fuel:** Pump logic, Crossfeed (boolean only), Consumption subtraction.
-   **APU:** Spool up/down logic, simple timer-based state.
-   **Pressurization:** Target altitude logic (simple interpolation).
-   **Env Control:** Cabin temp target approach.

### 3.7. Runway Stabilizer: `applyRunwayStabilizer`
**Model:** Artificial Potential Field / Forced Constraint.
**Modes:**
-   **Rookie:** "Rail Mode". Directly overrides Position and Heading to align with runway centerline. Zeroes out lateral velocity.
-   **Pro/Other:** "Gentle Pull". Applies artificial Force ($F_y$) and Moment ($M_z$) to nudge aircraft towards centerline.
    -   Uses PID-like logic on Cross Track Error (XTE).

### 3.8. Initialization & Loading: `setInitialConditions`, `loadFlightState`
-   **Massive configuration objects.**
-   `setColdStart`: Hardcodes the state of ~50 system switches to "OFF".
-   `loadFlightState`: Handles schema migration (e.g., `u,v,w` vs `x,y,z` velocities). Contains fallbacks for missing data.

## 4. "Disgraceful" Code & Code Smells
The following areas are identified as problematic or "hacky":

### 4.1. Magic Numbers
The file is riddled with untuned, hardcoded constants:
-   **Suspension:** `k = 400000` (Spring), `c = 25000` (Damper). Hardcoded in `updateGroundPhysics`.
-   **Stabilizer:** `k_lat = 5000`, `c_lat = 10000` in `applyRunwayStabilizer`.
-   **Inertia:** Hardcoded `Ix, Iy, Iz` in `integrate` if not provided by aircraft config.
-   **Ground Effect:** Hardcoded factors `16 * r * r` / `(1 + 16 * r * r)`.

### 4.2. Scope Creep
The `PhysicsService` is doing too much:
-   **Radio Tuning:** `handleRadioTuning` (lines ~2100) checks distance to ILS and auto-tunes NAV radios. This belongs in a `NavigationService` or `RadioSystem`.
-   **Flight Plan Management:** `updateFlightPlan` and `currentWaypointIndex` management logic is embedded here.
-   **Sound Triggers:** References to "clunk" sounds (though mostly via state flags).

### 4.3. Non-Physical Hacks
-   **Low Altitude Stability Assistant:** (lines ~1500) Artificially adds pitch/roll damping when `altitude < 200` to make landing easier.
-   **Ground Clamp:** Explicitly setting `vel = 0` when `speed < 0.5`. Violates physics continuity.
-   **Rail Mode:** Teleportation logic in `applyRunwayStabilizer` (Rookie mode).

### 4.4. Architectural Issues
-   **Monolithic `performSystemAction`:** A giant `switch/case` statement handling everything from "APU_START" to "LIGHT_LANDING". Should be dispatched to individual System classes.
-   **Mutable State Leaks:** Direct modification of `this.flightPlan` and `this.state` from external inputs without strict validation in some setters.

## 5. Summary of Models
| Domain | Model Used | Fidelity |
| :--- | :--- | :--- |
| **Translation** | Newton II (F=ma) | High (6-DOF) |
| **Rotation** | Euler Eq (Rigid Body) | High (6-DOF) |
| **Aerodynamics** | Linear Stability Derivatives | Medium (Valid for linear range, basic stall) |
| **Engine** | Turbofan (N1/N2/EGT) | Medium (Approximation) |
| **Ground** | Spring-Damper Points | Medium (Stiff, requires sub-stepping) |
| **Systems** | Logic/State Machine | Low-Medium (Functional, not physical) |
| **Atmosphere** | ISA (Standard Atmos) | Medium (Density/Temp vs Alt) |

