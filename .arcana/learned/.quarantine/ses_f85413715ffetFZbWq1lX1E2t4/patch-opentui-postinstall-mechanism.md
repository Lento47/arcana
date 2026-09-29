---
tags: [opentui, spine-tui, tooling]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# patch opentui postinstall mechanism

Repo patches OpenTUI via version-pinned `patch-opentui.ts` at postinstall; ink-settle needs no patch — component-side ref + effect suffices

The repo's established mechanism for modifying OpenTUI internals is `patch-opentui.ts`, applied at postinstall and version-pinned (precedent: the streaming-flip reuse patch).

**Why:** Patches carry maintenance cost (version pinning, reapplication on updates). Before designing around an OpenTUI limitation, check whether the behavior is achievable component-side.

**How to apply:** For ink-settle: a `ref` to the `MarkdownRenderable` in `SpineProse` plus an effect setting/clearing attributes — no OpenTUI patch required.
