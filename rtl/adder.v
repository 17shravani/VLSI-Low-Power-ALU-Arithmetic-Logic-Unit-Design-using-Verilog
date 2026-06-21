// rtl/adder.v
`timescale 1ns/1ps

module adder #(
    parameter integer WIDTH = 32,
    parameter integer USE_CLA = 0,         // 0: Ripple Carry Adder (RCA), 1: Carry Lookahead Adder (CLA)
    parameter integer APPROX_LSB = 0       // Number of LSBs to approximate (0 to disable)
)(
    input wire [WIDTH-1:0] A,
    input wire [WIDTH-1:0] B,
    input wire cin,
    input wire lp_mode,                    // Low-power mode control
    output wire [WIDTH-1:0] Y,
    output wire cout,
    output wire ovf                        // Signed overflow flag
);

    generate
        if (USE_CLA == 0) begin: GEN_RIPPLE
            // Ripple Carry Adder (RCA)
            wire [WIDTH:0] c;
            assign c[0] = cin;
            
            // In low-power mode, if APPROX_LSB > 0, we mask the LSBs of B to zero.
            // This prevents toggling activity in the lower bits from propagating through the carry chain,
            // effectively reducing switching power.
            wire [WIDTH-1:0] a_eff = A;
            wire [WIDTH-1:0] b_eff = (lp_mode && (APPROX_LSB > 0)) ? 
                                     {B[WIDTH-1:APPROX_LSB], {APPROX_LSB{1'b0}}} : B;
            
            genvar i;
            for (i = 0; i < WIDTH; i = i + 1) begin: FA
                assign {c[i+1], Y[i]} = a_eff[i] + b_eff[i] + c[i];
            end
            assign cout = c[WIDTH];
            assign ovf = c[WIDTH] ^ c[WIDTH-1];
            
        end else begin: GEN_CLA
            // Carry Lookahead Adder (CLA)
            wire [WIDTH:0] C;
            assign C[0] = cin;
            
            // Mask lower LSBs of B in low-power mode for approximate computing
            wire [WIDTH-1:0] a_eff = A;
            wire [WIDTH-1:0] b_eff = (lp_mode && (APPROX_LSB > 0)) ? 
                                     {B[WIDTH-1:APPROX_LSB], {APPROX_LSB{1'b0}}} : B;

            wire [WIDTH-1:0] P = a_eff ^ b_eff; // Propagate terms
            wire [WIDTH-1:0] G = a_eff & b_eff; // Generate terms

            genvar k;
            for (k = 0; k < WIDTH; k = k + 1) begin: CLA_SUM
                assign Y[k] = P[k] ^ C[k];
                
                // We generate carries. To maintain scalability and simplicity,
                // we implement 4-bit lookahead blocks.
                if ((k % 4) == 0) begin: CLA_BLOCK
                    if (k + 3 < WIDTH) begin: FULL_GROUP
                        wire c1 = G[k] | (P[k] & C[k]);
                        wire c2 = G[k+1] | (P[k+1] & G[k]) | (P[k+1] & P[k] & C[k]);
                        wire c3 = G[k+2] | (P[k+2] & G[k+1]) | (P[k+2] & P[k+1] & G[k]) | (P[k+2] & P[k+1] & P[k] & C[k]);
                        wire c4 = G[k+3] | (P[k+3] & G[k+2]) | (P[k+3] & P[k+2] & G[k+1]) | (P[k+3] & P[k+2] & P[k+1] & G[k]) | (P[k+3] & P[k+2] & P[k+1] & P[k] & C[k]);
                        
                        assign C[k+1] = c1;
                        assign C[k+2] = c2;
                        assign C[k+3] = c3;
                        assign C[k+4] = c4;
                    end else begin: REMAINDER_CELL
                        // Fallback carry for remaining bits when width is not multiple of 4
                        assign C[k+1] = G[k] | (P[k] & C[k]);
                    end
                end else begin: INTERMEDIATE_CELL
                    // If not the start of a 4-bit block, but we are near the end of the width
                    if (k + (3 - (k % 4)) >= WIDTH) begin: END_CELL
                        assign C[k+1] = G[k] | (P[k] & C[k]);
                    end
                end
            end
            assign cout = C[WIDTH];
            assign ovf = C[WIDTH] ^ C[WIDTH-1];
        end
    endgenerate

endmodule
