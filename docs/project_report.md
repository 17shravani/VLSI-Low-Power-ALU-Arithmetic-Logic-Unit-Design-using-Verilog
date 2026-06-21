# Technical Project Report: Low-Power Arithmetic Logic Unit (ALU) Design

**Course**: VLSI Design & RTL Engineering Course Project  
**Author**: Student Researcher  
**Status**: Simulation & Synthesis Ready  
**Target Architecture**: Parameterizable ASIC/FPGA Front-End  

---

## 1. Project Objective
The objective of this project is to design, model, and verify a parameterizable, low-power 8/16/32-bit Arithmetic Logic Unit (ALU) in synthesizable Verilog. The project showcases how standard power-aware register-transfer level (RTL) design methodologies (such as operand isolation, clock-enable registers, and approximate arithmetic LSB masking) are applied to reduce dynamic switching activity, which is the primary source of power consumption in modern VLSI systems.

---

## 2. Low-Power Design Concept in VLSI
Dynamic power in CMOS circuits is consumed during signal transitions (charging and discharging of output load capacitances):
\[P_{\text{dynamic}} = \alpha \cdot C \cdot V_{\text{dd}}^2 \cdot f\]
To achieve significant power savings without lowering supply voltage (\(V_{\text{dd}}\)) or reducing operating frequency (\(f\)), we must directly target the switching activity factor (\(\alpha\)) and capacitive load (\(C\)).

### A. Operand Isolation
In a conventional ALU, the inputs $A$ and $B$ are wired directly to every internal functional block (Adder, Shifter, Logical Unit). Whenever $A$ or $B$ changes, all internal circuits switch and consume dynamic power, even if the multiplexer discards their outputs.
* **Our Solution**: We decode the opcode (`OPC`) and isolate the input operands. If a block is inactive, its inputs are gated to constant zero. Since the inputs do not switch, the internal logic gates of that block remain idle, resulting in substantial dynamic power reduction.

### B. Register-Level Clock Gating (Clock Enable)
Clock trees consume up to 40% of a chip's total dynamic power due to continuous clock distribution buffering and flip-flop clock pin switching.
* **Our Solution**: Instead of registers constantly updating their state, we use a clock-enable (`en`) signal. When `en = 0`, the output registers hold their state. Synthesis tools map this conditional always block (`if (en) Y <= y_next;`) to an Integrated Clock Gating (ICG) cell, cutting off clock tree toggling to the registers, saving clock power.

### C. Approximate LSB Arithmetic & Shifter Masking
Arithmetic logic gates, particularly in adder carry chains, exhibit high switching activity.
* **Our Solution**: When the global `lp_mode` is asserted:
  1. The Shifter amount (`shamt`) is forced to a 1-bit step. This bypasses the activation of wide shift barrel multiplexer networks.
  2. The Adder gates the lower `APPROX_LSB` bits of operand $B$ to zero. This cuts off carry propagation in the least significant bits, turning those stages into simple buffers. This trade-off between power and arithmetic precision is highly relevant in error-tolerant fields like image processing, DSP, and AI.

---

## 3. ALU Design & Opcode Mapping
The ALU is parameterized by `WIDTH` (defaulting to 32) and supports 16 operations selected by a 4-bit opcode:

