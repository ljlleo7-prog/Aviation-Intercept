# Ultimate Crash Simulator - Project Documentation

## 1. Project Overview

**Ultimate Crash Simulator** (Legacy Version 0.1) is a sophisticated web-based flight simulation platform built with React and Vite. Unlike traditional flight simulators that focus solely on normal flight operations, this project places a heavy emphasis on **failure scenarios**, **realistic physics**, and **narrative generation**.

It features a custom 6-DOF (Degrees of Freedom) physics engine, a complex failure dependency graph (Skylinetragedy), and an AI-driven narrative system that generates pilot sensory descriptions based on flight conditions and system failures.

## 2. Technology Stack

-   **Frontend Framework**: React 18
-   **Build Tool**: Vite
-   **Styling**: Tailwind CSS, CSS Modules
-   **State Management**: React Context (Language), Local State, Event Bus
-   **Physics Engine**: Custom JavaScript-based 6-DOF rigid body dynamics
-   **Backend/Data**: Supabase (for persistent narrative data), Local JSON databases
-   **AI Integration**: Ollama (Llama 3) for generating dynamic narratives
-   **Testing**: Node.js native test runner (`node --test`)
-   **Linting**: ESLint

## 3. Directory Structure

```
/
├── public/                 # Static assets
├── scripts/                # Node.js scripts for data processing, analysis, and generation
├── src/
│   ├── components/         # React UI components (Cockpit panels, overlays, etc.)
│   ├── config/             # Configuration files (weather, etc.)
│   ├── contexts/           # React Contexts (LanguageContext)
│   ├── data/               # JSON databases (Airports, Aircraft, Failures)
│   ├── hooks/              # Custom React Hooks (Physics, Search)
│   ├── locales/            # i18n translation files (en, zh)
│   ├── services/           # Core business logic (Physics, Failures, ATC, NPC)
│   │   ├── failures/       # Failure system implementation
│   │   └── skylinetragedy/ # Narrative and cascade logic
│   ├── utils/              # Helper functions (Math, Distance, Formatters)
│   ├── App.jsx             # Main Application Component
│   └── main.js             # Entry point
├── tests/                  # Unit tests
└── package.json            # Dependencies and scripts
```

## 4. Core Services & Logic

The core logic resides in `src/services/`. These are singleton services or classes that manage the simulation state.

### 4.1. Physics Engine (`RealisticFlightPhysicsService.js`)
This is the heart of the simulation. It implements a high-fidelity 6-DOF physics model.
-   **Rigid Body Dynamics**: Uses Quaternions for attitude tracking to avoid gimbal lock.
-   **Coordinate Systems**: Uses NED (North-East-Down) for internal physics and FRD (Forward-Right-Down) for body frame.
-   **Aerodynamics**: Calculates lift, drag, and side forces based on angle of attack, sideslip, and control surface deflections.
-   **Engines**: Manages multiple engine instances (`EnginePhysicsService.js`) with thrust, fuel flow, and response lag.
-   **Environment**: Simulates standard atmosphere, wind, gusts, shear, and turbulence.
-   **Ground Interaction**: Handles landing gear compression and friction.

### 4.2. Failure System (`FailureSystem.js` & `src/services/failures/`)
Manages the generation and execution of system failures.
-   **Failure Types**: Extensive list defined in `FailureTypes` (Engine, Hydraulic, Pitot, Structural, etc.).
-   **Difficulty Levels**: Configurable probability multipliers and recovery chances (Rookie to Devil).
-   **Scheduling**: Supports forced failures (scheduled by time) and random probabilistic failures.
-   **Handlers**: `FailureHandler.js` applies the effects of failures to the physics model (e.g., locking control surfaces, reducing engine thrust).

