# Low-Power ALU (Arithmetic Logic Unit) Design in Verilog
<img width="1911" height="901" alt="Screenshot 2026-06-21 155832" src="https://github.com/user-attachments/assets/fcc1c071-0abd-4051-a980-50acdcee210e" />

[![Language](https://img.shields.io/badge/Language-Verilog%20%2F%20SystemVerilog-blue.svg)](https://en.wikipedia.org/wiki/Verilog)
[![Toolchain](https://img.shields.io/badge/Toolchain-Vivado%20%2F%20ModelSim%20%2F%20Icarus-orange.svg)](https://www.xilinx.com/products/design-tools/vivado.html)
[![Low-Power RTL](https://img.shields.io/badge/Design-Low--Power%20RTL%20%2F%20PPA-success.svg)](https://en.wikipedia.org/wiki/Low-power_electronics)
[![Interactive Dashboard](https://img.shields.io/badge/Interface-Web%20Dashboard-blueviolet.svg)](web/index.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An industry-oriented VLSI project showcasing a parameterizable, low-power **Arithmetic Logic Unit (ALU)** designed in synthesizable Verilog. The project incorporates standard front-end low-power optimization techniques—**operand isolation**, **RTL clock-enable gating**, and **low-power mode (`lp_mode`) optimizations** (shifter masking and LSB approximate computing). 

To make it interactive and visually engaging, the project includes an **RTL Web Simulator Dashboard** replicating the look of Xilinx Vivado Waveform Viewer.

---

## 1. Project Explanation & Concepts

### What is an ALU?
An **Arithmetic Logic Unit (ALU)** is the computational core of any CPU, GPU, DSP, or microcontroller. It performs basic mathematical (addition, subtraction, increment, decrement) and logical (bitwise AND, OR, XOR, shifts, comparisons) operations on binary operands.

### What is a Low-Power ALU?
A **Low-Power ALU** is a power-aware implementation of an ALU. In traditional ALU designs, all functional sub-blocks (adder, shifter, logical unit) compute continuously whenever the input operands toggle, even though only one block's output is selected by the output multiplexer. A low-power ALU inserts control logic to shut down toggling activity inside inactive blocks, saving significant dynamic power.

### Low-Power Techniques Used in this Design
1. **Operand Isolation**: Decodes the opcode and intercepts operands at the inputs of functional units. Inactive blocks receive static zeros, forcing their internal logic gates to remain idle.
2. **Register Clock-Enable (`en` signal)**: Implements register gating. When `en = 0`, registers hold their state and the synthesis tool infers **Integrated Clock Gating (ICG)** cells to cut off the clock tree at the flip-flops, preventing dynamic clock power loss.
3. **Low-Power Mode (`lp_mode`)**:
   - **Shifter Masking**: Gating shift amount inputs to 1 bit (`shamt = 1`) to bypass toggles in the multi-stage multiplexers of the barrel shifter.
   - **LSB Approximate Computing**: Masking lower $N$ bits (determined by `APPROX_LSB` parameter) of operand B to zero in addition/subtraction. This halts carry propagation and switching in the lower stages of the adder, allowing approximate computing for power savings in applications like image processing and AI.

---

## 2. Interactive Web Dashboard (RTL Web Simulator)

The project includes an interactive web-based dashboard under the [web/](web/) directory. It serves as a visual companion to explain and verify the Verilog designs.

### Key Dashboard Modules:
1. **RTL Control Inputs**: Switches to toggle clock-enable (`en`) and `lp_mode`, a dropdown to select opcodes, and inputs for Hex operands A and B. Click **Trigger Clock Edge** to advance the simulation time step.
2. **Vivado-Style Waveform Viewer**: A dynamic trace viewer designed to match the dark-theme trace scheme of **Xilinx Vivado Waveform Viewer** (clock in green, control signals in yellow, and flags in neon blue).
3. **Power Analysis Graph**: Interactive charts tracking estimated dynamic power and dynamic energy savings compared to baseline designs.
4. **Animated Operand Isolation Schematic**: An interactive SVG logical diagram. Active paths and computing blocks pulse green to represent signal toggling, while isolated blocks fade to grey with wires locking to flat-line static states, demonstrating operand isolation visually.

### How to Run:
No server required! Simply double-click **[web/index.html](web/index.html)** to open the dashboard directly in any standard web browser (Chrome, Edge, Firefox, Safari).

---

## 3. ALU Design Specification & Opcode Table

The design features a 4-bit opcode (`OPC`) enabling 16 operations:

| Opcode (`OPC`) | Operation | Operation Name | Description | Flags | Low-Power Treatment |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `4'b0000` | `Y = A + B` | **ADD** | Arithmetic addition | Z, N, C, V | Subject to `APPROX_LSB` masking |
| `4'b0001` | `Y = A - B` | **SUB** | Arithmetic subtraction | Z, N, C, V | Subject to `APPROX_LSB` masking |
| `4'b0010` | `Y = A & B` | **AND** | Bitwise logical AND | Z, N | Unused units isolated |
| `4'b0011` | `Y = A \| B` | **OR** | Bitwise logical OR | Z, N | Unused units isolated |
| `4'b0100` | `Y = A ^ B` | **XOR** | Bitwise logical XOR | Z, N | Unused units isolated |
| `4'b0101` | `Y = ~(A \| B)`| **NOR** | Bitwise logical NOR | Z, N | Unused units isolated |
| `4'b0110` | `Y = A << B` | **SLL** | Shift Left Logical | Z, N | Gated to 1-bit shift in `lp_mode` |
| `4'b0111` | `Y = A >> B` | **SRL** | Shift Right Logical | Z, N | Gated to 1-bit shift in `lp_mode` |
| `4'b1000` | `Y = A >>> B` | **SRA** | Shift Right Arithmetic | Z, N | Gated to 1-bit shift in `lp_mode` |
| `4'b1001` | `Y = A < B` | **SLT** | Signed Less Than comparison | Z, N | Unused units isolated |
| `4'b1010` | `Y = A` | **PASS A**| Pass operand A directly | Z, N | Unused units isolated |
| `4'b1011` | `Y = B` | **PASS B**| Pass operand B directly | Z, N | Unused units isolated |
| `4'b1100` | `Y = ~A` | **NOT A** | Bitwise negation of A | Z, N | Unused units isolated |
| `4'b1101` | `Y = A + 1` | **INC A** | Increment A by 1 | Z, N, C, V | Subject to `APPROX_LSB` masking |
| `4'b1110` | `Y = A - 1` | **DEC A** | Decrement A by 1 | Z, N, C, V | Subject to `APPROX_LSB` masking |
| `4'b1111` | `Y = 0` | **NOP** | Reset outputs (No Operation) | Z | Gated output, all units isolated |

---

## 4. Folder Structure

```
Low-Power-ALU-Verilog/
│
├── rtl/
│   ├── alu.v           # Parameterizable ALU top level (Operand isolation & clock-enable registers)
│   └── adder.v         # Ripple Carry / CLA Adder with APPROX_LSB gating
│
├── tb/
│   └── alu_tb.v        # Self-checking, randomized, and directed testbench with VCD dump
│
├── web/
│   ├── index.html      # Dashboard structural layout and schematic SVGs
│   ├── style.css       # Sleek Vivado-dark theme and glowing animations
│   └── app.js          # ALU simulation, SVG wires manager, dynamic waveform drawing
│
├── constraints/
│   └── alu.xdc         # Timing & physical constraint file for Vivado (Artix-7 FPGA pinouts)
│
├── simulation/
│   └── run_sim.bat     # Windows batch script to compile and run simulation locally
│
├── scripts/
│   └── synth.ys        # Yosys command file for command-line synthesis
│
├── reports/            # Output folder for synthesis gate counts and simulation logs
├── waveforms/          # Output folder for VCD/Waveform dumps
├── docs/               # Technical reports and documentation
├── README.md           # This file
└── .gitignore          # Git exclusion file
```

---

## 5. How to Run Simulation

### Method 1: Interactive Dashboard (Zero Setup)
Open **[web/index.html](web/index.html)** in your browser. You can click "Randomize Stimulus" or "Trigger Clock Edge" to run verification cases, watch waveforms scroll, and see wires light up live!

### Method 2: Cloud Simulation (EDA Playground)
1. Go to [EDA Playground](https://www.edaplayground.com/).
2. Copy `rtl/adder.v` and `rtl/alu.v` to the design area, and `tb/alu_tb.v` to the testbench area.
3. Select **Icarus Verilog 0.10.0**, check **EPWave**, and click **Run**.

### Method 3: Local Simulation (Icarus Verilog & GTKWave)
1. Double-click the file `simulation/run_sim.bat` (on Windows) or execute it from your terminal.
2. The compilation report will display in your console.
3. Open GTKWave and select `waveforms/waves.vcd` to view the waveform.

---

## 6. Synthesis & Power Report Analysis (Xilinx Vivado Tutorial)

To synthesize the design and generate power estimates:

1. Open Vivado and create a new project. Add `rtl/alu.v`, `rtl/adder.v`, and `constraints/alu.xdc`.
2. Click **Run Synthesis** and once done, click **Open Synthesized Design**.
3. Inspect gate counts using `report_utilization` in the Tcl console.
4. Run simulation in Vivado (using `tb/alu_tb.v`) to generate a Value Change Dump (`.vcd`) file.
5. In Synthesized design, click **Report Power**, load the `.vcd` file in the "VCD File" options field (vector-driven power estimation). Click OK to analyze register clock tree and switching power.

---

## 7. Interview Preparation (Questions & Answers)

### Q1: Explain your project.
**Answer**: I designed and verified a parameterizable, low-power Arithmetic Logic Unit (ALU) in Verilog. It supports 16 mathematical and logical operations. To make it industry-relevant, I integrated three low-power RTL techniques: clock-enable gating (which maps to Integrated Clock Gating cells in synthesis), operand isolation (which shuts down active switching in unused arithmetic/logical/shifter components), and a low-power mode (`lp_mode`). In low-power mode, the shifter is masked to a 1-bit step, and the adder uses approximate computing by zeroing out the lower LSBs (controlled by a parameter) to stop carry propagation toggles. I verified the design using a self-checking testbench that compares outputs and status flags against a behavioral reference model.

### Q2: What is operand isolation and how does it save power?
**Answer**: Operand isolation is a combinational power reduction technique. In an ALU, when input operands toggle, they propagate through all functional blocks (adder, shifter, multiplier, logical unit). Even if the multiplexer ignores the output of an idle block, that block still consumes dynamic power due to internal signal transitions. Operand isolation intercepts these inputs and gates them to a static value (like zero) when that specific block is not selected by the opcode. This forces the internal nodes of the block to remain stable, reducing dynamic switching power.

*(Additional interview questions can be found in [README.md](README.md))*

---

## 8. License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
