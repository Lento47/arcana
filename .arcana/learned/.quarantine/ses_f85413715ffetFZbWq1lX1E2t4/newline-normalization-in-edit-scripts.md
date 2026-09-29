---
tags: [windows, scripting, crlf]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# newline normalization in edit scripts

Detect the target file's actual newline style (CRLF vs LF) and normalize replacements before writing — LF-only search strings silently fail on CRLF files

A Node replacement script whose search strings used LF `\n` silently failed on `page.tsx` after the Codex agent rewrote it with CRLF line endings. Fix: detect the file's newline (`content.includes('\r\n')`) and `replaceAll("\n", nl)` on the replacement payload before `writeFileSync`.

**Why:** On Windows, different agents/tools write different line endings; exact-string matching across multi-line blocks breaks invisibly when endings differ — the script runs "successfully" but changes nothing.

**How to apply:** In any scripted file edit: read the file, compute its newline style, build search/replace strings in LF internally, and convert to the file's style on write. Better yet, match on single-line anchors when possible so line endings don't matter.
