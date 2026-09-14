# Aviation Intercept

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)

**Aviation Intercept** is a web-based aviation emergency simulator focused on abnormal situations, cockpit workload, and failure management. It combines a custom flight model, interactive cockpit systems, route planning, and narrative-driven scenarios.

This project is playable now, but it is **not** a fully study-level airliner simulation. Some aircraft systems and overhead workflows are modeled in depth, while others are currently simplified, shared across aircraft, or marked inoperative.

---

## Key Features

- **Custom 6-DOF physics engine** for aircraft motion and control response.
- **Dynamic failure system** with procedural and scenario-driven emergencies.
- **Interactive cockpit panels** including flight controls, autopilot, navigation, radios, checklist, save/load, and overhead systems.
- **Multi-aircraft support** driven by aircraft performance and configuration data.
- **Narrative and ATC-style flow** that blends cinematic setup with active flight management.

---

## Installation & Setup

### Prerequisites
- Node.js 16+
- npm

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/Aviation-Intercept.git
   cd Aviation-Intercept
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Optional: preview a production build**
   ```bash
   npm run build
   npm run preview
   ```

By default, the Vite dev server is expected to be available at `http://localhost:3000` in this project configuration.

---

## Flight Manual

### 1. What this simulator is

Aviation Intercept is built around emergency and abnormal-operations gameplay rather than routine gate-to-gate airline simulation. You will spend most of your time managing:

- route and dispatch setup
- aircraft handling during abnormal situations
- autopilot and navigation mode management
- radios and frequency context
- checklist progression
- overhead systems during startup or failures

Some systems are intentionally simplified for gameplay, especially outside the Boeing 737 implementation.

### 2. Starting a flight

The startup flow is split into a staged initialization sequence.

#### Step 1: Difficulty
Current difficulty levels are:
- **Rookie**
- **Amateur**
- **Intermediate**
- **Advanced**
- **Pro**
- **Devil**

These affect how demanding the flight is, including startup expectations and failure pressure. `Pro` and `Devil` are the main modes that enforce deeper startup procedure checks before departure.

#### Step 2: Operations & Environment
You then configure the flight environment, including:
- crew count
- Zulu time
- season
- route readiness
- aircraft/loadout readiness through the dispatch tablet

#### Dispatch Tablet responsibilities
The dispatch tablet is used to complete the operational side of the flight. It is where you validate or edit:
- departure and arrival airports
- route setup
- passengers
- payload
- reserve factor / reserve fuel
- cruise altitude / performance setup

The sim will not let you finalize initialization until route and loadout requirements are complete.

#### Resume Flight
If signed in, the simulator can detect a cloud save and offer:
- **Resume Flight**
- **Discard Save**

If you are offline or not signed in, cloud resume is unavailable.

### 3. Flight phases and general flow

A typical session moves through these layers:
- initialization and dispatch setup
- narrative / pre-departure phase
- active flight phase
- descent / approach / landing
- failure handling and post-event outcome

Important usability note:
- The aircraft may be intentionally held static during some pre-takeoff or narrative phases.
- This is expected behavior, not always a physics bug.
- In harder modes, takeoff progression can depend on startup completion and clearance/state progression.

### 4. Primary flight controls

#### Pitch and roll
Manual pitch and roll are controlled through the **on-screen draggable joystick**.

- Drag the joystick to command pitch and bank.
- Releasing it recenters the control input.
- Manual joystick input is disabled when autopilot is engaged.
- Manual joystick input is also disabled after a crash state.

#### Rudder / yaw
Yaw control is available through the rudder control module. Use it for directional control and ground steering support where needed.

#### Thrust
The thrust manager exposes per-engine control.

You can use it to:
- move each throttle independently
- enable **SYNC** to link engine thrust together
- switch between **forward thrust** and **reverse thrust** modes
- monitor whether an engine is in **RUN** or **CUT** state
- toggle engine run/cut controls from the thrust area

Important behavior:
- reverse thrust is not just a label; it uses a gated lever region
- synced throttles can still be broken out for asymmetric control if sync is disabled
- multi-engine aircraft use multiple engine levers where data supports it

#### Secondary flight controls
During flight, the simulator also exposes controllable aircraft configuration systems including:
- flaps
- landing gear
- air brakes / speed brakes
- wheel brakes
- trim

Exact flap and speed-brake detents vary by aircraft because they are pulled from aircraft-specific data.

### 5. Autopilot and navigation

The autopilot panel supports active mode management rather than being a passive status display.

Available controls include:
- **AP ON / AP OFF**
- **LNAV / HDG** mode switching
- **APP** for ILS-style approach mode
- target selectors for:
  - speed
  - heading
  - vertical speed
  - altitude

Important usability notes:
- **APP / ILS mode requires Tower frequency context** before it can be armed.
- The autopilot panel can be visible even when the current phase or context does not allow every mode to be used.
- Mode behavior is simulation-oriented and should not be assumed to exactly mirror real airline autoflight logic.

### 6. Communications and radio use

The communications module is part of active flight management.

Key behaviors:
- radio frequencies are tunable in the VHF range used by the sim
- **121.500** guard/emergency frequency is always available
- nearby station availability changes with context and altitude
- if no valid station is tuned, the radio can show **No Signal**
- tower frequency context matters for some approach/autopilot features

### 7. Sidebar panels and what they do

The in-flight sidebar exposes the following major panels:

- **Checklist** — procedural checklist flow for major phases
- **F-Comp** — flight computer tools
- **Systems** — overhead/system access
- **Timer** — timing utilities
- **Save/Load** — local file save/load and signed-in cloud save flow
- **Inspect** — debug/inspection-oriented panel access
- **Settings** — present in the UI, but may not be fully useful yet depending on current implementation state

