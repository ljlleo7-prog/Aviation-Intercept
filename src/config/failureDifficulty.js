// Conservative allowlists: new failure definitions require review before they
// can appear in beginner flights. A fault's whole progression must be suitable.
const SIMPLE_FAILURES = new Set([
  'engine_vibration', 'cabin_fan_fail', 'emergency_lights_fail',
  'autopilot_disconnect', 'gps_signal_loss', 'weather_radar_fail',
  'transponder_fail', 'marker_beacon_fail'
]);
const MANAGEABLE_FAILURES = new Set([
  'pack_failure', 'generator_drive_disconnect', 'fuel_pump_fail',
  'center_tank_pump_fail', 'flap_jam', 'mach_trim_fail', 'yaw_damper_fail',
  'radalt_failure', 'ils_signal_glitch', 'heavy_precipitation'
]);
const SERIOUS_FAILURES = new Set([
  'engine_failure', 'engine_oil_leak', 'compressor_stall', 'pitot_blockage',
  'static_port_block', 'aoa_vane_stuck', 'hydraulic_leak',
  'cabin_pressure_controller_fail', 'landing_gear_extension_issue'
]);
const CATASTROPHIC_FAILURES = new Set([
  'dual_engine_failure', 'uncontained_engine_failure', 'major_hydraulic_failure',
  'total_flight_control_failure', 'rudder_hard_over', 'reverser_deploy',
  'hull_breach', 'rapid_depressurization'
]);
const LEVELS = ['rookie', 'amateur', 'intermediate', 'advanced', 'pro', 'devil'];

export function isFailureSuitable(id, difficulty) {
  const rank = Math.max(0, LEVELS.indexOf(difficulty));
  if (SIMPLE_FAILURES.has(id)) return true;
  if (MANAGEABLE_FAILURES.has(id)) return rank >= 1;
  if (SERIOUS_FAILURES.has(id)) return rank >= 2;
  if (CATASTROPHIC_FAILURES.has(id)) return rank >= 4;
  if (id === 'sabotage_explosion') return rank >= 5;
  return rank >= 3;
}