### 4.3. SkylineTragedy Service (`src/services/skylinetragedy/`)
This module orchestrates the narrative and complex failure cascades.
-   **SkylinetragedyService.js**: The main coordinator. It initializes the failure graph and updates the cascade resolver.
-   **FailureGraphManager.js**: Manages a directed graph of system dependencies. For example, an "Engine Failure" might lead to "Hydraulic Pressure Loss," which leads to "Control Surface Jam."
-   **CascadeResolver.js**: Determines which downstream failures are triggered based on active failures and time.
-   **NarrativePipeline.js**: Converts system states and symptoms into narrative events.
-   **OllamaNarrativeService.js**: Interfaces with a local Ollama instance to generate human-readable, sensory-based pilot narratives (e.g., "I feel a heavy vibration in the yoke...").

### 4.4. Weather & ATC
-   **RealWeatherService.js**: Fetches real-world weather data (placeholder/mock or API integration).
-   **ATCLogic.js**: Manages Air Traffic Control communications and state.
-   **NPCService.js**: Simulates other aircraft in the vicinity.

## 5. Frontend Architecture

### 5.1. Main Layout (`App.jsx`)
-   **State**: Manages app modes (`home`, `init`, `simulation`), user selections (aircraft, airport), and global settings.
-   **Routing**: Simple conditional rendering based on `appMode`.

### 5.2. Simulation View (`FlightInProgress.jsx`)
-   **Responsibility**: Initializes the physics engine and renders the simulation interface.
-   **Spawn Logic**: Calculates precise runway threshold coordinates for spawning based on airport data.
-   **Integration**: Connects React state with the imperative Physics Service.

### 5.3. Cockpit & Panels (`FlightPanelModular.jsx`)
The cockpit is composed of modular panels:
-   **Primary Flight Display (PFD)**: `FlightPosePanel.jsx` (Attitude, Altitude, Speed).
-   **Navigation Display (ND)**: `NavigationPanel.jsx`.
-   **Engine Indicating and Crew Alerting System (EICAS)**: `SystemStatusPanel.jsx`.
-   **Overhead Panel**: `OverheadPanel.jsx` (Electrical, Fuel, Bleed Air systems).
-   **Controls**: `ControlSurfacePanel.jsx`, `ThrustManager.jsx`, `DraggableJoystick.jsx`.
-   **Communication**: `CommunicationModule.jsx` (Radio, ATC).

### 5.4. Internationalization (`LanguageContext.jsx`)
-   Uses a custom Context provider to switch between English (`en`) and Chinese (`zh`).
-   Translations are stored in `src/locales/`.

## 6. Data Management

### 6.1. Local Data (`src/data/`)
-   **Airports**: JSON files (`americanAirports.json`, `europeanAirports.json`, etc.) containing runway geometry and metadata.
-   **Aircraft**: `aircraftDatabase.json` defines performance characteristics (mass, thrust, dimensions).
-   **Failures**: `failureScenarios.json`, `failureRelationships.json`.

### 6.2. Supabase Integration
-   Used primarily for storing and retrieving generated narratives (`skylinetragedy_narratives` table).
-   configured via `.env` variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## 7. Scripts & Tooling

The `scripts/` directory contains powerful tools for development and content generation:

-   **`generate_narratives.js`**:
    -   **Usage**: `npm run generate:narratives`
    -   **Function**: Reads symptoms, calls local Ollama (Llama 3) to generate sensory descriptions, and saves them to Supabase.
-   **`process_failure_graph.js`**:
    -   **Usage**: `npm run process:failure-graph`
    -   **Function**: Processes raw system data (`raw_system_data.json`) into a structured failure graph, applying logic rules.
-   **`check_translations.py`**:
    -   **Function**: Scans the codebase for usage of `t()` function and compares against locale files to find missing or unused keys.
-   **`fetch_authoritative_sources.js`**:
    -   **Function**: Fetches external data (like NTSB reports) to enrich the failure database.

## 8. Installation & Usage

### Prerequisites
-   Node.js (v18+)
-   Supabase project (optional, for narratives)
-   Ollama (optional, for AI generation)

### Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file based on `.env.example` (if available) or set:
    ```
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    ```

### Running the App
-   **Development**: `npm run dev`
-   **Build**: `npm run build`
-   **Preview**: `npm run preview`

### Running Scripts
-   **Generate Failure Descriptions**: `npm run generate:failure-descriptions`
-   **Update Failure Graph**: `npm run update:failure-graph`
