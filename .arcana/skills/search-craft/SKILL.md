---
name: search-craft
description: "Advanced one-shot search: complex Rust regex recipes for grep, multiline block matching, glob recipes, and web query design. Load before broad searches or when a search needs more than one pass."
version: 0.1.0
category: engineering
---

# Search Craft

One strong call beats five weak calls. The tool descriptions carry the short version; this skill is the full pattern book for `grep`, `glob`, and `websearch`.

## Decision order

1. Symbol definition/references with a configured language server → `lsp` (`goToDefinition`, `findReferences`, `workspaceSymbol`).
2. File names → `glob`.
3. File contents → `grep`; read the matching window with `read` only when the matching line is not enough.
4. Open-ended exploration or more than ~2 search rounds → `task` with `explore`; it returns one synthesized answer.
5. Web → one `websearch`; `webfetch` only for a URL you already have.

## Rust regex toolkit (what grep supports)

| Need | Syntax | Example |
|---|---|---|
| Alternatives | `\|` | `parseConfig\|loadConfig\|readConfig` |
| Non-capturing group | `(?:...)` | `(?:get\|set)(?:Config\|Options)` |
| Optional part | `?...` | `(?:export\s+)?(?:async\s+)?function\s+\w+` |
| Word boundary | `\b` | `\bfoo\b` |
| Case-insensitive | `(?i)` | `(?i)\b(config\|settings)\b` |
| Verbose layout | `(?x)` | `(?x) (?:foo\|bar) \s* \(` |
| Any char incl. newline | `[\s\S]` | with `multiline: true` |
| Unicode class | `\p{...}` | `\p{Lu}` upper-case letter |
| POSIX class | `[[:...:]]` | `[[:alpha:]]`, `[[:digit:]]` |
| Repetition | `{n,m}`, `*?`, `+` | `\w{1,3}`, `.*?` |
| Literal punctuation | `\` escape | `foo\(`, `a\.b`, `\$\{`, `\[` |
| Negated class | `[^...]` | `[^)\n]*` |
| Anchors | `^` `$` | line start/end (default line mode) |

**Not supported:** lookahead `(?=)`, lookbehind `(?<=)`, backreferences `\1`. Restructure instead:

- "X preceded by Y" → match both: `Y\s*X`.
- "X not followed by Y" → match `X` and add `Y` via `exclude`/context, or run a second scoped search.
- "same word twice" → run two searches and compare with `context`.

An invalid pattern fails the whole call. When in doubt, drop the fancy part and scope with `path`/`include` instead.

## Recipe book

**Definitions and usages in one pattern** — mix each language's shape with the bare call:

- TypeScript/JS function: `^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+foo\b|\bfoo\s*\(`
- TypeScript/JS arrow const: `^\s*(?:export\s+)?(?:const|let)\s+foo\s*=|\bfoo\s*\(`
- Python: `^\s*(?:async\s+)?def\s+foo\b|\bfoo\s*\(`
- Rust: `^\s*(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+foo\b|\bfoo\s*\(`
- Go: `^func\s+(?:\([^)]*\)\s*)?foo\s*\(|\bfoo\s*\(`
- Class method: `^\s*(?:public|private|protected|static|async|\s)*foo\s*\(`

**Imports of a module** (all forms in one call):

`(?:from\s+['"]mod['"]|require\(\s*['"]mod['"]\s*\)|import\(\s*['"]mod['"]\s*\))`

**Environment variables:**

`(?:process\.env(?:\.\w+|\[\s*['"]\w+['"]\s*\])|os\.environ(?:\.get)?[\[(]|getenv\(\s*['"])`

**Routes/endpoints:** `(?:app|router|server)\.(?:get|post|put|patch|delete|use)\(\s*['"]([^'"]*)`

**Config keys by concept:** `(?i)^\s*[\w.-]*(?:timeout|retry|retries|backoff|limit)[\w.-]*\s*[:=]`

**TODOs with owners:** `(?:TODO|FIXME|HACK|XXX)\b[^\n]*(?:@\w+)?`

**Commented-out code:** `^\s*(?://|#|\*)\s*(?:const|let|var|function|def|class|import|if|return)\b`

**Error paths:** `(?:throw\s+new\s+\w*(?:Error|Failure)|Effect\.fail|raise\s+\w*(?:Error|Exception)|return\s+err\b|panic!)`

**Feature flags:** `(?i)(?:feature|flag)s?[._-]?\w+`

**Whole block across lines** (`multiline: true`, `.` matches newlines):

- Function body: `(?:export\s+)?(?:async\s+)?function\s+foo\b[\s\S]*?\n\}`
- Effect pipeline: `Effect\.gen\([\s\S]*?\n\s*\}\)`

Prefer `[\s\S]*?` (non-greedy) and anchor the end (`\n\}`) to stop at the intended block.

## grep call shapes

- "Where is it used?" → `mode: "files"`, `maxResults` low.
- "How many places?" → `mode: "count"`.
- "Show me the code around it" → `context: 2` (one call, no `read`).
- "Skip tests/vendor" → `exclude: "**/*.{test,spec}.ts"` or `"{**/node_modules/**,**/dist/**}"`.
- "Whole function" → `multiline: true` + block pattern.
- Too many hits → add `include`/`exclude`/`path` or switch to `mode: "files"`; do **not** repeat the same call.
- Too few hits → drop wrapper groups, broaden alternation, remove `^` anchors.

## glob recipes

- Sources: `**/*.{ts,tsx,js,jsx}` with `exclude: "{**/node_modules/**,**/dist/**,**/build/**}"`
- Tests: `**/*.{test,spec}.{ts,tsx}`
- Configs: `**/*.{json,jsonc,toml,yaml,yml}`
- Monorepo package: `packages/*/src/**/*.ts`
- Migrations: `**/migrations/**/*.{sql,ts}`
- One call per family; braces already cover alternatives.

## websearch query design

Stack every constraint in one query: subject + artifact (docs, changelog, release notes, source) + version + timeframe (`{{year}}`).

- Error: `"<exact message>" <library> <language>`
- Changes: `<product> <version> release notes changelog {{year}}`
- Docs: `<product> <feature> docs configuration example`
- Migration: `migrate <from> to <to> breaking changes guide`
- Comparison: `<a> vs <b> differences {{year}}`
- Source: `<repo> <symbol> implementation github`

Provider notes: Exa is neural — natural language with all constraints beats operator soup, but quotes still pin exact strings. Parallel takes an objective plus `search_queries`; use the `queries` array only for genuinely distinct angles (max 4). Prefer two independent sources for version-specific claims and cite URLs.

## Strategy and stop rules

- Budget: ≤2 grep rounds + 1 read window per question; beyond that, delegate to `explore`.
- Confirm scope before breadth: one `mode: "count"` call sizes a problem cheaper than a full listing.
- Stop when you have file:line evidence for the answer; do not re-read files, do not re-run a failed call with identical inputs.
- Report absolute paths and line numbers; include the matching line as evidence.
