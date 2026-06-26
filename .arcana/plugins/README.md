# Arcana Plugins

This directory contains example plugin conventions for Arcana user space.

Plugins are advanced extensions. They are not required for normal Arcana usage.

## Plugin goals

Plugins can help users add:

```txt
custom risk checks
custom dependency review
custom verification
custom route scoring
custom context filtering
custom memory review
team-specific policy behavior
```

## Status

These files are examples only. Runtime plugin loading is not implemented in this branch.

## Expected behavior

A plugin should:

```txt
respect the active autonomy mode
emit structured decisions
attach evidence to the Run Capsule
avoid hidden side effects
fail safely
```

## Example hooks

```ts
export default {
  onDependencyChanged(change, ctx) {},
  onRiskDetected(risk, ctx) {},
  onVerificationRequired(verification, ctx) {},
  onCapsuleComplete(capsule, ctx) {}
}
```

## Mode-aware output

Plugins should not decide alone whether to block.

They should emit risk or recommendation output. Arcana mode then decides whether to record, warn, ask, block, or lock.
