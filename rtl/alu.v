// rtl/alu.v
`timescale 1ns/1ps

module alu #(
    parameter integer WIDTH = 32,
    parameter integer USE_CLA = 0,         // 0: ripple, 1: carry-lookahead
    parameter integer APPROX_LSB = 0       // 0: exact, N>0: approximate N LSBs in add/sub
)(
    input wire clk,
    input wire rst_n,
    input wire en,                         // clock-enable (RTL clock gating)
    input wire lp_mode,                    // low-power mode hint
    input wire [WIDTH-1:0] A,
    input wire [WIDTH-1:0] B,
    input wire [3:0] OPC,                  // 4-bit opcode
    output reg [WIDTH-1:0] Y,
    output reg Z, N, C, V
);

    // --- Opcode Decodes for Operand Isolation ---
    wire do_add = (OPC == 4'b0000);
    wire do_sub = (OPC == 4'b0001);
    wire do_and = (OPC == 4'b0010);
    wire do_or  = (OPC == 4'b0011);
    wire do_xor = (OPC == 4'b0100);
    wire do_nor = (OPC == 4'b0101);
    wire do_sll = (OPC == 4'b0110);
    wire do_srl = (OPC == 4'b0111);
    wire do_sra = (OPC == 4'b1000);
    wire do_slt = (OPC == 4'b1001);
    wire do_a   = (OPC == 4'b1010);
    wire do_b   = (OPC == 4'b1011);
    wire do_not = (OPC == 4'b1100);
    wire do_inc = (OPC == 4'b1101);
    wire do_dec = (OPC == 4'b1110);
    wire do_nop = (OPC == 4'b1111);

    // --- Operand Isolation: gate inputs of inactive blocks to constant zero ---
    // Arithmetic operands (active during ADD, SUB, INC, DEC)
    wire [WIDTH-1:0] A_add = (do_add | do_sub | do_inc | do_dec) ? A : {WIDTH{1'b0}};
    wire [WIDTH-1:0] B_add = do_add ? B :
                             do_sub ? B :
                             do_inc ? {{WIDTH-1{1'b0}}, 1'b1} : // B = 1 for INC
                             do_dec ? {{WIDTH-1{1'b0}}, 1'b1} : // B = 1 for DEC (we do SUB 1)
                             {WIDTH{1'b0}};
                             
    // Logical operands (active during AND, OR, XOR, NOR, NOT)
    wire [WIDTH-1:0] A_log = (do_and | do_or | do_xor | do_nor | do_not) ? A : {WIDTH{1'b0}};
    wire [WIDTH-1:0] B_log = (do_and | do_or | do_xor | do_nor) ? B : {WIDTH{1'b0}};

    // Shifter operands (active during SLL, SRL, SRA)
    wire [WIDTH-1:0] A_sh = (do_sll | do_srl | do_sra) ? A : {WIDTH{1'b0}};
    wire [WIDTH-1:0] B_sh = (do_sll | do_srl | do_sra) ? B : {WIDTH{1'b0}};

    // --- Adder / Subtractor Instance ---
    // If it's a subtraction or decrement, we negate B_add and set cin to 1.
    // In Verilog, a subtraction A - B is computed as A + ~B + 1.
    wire do_arith_sub = (do_sub | do_dec);
    wire [WIDTH-1:0] B_add_eff = do_arith_sub ? ~B_add : B_add;
    wire cin = do_arith_sub ? 1'b1 : 1'b0;

    wire [WIDTH-1:0] sum;
    wire cout, v_of;

    adder #(
        .WIDTH(WIDTH),
        .USE_CLA(USE_CLA),
        .APPROX_LSB(APPROX_LSB)
    ) u_adder (
        .A(A_add),
        .B(B_add_eff),
        .cin(cin),
        .lp_mode(lp_mode),
        .Y(sum),
        .cout(cout),
        .ovf(v_of)
    );

    // --- Logic Unit ---
    wire [WIDTH-1:0] y_and = A_log & B_log;
    wire [WIDTH-1:0] y_or  = A_log | B_log;
    wire [WIDTH-1:0] y_xor = A_log ^ B_log;
    wire [WIDTH-1:0] y_nor = ~(A_log | B_log);
    wire [WIDTH-1:0] y_not = ~A_log;

    // --- Shifter Unit ---
    // In low-power mode, shift amount is masked/limited to 1 bit to prevent excessive barrel-shifter toggles.
    // If WIDTH is 32, shift amount is B[4:0]; if WIDTH is 16, B[3:0]; if WIDTH is 8, B[2:0].
    localparam SHIFT_WIDTH = (WIDTH <= 8) ? 3 : (WIDTH <= 16) ? 4 : 5;
    wire [SHIFT_WIDTH-1:0] shamt = lp_mode ? {{SHIFT_WIDTH-1{1'b0}}, 1'b1} : B_sh[SHIFT_WIDTH-1:0];

    wire [WIDTH-1:0] y_sll = A_sh << shamt;
    wire [WIDTH-1:0] y_srl = A_sh >> shamt;
    wire [WIDTH-1:0] y_sra = $signed(A_sh) >>> shamt;

    // --- Comparator Unit (Signed Less-Than) ---
    wire [WIDTH-1:0] y_slt = ($signed(A) < $signed(B)) ? {{WIDTH-1{1'b0}}, 1'b1} : {WIDTH{1'b0}};

    // --- Combinational Multiplexer for Next Result ---
    wire [WIDTH-1:0] y_next = 
        (do_add | do_sub | do_inc | do_dec) ? sum   :
        do_and                              ? y_and :
        do_or                               ? y_or  :
        do_xor                              ? y_xor :
        do_nor                              ? y_nor :
        do_not                              ? y_not :
        do_sll                              ? y_sll :
        do_srl                              ? y_srl :
        do_sra                              ? y_sra :
        do_slt                              ? y_slt :
        do_a                                ? A     :
        do_b                                ? B     :
        {WIDTH{1'b0}};

    // --- Flag Generation (Combinational before output register) ---
    wire Z_n = (y_next == {WIDTH{1'b0}});
    wire N_n = y_next[WIDTH-1];
    wire C_n = (do_add | do_sub | do_inc | do_dec) ? cout : 1'b0;
    wire V_n = (do_add | do_sub | do_inc | do_dec) ? v_of : 1'b0;

    // --- Output Registers with RTL Clock-Enable (Register-level Clock Gating) ---
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            Y <= {WIDTH{1'b0}};
            Z <= 1'b0;
            N <= 1'b0;
            C <= 1'b0;
            V <= 1'b0;
        end else if (en) begin
            Y <= y_next;
            Z <= Z_n;
            N <= N_n;
            C <= C_n;
            V <= V_n;
        end
        // If en is 0, the output registers stable-hold their previous state,
        // preventing downstream circuits from toggling.
    end

endmodule