The main in-flight interface can also surface:
- navigation panel
- communication module
- control surface panel
- flight pose/status panel
- system status panel
- overhead panel
- save/load panel

Some phases use a more immersive narrative layout instead of the full “all-panels-open” workflow.

### 8. Checklists

The simulator includes checklist categories for major stages of flight, including:
- preflight
- engine start
- takeoff
- descent
- landing

Checklist behavior is mixed:
- some items are automatically validated from aircraft/system state
- some items are still manual and informational

Do not assume every checklist line is fully wired to the deepest system logic.

### 9. Save and load

The sim supports both local and signed-in save workflows.

Capabilities include:
- downloading an encrypted local save file
- uploading a previous local save file
- cloud save / resume when authenticated

Save/load is intended for session continuity, testing, and scenario retrying.

### 10. Overhead panel and system controls

The overhead panel is where most non-primary aircraft systems are managed.

Current modeled overhead/system categories include:
- electrical power
- APU
- fuel system
- pneumatics / bleed air
- packs / air conditioning flow
- hydraulics
- engine start controls
- fire protection
- exterior lighting
- anti-ice / probe heat
- ADIRS / navigation alignment logic
- cabin pressurization
- comm / transponder-related controls
- signs / emergency lighting / miscellaneous switches
- wipers and selected support systems

What this means in practice:
- many switches do drive simulated state
- several subsystems feed into the runtime simulation rather than being cosmetic only
- however, not every switch has a fully aircraft-specific downstream effect

### 11. Current aircraft support

The simulator currently includes selectable aircraft data for:
- Boeing 737-800
- Airbus A320-200
- Boeing 777-300ER
- Airbus A350-900
- Embraer E190
- Cessna Citation X
- Boeing 747-400
- Airbus A380-800
- Airbus A330-300
- Airbus A340-600
- Boeing 757-200

#### Current state of cockpit/overhead support
- The **Boeing 737** currently has the most customized overhead presentation and the most bespoke aircraft-specific cockpit work.
- Even on the 737, several sections are still explicitly **INOP** or partially implemented.
- Other Boeing aircraft currently rely on a more **generic Boeing overhead abstraction**.
- Airbus aircraft currently rely on a more **generic Airbus overhead abstraction**.
- Non-737 aircraft are therefore selectable and flyable in the broader sim, but their overhead panel implementations are **not yet updated to full aircraft-specific layouts/workflows** and may not behave correctly for full system interaction.

If you are looking for the most complete overhead/system experience right now, use the **737**.

### 12. Known limitations and usability notes

This is the most important section to read before treating the sim like a study-level cockpit trainer.

#### Fidelity limitations
- System modeling is partial and gameplay-oriented in several areas.
- Some switches affect displayed state or simplified system state more than fully detailed subsystem behavior.
- Startup and checklist logic are more complete on harder modes, but still not perfectly representative of real-world procedures.
- Some aircraft share generalized systems logic even when their real cockpits differ significantly.

#### Overhead limitations
- The 737 has the best bespoke layout, but is still incomplete.
- Other aircraft do **not** yet have complete aircraft-specific overhead recreations.
- Expect shared abstractions, simplified logic, and some missing or placeholder controls.

#### Phase/context limitations
- Some controls are intentionally unavailable depending on crash state, autopilot state, or radio context.
- APP/ILS mode is context-sensitive and tower-frequency dependent.
- Movement may be frozen during narrative or pre-clearance phases.

#### UI limitations
- Some visible panels or buttons may be present before they are fully feature-complete.
- “Inspect” is closer to a debug/inspection tool than a polished player-facing avionics system.
- Settings availability may lag behind the visible button presence.

### 13. Recommended way to play right now

For the best current experience:
1. Start with the **737**.
2. Use **Rookie**, **Amateur**, or **Intermediate** first.
3. Complete route/loadout through the dispatch tablet before finalizing.
4. Learn the joystick, throttle sync, reverse gate, and basic autopilot controls before attempting harder failures.
5. Treat the overhead as partially realistic: useful, interactive, and important — but not yet complete across the fleet.

> Dev/testing note: the project includes dev-mode tooling and quick-start behavior for rapid iteration, but the exact flow may vary depending on the current UI state.

---

## Project Structure

For a detailed technical deep-dive, refer to:
- [**PROJECT_OVERVIEW.md**](./PROJECT_OVERVIEW.md): High-level architecture and design philosophy.
- [**CODE_REFERENCE.md**](./CODE_REFERENCE.md): Detailed API documentation for classes and services.

```text
src/
├── components/          # UI: cockpit panels, HUDs, initialization screens
├── config/              # JSON: weather presets, difficulty settings
├── data/                # Databases: airports, aircraft specs, failure scenarios
├── hooks/               # Main runtime adapters (e.g. useAircraftPhysics)
├── services/            # Core engines and simulation services
│   ├── failures/        # Failure state machine & definitions
│   ├── RealisticFlightPhysicsService.js
│   └── ...
├── utils/               # Navigation, math, formatting helpers
└── App.jsx              # App entry and top-level orchestration
```

---

## Development

### Available Scripts
- `npm run dev` — start local dev server
- `npm run build` — create production build
- `npm run preview` — preview production build locally
- `npm run lint` — run ESLint
- `npm test` — run automated tests

### Adding New Aircraft
1. Add performance data to `src/data/aircraftDatabase.json`.
2. Ensure thrust, wing, and control parameters are accurate enough for the physics model.
3. If you want full cockpit fidelity, aircraft-specific overhead/panel work is also required.

### Creating Failures
1. Define the failure in `src/services/failures/types/`.
2. Register it through the failure system.
3. Implement the runtime effect in the relevant failure/physics path.

---

## License

This project is licensed under the MIT License.
