const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

// Smoke concentration is separate from fire state: less smoke does not mean
// extinction. Pack isolation and spool-down only change transport/ventilation.
export function updateCockpitSmoke(systems, engines, failures, dt) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const fire = systems.fire || {};
  const pneu = systems.pressurization || {};
  const leftPack = pneu.packL === true && pneu.packLFlow === true;
  const rightPack = pneu.packR === true && pneu.packRFlow === true;
  const packForSide = left => pneu.isolationValve ? leftPack || rightPack : left ? leftPack : rightPack;
  let direct = 0; let transported = 0; let sources = 0;
  for (const key of ['cockpit', 'cabin', 'electricalBay', 'elecBay']) {
    if (fire[key]) { direct += key === 'cockpit' ? .025 : .012; sources++; }
  }
  for (const failure of failures?.values?.() || []) {
    const stage = failure.currentStage;
    const context = failure.variation?.context || {};
    if (['inactive', 'recovered', 'extinguished'].includes(stage) || context.extinguished) continue;
    if (['electrical_fire', 'circuit_arc', 'cabin_smoke', 'lavatory_smoke'].includes(failure.id)) {
      direct += failure.id === 'circuit_arc' ? .008 : stage === 'incipient' ? .008 : .018;
      sources++;
    }
  }
  const split = Math.ceil(engines.length / 2);
  engines.forEach((engine, index) => {
    const id = `eng${index + 1}`;
    const contaminated = fire[id] || fire[`bleed${index + 1}`];
    if (contaminated) sources++;
    if (contaminated && !fire[`${id}Handle`] && pneu[`bleed${index + 1}`] && packForSide(index < split)) {
      transported += .025 * clamp(engine.state.n1 / 100);
    }
  });
  if (fire.apu) sources++;
  if (fire.apu && !fire.apuHandle && systems.apu?.running && systems.apu?.bleed && packForSide(true)) {
    transported += .02 * clamp(systems.apu.n2 / 100);
  }
  if (fire.packL) { sources++; if (leftPack) transported += .018; }
  if (fire.packR) { sources++; if (rightPack) transported += .018; }
  const previous = clamp(systems.cockpitSmoke?.density);
  const timeConstant = leftPack || rightPack ? 55 : 130;
  const retention = Math.exp(-dt / timeConstant);
  const density = clamp(previous * retention + (direct + transported) * timeConstant * (1 - retention));
  systems.cockpitSmoke = { density: direct + transported === 0 && density < .0001 ? 0 : density, directRate: direct, transportedRate: transported, activeSourceCount: sources };
}
