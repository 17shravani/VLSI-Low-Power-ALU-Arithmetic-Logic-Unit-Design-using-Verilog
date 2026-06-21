// web/app.js

// --- Global Simulation State ---
let simTime = 0; // in ns
const TIME_STEP = 10; // 10ns per clock cycle
let history = []; // stores waveform history

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
    // Bind buttons
    document.getElementById("btn-clock").addEventListener("click", triggerClockEdge);
    document.getElementById("btn-random").addEventListener("click", randomizeStimulus);
    document.getElementById("btn-reset").addEventListener("click", resetSimulation);
    
    // Bind input changes
    document.getElementById("ctrl-en").addEventListener("change", (e) => { en = e.target.checked; updatePowerAnalysis(); });
    document.getElementById("ctrl-lp").addEventListener("change", (e) => { lpMode = e.target.checked; updatePowerAnalysis(); });
    document.getElementById("ctrl-opc").addEventListener("change", (e) => { opc = parseInt(e.target.value); updatePowerAnalysis(); updateSchematicWires(); });
    
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

// Helper: Parse Hex String
function parseHex(str) {
    str = str.replace(/[^0-9A-Fa-f]/g, '');
    if (!str) return 0;
    return parseInt(str, 16) & 0xFFFFFFFF;
}

// Helper: Format 32-bit Hex
function toHex32(val) {
    return (val >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// Helper: Format 32-bit Binary
function toBin32(val) {
    return (val >>> 0).toString(2).padStart(32, '0');
}

// Randomize operands A or B
function randomizeInput(id) {
    const val = Math.floor(Math.random() * 0xFFFFFFFF);
    const hexStr = toHex32(val);
    document.getElementById(id).value = hexStr;
    if (id === "ctrl-a") inputA = val;
    if (id === "ctrl-b") inputB = val;
    updateSchematicWires();
}

// --- ALU Behavioral Logic ---
function executeALULogic() {
    let result = 0;
    let carry = 0;
    let overflow = 0;

    let a_eff = inputA;
    let b_eff = inputB;
    
    // Low Power: LSB Masking (Mask lower 4 bits of B to 0)
    const approx_lsb = 4;
    if (lpMode && approx_lsb > 0) {
        b_temp = inputB & 0xFFFFFFF0;
    } else {
        b_temp = inputB;
    }

    // Determine active block for operand isolation
    const isAdderActive = [0, 1, 13, 14].includes(opc);
    const isLogicActive = [2, 3, 4, 5, 12].includes(opc);
    const isShifterActive = [6, 7, 8].includes(opc);

    // Set internal buses for operand isolation
    gatedA_add = isAdderActive ? inputA : 0;
    gatedB_add = isAdderActive ? b_temp : 0;

    gatedA_log = isLogicActive ? inputA : 0;
    gatedB_log = isLogicActive ? inputB : 0;

    gatedA_sh = isShifterActive ? inputA : 0;
    gatedB_sh = isShifterActive ? inputB : 0;

    switch (opc) {
        case 0: { // ADD
            const sum = gatedA_add + gatedB_add;
            result = sum & 0xFFFFFFFF;
            carry = sum > 0xFFFFFFFF ? 1 : 0;
            // Signed overflow: positive + positive = negative, or negative + negative = positive
            const signA = (gatedA_add >> 31) & 1;
            const signB = (gatedB_add >> 31) & 1;
            const signR = (result >> 31) & 1;
            overflow = (signA === signB && signA !== signR) ? 1 : 0;
            break;
        }
        case 1: { // SUB
            const diff = gatedA_add - gatedB_add;
            result = diff & 0xFFFFFFFF;
            carry = gatedA_add < gatedB_add ? 1 : 0; // Borrow-out
            // Signed overflow
            const signA = (gatedA_add >> 31) & 1;
            const signB = (gatedB_add >> 31) & 1;
            const signR = (result >> 31) & 1;
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
            result = ~(gatedA_log | gatedB_log) & 0xFFFFFFFF;
            break;
        case 6: { // SLL
            const shamt = lpMode ? 1 : (gatedB_sh & 0x1F);
            result = (gatedA_sh << shamt) & 0xFFFFFFFF;
            break;
        }
        case 7: { // SRL
            const shamt = lpMode ? 1 : (gatedB_sh & 0x1F);
            result = gatedA_sh >>> shamt;
            break;
        }
        case 8: { // SRA
            const shamt = lpMode ? 1 : (gatedB_sh & 0x1F);
            // Sign extending right shift
            const sign = (gatedA_sh >> 31) & 1;
            if (sign) {
                result = (gatedA_sh >> shamt) | (((1 << shamt) - 1) << (32 - shamt));
            } else {
                result = gatedA_sh >> shamt;
            }
            result = result & 0xFFFFFFFF;
            break;
        }
        case 9: { // SLT (Signed Less Than)
            const valA = (inputA >= 0x80000000) ? (inputA - 0x100000000) : inputA;
            const valB = (inputB >= 0x80000000) ? (inputB - 0x100000000) : inputB;
            result = valA < valB ? 1 : 0;
            break;
        }
        case 10: // PASS A
            result = inputA;
            break;
        case 11: // PASS B
            result = inputB;
            break;
        case 12: // NOT A
            result = ~gatedA_log & 0xFFFFFFFF;
            break;
        case 13: { // INC A
            // INC is Adder A + 1. If lpMode is high and APPROX_LSB = 4, the 1 (which is in the LSBs) is masked to 0.
            // So result becomes A + 0 = A.
            const incrementer = (lpMode) ? 0 : 1;
            const sum = gatedA_add + incrementer;
            result = sum & 0xFFFFFFFF;
            carry = sum > 0xFFFFFFFF ? 1 : 0;
            const signA = (gatedA_add >> 31) & 1;
            const signR = (result >> 31) & 1;
            overflow = (signA === 0 && signR === 1 && incrementer === 1) ? 1 : 0; // Positive overflow
            break;
        }
        case 14: { // DEC A
            // DEC is Adder A - 1. Gated B in approximate mode is masked to 0.
            const decrementer = (lpMode) ? 0 : 1;
            const diff = gatedA_add - decrementer;
            result = diff & 0xFFFFFFFF;
            carry = gatedA_add < decrementer ? 1 : 0;
            const signA = (gatedA_add >> 31) & 1;
            const signR = (result >> 31) & 1;
            overflow = (signA === 1 && signR === 0 && decrementer === 1) ? 1 : 0; // Negative overflow
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
        N: (result >> 31) & 1,
        C: carry,
        V: overflow
    };
}

// --- Trigger Clock Edge ---
function triggerClockEdge() {
    // If enable is high, we update the output registers on clock edge
    if (en) {
        const out = executeALULogic();
        regY = out.Y;
        flagZ = out.Z;
        flagN = out.N;
        flagC = out.C;
        flagV = out.V;
    }
    // If en is 0, the output registers Y, Z, N, C, V hold their state (stable clock gating)

    // Save current step to waveform history
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
    
    // Add half cycle low, half cycle high to visualize clock edge
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
    
    // Limit history length to fit waveform viewer window (keep last 12 points)
    if (history.length > 24) {
        history.shift();
        history.shift();
    }

    // Update UI elements
    updateOutputsUI();
    updateSchematicWires();
    drawWaveform();
    
    // Update current time indicator
    document.getElementById("time-indicator").innerText = `Current Time: ${simTime} ns`;
}

// --- Update Outputs UI ---
function updateOutputsUI() {
    document.getElementById("out-y").innerText = toHex32(regY);
    document.getElementById("out-y-bin").innerText = toBin32(regY);
    // Convert signed decimal value for view
    const decVal = regY >= 0x80000000 ? regY - 0x100000000 : regY;
    document.getElementById("out-y-dec").innerText = `Dec: ${decVal.toLocaleString()}`;

    // Update Flag lights
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
    
    // Randomize switches and opcode
    en = Math.random() > 0.1; // 90% chance of en
    lpMode = Math.random() > 0.6; // 40% chance of lpMode
    opc = Math.floor(Math.random() * 16);
    
    document.getElementById("ctrl-en").checked = en;
    document.getElementById("ctrl-lp").checked = lpMode;
    document.getElementById("ctrl-opc").value = opc;

    triggerClockEdge();
}

// --- Reset Simulation ---
function resetSimulation() {
    simTime = 0;
    history = [];
    
    en = true;
    lpMode = false;
    opc = 0;
    inputA = 0x1A2B3C4D;
    inputB = 0x4C3B2A1D;
    
    document.getElementById("ctrl-en").checked = en;
    document.getElementById("ctrl-lp").checked = lpMode;
    document.getElementById("ctrl-opc").value = opc;
    document.getElementById("ctrl-a").value = toHex32(inputA);
    document.getElementById("ctrl-b").value = toHex32(inputB);
    
    regY = 0;
    flagZ = 0;
    flagN = 0;
    flagC = 0;
    flagV = 0;
    
    // Initialize first sample in history
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
    updatePowerAnalysis();
    updateSchematicWires();
    resizeCanvas();
    
    document.getElementById("time-indicator").innerText = "Current Time: 0 ns";
}

// --- Power analysis chart simulator ---
function updatePowerAnalysis() {
    // Estimations based on dynamic switching activity factor reduction:
    // P = C*V^2*f * switching factor (SF)
    // Baseline (Full switching): 145uW
    // Clock gated (en=0): cuts flip flop clock nodes, registers hold state. Dynamic drops to leakage + static clock tree load = ~32 uW.
    // Operand isolated: shuts down 3 of 4 large combinational blocks, dynamic drops to ~105uW.
    // Gated + isolated + lpMode: drops to ~70uW.
    
    let power = 145; // Baseline
    
    if (!en) {
        power = 32; // Gated tree
    } else {
        // Operand isolation drops combinational power.
        // lpMode approximates LSB additions and cuts shifting multiplexers.
        if (lpMode) {
            power = 72; // Fully Optimized
        } else {
            power = 105; // Isolated active
        }
    }
    
    // Set UI values
    document.getElementById("stat-power").innerText = `${power} µW`;
    
    const savings = Math.round(((145 - power) / 145) * 100);
    document.getElementById("stat-savings").innerText = `${savings}%`;
    
    // Update power bars heights (CSS percentages)
    document.getElementById("p-bar-base").style.height = "100%";
    document.getElementById("p-bar-gate").style.height = `${(32/145)*100}%`;
    document.getElementById("p-bar-iso").style.height = `${(105/145)*100}%`;
    document.getElementById("p-bar-opt").style.height = `${(72/145)*100}%`;
}

// --- Update Interactive Schematic SVG ---
function updateSchematicWires() {
    const isAdderActive = [0, 1, 13, 14].includes(opc);
    const isLogicActive = [2, 3, 4, 5, 12].includes(opc);
    const isShifterActive = [6, 7, 8].includes(opc);
    const isComparatorActive = (opc === 9);

    // Toggle functional blocks styling
    toggleNodeClass("node-adder", isAdderActive);
    toggleNodeClass("node-logic", isLogicActive);
    toggleNodeClass("node-shifter", isShifterActive);
    toggleNodeClass("node-comparator", isComparatorActive);

    // Toggle corresponding wires styling (Inputs to Blocks)
    toggleWireClass("wire-a-add", isAdderActive);
    toggleWireClass("wire-b-add", isAdderActive);
    toggleWireClass("wire-a-log", isLogicActive);
    toggleWireClass("wire-b-log", isLogicActive);
    toggleWireClass("wire-a-sh", isShifterActive);
    toggleWireClass("wire-b-sh", isShifterActive);
    toggleWireClass("wire-a-comp", isComparatorActive);
    toggleWireClass("wire-b-comp", isComparatorActive);

    // Toggle output wires styling (Blocks to Mux)
    toggleWireClass("wire-out-add", isAdderActive);
    toggleWireClass("wire-out-log", isLogicActive);
    toggleWireClass("wire-out-sh", isShifterActive);
    toggleWireClass("wire-out-comp", isComparatorActive);

    // Wire from MUX to output registers
    // Toggles if enable is active and we are NOT in NOP (OPC=15)
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

    // Parameters for formatting
    const signalNames = [
        "clk", "en", "lp_mode", "OPC[3:0]", "A[31:0]", "B[31:0]", "Y[31:0]", "Z", "N", "C", "V"
    ];
    
    const startX = 110;
    const endX = canvas.width - 20;
    const waveAreaWidth = endX - startX;
    
    const rowHeight = Math.floor(canvas.height / (signalNames.length + 1.2));
    
    // Draw grid lines and labels column border
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, canvas.height);
    ctx.stroke();

    // Map times to canvas pixels
    const maxSamples = 12; // cycles
    const xStep = waveAreaWidth / maxSamples;

    // Draw clock grid vertical lines and time scale numbers at the top row
    ctx.fillStyle = "#8b949e";
    ctx.font = "9px 'Fira Code', monospace";
    ctx.textAlign = "center";
    
    for (let i = 0; i <= maxSamples; i++) {
        const x = startX + i * xStep;
        ctx.beginPath();
        ctx.moveTo(x, rowHeight);
        ctx.lineTo(x, canvas.height);
        ctx.strokeStyle = "#1b1b1b";
        ctx.stroke();
        
        // Render tick values (each step is 10ns)
        const displayTime = i * 10;
        ctx.fillText(`${displayTime}ns`, x, rowHeight - 6);
    }
    
    // Draw horizontal grid separators
    for (let r = 0; r <= signalNames.length; r++) {
        const y = (r + 1) * rowHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.strokeStyle = "#1f1f1f";
        ctx.stroke();
    }

    // Draw Signal Labels
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 11px 'Fira Code', monospace";

    signalNames.forEach((sig, index) => {
        const y = (index + 1) * rowHeight + rowHeight / 2;
        
        // Label coloring to match Vivado
        if (sig === "clk") ctx.fillStyle = "#00FF66"; // Green
        else if (["en", "lp_mode"].includes(sig)) ctx.fillStyle = "#FFD700"; // Yellow
        else if (sig.includes("OPC") || sig.includes("A") || sig.includes("B") || sig.includes("Y")) ctx.fillStyle = "#58a6ff"; // Blue buses
        else ctx.fillStyle = "#00E5FF"; // Neon blue flags
        
        ctx.fillText(sig, 10, y);
        
        // Show current value label
        let valText = "";
        const latest = history[history.length - 1];
        if (latest) {
            if (sig === "clk") valText = latest.clk ? "1" : "0";
            else if (sig === "en") valText = latest.en ? "1" : "0";
            else if (sig === "lp_mode") valText = latest.lpMode ? "1" : "0";
            else if (sig === "OPC[3:0]") valText = latest.opc.toString(16).toUpperCase();
            else if (sig === "A[31:0]") valText = toHex32(latest.A);
            else if (sig === "B[31:0]") valText = toHex32(latest.B);
            else if (sig === "Y[31:0]") valText = toHex32(latest.Y);
            else if (sig === "Z") valText = latest.Z ? "1" : "0";
            else if (sig === "N") valText = latest.N ? "1" : "0";
            else if (sig === "C") valText = latest.C ? "1" : "0";
            else if (sig === "V") valText = latest.V ? "1" : "0";
        }
        ctx.fillStyle = "#8b949e";
        ctx.fillText(valText.substring(0, 8), 75, y);
    });

    // Draw Signal Wave traces
    history.forEach((state, stepIdx) => {
        if (stepIdx === 0) return;
        const prev = history[stepIdx - 1];
        
        // Timeline coordinate mapping
        const xPrev = startX + (prev.time / 10) * xStep;
        const xCurr = startX + (state.time / 10) * xStep;
        
        signalNames.forEach((sig, sigIdx) => {
            const yCenter = (sigIdx + 1) * rowHeight + rowHeight / 2;
            const yHigh = yCenter - rowHeight / 3;
            const yLow = yCenter + rowHeight / 3;
            
            // Check if signal is a multi-bit Bus
            const isBus = sig.includes("[");
            
            if (isBus) {
                // Bus rendering (Hex values inside hex shaped packets)
                ctx.strokeStyle = "#58a6ff"; // Blue buses
                ctx.fillStyle = "rgba(88, 166, 255, 0.1)";
                ctx.lineWidth = 1.2;
                
                // Get values
                let valPrev = "", valCurr = "";
                if (sig.includes("OPC")) {
                    valPrev = OP_NAMES[prev.opc];
                    valCurr = OP_NAMES[state.opc];
                } else if (sig.includes("A")) {
                    valPrev = toHex32(prev.A);
                    valCurr = toHex32(state.A);
                } else if (sig.includes("B")) {
                    valPrev = toHex32(prev.B);
                    valCurr = toHex32(state.B);
                } else if (sig.includes("Y")) {
                    valPrev = toHex32(prev.Y);
                    valCurr = toHex32(state.Y);
                }
                
                const valueChanged = (valPrev !== valCurr);
                
                ctx.beginPath();
                if (valueChanged || stepIdx === 1) {
                    // Draw transition cross
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
                    // Draw parallel bus lines
                    ctx.beginPath();
                    ctx.moveTo(xPrev, yHigh);
                    ctx.lineTo(xCurr, yHigh);
                    ctx.moveTo(xPrev, yLow);
                    ctx.lineTo(xCurr, yLow);
                    ctx.stroke();
                }
            } else {
                // Single bit binary waveform (glowing lines)
                let bitPrev = 0, bitCurr = 0;
                let color = "#ffffff";
                
                if (sig === "clk") { bitPrev = prev.clk; bitCurr = state.clk; color = varColor("--color-clk"); }
                else if (sig === "en") { bitPrev = prev.en; bitCurr = state.en; color = varColor("--color-ctrl"); }
                else if (sig === "lp_mode") { bitPrev = prev.lpMode; bitCurr = state.lpMode; color = varColor("--color-ctrl"); }
                else if (sig === "Z") { bitPrev = prev.Z; bitCurr = state.Z; color = varColor("--color-flag"); }
                else if (sig === "N") { bitPrev = prev.N; bitCurr = state.N; color = varColor("--color-flag"); }
                else if (sig === "C") { bitPrev = prev.C; bitCurr = state.C; color = varColor("--color-flag"); }
                else if (sig === "V") { bitPrev = prev.V; bitCurr = state.V; color = varColor("--color-flag"); }
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.8;
                
                ctx.beginPath();
                // vertical edge transition
                const yPrevVal = (bitPrev === 1) ? yHigh : yLow;
                const yCurrVal = (bitCurr === 1) ? yHigh : yLow;
                
                ctx.moveTo(xPrev, yPrevVal);
                ctx.lineTo(xCurr, yPrevVal); // horizontal hold
                ctx.lineTo(xCurr, yCurrVal); // vertical rise/fall
                ctx.stroke();
            }
        });
    });
}

function varColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
