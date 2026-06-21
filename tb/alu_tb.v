// tb/alu_tb.v
`timescale 1ns/1ps

module alu_tb;
    localparam WIDTH = 32;
    localparam USE_CLA = 0;
    localparam APPROX_LSB = 4; // Approximate lower 4 bits in low power mode
    
    reg clk;
    reg rst_n;
    reg en;
    reg lp_mode;
    reg [WIDTH-1:0] A;
    reg [WIDTH-1:0] B;
    reg [3:0] OPC;
    
    wire [WIDTH-1:0] Y;
    wire Z, N, C, V;
    
    // Instantiate Device Under Test (DUT)
    alu #(
        .WIDTH(WIDTH),
        .USE_CLA(USE_CLA),
        .APPROX_LSB(APPROX_LSB)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),
        .en(en),
        .lp_mode(lp_mode),
        .A(A),
        .B(B),
        .OPC(OPC),
        .Y(Y),
        .Z(Z),
        .N(N),
        .C(C),
        .V(V)
    );
    
    // Clock generator (100 MHz clock)
    always #5 clk = ~clk;
    
    // Reference model function for verification
    function [WIDTH-1:0] get_expected_result;
        input [3:0] op;
        input [WIDTH-1:0] a;
        input [WIDTH-1:0] b;
        input lp;
        reg [WIDTH-1:0] b_temp;
        reg [4:0] shamt;
        begin
            case (op)
                4'b0000: begin // ADD
                    if (lp && (APPROX_LSB > 0)) begin
                        // In low power mode, lower APPROX_LSB bits of B are zeroed
                        b_temp = {b[WIDTH-1:APPROX_LSB], {APPROX_LSB{1'b0}}};
                        get_expected_result = a + b_temp;
                    end else begin
                        get_expected_result = a + b;
                    end
                end
                4'b0001: begin // SUB
                    if (lp && (APPROX_LSB > 0)) begin
                        b_temp = {b[WIDTH-1:APPROX_LSB], {APPROX_LSB{1'b0}}};
                        get_expected_result = a - b_temp;
                    end else begin
                        get_expected_result = a - b;
                    end
                end
                4'b0010: get_expected_result = a & b; // AND
                4'b0011: get_expected_result = a | b; // OR
                4'b0100: get_expected_result = a ^ b; // XOR
                4'b0101: get_expected_result = ~(a | b); // NOR
                4'b0110: begin // SLL
                    shamt = lp ? 5'd1 : b[4:0];
                    get_expected_result = a << shamt;
                end
                4'b0111: begin // SRL
                    shamt = lp ? 5'd1 : b[4:0];
                    get_expected_result = a >> shamt;
                end
                4'b1000: begin // SRA
                    shamt = lp ? 5'd1 : b[4:0];
                    get_expected_result = $signed(a) >>> shamt;
                end
                4'b1001: get_expected_result = ($signed(a) < $signed(b)) ? 32'd1 : 32'd0; // SLT
                4'b1010: get_expected_result = a; // PASS A
                4'b1011: get_expected_result = b; // PASS B
                4'b1100: get_expected_result = ~a; // NOT A
                4'b1101: begin // INC A
                    if (lp && (APPROX_LSB > 0)) begin
                        // INC A is A + 1. In approximate mode, B is masked (1 is in LSB, so it gets masked to 0!)
                        // Thus, Y = A + 0 = A.
                        get_expected_result = a;
                    end else begin
                        get_expected_result = a + 1'b1;
                    end
                end
                4'b1110: begin // DEC A
                    if (lp && (APPROX_LSB > 0)) begin
                        // DEC A is A - 1. In approximate mode, B is masked (1 is in LSB, so it gets masked to 0!)
                        // Thus, Y = A - 0 = A.
                        get_expected_result = a;
                    end else begin
                        get_expected_result = a - 1'b1;
                    end
                end
                4'b1111: get_expected_result = 32'd0; // NOP
                default: get_expected_result = 32'd0;
            endcase
        end
    endfunction

    integer test_id = 0;
    integer errors = 0;

    initial begin
        // File dump for waves
        $dumpfile("waveforms/waves.vcd");
        $dumpvars(0, alu_tb);
        
        // Initialize signals
        clk = 0;
        rst_n = 0;
        en = 0;
        lp_mode = 0;
        A = 0;
        B = 0;
        OPC = 0;
        
        // Apply reset
        #15;
        rst_n = 1;
        #10;
        
        $display("--------------------------------------------------");
        $display("   STARTING LOW-POWER ALU SELF-CHECKING TESTBENCH  ");
        $display("--------------------------------------------------");
        
        // --- TEST 1: Register Stability (Enable = 0) ---
        $display("\n[TEST 1] Verifying Enable Signal Gating (Register Stability)...");
        en = 0;
        A = 32'hA5A5_5A5A;
        B = 32'h5A5A_A5A5;
        OPC = 4'b0010; // AND
        #10;
        @(posedge clk);
        #1;
        if (Y !== 32'd0) begin
            $display("ERROR: Output changed while enable was 0! Y = %h", Y);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: Output remained stable (Y = %h) when enable was 0.", Y);
        end
        
        // --- TEST 2: Basic Operations (Enable = 1, lp_mode = 0) ---
        $display("\n[TEST 2] Verifying All 16 Operations in Baseline Mode (lp_mode=0)...");
        en = 1;
        lp_mode = 0;
        
        // We will loop through all 16 opcodes
        for (test_id = 0; test_id < 16; test_id = test_id + 1) begin
            OPC = test_id[3:0];
            
            // Setup operands based on opcode to test boundaries
            case (OPC)
                4'b0000: begin A = 32'h7FFF_FFFF; B = 32'h0000_0001; end // ADD (Overflow case)
                4'b0001: begin A = 32'h8000_0000; B = 32'h0000_0001; end // SUB (Underflow/Overflow case)
                4'b0110, 4'b0111, 4'b1000: begin A = 32'hF000_000F; B = 32'd4; end // Shifts
                4'b1001: begin A = 32'h8000_0000; B = 32'h7FFF_FFFF; end // SLT (Signed comparison negative < positive)
                4'b1101: begin A = 32'hFFFF_FFFF; B = 32'd0; end // INC (Wrap-around to 0)
                4'b1110: begin A = 32'h0000_0000; B = 32'd0; end // DEC (Wrap-around to -1)
                default: begin A = $random; B = $random; end
            endcase
            
            @(posedge clk);
            #1; // Wait for output registration
            
            // Check output
            if (Y !== get_expected_result(OPC, A, B, lp_mode)) begin
                $display("ERROR: Opcode %b failed! A=%h, B=%h, Y=%h (Expected %h)", 
                         OPC, A, B, Y, get_expected_result(OPC, A, B, lp_mode));
                errors = errors + 1;
            end else begin
                // Verify basic flags
                if (Z !== (Y == 0)) begin
                    $display("ERROR: Zero flag mismatch on Opcode %b! Y=%h, Z=%b", OPC, Y, Z);
                    errors = errors + 1;
                end
                if (N !== Y[WIDTH-1]) begin
                    $display("ERROR: Negative flag mismatch on Opcode %b! Y=%h, N=%b", OPC, Y, N);
                    errors = errors + 1;
                end
            end
        end
        $display("Baseline operations check complete. Errors so far: %0d", errors);
        
        // --- TEST 3: Low-Power Mode Shifter Masking ---
        $display("\n[TEST 3] Verifying Shifter Masking in lp_mode=1...");
        lp_mode = 1;
        A = 32'hFFFF_FFFF;
        B = 32'd16; // Attempting to shift by 16
        
        // Test SLL with lp_mode = 1
        OPC = 4'b0110; // SLL
        @(posedge clk);
        #1;
        if (Y !== (32'hFFFF_FFFF << 1)) begin
            $display("ERROR: Shifter masking failed for SLL! Y = %h (Expected shift by 1 bit: %h)", Y, (32'hFFFF_FFFF << 1));
            errors = errors + 1;
        end else begin
            $display("SUCCESS: SLL shift amount was restricted to 1 bit (Y = %h).", Y);
        end
        
        // Test SRL with lp_mode = 1
        OPC = 4'b0111; // SRL
        @(posedge clk);
        #1;
        if (Y !== (32'hFFFF_FFFF >> 1)) begin
            $display("ERROR: Shifter masking failed for SRL! Y = %h", Y);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: SRL shift amount was restricted to 1 bit (Y = %h).", Y);
        end

        // --- TEST 4: Low-Power Mode LSB Approximation ---
        $display("\n[TEST 4] Verifying LSB Approximation in lp_mode=1...");
        lp_mode = 1;
        A = 32'h0000_0010;
        B = 32'h0000_0007; // Lower 4 bits are 0111. Since APPROX_LSB = 4, B should be masked to 0000.
        OPC = 4'b0000; // ADD
        @(posedge clk);
        #1;
        if (Y !== 32'h0000_0010) begin
            $display("ERROR: LSB Approximation failed! Y = %h (Expected 32'h0000_0010 due to lower 4 bits masking of B)", Y);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: LSB Approximation active. B lower 4 bits masked. Y = %h", Y);
        end
        
        // --- TEST 5: Flag Verification (Carry & Overflow) ---
        $display("\n[TEST 5] Verifying Carry (C) and Overflow (V) Flags...");
        lp_mode = 0;
        
        // Case A: ADD unsigned carry-out
        A = 32'hFFFF_FFFF;
        B = 32'h0000_0001;
        OPC = 4'b0000; // ADD
        @(posedge clk);
        #1;
        if (C !== 1'b1 || V !== 1'b0) begin
            $display("ERROR: Flag check failed on Unsigned Carry! Y=%h, C=%b (Expected 1), V=%b (Expected 0)", Y, C, V);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: Unsigned Carry flag asserted correctly (C = 1, V = 0).");
        end
        
        // Case B: ADD signed overflow (positive + positive = negative)
        A = 32'h7FFF_FFFF; // Max positive signed integer
        B = 32'h0000_0001;
        OPC = 4'b0000; // ADD
        @(posedge clk);
        #1;
        if (V !== 1'b1 || C !== 1'b0) begin
            $display("ERROR: Flag check failed on Signed Overflow! Y=%h, C=%b (Expected 0), V=%b (Expected 1)", Y, C, V);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: Signed Overflow flag asserted correctly (C = 0, V = 1).");
        end

        // Case C: SUB signed overflow (negative - positive = positive)
        A = 32'h8000_0000; // Min negative signed integer
        B = 32'h0000_0001;
        OPC = 4'b0001; // SUB
        @(posedge clk);
        #1;
        if (V !== 1'b1) begin
            $display("ERROR: Flag check failed on SUB Overflow! Y=%h, V=%b (Expected 1)", Y, V);
            errors = errors + 1;
        end else begin
            $display("SUCCESS: SUB Signed Overflow flag asserted correctly (V = 1).");
        end

        // --- TEST 6: Randomized Operations to simulate activity ---
        $display("\n[TEST 6] Running 100 Randomized Operations for VCD analysis...");
        for (test_id = 0; test_id < 100; test_id = test_id + 1) begin
            A = $random;
            B = $random;
            OPC = $random % 16;
            lp_mode = $random % 2;
            en = ($random % 10 == 0) ? 1'b0 : 1'b1; // Occasional disable
            @(posedge clk);
        end
        
        $display("\n--------------------------------------------------");
        if (errors == 0) begin
            $display("       TESTBENCH COMPLETED SUCCESSFULLY (0 ERRORS) ");
        end else begin
            $display("       TESTBENCH FAILED WITH %0d ERRORS           ", errors);
        end
        $display("--------------------------------------------------");
        
        $finish;
    end

endmodule
