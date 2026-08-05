# Arcana Quickstart

Arcana is a governed autonomy runtime for terminal AI agents: the model proposes, the engine
decides, the proof records. This guide gets you from zero to a running, governed agent in a
few minutes, then points you at the real API surface you can build on.

- **Language / runtime:** TypeScript 7 + Bun 1.3+
- **CLI binary:** `arcana` (installed via `@arcana/engine` or the `arcana-ai` package)
- **SDK package:** `@arcana/sdk`
- **Full docs:** see `.hermes/docs/arcana/docs/` for the Master Specification (architecture,
  security model, roadmap).

---

## 1. Install

The CLI is distributed as `arcana`:

```bash
bun install -g @arcana/engine   # or: arcana-ai
arcana --version
```

Add the typed SDK to a project:

```bash
bun init -y
bun add @arcana/sdk
```

The SDK package is `@arcana/sdk` (version 1.17.8 in this workspace). Public entry points:

| Import | Exports |
|--------|---------|
| `@arcana/sdk` | `createArcana` (alias `createOpencode`), `ArcanaClient` / `OpencodeClient` |
| `@arcana/sdk/v2/client` | `createOpencodeClient`, `ArcanaClientConfig` |
| `@arcana/sdk/v2/governance` | `buildAuthorizationRequest`, `toAuthorizationRequest`, `canonicalize`, `parseStrictEnvelope`, `verifySignedEnvelope` |
| `@arcana/sdk/v2/proof` | `proofFingerprint`, `verifyRunProofExport`, `RunProofLike` |
| `@arcana/sdk/v2/errors` | `ArcanaError`, `AuthorizationDeniedError`, `ApprovalRequiredError`, `TransportError`, ... |

> Every symbol used below resolves to a real export in this repository. The
> `examples/reference-app` and `examples/samples` directories in this workspace are runnable
> against these APIs.

---

## 2. Run your first agent

### Interactive (TUI)

```bash
arcana
```

Opens the terminal UI. Type `/help` for the command spine.

### Headless, one-shot

```bash
arcana run "summarize the README of this repository in three bullets"
```

`arcana run` executes a single prompt and exits. Useful flags:

```bash
# structured output (JSON) instead of prose
arcana run "classify this PR" --format json

# continue an existing session instead of starting a fresh one
arcana run "and now include the test counts" --session <session-id> --continue

# resume inside an interactive REPL attached to the session
arcana run --session <session-id> --interactive --attach

# pick a model (provider/model) and an agent profile
arcana run "refactor parse.ts" --model <provider>/<model> --agent primary

# emit diagnostic logs at a specific level
arcana run "quick check" --print-logs --log-level DEBUG
```

### Service / daemon

```bash
# start a headless server on a specific port (default 127.0.0.1:0)
arcana serve --hostname 127.0.0.1 --port 4096

# supervise it as a background daemon
arcana daemon start
arcana daemon status
arcana daemon stop
```

Binding to a non-loopback address requires `ARCANA_SERVER_PASSWORD` (see the security
checklist). The HTTP API used by the SDK is served by `arcana serve`; every SDK client call in
this guide targets exactly that API.

---

## 3. Talk to the runtime from code

The SDK ships a generated, typed HTTP client plus a one-call launcher.

```ts
import { createArcana } from "@arcana/sdk";

// Managed: spawn `arcana serve` on 127.0.0.1:4096 for you, return a typed client.
const { client, server } = await createArcana({ hostname: "127.0.0.1", port: 4096, timeout: 5000 });

// Or connect to an already-running server:
import { createOpencodeClient } from "@arcana/sdk/v2/client";
const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" });
```

### Create a session and prompt it

```ts
const created = await client.session.create({ title: "my first session", permission: [] });
const sessionID = created.data?.id;

await client.session.prompt({
  sessionID,
  parts: [{ type: "text", text: "List the files in this directory." }],
});

// Stream session events (message parts, tool calls, permission requests) instead of polling.
const events = await client.event.subscribe();
for await (const event of events.stream) {
  console.log(JSON.stringify(event));
}

// Ask for structured output with a JSON schema.
await client.session.prompt({
  sessionID,
  parts: [{ type: "text", text: "Return the file count." }],
  model: { providerID: "<provider>", modelID: "<model>" },
});
```

### Approve permission requests

When an agent hits an `ask` permission, the engine pauses and returns an approval request.
Inspect pending requests and reply:

```ts
const requests = await client.permission.list();

for (const request of requests.data ?? []) {
  // decide: "once" | "always" | "reject"
  await client.permission.reply({ requestID: request.requestID, reply: "once" });
}
```

### Inspect sessions and share/fork

```ts
const sessions = await client.session.list();
const shared = await client.session.share({ sessionID });   // clone for sharing
const fork = await client.session.fork({ sessionID });       // branch a session
```

---

## 4. Governance: policies, authorization requests, proofs

The runtime decides only what policy permits. Everything below uses the real v2 governance
and proof modules of `@arcana/sdk`.

### 4.1 Build an authorization request

