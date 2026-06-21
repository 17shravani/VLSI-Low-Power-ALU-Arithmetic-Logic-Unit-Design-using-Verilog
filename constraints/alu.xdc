## constraints/alu.xdc
## Physical and Timing Constraints for Low-Power ALU
## Target Board: Artix-7 (e.g., Nexys4 DDR or Basys3)

# Clock signal (100 MHz clock oscillator on board)
create_clock -add -name sys_clk_pin -period 10.00 -waveform {0 5} [get_ports clk]
set_property -dict { PACKAGE_PIN E3    IOSTANDARD LVCMOS33 } [get_ports { clk }];

# Reset Pin (Active-low CPU reset button)
set_property -dict { PACKAGE_PIN C12   IOSTANDARD LVCMOS33 } [get_ports { rst_n }];

# Enable and Low-Power Mode Switches
set_property -dict { PACKAGE_PIN J15   IOSTANDARD LVCMOS33 } [get_ports { en }];      # SW[0]
set_property -dict { PACKAGE_PIN L16   IOSTANDARD LVCMOS33 } [get_ports { lp_mode }]; # SW[1]

# Opcode Switches (4-bit Opcode OPC[3:0])
set_property -dict { PACKAGE_PIN M13   IOSTANDARD LVCMOS33 } [get_ports { OPC[0] }];  # SW[2]
set_property -dict { PACKAGE_PIN R15   IOSTANDARD LVCMOS33 } [get_ports { OPC[1] }];  # SW[3]
set_property -dict { PACKAGE_PIN R17   IOSTANDARD LVCMOS33 } [get_ports { OPC[2] }];  # SW[4]
set_property -dict { PACKAGE_PIN T18   IOSTANDARD LVCMOS33 } [get_ports { OPC[3] }];  # SW[5]

# NOTE: For 32-bit operands A and B, a physical board has limited switches.
# In a real hardware demo, operands are usually loaded sequentially (e.g. using buttons to latch parts of the value)
# or driven by an internal soft-core CPU (e.g. MicroBlaze) or a test pattern generator.
# Below, we map the lower 4 bits of A and B to switches for user-interactive demo,
# while the remaining upper bits are tied to virtual registers in our hardware wrap.
set_property -dict { PACKAGE_PIN U18   IOSTANDARD LVCMOS33 } [get_ports { A[0] }];    # SW[6]
set_property -dict { PACKAGE_PIN R13   IOSTANDARD LVCMOS33 } [get_ports { A[1] }];    # SW[7]
set_property -dict { PACKAGE_PIN T8    IOSTANDARD LVCMOS33 } [get_ports { A[2] }];    # SW[8]
set_property -dict { PACKAGE_PIN U8    IOSTANDARD LVCMOS33 } [get_ports { A[3] }];    # SW[9]

set_property -dict { PACKAGE_PIN V10   IOSTANDARD LVCMOS33 } [get_ports { B[0] }];    # SW[10]
set_property -dict { PACKAGE_PIN U11   IOSTANDARD LVCMOS33 } [get_ports { B[1] }];    # SW[11]
set_property -dict { PACKAGE_PIN U12   IOSTANDARD LVCMOS33 } [get_ports { B[2] }];    # SW[12]
set_property -dict { PACKAGE_PIN H6    IOSTANDARD LVCMOS33 } [get_ports { B[3] }];    # SW[13]

# Connect remaining pins of A and B to ground or virtual pins if synthesizing top-level
# (Vivado will issue warnings if inputs are unused, which is safe for this course demo).

# LED outputs (Mapping ALU result Y[11:0] to LEDs)
set_property -dict { PACKAGE_PIN H17   IOSTANDARD LVCMOS33 } [get_ports { Y[0] }];    # LED[0]
set_property -dict { PACKAGE_PIN K15   IOSTANDARD LVCMOS33 } [get_ports { Y[1] }];    # LED[1]
set_property -dict { PACKAGE_PIN J13   IOSTANDARD LVCMOS33 } [get_ports { Y[2] }];    # LED[2]
set_property -dict { PACKAGE_PIN N14   IOSTANDARD LVCMOS33 } [get_ports { Y[3] }];    # LED[3]
set_property -dict { PACKAGE_PIN R18   IOSTANDARD LVCMOS33 } [get_ports { Y[4] }];    # LED[4]
set_property -dict { PACKAGE_PIN V17   IOSTANDARD LVCMOS33 } [get_ports { Y[5] }];    # LED[5]
set_property -dict { PACKAGE_PIN U17   IOSTANDARD LVCMOS33 } [get_ports { Y[6] }];    # LED[6]
set_property -dict { PACKAGE_PIN U16   IOSTANDARD LVCMOS33 } [get_ports { Y[7] }];    # LED[7]
set_property -dict { PACKAGE_PIN V16   IOSTANDARD LVCMOS33 } [get_ports { Y[8] }];    # LED[8]
set_property -dict { PACKAGE_PIN T15   IOSTANDARD LVCMOS33 } [get_ports { Y[9] }];    # LED[9]
set_property -dict { PACKAGE_PIN U14   IOSTANDARD LVCMOS33 } [get_ports { Y[10] }];   # LED[10]
set_property -dict { PACKAGE_PIN T16   IOSTANDARD LVCMOS33 } [get_ports { Y[11] }];   # LED[11]

# Flag LEDs
set_property -dict { PACKAGE_PIN V15   IOSTANDARD LVCMOS33 } [get_ports { Z }];        # LED[12] - Zero Flag
set_property -dict { PACKAGE_PIN V14   IOSTANDARD LVCMOS33 } [get_ports { N }];        # LED[13] - Negative Flag
set_property -dict { PACKAGE_PIN V12   IOSTANDARD LVCMOS33 } [get_ports { C }];        # LED[14] - Carry Flag
set_property -dict { PACKAGE_PIN V11   IOSTANDARD LVCMOS33 } [get_ports { V }];        # LED[15] - Overflow Flag
