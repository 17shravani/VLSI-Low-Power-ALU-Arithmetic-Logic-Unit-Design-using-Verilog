// web/app.js

// --- Global Simulation State ---
let simTime = 0; // in ns
const TIME_STEP = 10; // 10ns per clock cycle
let history = []; // stores waveform history

// Design Configuration (PPA parameters)
let WIDTH = 32;
let USE_CLA = 0; // 0: Ripple Carry, 1: CLA
let freqMHz = 100;
let approxLsb = 4;

// Current inputs
let inputA = 0x1A2B3C4D;
let inputB = 0x4C3B2A1D;
let opc = 0;
let en = true;
let lpMode = false;

// Current outputs (registers)
let regY = 0;
let flagZ = 0;
let flagN = 0;
let flagC = 0;
let flagV = 0;

// Internal gated signals (for operand isolation visualizer)
let gatedA_add = 0, gatedB_add = 0;
let gatedA_log = 0, gatedB_log = 0;
let gatedA_sh = 0, gatedB_sh = 0;

const OP_NAMES = [
    "ADD", "SUB", "AND", "OR", "XOR", "NOR", "SLL", "SRL",
    "SRA", "SLT", "PASS A", "PASS B", "NOT A", "INC A", "DEC A", "NOP"
];

// --- Canvas Setup for Waveform ---
const canvas = document.getElementById("wave-canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawWaveform();
}

window.addEventListener("resize", resizeCanvas);

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // Bind simulation buttons
    document.getElementById("btn-clock").addEventListener("click", triggerClockEdge);
    document.getElementById("btn-random").addEventListener("click", randomizeStimulus);
    document.getElementById("btn-reset").addEventListener("click", resetSimulation);
    document.getElementById("btn-run-tests").addEventListener("click", runRegressionTests);
    
    // Bind input control changes
    document.getElementById("ctrl-en").addEventListener("change", (e) => { en = e.target.checked; updatePowerAndPPADashboard(); updateClockGatingVisuals(); });
    document.getElementById("ctrl-lp").addEventListener("change", (e) => { lpMode = e.target.checked; updatePowerAndPPADashboard(); });
    document.getElementById("ctrl-opc").addEventListener("change", (e) => { opc = parseInt(e.target.value); updatePowerAndPPADashboard(); updateSchematicWires(); });
    
    // Bind configuration control changes
    document.getElementById("config-width").addEventListener("change", (e) => { 
        WIDTH = parseInt(e.target.value); 
        resetSimulation();
        updatePowerAndPPADashboard();
    });
    document.getElementById("config-adder").addEventListener("change", (e) => { 
        USE_CLA = parseInt(e.target.value); 
        updatePowerAndPPADashboard(); 
    });
    
    const sliderFreq = document.getElementById("config-freq");
    sliderFreq.addEventListener("input", (e) => {
        freqMHz = parseInt(e.target.value);
        document.getElementById("lbl-freq").innerText = freqMHz;
        updatePowerAndPPADashboard();
    });
    
    const sliderApprox = document.getElementById("config-approx");
    sliderApprox.addEventListener("input", (e) => {
        approxLsb = parseInt(e.target.value);
        document.getElementById("lbl-approx").innerText = approxLsb;
        updatePowerAndPPADashboard();
    });

    document.getElementById("ctrl-a").addEventListener("input", (e) => {
        inputA = parseHex(e.target.value);
        updateSchematicWires();
    });
    document.getElementById("ctrl-b").addEventListener("input", (e) => {
        inputB = parseHex(e.target.value);
        updateSchematicWires();
    });

    // Run initial reset
    resetSimulation();
});

// Helper: Parse Hex String based on current WIDTH
function parseHex(str) {
    str = str.replace(/[^0-9A-Fa-f]/g, '');
    if (!str) return 0;
    const val = parseInt(str, 16);
    return val & getMask();
}

// Helper: Get bit mask for current width
function getMask() {
    if (WIDTH === 8) return 0xFF;
    if (WIDTH === 16) return 0xFFFF;
    return 0xFFFFFFFF;
}

// Helper: Format Hex based on current WIDTH
function formatHex(val) {
    const hex = (val >>> 0).toString(16).toUpperCase();
    const chars = WIDTH / 4;
    return hex.padStart(chars, '0').slice(-chars);
}

// Helper: Format Binary based on current WIDTH
function formatBin(val) {
    const bin = (val >>> 0).toString(2);
    return bin.padStart(WIDTH, '0').slice(-WIDTH);
}

