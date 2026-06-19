// Compatibility shim: external npm packages (opencode-gitlab-auth,
// opencode-poe-auth, @gitlab/opencode-gitlab-auth) are typed against the
// published "@opencode-ai/plugin". This workspace shim re-exports the renamed
// "@arcana/plugin" fork under the legacy name so every consumer resolves a
// single Plugin/PluginInput type identity (no duplicate-_HeyApiClient clash).
export * from "@arcana/plugin"
