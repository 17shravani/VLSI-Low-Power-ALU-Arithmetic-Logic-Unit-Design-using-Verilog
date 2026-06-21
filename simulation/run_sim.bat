@echo off
echo ==================================================
echo   Compiling Low-Power ALU with Icarus Verilog...
echo ==================================================

:: Go to project root directory
cd %~dp0..

:: Ensure reports and waveforms directories exist
if not exist waveforms mkdir waveforms
if not exist reports mkdir reports

:: Compile the design and testbench
iverilog -g2012 -o simulation/alu_sim.vvp -I rtl tb/alu_tb.v rtl/adder.v rtl/alu.v

if %errorlevel% neq 0 (
    echo [ERROR] Compilation FAILED!
    pause
    exit /b %errorlevel%
)

echo [INFO] Compilation SUCCESSFUL. Running simulation...
vvp simulation/alu_sim.vvp

if %errorlevel% neq 0 (
    echo [ERROR] Simulation FAILED!
    pause
    exit /b %errorlevel%
)

echo [INFO] Simulation COMPLETE. Waveforms dumped to waveforms/waves.vcd.
echo [INFO] You can open the waveforms using GTKWave by running:
echo        gtkwave waveforms/waves.vcd
pause
