---
tags: [arcana, permissions, communication, debugging]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# assumed user denied when auto cancelled

Incorrectly told user they clicked 'Deny' when the MCP was actually auto-cancelled by policy

When MCP connect returned `DENIED by operator`, I told the user they had denied the prompt. The user said they never saw a prompt. This was a misdiagnosis — the denial was likely from a pre-existing policy rule, not an active user choice.

**Why:** This frustrated the user and wasted several turns on confusion.

**How to apply:** Never assume the user actively denied something. If the response says "denied by operator" but the user says they didn't do it, believe them and investigate policy rules instead.