| Opcode | Operation | Name | Isolated Block |
| :---: | :---: | :---: | :--- |
| `0000` | \(Y = A + B\) | **ADD** | Adder active; Logic/Shifter isolated |
| `0001` | \(Y = A - B\) | **SUB** | Adder active; Logic/Shifter isolated |
| `0010` | \(Y = A \ \& \ B\) | **AND** | Logic active; Adder/Shifter isolated |
| `0011` | \(Y = A \ \| \ B\) | **OR** | Logic active; Adder/Shifter isolated |
| `0100` | \(Y = A \ \wedge \ B\) | **XOR** | Logic active; Adder/Shifter isolated |
| `0101` | \(Y = \sim(A \ \| \ B)\) | **NOR** | Logic active; Adder/Shifter isolated |
| `0110` | \(Y = A \ll B\) | **SLL** | Shifter active; Adder/Logic isolated |
| `0111` | \(Y = A \gg B\) | **SRL** | Shifter active; Adder/Logic isolated |
| `1000` | \(Y = A \gg\gg B\) | **SRA** | Shifter active; Adder/Logic isolated |
| `1001` | \(Y = A < B\) | **SLT** | Comparator active; Adder/Logic/Shifter isolated |
| `1010` | \(Y = A\) | **PASS A** | Passthrough active; all compute blocks isolated |
| `1011` | \(Y = B\) | **PASS B** | Passthrough active; all compute blocks isolated |
| `1100` | \(Y = \sim A\) | **NOT A** | Logic active; Adder/Shifter isolated |
| `1101` | \(Y = A + 1\) | **INC A** | Adder active (B=1); Logic/Shifter isolated |
| `1110` | \(Y = A - 1\) | **DEC A** | Adder active (B=1); Logic/Shifter isolated |
| `1111` | \(Y = 0\) | **NOP** | All functional blocks isolated; output registered zero |

---

## 4. RTL Logic & Design Structure

The design is split into two synthesizable modules:
1. **`adder.v`**: Parameterized adder component implementing:
   - Ripple Carry Adder (RCA) or Carry Lookahead Adder (CLA) architectures.
   - Low-power approximation logic masking the lower bits of $B$ in low-power mode.
2. **`alu.v`**: Top-level wrapper managing:
   - Opcode decoders.
   - Operand isolation gates (bitwise ANDs/MUXes).
   - Shifter amount masking.
   - Outputs and flags status registers with clock-enable.

---

## 5. Verification & Testbench Strategy
The verification of the design is performed in `tb/alu_tb.v`:
* **Functional Correctness**: Computations are compared against a golden reference model function written in behavioral SystemVerilog/Verilog style.
* **Enable-gating check**: Input values are toggled when `en = 0`. The testbench asserts an error if the output changes, proving clock enable stability.
* **Operand Isolation verification**: Can be checked visually by loading internal signal traces (`A_add`, `A_log`, `A_sh`) in GTKWave and verifying they remain flat at zero when unrelated operations are performed.
* **Flag assertions**: Specific tests are run to verify that Zero (`Z`), Negative (`N`), Carry (`C`), and Overflow (`V`) flags assert under boundary conditions (e.g. addition overflow, signed subtraction underflow).

---

## 6. Synthesis & Power Analysis Guidelines

### Synthesis Steps (Yosys)
By executing `yosys -s scripts/synth.ys`, the RTL code is elaborated and mapped to a library of generic gates. The Yosys compilation:
1. Translates the behavioral constructs into gate-level primitives.
2. Infers clock-enable structures.
3. Generates a report showing gate counts (e.g., AND, OR, XOR, MUX, and Registers).

### Power Analysis in Vivado
For realistic power reporting:
1. Synthesize and implement the project in Vivado.
2. Run simulation in Vivado (using `tb/alu_tb.v`) to generate a Value Change Dump (`.vcd`) file.
3. Use the Vivado Power Analyzer, loading the `.vcd` file. Vivado reads the switching activity data of each node from the VCD to calculate the dynamic power consumption of the design.
4. Compare power consumption by running two simulations:
   - **Baseline**: `lp_mode = 0` throughout the test.
   - **Low Power**: `lp_mode = 1` active.
   Observe the dynamic power delta between both configurations to verify energy savings.

---

## 7. Conclusion
This project successfully demonstrates the application of front-end low-power VLSI design principles. By employing operand isolation, clock-enable gating, and approximate LSB computing, the ALU reduces useless switching toggles, directly lowering dynamic power. The design remains fully parameterizable and synthesizable, serving as an excellent proof-of-work project for students entering the digital design and VLSI domains.
