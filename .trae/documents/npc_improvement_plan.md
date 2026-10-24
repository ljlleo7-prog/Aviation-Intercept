# Cockpit NPC Module Audit & Improvement Plan

## 1. Current State Analysis

The current Cockpit NPC module consists of:
- **`NPCCrewService.js`**: Core logic handling First Officer (FO) and Cabin Crew states, stress levels, and fetching dynamic dialogue from Supabase based on scenarios.
- **`CrewPanel.jsx`**: The React component rendering the crew communication interface.
- **`generate_npc_responses.js`**: An offline script that uses an LLM (Ollama) to generate dialogue permutations with specific data placeholders (e.g., `[ALTITUDE]`, `[HEADING]`).

## 2. Identified Issues & Code Smells

### A. Critical Bug: Missing Template Hydration
- **Issue**: The LLM generation script creates responses with placeholders like `[ALTITUDE]`, `[HEADING]`, and `[AIRSPEED]`. However, `NPCCrewService.js` **never replaces these placeholders** with actual flight simulator data before sending them to the UI. The user just sees the raw placeholder tags.
- **Impact**: Breaks immersion completely.

### B. One-Way Stress Accumulation
- **Issue**: In `NPCCrewService.handleFailure()`, stress is incremented (`FO.stress += 20`) but it **never decays**. Once stress reaches 100%, it stays there forever, even if the flight stabilizes.
- **Impact**: Unrealistic crew behavior over longer scenarios.

### C. Timeout Leaks & Race Conditions
- **Issue**: `triggerResponse` uses `setTimeout` to simulate latency. These timeouts are not tracked or cleared.
- **Impact**: If a scenario is reset or multiple events fire rapidly, old timeouts will still execute, causing a barrage of out-of-context messages.

### D. Tight Coupling & Missing Offline Support
- **Issue**: `NPCCrewService` directly queries `supabase`. If the database is down or the user is offline, it falls back to an extremely limited 3-string array.
- **Impact**: Poor offline experience. It should ideally fall back to a robust local JSON cache.

### E. UI Hardcoding
- **Issue**: `CrewPanel.jsx` relies entirely on massive inline styles with hardcoded absolute positioning (`right: '350px'`). It also only displays FO stress, completely ignoring Cabin Crew stress.
- **Impact**: Hard to maintain, unscalable, and incomplete UI.

---

## 3. Step-by-Step Improvement Plan

### Step 1: Fix Template Hydration (Data Injection)
- Update `NPCCrewService` to accept or fetch the current aircraft state (e.g., via a `getAircraftState()` function or by subscribing to telemetry events).
- Create a `hydrateMessage(content, flightData)` helper function that replaces `[ALTITUDE]`, `[AIRSPEED]`, `[HEADING]`, etc., with actual values formatted appropriately (e.g., rounding to nearest 100 for altitude).

### Step 2: Implement Stress Management & Decay
- Add a periodic tick or update loop in `NPCCrewService` that slowly decays crew stress over time if no failures are active.
- Factor in aircraft stability (e.g., extreme pitch/roll could temporarily pause decay or increase stress).

### Step 3: Fix Timeout Leaks & Message Queuing
- Introduce a `timeoutId` tracking system in `NPCCrewService`.
- If a new critical message needs to be sent, clear the previous pending timeout to avoid overlapping dialogue.
- Alternatively, implement a proper message queue so the FO doesn't talk over themselves.

### Step 4: Refactor CrewPanel.jsx (UI Clean-up)
- Move inline styles to a dedicated CSS module or standard CSS file (`CrewPanel.css`).
- Add a UI element to track and display Cabin Crew stress alongside FO stress.
- Make the panel position responsive rather than hardcoded to `right: 350px`.

### Step 5: Improve Offline Fallback
- Export a subset of the generated NPC responses into a local `fallback_responses.json`.
- Modify `fetchResponses` to use this local JSON file if the Supabase query fails, ensuring a rich experience even without database connectivity.

## 4. Execution Strategy

Once this plan is approved, the implementation will proceed file-by-file:
1. `src/services/NPCCrewService.js` (Hydration, Timeouts, Stress Decay, Fallback logic).
2. `src/components/CrewPanel.jsx` and `src/components/CrewPanel.css` (UI Refactoring).
3. Test the integrations by triggering failures and verifying placeholders are correctly replaced.