# Ultimate Crash Simulator - Project Overview

## 1. Introduction
**Ultimate Crash** is a high-fidelity, web-based aviation disaster simulator built with React. Unlike standard flight simulators, it focuses on emergency management, system failures, and pilot decision-making under pressure.

> **Detailed API Reference**: For a comprehensive breakdown of classes, methods, and functions, please refer to [CODE_REFERENCE.md](./CODE_REFERENCE.md).

## 2. Technology Stack
- **Frontend Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, CSS Modules
- **State Management**: React Hooks (useState, useEffect, custom hooks) & Event Bus pattern
- **Physics Engine**: Custom JavaScript-based 6-DOF rigid body dynamics engine
- **Data Management**: JSON databases for aircraft, airports, and failure scenarios

## 3. Architecture & Core Concepts

### 3.1. Simulation Loop
The core simulation runs within the `useAircraftPhysics` hook, which orchestrates the interaction between:
1.  **Physics Service**: Calculates forces (lift, drag, thrust, gravity) and moments to update the aircraft's state (position, velocity, attitude).
2.  **Failure System**: Injects system malfunctions based on difficulty settings and random triggers.
3.  **Weather Service**: Provides environmental conditions (wind, turbulence, visibility).
4.  **Autopilot Service**: Inputs control surface commands to maintain flight parameters.

### 3.2. Service-Oriented Architecture
The application uses a service layer to handle complex logic, keeping UI components lightweight.
- **`RealisticFlightPhysicsService.js`**: The heart of the simulation. Handles equations of motion, aerodynamics, and ground interaction. Uses Quaternions for attitude to avoid gimbal lock.
- **`FailureHandler.js`**: Manages the lifecycle of failures (inception -> active -> critical).
- **`aircraftService.js`**: Loads performance data (fuel burn, weight limits) for different aircraft models.
- **`airportService.js`**: Manages airport database, runway geometry, and ILS frequencies.
- **`weatherService.js` / `RealWeatherService.js`**: Handles static and real-time weather data fetching.

### 3.3. Event-Driven Communication
An `EventBus` (`src/services/eventBus.js`) is used for decoupled communication between services and UI components, particularly for:
- Failure alerts (`FAILURE_OCCURRED`)
- ATC messages
- Narrative events

## 4. Key Modules

### 4.1. Physics Engine (`src/services/RealisticFlightPhysicsService.js`)
- **Dynamics**: 6 Degrees of Freedom (x, y, z, roll, pitch, yaw).
- **Aerodynamics**: Calculates Lift and Drag based on Angle of Attack (AoA), flap settings, and air density.
- **Propulsion**: Models engine thrust response, spool-up times, and fuel consumption.
- **Ground Handling**: Basic landing gear physics and braking.

### 4.2. Failure System (`src/services/failures/`)
- **Structure**: Failures are defined in `src/services/failures/types/` (e.g., `EngineFailures.js`).
- **Logic**: The `FailureHandler` checks for triggers (time-based or condition-based) and manages the progression of failures.
- **Impact**: Failures directly modify physics parameters (e.g., reducing thrust, locking control surfaces).

### 4.3. User Interface
- **`FlightInitialization`**: Pre-flight setup (Airport selection, Loadsheet, Weather).
- **`FlightInProgress`**: The main cockpit view containing:
    - **`FlightPanelModular`**: Primary Flight Display (PFD) and Engine Indicating and Crew Alerting System (EICAS).
    - **`OverheadPanel`**: Systems control (Electrical, Hydraulic, Fuel).
    - **`ControlSurfacePanel`**: Visual feedback of aileron, elevator, and rudder positions.

## 5. Directory Structure
```
src/
├── components/          # React UI components (Cockpit panels, HUDs)
├── config/             # JSON configuration files (Weather presets)
├── data/               # Static databases (Airports, Aircraft specs, Failures)
├── hooks/              # Game loop hooks (useAircraftPhysics, useAirportSearch)
├── services/           # Business logic & Simulation engines
│   ├── failures/       # Failure definitions and handler
│   └── ...             # Other services (Physics, ATC, Weather)
├── utils/              # Helper functions (Math, Formatters)
└── App.jsx             # Main entry point & State container
```

## 6. Development Workflow

### Commands
- **Start Dev Server**: `npm run dev` (Runs on port 3000)
- **Build**: `npm run build`
- **Lint**: `npm run lint`

### Development Mode
A hidden "Dev Mode" can be triggered to bypass the flight setup screen for faster testing.
- **Trigger**: `Ctrl+Shift+D` (in `App.jsx`)
- **Effect**: Instantly starts a flight from KSFO to KLAX with default settings.

## 7. Future Considerations
- **Terrain**: Implementation of height-map based terrain collision.
- **ATC**: Enhanced voice interaction and traffic simulation.
- **Multiplayer**: Potential for shared cockpit or ATC roles.
