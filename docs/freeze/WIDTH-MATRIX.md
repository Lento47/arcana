# WIDTH MATRIX EVIDENCE - BLK-TUI-02
Generated: 2026-08-22 (bun 1.4.0, headless testRender, dark theme)
Command: bun test packages/tui/test/width-matrix.test.tsx
Result: PASS (10 mandated widths x {plain, +scrollbar})

| Width | Layout | Prose body | Right-edge overflow |
|-------|--------|-----------|---------------------|
| 59 | minimal | 50 | none (automated assert) |
| 60 | narrow | 50 | none (automated assert) |
| 79 | narrow | 69 | none (automated assert) |
| 80 | compact | 70 | none (automated assert) |
| 99 | compact | 89 | none (automated assert) |
| 100 | standard | 90 | none (automated assert) |
| 119 | standard | 109 | none (automated assert) |
| 120 | wide | 110 | none (automated assert) |
| 149 | wide | 139 | none (automated assert) |
| 180 | wide | 170 | none (automated assert) |

## Method
Headless testRender of the session frame (2px padding, left/right borders,
gutter 2, card border+padding) at each mandated width, with and without a
scrollbar column. Asserts per row: prose body renders non-zero and
body-width never exceeds spine inner width (no right-edge clipping).
Source: packages/tui/test/width-matrix.test.tsx

## Notes
- SpineHeader fit is covered separately: it receives contentWidth from the
  session route (production behavior) and drops status items to fit; see
  session-frame-width.measure.test.tsx for header math.
- Prompt remains usable at all widths: composer textarea mounts inside the
  same frame tree; width-matrix asserts the frame does not collapse.
