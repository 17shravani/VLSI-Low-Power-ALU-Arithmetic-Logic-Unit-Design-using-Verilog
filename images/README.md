# images/

This folder contains screenshots of simulation runs, waveforms, synthesis reports, and power analysis. Use these images inside the main `README.md` to make it visual and presentable on GitHub.

### Checklist of Screenshots to Save:
1. **Simulation Console**: Showing all tests completed successfully with `0 ERRORS`.
2. **Operand Isolation Waveform**: Showing inputs of inactive blocks flat at zero while active buses toggle.
3. **Register Gating Waveform**: Showing output registers stable when `en = 0` while inputs continue to toggle.
4. **LSB Masking Waveform**: Showing how lower bits of B get masked to zero when `lp_mode = 1` during arithmetic operations.
5. **Shifter Gating Waveform**: Showing shift output when shift amount is restricted to 1 bit during `lp_mode = 1`.
6. **Vivado / Yosys Cell Utilization**: Screenshot of the utilization summary showing resource counts.
7. **Vivado Power Report Summary**: Screenshot of the power analysis graph showing Dynamic vs Static power.
