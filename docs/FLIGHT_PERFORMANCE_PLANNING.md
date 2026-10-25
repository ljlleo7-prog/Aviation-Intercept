# Simulator fuel and thrust planning

Fuel planning separates taxi, trip (climb, cruise, descent, approach), contingency,
alternate allowance and final reserve. Twenty fixed-point iterations account for
fuel carried in aircraft mass. Climb duration increases with mass, and climb flow
scales with mass. The baseline burn is the database kg/NM value times cruise KTAS.
The reserve input below 1 is a contingency fraction (minimum 5%); inputs at or above
1 retain the legacy reserve-hours meaning. Final reserve uses 30 minutes of
estimated holding flow; alternate fuel uses a 15-minute proxy pending actual
alternate routing. Overweight and tank-capacity warnings do not silently replace
an aircraft's estimate with generic jet fuel.

Automatic altitude considers route distance, field elevation, weight and aircraft
ceiling. Local circuits use about 3,000 ft above the field, nearby transfers about
5,000 ft, regional trips progressively higher levels, and long trips up to 41,000 ft.
The FMC INIT AUTO button restores automatic selection. A manual altitude affects
fuel planning. Suggested ranges are planning estimates, not ATC clearances, terrain
clearance guarantees or directional cruising-level assignments.

FLEX uses assumed temperature above actual ambient, limited by a conservative
mass-dependent thrust-reduction budget (up to 25%, tapering to zero at 95% MTOW).
The thrust fraction converts to N1 using the engine's approximate N1 power law.
TOGA commands the modeled rated maximum, independent of mass. The 737's maximum
forward lever now reaches rated N1 without needing an engine-out emergency boost.
Ambient Kelvin values are converted before temperature corrections.

These are simulator engineering estimates. Runway length, obstacles, bleed,
anti-ice and engine-out certified performance are not available to validate a real
FLEX or assumed-temperature takeoff. No dispatch or certification claim is made.

References:
- FAA AC 25-13, Reduced and Derated Takeoff Thrust (Power) Procedures:
  https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.current/documentNumber/25-13
- FAA AC 25-7C, assumed-temperature limitations and climb/field-length constraints:
  https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_25-7C.pdf
- EASA Easy Access Rules for Air Operations, fuel planning components:
  https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-air-operations
