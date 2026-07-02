# TUI contrast fallback fixes

Date: 2026-06-29
Task: Fix remaining lower-priority color/contrast/theme fallbacks from the TUI audit.

## Problem

The previous color-contrast pass left several hardcoded colors and transparent surfaces that could break readability on transparent/system themes or light-mode terminals. This change replaces them with theme-derived equivalents.

## Files changed

### `packages/tui/src/ui/dialog.tsx`
- Replaced hardcoded 60% black dimmer overlay `RGBA.fromInts(0, 0, 0, 150)` with a reactive `dimmer` memo.
- The overlay is derived from `theme.background` luminance: uses a white base for dark backgrounds and a black base for light backgrounds, keeping alpha at `150/255`.
- Added `createMemo` to the `solid-js` imports.

### `packages/tui/src/ui/dialog-select.tsx`
- Added `inactiveBg` memo that returns `theme.background` when opaque, otherwise falls back to `theme.backgroundPanel`.
- Replaced `RGBA.fromInts(0, 0, 0, 0)` transparent backgrounds for:
  - inactive option rows
  - inactive footer action buttons

### `packages/tui/src/component/error-component.tsx`
- New `emergencyPalette(theme?, mode?)` helper:
  - Uses resolved theme tokens (`background`, `text`, `textMuted`, `primary`) when the theme context is available.
  - Falls back to mode-based RGBAs when rendered outside `ThemeProvider`.
  - Computes button label color with `selectedForeground(theme, primary)`.
- Added `useContext` and imports `RGBA`, `selectedForeground`, `ThemeContext`, and `Theme`.

### `packages/tui/src/ui/spinner.ts`
- Removed hardcoded red default gradient (`#ff0000`, `#ff5555`, etc.) and dark-red inactive color (`#330000`).
- Default scanner colors now derive from `options.color ?? options.theme?.primary ?? RGBA.fromHex("#a0a0a0")`.
- Flat styles (`charge`, `signal`, `pulse`) now fall back to `options.theme?.text` before white.
- Added optional `theme?: Theme` to `KnightRiderOptions`.

### `packages/tui/src/feature-plugins/system/which-key.tsx`
- Removed the `ink()` helper and its hardcoded hex fallbacks (`#1c1c1c`, `#f0f0f0`, `#a5a5a5`, `#6f6f6f`, `#ffd75f`, `#5f87ff`, `#ffffff`).
- `skin()` now reads directly from `api.theme.current`.
- Simplified the `Skin` type to use `RGBA` directly.

### `packages/tui/src/component/logo.tsx`
- Removed the hardcoded `PEAK = RGBA.fromInts(255, 255, 255)` constant.
- Added `peakFor(ink)` helper that returns black or white based on the ink color luminance.
- Threaded the derived `peak` through `glow`, `shade`, and `renderLine` so the logo highlight stays readable on both dark and light themes.

### `packages/tui/src/component/dialog-retry-action.tsx`
- Replaced transparent inactive retry button backgrounds with an `inactiveBg` memo.
- The inactive background uses the existing text overlay for Go-treatment dialogs, otherwise falls back to an opaque theme surface when the main background is transparent.

### `packages/tui/src/context/theme.tsx`
- Exported `ThemeContext` from the `createSimpleContext` result so `error-component.tsx` can read the theme optionally without throwing when rendered outside the provider.

## Verification

```bash
bunx tsc -p packages/tui/tsconfig.json --noEmit        # clean
bunx tsc -p packages/engine/tsconfig.json --noEmit     # clean
bun test packages/tui --timeout 120000                 # 206 pass / 1 skip / 0 fail
bun test packages/engine/test/cli/run/footer.view.test.tsx --timeout 120000   # 22 pass / 5 skip / 0 fail
bun test packages/engine/test/cli/run/theme.test.ts --timeout 120000          # 7 pass / 0 fail
rg -n 'RGBA\.fromInts\(0, 0, 0, 0\)|RGBA\.fromInts\(0, 0, 0, 150\)|#ff0000|#330000' packages/tui/src/ui packages/tui/src/component packages/tui/src/feature-plugins/system packages/tui/src/context
```

## Notes

- The outer `ErrorBoundary` in `app.tsx` still sits above `ThemeProvider`, so `ErrorComponent` keeps a mode-based fallback for errors that occur before the theme is ready.
- No breaking API changes; `KnightRiderOptions.theme` is optional.