// Randomize operands A or B
function randomizeInput(id) {
    const val = Math.floor(Math.random() * getMask());
    const hexStr = formatHex(val);
    document.getElementById(id).value = hexStr;
    if (id === "ctrl-a") inputA = val;
    if (id === "ctrl-b") inputB = val;
    updateSchematicWires();
}

// Write to virtual dashboard console
function logToConsole(text, type = "system-line") {
    const consoleBox = document.getElementById("virtual-console");
    const div = document.createElement("div");
    div.className = `console-line ${type}`;
    div.innerText = text;
    consoleBox.appendChild(div);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

// --- ALU Behavioral Logic ---
function executeALULogic() {
    const mask = getMask();
    const halfWidth = WIDTH / 2;
    const signBit = 1 << (WIDTH - 1);
    
    // Mask inputs to current width
    const a_masked = inputA & mask;
    const b_masked = inputB & mask;

    let result = 0;
    let carry = 0;
    let overflow = 0;
    
    // Approximate computation: mask lower LSBs of B
    let b_temp = b_masked;
    if (lpMode && approxLsb > 0) {
        const approxMask = ~((1 << approxLsb) - 1) & mask;
        b_temp = b_masked & approxMask;
    }

    // Determine active block for operand isolation
    const isAdderActive = [0, 1, 13, 14].includes(opc);
    const isLogicActive = [2, 3, 4, 5, 12].includes(opc);
    const isShifterActive = [6, 7, 8].includes(opc);

    // Set isolated operand values
    gatedA_add = isAdderActive ? a_masked : 0;
    gatedB_add = isAdderActive ? b_temp : 0;
    
    gatedA_log = isLogicActive ? a_masked : 0;
    gatedB_log = isLogicActive ? b_masked : 0;

    gatedA_sh = isShifterActive ? a_masked : 0;
    gatedB_sh = isShifterActive ? b_masked : 0;

    // Shift limit inside low power mode
    const shiftLimit = (WIDTH === 8) ? 3 : (WIDTH === 16) ? 4 : 5;

    switch (opc) {
        case 0: { // ADD
            const sum = gatedA_add + gatedB_add;
            result = sum & mask;
            carry = sum > mask ? 1 : 0;
            // Signed overflow
            const signA = (gatedA_add & signBit) ? 1 : 0;
            const signB = (gatedB_add & signBit) ? 1 : 0;
            const signR = (result & signBit) ? 1 : 0;
            overflow = (signA === signB && signA !== signR) ? 1 : 0;
            break;
        }
        case 1: { // SUB
            const diff = gatedA_add - gatedB_add;
            result = diff & mask;
            carry = gatedA_add < gatedB_add ? 1 : 0; // Borrow
            // Signed overflow
            const signA = (gatedA_add & signBit) ? 1 : 0;
            const signB = (gatedB_add & signBit) ? 1 : 0;
            const signR = (result & signBit) ? 1 : 0;
            overflow = (signA !== signB && signA !== signR) ? 1 : 0;
            break;
        }
        case 2: // AND
            result = gatedA_log & gatedB_log;
            break;
        case 3: // OR
            result = gatedA_log | gatedB_log;
            break;
        case 4: // XOR
            result = gatedA_log ^ gatedB_log;
            break;
        case 5: // NOR
            result = ~(gatedA_log | gatedB_log) & mask;
            break;
        case 6: { // SLL
            const shamt = lpMode ? 1 : (gatedB_sh & ((1 << shiftLimit) - 1));
            result = (gatedA_sh << shamt) & mask;
            break;
        }
        case 7: { // SRL
            const shamt = lpMode ? 1 : (gatedB_sh & ((1 << shiftLimit) - 1));
            result = gatedA_sh >>> shamt;
            break;
        }
        case 8: { // SRA
            const shamt = lpMode ? 1 : (gatedB_sh & ((1 << shiftLimit) - 1));
            const sign = (gatedA_sh & signBit) ? 1 : 0;
            if (sign) {
                result = (gatedA_sh >> shamt) | (((1 << shamt) - 1) << (WIDTH - shamt));
            } else {
                result = gatedA_sh >> shamt;
            }
            result = result & mask;
            break;
        }
        case 9: { // SLT
            // Convert to signed integers
            const valA = (a_masked & signBit) ? (a_masked - (1 << WIDTH)) : a_masked;
            const valB = (b_masked & signBit) ? (b_masked - (1 << WIDTH)) : b_masked;
            result = valA < valB ? 1 : 0;
            break;
        }
        case 10: // PASS A
            result = a_masked;
            break;
        case 11: // PASS B
            result = b_masked;
            break;
        case 12: // NOT A
            result = ~gatedA_log & mask;
            break;
        case 13: { // INC A
            const incrementer = lpMode ? 0 : 1;
            const sum = gatedA_add + incrementer;
            result = sum & mask;
            carry = sum > mask ? 1 : 0;
            const signA = (gatedA_add & signBit) ? 1 : 0;
            const signR = (result & signBit) ? 1 : 0;
            overflow = (signA === 0 && signR === 1 && incrementer === 1) ? 1 : 0;
            break;
        }
        case 14: { // DEC A
            const decrementer = lpMode ? 0 : 1;
            const diff = gatedA_add - decrementer;
            result = diff & mask;
            carry = gatedA_add < decrementer ? 1 : 0;
            const signA = (gatedA_add & signBit) ? 1 : 0;
            const signR = (result & signBit) ? 1 : 0;
            overflow = (signA === 1 && signR === 0 && decrementer === 1) ? 1 : 0;
            break;
        }
        case 15: // NOP
        default:
            result = 0;
            break;
    }

    return {
        Y: result,
        Z: result === 0 ? 1 : 0,
        N: (result & signBit) ? 1 : 0,
        C: carry,
        V: overflow
    };
}

// --- Trigger Clock Edge ---
function triggerClockEdge() {
    if (en) {
        const out = executeALULogic();
        regY = out.Y;
        flagZ = out.Z;
        flagN = out.N;
        flagC = out.C;
        flagV = out.V;
    }

    // Waveform history log
    history.push({
        time: simTime,
        clk: 0,
        en: en ? 1 : 0,
        lpMode: lpMode ? 1 : 0,
        opc: opc,
        A: inputA,
        B: inputB,
        Y: regY,
        Z: flagZ,
        N: flagN,
        C: flagC,
        V: flagV
    });
    
    history.push({
        time: simTime + 5,
        clk: 1,
        en: en ? 1 : 0,
        lpMode: lpMode ? 1 : 0,
        opc: opc,
        A: inputA,
        B: inputB,
        Y: regY,
        Z: flagZ,
        N: flagN,
        C: flagC,
        V: flagV
    });

    simTime += TIME_STEP;
    
    // Waveform fit width (last 12 points)
    if (history.length > 24) {
        history.shift();
        history.shift();
    }

    updateOutputsUI();
    updateSchematicWires();
    drawWaveform();
    
    document.getElementById("time-indicator").innerText = `Current Time: ${simTime} ns`;
}

// --- Update Outputs UI ---
function updateOutputsUI() {
    document.getElementById("out-y").innerText = formatHex(regY);
    document.getElementById("out-y-bin").innerText = formatBin(regY);
    
    // Convert signed decimal value
    const signBit = 1 << (WIDTH - 1);
    const decVal = (regY & signBit) ? regY - (1 << WIDTH) : regY;
    document.getElementById("out-y-dec").innerText = `Dec: ${decVal.toLocaleString()}`;

    setFlagLED("flag-z", flagZ);
    setFlagLED("flag-n", flagN);
    setFlagLED("flag-c", flagC);
    setFlagLED("flag-v", flagV);
}

function setFlagLED(id, active) {
    const el = document.getElementById(id);
    if (active) {
        el.classList.add("active-led");
    } else {
        el.classList.remove("active-led");
    }
}

// --- Randomize Stimulus ---
function randomizeStimulus() {
    randomizeInput("ctrl-a");
    randomizeInput("ctrl-b");
    
    en = Math.random() > 0.1;
    lpMode = Math.random() > 0.6;
    opc = Math.floor(Math.random() * 16);
    
    document.getElementById("ctrl-en").checked = en;
    document.getElementById("ctrl-lp").checked = lpMode;
    document.getElementById("ctrl-opc").value = opc;

    logToConsole(`[STIMULUS] Random inputs generated: A=${formatHex(inputA)}, B=${formatHex(inputB)}, OPC=${OP_NAMES[opc]}`, "log-line");
    triggerClockEdge();
}

// --- Reset Simulation ---
function resetSimulation() {
    simTime = 0;
    history = [];
    
    en = true;
    lpMode = false;
    opc = 0;
    
    // Default operands based on bit width
    if (WIDTH === 8) {
        inputA = 0x5A;
        inputB = 0x3C;
    } else if (WIDTH === 16) {
        inputA = 0xA55A;
        inputB = 0x5AA5;
    } else {
        inputA = 0x1A2B3C4D;
        inputB = 0x4C3B2A1D;
    }
    
    document.getElementById("ctrl-en").checked = en;
    document.getElementById("ctrl-lp").checked = lpMode;
    document.getElementById("ctrl-opc").value = opc;
    document.getElementById("ctrl-a").value = formatHex(inputA);
    document.getElementById("ctrl-b").value = formatHex(inputB);
    
    regY = 0;
    flagZ = 0;
    flagN = 0;
    flagC = 0;
    flagV = 0;
    
    history.push({
        time: 0,
        clk: 0,
        en: 1,
        lpMode: 0,
        opc: 0,
        A: inputA,
        B: inputB,
        Y: 0,
        Z: 0,
        N: 0,
        C: 0,
        V: 0
    });

    updateOutputsUI();
    updatePowerAndPPADashboard();
    updateClockGatingVisuals();
    updateSchematicWires();
    resizeCanvas();
    
    document.getElementById("time-indicator").innerText = "Current Time: 0 ns";
    logToConsole(`[SYSTEM] Environment Reset complete. Configured for ${WIDTH}-bit Datapath.`, "system-line");
}

// --- PPA & Power Estimation Models ---
function updatePowerAndPPADashboard() {
    // 1. AREA (Gate Equivalent - GE)
    // RCA: 24 gates/bit. CLA: 42 gates/bit.
    // Shifter: 18 gates/bit * log2(width).
    // Logic Unit: 14 gates/bit. Regs: 10 gates/bit.
    const adderArea = (USE_CLA === 1) ? (42 * WIDTH) : (24 * WIDTH);
    const shiftLevels = Math.log2(WIDTH);
    const shifterArea = Math.round(18 * WIDTH * shiftLevels);
    const logicArea = 14 * WIDTH;
    const regArea = 10 * (WIDTH + 4); // Y + flags
    const controlArea = 120; // Opcode decoders + control logic
    
    const totalArea = adderArea + shifterArea + logicArea + regArea + controlArea;
    const totalPrimitives = Math.round(totalArea / 4.5); // Average 4.5 gates per primitive cell
    
    document.getElementById("ppa-area").innerText = `${totalArea.toLocaleString()} GE`;
    document.getElementById("ppa-area-sub").innerText = `${totalPrimitives} cells (approx)`;

    // 2. TIMING DELAY (Propagation delay)
    // RCA Delay = 0.15ns * WIDTH + 0.5ns
    // CLA Delay = 0.4ns * log2(WIDTH) + 0.3ns
    // Shifter Delay = 0.12ns * log2(WIDTH) + 0.2ns
    // Logic/Mux Delay = 0.4ns
    let delay = 0.4;
    const adderDelay = (USE_CLA === 1) ? (0.4 * shiftLevels + 0.3) : (0.15 * WIDTH + 0.5);
    const shifterDelay = 0.12 * shiftLevels + 0.2;
    
    // Critical path depends on active opcode
    if ([0, 1, 13, 14].includes(opc)) {
        delay = adderDelay + 0.4; // adder + mux
    } else if ([6, 7, 8].includes(opc)) {
        delay = shifterDelay + 0.4; // shifter + mux
    } else {
        delay = 0.4 + 0.4; // logic + mux
    }
    
    // Add output setup delay
    delay += 0.25;
    
    const maxFreq = Math.round(1000 / delay);
    document.getElementById("ppa-delay").innerText = `${delay.toFixed(2)} ns`;
    document.getElementById("ppa-delay-sub").innerText = `Max Freq: ~${maxFreq} MHz`;

    // 3. LEAKAGE POWER
    // Proportional to area. Standard gate leakage: ~0.003uW per GE
    const leakage = totalArea * 0.003;
    document.getElementById("ppa-leakage").innerText = `${leakage.toFixed(2)} µW`;

    // 4. DYNAMIC DISSIPATION & SAVINGS
    // Dynamic Power = alpha * C * V^2 * f
    // Clock tree: gated when en=0
    // Signals/Buses: operand isolated when not active
    // Approximate computation: masks lower LSBs of adder, reducing toggles
    
    const clkPowerUnit = 0.03 * (WIDTH + 4) * freqMHz;
    const clkPower = en ? clkPowerUnit : (clkPowerUnit * 0.08); // 92% saving on clock tree when gated
    
    // Combinational Logic Power: Active vs Idle (Isolated)
    // If not isolated (conventional), all units switch:
    const baseCombinationalPower = (adderArea + shifterArea + logicArea) * 0.00012 * freqMHz;
    
    let activeCombinationalPower = 0;
    const adderPwr = adderArea * 0.00012 * freqMHz;
    const shifterPwr = shifterArea * 0.00012 * freqMHz;
    const logicPwr = logicArea * 0.00012 * freqMHz;
    
    // Operand Isolation active: only selected block consumes switching power
    if ([0, 1, 13, 14].includes(opc)) {
        // Approximate LSBs reduce switching activity in adder
        let approxSavingMultiplier = 1.0;
        if (lpMode && approxLsb > 0) {
            approxSavingMultiplier = 1.0 - (approxLsb / WIDTH) * 0.65;
        }
        activeCombinationalPower = adderPwr * approxSavingMultiplier;
    } else if ([6, 7, 8].includes(opc)) {
        // Shifter masked to 1-bit step reduces switching activity
        let shiftSavingMultiplier = 1.0;
        if (lpMode) {
            shiftSavingMultiplier = 0.15; // 85% shifter saving
        }
        activeCombinationalPower = shifterPwr * shiftSavingMultiplier;
    } else if (opc !== 15) { // NOP
        activeCombinationalPower = logicPwr;
    }

    // Conventional design power (no isolation, full clocks)
    const conventionalPower = clkPowerUnit + baseCombinationalPower + (0.04 * WIDTH * freqMHz);
    
    // Our design power
    const outputRegsPower = en ? (0.04 * WIDTH * freqMHz) : 0;
    const currentDynamicPower = clkPower + activeCombinationalPower + outputRegsPower;
    const totalPower = currentDynamicPower + leakage;
    
    // Estimate baseline conventional power to compare
    const totalConventionalPower = conventionalPower + leakage;
    const savings = Math.max(0, Math.round(((totalConventionalPower - totalPower) / totalConventionalPower) * 100));

    document.getElementById("stat-power").innerText = `Total: ${Math.round(totalPower)} µW`;
    document.getElementById("stat-savings").innerText = `${savings}%`;

    // Update power bars (Baseline, Clock Gated, Operand Isolated, Combined Optimized)
    const powerBaseline = totalConventionalPower;
    const powerGated = (clkPowerUnit * 0.08) + leakage; // en=0
    const powerIsolated = clkPowerUnit + activeCombinationalPower + (0.04 * WIDTH * freqMHz) + leakage;
    const powerOptimized = totalPower; // Gated + Isolated + Approximate

    document.getElementById("p-bar-base").style.height = "100%";
    document.getElementById("p-bar-gate").style.height = `${(powerGated / powerBaseline) * 100}%`;
    document.getElementById("p-bar-iso").style.height = `${(powerIsolated / powerBaseline) * 100}%`;
    document.getElementById("p-bar-opt").style.height = `${(powerOptimized / powerBaseline) * 100}%`;
}

// --- Clock Gating Tree Visual Animations ---
function updateClockGatingVisuals() {
    const clkGatedWire = document.getElementById("clk-wire-gated");
    const clkGatedLbl = document.getElementById("clk-gated-lbl");
    const statusText = document.getElementById("icg-status-text");
    const regNode = document.getElementById("clk-reg-node");
    const statusMode = document.getElementById("status-power-mode");

    if (en) {
        clkGatedWire.className.baseVal = "wire-line wire-clk-active";
        clkGatedWire.style.stroke = "var(--color-clk)";
        clkGatedLbl.style.fill = "var(--color-clk)";
        statusText.style.fill = "var(--color-clk)";
        statusText.textContent = "ON";
        regNode.classList.remove("clk-gated-reg");
        statusMode.textContent = "Mode: Active";
        statusMode.className = "status-tag pwr";
    } else {
        clkGatedWire.className.baseVal = "wire-line wire-clk-gated";
        clkGatedWire.style.stroke = "#30363d";
        clkGatedLbl.style.fill = "#8b949e";
        statusText.style.fill = "#ff7b72";
        statusText.textContent = "OFF";
        regNode.classList.add("clk-gated-reg");
        statusMode.textContent = "Mode: Gated/Sleep";
        statusMode.className = "status-tag pwr sleep";
    }
}

// --- Update Interactive Schematic SVG Wires ---
function updateSchematicWires() {
    const isAdderActive = [0, 1, 13, 14].includes(opc);
    const isLogicActive = [2, 3, 4, 5, 12].includes(opc);
    const isShifterActive = [6, 7, 8].includes(opc);
    const isComparatorActive = (opc === 9);

    toggleNodeClass("node-adder", isAdderActive);
    toggleNodeClass("node-logic", isLogicActive);
    toggleNodeClass("node-shifter", isShifterActive);
    toggleNodeClass("node-comparator", isComparatorActive);

    toggleWireClass("wire-a-add", isAdderActive);
    toggleWireClass("wire-b-add", isAdderActive);
    toggleWireClass("wire-a-log", isLogicActive);
    toggleWireClass("wire-b-log", isLogicActive);
    toggleWireClass("wire-a-sh", isShifterActive);
    toggleWireClass("wire-b-sh", isShifterActive);
    toggleWireClass("wire-a-comp", isComparatorActive);
    toggleWireClass("wire-b-comp", isComparatorActive);

    toggleWireClass("wire-out-add", isAdderActive);
    toggleWireClass("wire-out-log", isLogicActive);
    toggleWireClass("wire-out-sh", isShifterActive);
    toggleWireClass("wire-out-comp", isComparatorActive);

    const isMuxOutputActive = en && (opc !== 15);
    toggleWireClass("wire-mux-out", isMuxOutputActive);
    toggleNodeClass("node-reg", en);
}

function toggleNodeClass(id, active) {
    const node = document.getElementById(id);
    if (!node) return;
    if (active) {
        node.classList.remove("isolated");
        node.classList.add("active-block");
    } else {
        node.classList.remove("active-block");
        node.classList.add("isolated");
    }
}

function toggleWireClass(id, active) {
    const wire = document.getElementById(id);
    if (!wire) return;
    if (active) {
        wire.classList.remove("wire-iso");
        wire.classList.add("wire-active");
    } else {
        wire.classList.remove("wire-active");
        wire.classList.add("wire-iso");
    }
}

// --- Draw Vivado Waveform Trace ---
function drawWaveform() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (history.length === 0) return;

    // Formatting parameters
    const signalNames = [
        "clk", "en", "lp_mode", "OPC[3:0]", "A", "B", "Y", "Z", "N", "C", "V"
    ];
    
    const startX = 110;
    const endX = canvas.width - 20;
    const waveAreaWidth = endX - startX;
    
    const rowHeight = Math.floor(canvas.height / (signalNames.length + 1.2));
    
    // Labels separator
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, canvas.height);
    ctx.stroke();

    const maxSamples = 12; // cycles
    const xStep = waveAreaWidth / maxSamples;

    // Grid vertical scale
    ctx.fillStyle = "#8b949e";
    ctx.font = "9px 'Fira Code', monospace";
    ctx.textAlign = "center";
    
    for (let i = 0; i <= maxSamples; i++) {
        const x = startX + i * xStep;
        ctx.beginPath();
        ctx.moveTo(x, rowHeight);
        ctx.lineTo(x, canvas.height);
        ctx.strokeStyle = "#121212";
        ctx.stroke();
        
        const displayTime = i * 10;
        ctx.fillText(`${displayTime}ns`, x, rowHeight - 6);
    }
    
    // Grid horizontal separators
    for (let r = 0; r <= signalNames.length; r++) {
        const y = (r + 1) * rowHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.strokeStyle = "#161616";
        ctx.stroke();
    }

    // Render Labels
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 10px 'Fira Code', monospace";

    signalNames.forEach((sig, index) => {
        const y = (index + 1) * rowHeight + rowHeight / 2;
        
        if (sig === "clk") ctx.fillStyle = "#39FF14"; // Green
        else if (["en", "lp_mode"].includes(sig)) ctx.fillStyle = "#FFD700"; // Yellow
        else if (["OPC[3:0]", "A", "B", "Y"].includes(sig)) ctx.fillStyle = "#58a6ff"; // Blue buses
        else ctx.fillStyle = "#00E5FF"; // Flags
        
        ctx.fillText(sig, 10, y);
        
        // Show current value label next to name
        let valText = "";
        const latest = history[history.length - 1];
        if (latest) {
            if (sig === "clk") valText = latest.clk ? "1" : "0";
            else if (sig === "en") valText = latest.en ? "1" : "0";
            else if (sig === "lp_mode") valText = latest.lpMode ? "1" : "0";
            else if (sig === "OPC[3:0]") valText = latest.opc.toString(16).toUpperCase();
            else if (sig === "A") valText = formatHex(latest.A);
            else if (sig === "B") valText = formatHex(latest.B);
            else if (sig === "Y") valText = formatHex(latest.Y);
            else if (sig === "Z") valText = latest.Z ? "1" : "0";
            else if (sig === "N") valText = latest.N ? "1" : "0";
            else if (sig === "C") valText = latest.C ? "1" : "0";
            else if (sig === "V") valText = latest.V ? "1" : "0";
        }
        ctx.fillStyle = "#8b949e";
        ctx.fillText(valText.substring(0, 8), 75, y);
    });

    // Draw Traces
    history.forEach((state, stepIdx) => {
        if (stepIdx === 0) return;
        const prev = history[stepIdx - 1];
        
        const xPrev = startX + (prev.time / 10) * xStep;
        const xCurr = startX + (state.time / 10) * xStep;
        
        signalNames.forEach((sig, sigIdx) => {
            const yCenter = (sigIdx + 1) * rowHeight + rowHeight / 2;
            const yHigh = yCenter - rowHeight / 3;
            const yLow = yCenter + rowHeight / 3;
            
            const isBus = ["OPC[3:0]", "A", "B", "Y"].includes(sig);
            
            if (isBus) {
                ctx.strokeStyle = "#58a6ff";
                ctx.fillStyle = "rgba(88, 166, 255, 0.08)";
                ctx.lineWidth = 1.0;
                
                let valPrev = "", valCurr = "";
                if (sig.includes("OPC")) {
                    valPrev = OP_NAMES[prev.opc];
                    valCurr = OP_NAMES[state.opc];
                } else if (sig === "A") {
                    valPrev = formatHex(prev.A);
                    valCurr = formatHex(state.A);
                } else if (sig === "B") {
                    valPrev = formatHex(prev.B);
                    valCurr = formatHex(state.B);
                } else if (sig === "Y") {
                    valPrev = formatHex(prev.Y);
                    valCurr = formatHex(state.Y);
                }
                
                const valueChanged = (valPrev !== valCurr);
                
                ctx.beginPath();
                if (valueChanged || stepIdx === 1) {
                    ctx.moveTo(xPrev, yCenter);
                    ctx.lineTo(xPrev + 3, yHigh);
                    ctx.lineTo(xCurr - 3, yHigh);
                    ctx.lineTo(xCurr, yCenter);
                    ctx.lineTo(xCurr - 3, yLow);
                    ctx.lineTo(xPrev + 3, yLow);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    
                    // Render string value
                    ctx.fillStyle = "#c9d1d9";
                    ctx.font = "8px 'Fira Code', monospace";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    const clipWidth = xCurr - xPrev - 8;
                    if (clipWidth > 15) {
                        ctx.fillText(valCurr.substring(0, Math.floor(clipWidth/6)), (xPrev + xCurr)/2, yCenter);
                    }
                } else {
                    ctx.beginPath();
                    ctx.moveTo(xPrev, yHigh);
                    ctx.lineTo(xCurr, yHigh);
                    ctx.moveTo(xPrev, yLow);
                    ctx.lineTo(xCurr, yLow);
                    ctx.stroke();
                }
            } else {
                let bitPrev = 0, bitCurr = 0;
                let color = "#ffffff";
                
                if (sig === "clk") { bitPrev = prev.clk; bitCurr = state.clk; color = "#39FF14"; }
                else if (sig === "en") { bitPrev = prev.en; bitCurr = state.en; color = "#FFD700"; }
                else if (sig === "lp_mode") { bitPrev = prev.lpMode; bitCurr = state.lpMode; color = "#FFD700"; }
                else if (sig === "Z") { bitPrev = prev.Z; bitCurr = state.Z; color = "#00E5FF"; }
                else if (sig === "N") { bitPrev = prev.N; bitCurr = state.N; color = "#00E5FF"; }
                else if (sig === "C") { bitPrev = prev.C; bitCurr = state.C; color = "#00E5FF"; }
                else if (sig === "V") { bitPrev = prev.V; bitCurr = state.V; color = "#00E5FF"; }
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                
                ctx.beginPath();
                const yPrevVal = (bitPrev === 1) ? yHigh : yLow;
                const yCurrVal = (bitCurr === 1) ? yHigh : yLow;
                
                ctx.moveTo(xPrev, yPrevVal);
                ctx.lineTo(xCurr, yPrevVal);
                ctx.lineTo(xCurr, yCurrVal);
                ctx.stroke();
            }
        });
    });
}

