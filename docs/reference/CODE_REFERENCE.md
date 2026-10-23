# Code Reference

This document provides detailed API documentation for the core services and utilities in the **Ultimate Crash** project.

## 1. Physics Engine

### `src/services/RealisticFlightPhysicsService.js`
The core physics engine implementing 6-DOF rigid body dynamics.

#### **Class: `RealisticFlightPhysicsService`**
**Constructor**: `new RealisticFlightPhysicsService(aircraftData, initialLat, initialLon)`
- `aircraftData`: Object containing mass, thrust, wing area, etc.
- `initialLat`, `initialLon`: Starting coordinates.

**Properties**:
- `state`: The current physics state.
    - `pos`: `Vector3` (NED frame position)
    - `vel`: `Vector3` (Body frame velocity: u, v, w)
    - `quat`: `Quaternion` (Attitude: Body to Earth)
    - `rates`: `Vector3` (Angular velocity: p, q, r)
- `controls`: Current control surface inputs (0-1 or -1 to 1).
    - `throttle`, `aileron`, `elevator`, `rudder`, `flaps`, `gear`, `brakes`
- `engines`: Array of `EnginePhysicsService` instances.
- `systems`: State of aircraft systems (hydraulics, electrical, etc.).

#### **Helper Classes**
- **`Vector3`**: Standard 3D vector implementation (`add`, `sub`, `scale`, `dot`, `cross`, `normalize`).
- **`Quaternion`**: Rotation tracking (`rotate`, `toEuler`, `fromEuler`).

---

## 2. Failure System

### `src/services/failures/FailureHandler.js`
Manages the lifecycle of system failures.

#### **Class: `FailureHandler`**
**Constructor**: `new FailureHandler(config)`
- `config.difficulty`: Sets failure probability and max active failures.

**Methods**:
- `update(dt, flightState)`: Advances time for active failures and checks for random triggers.
- `triggerFailure(id, context)`: Manually starts a specific failure (e.g., `'eng1_fire'`).
- `registerGroup(group)`: Loads failure definitions from a module.
- `checkRandomFailures(state)`: Evaluates probabilistic triggers based on difficulty settings.

### `src/services/failures/BaseFailure.js`
Base class for all failure instances.
- `transitionTo(stage)`: Moves failure between stages (hidden -> incipient -> active).
- `apply(physicsService)`: Modifies the physics state (e.g., reduces thrust to 0).

---

## 3. Data Services

### `src/services/airportService.js`
Manages the global airport database.

#### **Class: `AirportService`**
**Methods**:
- `searchAirports(query, options)`: Returns airports matching IATA/ICAO/City.
- `getAirportByCode(code)`: Returns full airport object for a given code.
- `calculateDistance(dep, arr)`: Returns Great Circle distance in Nautical Miles.
- `getRunwayGeometry(code, runwayId)`: Returns threshold coordinates for spawning.

### `src/services/aircraftService.js`
**Functions**:
- `loadAircraftData()`: Async loader for `aircraftDatabase.json`.
- `getAircraftPerformance(model)`: Returns fuel burn profiles and weight limits.

---

## 4. Environment

### `src/services/weatherService.js`
Generates procedural weather based on location and season.

**Functions**:
- `generateInitialWeather(lat, lon, season)`: Returns a `WeatherData` object.
- `updateWeather(currentWeather, dt)`: Evolves weather parameters over time.
- `getRegionalWeatherAdjustments(lat, lon)`: Applies climate modifiers (e.g., higher temp in tropics).

**Types**:
- `WeatherData`: `{ windSpeed, windDirection, turbulence, visibility, precipitation, temperature }`

---

## 5. React Hooks

### `src/hooks/useAircraftPhysics.js`
The main simulation loop connecting React components to the Physics Service.

**Parameters**:
- `config`: Initial setup (aircraft model, airport).
- `autoStart`: Whether to begin simulation loop immediately.

**Returns**:
- `flightData`: Real-time telemetry for UI (altitude, airspeed, pitch, roll).
- `physicsState`: Meta-state (isRunning, updateCount).
- `isCrashed`: Boolean flag.

**Internal Logic**:
- Uses `requestAnimationFrame` to drive the physics `update(dt)` method.
- Syncs `currentControlsRef` (from UI inputs) to `physicsService.controls`.

---

## 6. Utilities

### `src/utils/distanceCalculator.js`
- `calculateDistance(lat1, lon1, lat2, lon2)`: Haversine formula.
- `formatFuel(weight)`: Formats fuel in lbs/kg.
- `formatFlightTime(minutes)`: Returns "HH:MM".
