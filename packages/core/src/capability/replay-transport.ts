// packages/core/src/capability/replay-transport.ts
//
// Authority Kernel K3b — Transport/execution replay.
//
// A GateTransport rides on any gate call:
//   mode "record" : execute for real, remember {requestHash → output}
//   mode "replay" : substitute the recorded output — ZERO world contact
//
// Claim under test (K3b): with a completed ledger, replaying the identical
// captured-input requests reproduces every effect result without a single
// real dispatch, and any uncovered hash is a hard REPLAY_GAP failure.
//
// SECRET VALUES ARE NEVER RECORDED. The secret-gate ignores transports —
// only the fact of access is receipted, never the material.

import type { ProcessGateOptions } from "./process-gate"

export type TransportMode = "record" | "replay"

export interface GateTransport {
  mode: TransportMode
  /** requestHash → recorded effect output. */
  ledger: TransportLedger
}

export class TransportLedger {
  private entries = new Map<string, unknown>()

  put(requestHash: string, output: unknown): void {
    this.entries.set(requestHash, output)
  }

  get(requestHash: string): unknown | undefined {
    return this.entries.get(requestHash)
  }

  has(requestHash: string): boolean {
    return this.entries.has(requestHash)
  }

  get size(): number {
    return this.entries.size
  }

  toJSON(): string {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of [...this.entries.entries()].sort()) obj[k] = v
    return JSON.stringify({ version: 1, entries: obj }, null, 2)
  }

  static parse(text: string): TransportLedger {
    const parsed = JSON.parse(text) as { entries: Record<string, unknown> }
    const l = new TransportLedger()
    for (const [k, v] of Object.entries(parsed.entries ?? {})) l.put(k, v)
    return l
  }
}

/**
 * Single choke point for transport-aware execution inside gate executeExact.
 *   replay : recorded output substituted — run() is NEVER called
 *   record : run() executes and the output is captured
 *   none   : pass-through
 */
export function gateTransportExec<T>(
  transport: GateTransport | undefined,
  requestHash: string,
  run: () => T,
): { value: T; replayed: boolean } {
  if (transport?.mode === "replay") {
    if (!transport.ledger.has(requestHash)) {
      throw new Error(`REPLAY_GAP:${requestHash}`)
    }
    return { value: transport.ledger.get(requestHash) as T, replayed: true }
  }
  if (transport?.mode === "record") {
    const value = run()
    transport.ledger.put(requestHash, value)
    return { value, replayed: false }
  }
  return { value: run(), replayed: false }
}

/** Convenience: attach a transport to gate options. */
export interface WithTransport {
  transport?: GateTransport
}

export type GateOptionsWithTransport = ProcessGateOptions & WithTransport
