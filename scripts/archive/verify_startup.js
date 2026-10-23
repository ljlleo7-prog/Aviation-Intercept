
// Logic Verification Script
// Simulating RealisticFlightPhysicsService methods to verify logic

console.log("🚀 Starting Startup Logic Verification (Isolated)...");

class MockPhysicsService {
    constructor() {
        this.difficulty = 'rookie';
        this.systems = {
            electrical: { battery: true, gen1: true, gen2: true, apuGen: false },
            fuel: { leftPumps: true },
            apu: { running: false },
            hydraulics: { sysA: { pressure: 3000 }, sysB: { pressure: 3000 } }
        };
        this.engines = [
            { state: { running: true, n2: 60 } },
            { state: { running: true, n2: 60 } }
        ];
    }

    setColdStart() {
        console.log("❄️ Applying Cold & Dark Configuration");
        this.systems.electrical = {
            ...this.systems.electrical,
            battery: false,
            gen1: false,
            gen2: false,
            apuGen: false,
            extPower: false // Mocking the addition I plan to make
        };
        this.systems.apu = {
            ...this.systems.apu,
            running: false,
            bleed: false
        };
        this.systems.fuel = { leftPumps: false, rightPumps: false };
        this.engines.forEach(e => {
            e.state.running = false;
            e.state.n2 = 0;
        });
    }

    setInitialConditions(conditions) {
        if (conditions.difficulty) {
            this.difficulty = conditions.difficulty;
        }

        // THE LOGIC TO VERIFY:
        if (['pro', 'professional', 'survival', 'devil'].includes(this.difficulty)) {
            this.setColdStart();
        } else if (conditions.coldStart) {
            this.setColdStart();
        }
    }
}

// 1. Test Cold Start Logic
const service = new MockPhysicsService();
console.log("Default State (Rookie):", service.systems.electrical.battery ? "ON" : "OFF");

service.setInitialConditions({ difficulty: 'pro' });
console.log("After setInitialConditions('pro'):");
console.log("Battery:", service.systems.electrical.battery);
console.log("Gen 1:", service.systems.electrical.gen1);
console.log("Engines Running:", service.engines[0].state.running);

if (!service.systems.electrical.battery && !service.systems.electrical.gen1 && !service.engines[0].state.running) {
    console.log("✅ Cold Start Logic PASS");
} else {
    console.error("❌ Cold Start Logic FAIL");
}

// 2. Test StartupChecklist Logic
// Copying checkStartupRequirements function for verification
const StartupPhases = {
    POWER_UP: 'POWER_UP',
    ENGINE_START: 'ENGINE_START'
};

const checkStartupRequirements = (phase, systems, engines = []) => {
    const missingItems = [];
    if (!systems) return { canContinue: false, missingItems: ['Systems not initialized'] };

    if (phase === StartupPhases.POWER_UP) {
        if (!systems.electrical?.battery) missingItems.push('Battery Switch ON');
        if (!systems.apu?.bleed) missingItems.push('APU Bleed Switch ON');
        if (!systems.electrical?.apuGen) missingItems.push('APU Generator Switch ON');
        if (!systems.apu?.running || systems.apu?.n2 < 90) missingItems.push('APU Running & Stabilized (>90%)');
    } else if (phase === StartupPhases.ENGINE_START) {
        const eng1Running = engines[0] && (engines[0].n2 > 50 || (engines[0].state && engines[0].state.n2 > 50));
        const eng2Running = engines[1] && (engines[1].n2 > 50 || (engines[1].state && engines[1].state.n2 > 50));
        
        if (!eng1Running || !eng2Running) missingItems.push('Both Engines Running (N2 > 50%)');
        if (!systems.electrical?.gen1) missingItems.push('Generator 1 ON');
        if (!systems.electrical?.gen2) missingItems.push('Generator 2 ON');
        // Critical Check: APU OFF
        if (systems.apu?.running || systems.electrical?.apuGen) missingItems.push('APU Shutdown & APU Gen OFF');
        
        const fuel = systems.fuel || {};
        const pumpsOn = (fuel.leftPumps || fuel.centerPumps) && (fuel.rightPumps || fuel.centerPumps);
        if (!pumpsOn) missingItems.push('Fuel Pumps ON');
        
        const hyd = systems.hydraulics || {};
        if (!hyd.sysA?.engPump) missingItems.push('Hydraulic Pump ENG 1 ON');
    }

    return { canContinue: missingItems.length === 0, missingItems };
};

// Scene 1 Test
console.log("\n--- Scene 1 Check ---");
let check = checkStartupRequirements(StartupPhases.POWER_UP, service.systems, service.engines);
console.log("Initial:", check.canContinue ? "PASS" : "FAIL");

// Simulate success
service.systems.electrical.battery = true;
service.systems.apu.running = true;
service.systems.apu.n2 = 100;
service.systems.apu.bleed = true;
service.systems.electrical.apuGen = true;

check = checkStartupRequirements(StartupPhases.POWER_UP, service.systems, service.engines);
console.log("After Actions:", check.canContinue ? "PASS" : "FAIL");
if (!check.canContinue) console.log("Missing:", check.missingItems);

// Scene 2 Test
console.log("\n--- Scene 2 Check ---");
check = checkStartupRequirements(StartupPhases.ENGINE_START, service.systems, service.engines);
console.log("Initial (with APU ON):", check.canContinue ? "PASS" : "FAIL");
if (check.canContinue) console.error("Should fail because Engines OFF and APU ON");

// Start Engines but keep APU ON
service.engines[0].state.n2 = 60;
service.engines[1].state.n2 = 60;
service.systems.electrical.gen1 = true;
service.systems.electrical.gen2 = true;
service.systems.fuel.leftPumps = true;
service.systems.fuel.rightPumps = true;
service.systems.hydraulics.sysA.engPump = true;

check = checkStartupRequirements(StartupPhases.ENGINE_START, service.systems, service.engines);
console.log("With Engines ON but APU ON:", check.canContinue ? "PASS" : "FAIL");
if (check.canContinue) console.error("Should fail because APU is ON");
else console.log("Correctly blocked by APU ON");

// Shutdown APU
service.systems.apu.running = false;
service.systems.electrical.apuGen = false;

check = checkStartupRequirements(StartupPhases.ENGINE_START, service.systems, service.engines);
console.log("With APU OFF:", check.canContinue ? "PASS" : "FAIL");
if (!check.canContinue) console.log("Missing:", check.missingItems);
else console.log("✅ Passed!");