```ts
import { buildAuthorizationRequest } from "@arcana/sdk/v2/governance";

const request = buildAuthorizationRequest({
  schemaVersion: "1",
  principalId: "agent-sandbox",
  sessionId: "<session-id>",
  workspaceId: "default",
  tool: "bash",
  action: "process.execute",
  resource: { kind: "process", executable: "/usr/bin/echo" },
  arguments: ["message=hello"],
  workingDirectory: "/home/user/project",
  provenance: ["SYSTEM_POLICY", "USER_INSTRUCTION"],
  sensitivity: ["PUBLIC"],
});
```

`AuthorizationRequest` is the canonical, content-addressed question the PEP evaluates. The
engine computes its SHA-256 digest (`computeRequestHash`) so an approval is bound to the exact
request that was presented.

### 4.2 Publish a signed policy envelope

Policies and capabilities travel as signed envelopes (Ed25519). The CLI owns the signing
key; the SDK can canonicalize, parse and verify envelopes.

```ts
import { canonicalize, verifySignedEnvelope } from "@arcana/sdk/v2/governance";

const envelopeJson = `{ ... }`; // a SignedPolicyEnvelope / SignedCapabilityEnvelope JSON

const canonical = canonicalize(JSON.parse(envelopeJson)); // deterministic bytes for signing
const parsed = parseStrictEnvelope(envelopeJson);         // fails on duplicate/unknown fields

// Layered verification: PARSE, SCHEMA, SIGNATURE, TRUST, AUDIENCE, FRESHNESS, REVOCATION.
// publicKey must be the raw 32-byte Ed25519 public key.
const verified = verifySignedEnvelope(envelopeJson, "arcana:signed-policy:v1", publicKeyBytes);
if (!verified.valid) {
  console.error(`verification failed at stage ${verified.stage}: ${verified.reason}`);
}
```

The core verifier (`@arcana/core/crypto/verifier`) additionally exposes the individual
layers (`verifyEnvelopeSignature`, `verifyIssuerTrust`, `verifyAudience`,
`verifyFreshness`, `verifyRevocationStatus`) for independent testing.

### 4.3 Publish a policy from the client

```ts
await client.policy.publish({
  envelope: {
    schemaVersion: 1,
    issuerId: "<node-id>",
    issuerEpoch: 1,
    sequence: 1,
    policyId: "policy:default",
    policyVersion: "1.0.0",
    policyDigest: "<sha256 of the canonicalized policy statement>",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    signatureAlgorithm: "Ed25519",
    signature: "<base64url signature over the canonicalized unsigned envelope>",
  },
})
```

The engine verifies the signed policy envelope strictly (schema, issuer trust, chain
continuity) before staging or activating it; unsigned or malformed envelopes are
rejected. Signing is done by the node's Ed25519 key (see
`packages/core/src/crypto/node-enrollment.ts`); the client only transports.

### 4.4 Verify a run proof

Every session produces a proof record of what was proposed, decided, executed and logged.

```ts
import { verifyRunProofExport, proofFingerprint, type RunProofLike } from "@arcana/sdk/v2/proof";

const proof = JSON.parse(proofJson) as RunProofLike; // id, schema_version, timestamp, lifecycle, events

const result = verifyRunProofExport(proof);
if (result.valid) {
  console.log("proof fingerprint:", result.fingerprint);
  console.log("checks:", JSON.stringify(result.checks));
} else {
  console.error(`proof rejected: ${result.reason}`);
}

// The fingerprint is SHA-256 over the canonicalized core fields
// (id, schema_version, timestamp, lifecycle, events).
const fp = proofFingerprint(proof);
```

Also available on the CLI:

```bash
arcana epistemic proof export <session-id> --format json
```

---

## 5. Agents, skills, tools

### Create an agent profile

```bash
arcana agent create \
  --description "Refactor-focused engineer" \
  --mode primary \
  --permissions "read,edit,bash" \
  --path agents
arcana agent list
```

Supported permission keys: `bash`, `read`, `edit`, `glob`, `grep`, `webfetch`, `task`,
`todowrite`, `websearch`, `lsp`, `skill`.

### Skills

Skills are structured instructions. The repository keeps a shared skill library under
`skills/` and `arcana skills` lists/loads them. See `arcana skills --help`.

---

## 6. Configuration

```bash
arcana config show          # print the effective config (file + env overrides)
arcana config init          # write a starter config to the project
arcana config show --key server
```

The effective config is a validated `Info` schema: server, command, permission, provider,
agent, lsp, mcp, skills sections. Env variables override file values (see
`packages/core/src/v1/config/config.ts` and `packages/engine/src/cli/cmd/config.ts`).

---

## 7. Diagnostics and launch

```bash
arcana doctor               # environment / install diagnostics
arcana launch codex --dry-run   # preview how arcana launches another runtime
arcana launch claude --directory .
```

`arcana launch <runtime>` wraps other runtimes (`codex`, `claude`, `gemini`); `--dry-run`
prints the invocation without running it.

---

## Next steps

- **Build an app:** see `examples/reference-app` in this repo — a minimal governed-agent
  program with real SDK + engine types (`createArcana`, `client.session.create`,
  `client.policy.publish`, `client.permission.reply`, proof verification, typed approval
  commands).
- **Small samples:** see `examples/samples` — `sdk-client.ts`, `governance-policy.ts`,
  `proof-verify.ts`, and the headless CLI walkthrough.
- **Read the model:** `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`
- **Security checklist:** `docs/SECURITY-CHECKLIST.md`
- **Open questions / planned work:** `docs/BLOCKERS.md`
