---
name: secure-code-review
version: 0.1.0
mode: ask
contract: contract.example.json
category: security
---

# Secure Code Review Skill

## Purpose

Review code for realistic security risks, unsafe patterns, missing safeguards, and verification gaps with clear evidence and remediation guidance.

## Behavior

The agent should:

- identify security-sensitive areas first
- prioritize issues with concrete file/function evidence
- distinguish confirmed risks from hypotheses
- cite affected files, functions, commands, and observations
- avoid vague best-practice noise
- avoid modifying files unless the active contract allows writes
- preserve uncertainty when evidence is incomplete

## Required output

Every finding should include:

```txt
title
severity
affected files/functions
risk description
evidence
conditions required
impact
recommended fix
verification suggestion
confidence
```

## Forbidden behavior

The agent should not:

- claim certainty without evidence
- assume privileged access unless the code clearly grants it
- provide harmful operational instructions
- use external providers if the active routing policy forbids code exposure
- make destructive changes during read-only review
- hide uncertainty

## Verification

Preferred verification:

```txt
static evidence
unit/integration test suggestion
safe reproduction condition description
configuration review
regression test recommendation
```

## Failure modes

Common failures:

```txt
best-practice noise
unrealistic assumptions
missing impact
missing remediation
ignoring scope
unclear confidence
```
