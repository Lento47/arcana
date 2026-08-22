# Arcana hardened Linux reference deployment

This directory holds the evidence contract for the deployment assessed at L4. It intentionally does not contain a passing deployment manifest: current TLS/mTLS, channel-binding, OS-key-protection, and live-exercise blockers prevent one.

When the controls are implemented, generate deployment evidence outside source control, validate it against `deployment-manifest.schema.json`, and pass its path to:

```bash
bun run assurance manifest --tag vX.Y.Z-rc.N --deployment <deployment-manifest.json> --output assurance-manifest.json
```

Never include private keys, tokens, database contents, or unredacted exploit material in the manifest.