// --- Automated Regression Test Suite ---
async function runRegressionTests() {
    logToConsole("\n[TESTBENCH] Starting RTL Automated Regression Test Suite...", "header-line");
    
    // Clear history to start a clean waveform
    history = [];
    simTime = 0;
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Helper to evaluate test result
    const runTestStep = async (name, testOpc, testA, testB, testEn, testLp, checkFunc) => {
        en = testEn;
        lpMode = testLp;
        opc = testOpc;
        inputA = testA;
        inputB = testB;
        
        document.getElementById("ctrl-en").checked = en;
        document.getElementById("ctrl-lp").checked = lpMode;
        document.getElementById("ctrl-opc").value = opc;
        document.getElementById("ctrl-a").value = formatHex(inputA);
        document.getElementById("ctrl-b").value = formatHex(inputB);
        
        triggerClockEdge();
        await sleep(150); // Pause for animation
        
        const passed = checkFunc();
        const statusText = passed ? "PASSED" : "FAILED";
        const logType = passed ? "test-pass" : "test-fail";
        
        logToConsole(`Test: ${name} -> ${statusText}`, logType);
        return passed;
    };

    let passedAll = true;

    // Test 1: Reset Gating Stability
    passedAll &= await runTestStep(
        "T01_Register_Gating_Stability", 
        2, 0xAAAAAAAA & getMask(), 0x55555555 & getMask(), false, false, 
        () => (regY === 0)
    );

    // Test 2: Addition Unsigned
    passedAll &= await runTestStep(
        "T02_ADD_Unsigned_Arithmetic", 
        0, 0x0000002A & getMask(), 0x00000008 & getMask(), true, false, 
        () => (regY === (0x32 & getMask()) && flagZ === 0)
    );

    // Test 3: Signed Addition Overflow
    passedAll &= await runTestStep(
        "T03_ADD_Signed_Overflow", 
        0, 0x7FFFFFFF & getMask(), 1, true, false, 
        () => {
            if (WIDTH === 32) return (flagV === 1 && flagN === 1);
            if (WIDTH === 16) return (regY === 0x8000);
            return true;
        }
    );

    // Test 4: Subtraction Signed
    passedAll &= await runTestStep(
        "T04_SUB_Signed_Arithmetic", 
        1, 10, 15, true, false, 
        () => (flagN === 1 && regY === (getMask() - 4))
    );

    // Test 5: Logic AND gate
    passedAll &= await runTestStep(
        "T05_Logical_Bitwise_AND", 
        2, 0xF0F0F0F0 & getMask(), 0x88888888 & getMask(), true, false, 
        () => (regY === (0x80808080 & getMask()))
    );

    // Test 6: Shift left logical
    passedAll &= await runTestStep(
        "T06_Shifter_Logical_SLL", 
        6, 0x000000FF & getMask(), 4, true, false, 
        () => (regY === (0x00000FF0 & getMask()))
    );

    // Test 7: Shifter Masking in lp_mode
    passedAll &= await runTestStep(
        "T07_Shifter_LP_Amount_Masking", 
        6, 0x000000FF & getMask(), 8, true, true, 
        () => (regY === (0x000001FE & getMask())) // Shift by 1 bit instead of 8
    );

    // Test 8: Approximate LSB Addition
    passedAll &= await runTestStep(
        "T08_ADD_Approximate_LSB", 
        0, 0x00000020 & getMask(), 0x0000000F & getMask(), true, true, 
        () => (regY === (0x00000020 & getMask())) // Lower LSBs (4 bits) of B masked to 0
    );

    // Test 9: Zero flag calculation
    passedAll &= await runTestStep(
        "T09_Zero_Flag_Assertion", 
        15, 0x1234, 0x5678, true, false, 
        () => (regY === 0 && flagZ === 1)
    );

    // Test 10: Comparison signed
    passedAll &= await runTestStep(
        "T10_Signed_Comparison_SLT", 
        9, 0x80000000 & getMask(), 0x7FFFFFFF & getMask(), true, false, 
        () => (regY === 1)
    );

    logToConsole("--------------------------------------------------", "system-line");
    if (passedAll) {
        logToConsole("REGRESSION STATUS: SUCCESS (10/10 PASSED)", "test-pass");
    } else {
        logToConsole("REGRESSION STATUS: FAILED (Some checks failed)", "test-fail");
    }
    logToConsole("--------------------------------------------------", "system-line");
}
