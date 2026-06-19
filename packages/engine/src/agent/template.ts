// Arcana Agent Template
// Copy to <config>/arcana/agents/my-agent.ts and customize
// (loaded by AgentSDK.loadExternalAgents — see agent/sdk.ts AGENTS_DIR)
export default {
  name: "my-agent",
  description: "What this agent does",
  prompt: `You are a specialized agent.
## Role
[Describe your role]
## Behavior
[Describe behavior]
## Output
[Expected format]
`,
  routing: { keywords: [], capabilities: [] },
}
