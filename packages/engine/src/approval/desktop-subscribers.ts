/**
 * Desktop subscriber awareness (Phase D: advisory routing input).
 *
 * A bounded, expiring registry of live Desktop operator surfaces. A Desktop
 * subscriber announces itself with POST /desktop/heartbeat and must renew
 * before its TTL expires; a dead or stale subscriber automatically becomes
 * unavailable. This state is ADVISORY ONLY:
 *
 *   - it may influence approval routing (DESKTOP_PREFERRED / DESKTOP_REQUIRED),
 *   - it never authorizes an action,
 *   - it never extends approval expiry,
 *   - it never fabricates an operator identity,
 *   - it never consumes an approval,
 *   - it never changes a PDP result, and
 *   - it never executes an effect.
 */

import type { DeploymentMode } from "@arcana/core/crypto/approval-routing"

export interface DesktopSubscriber {
  subscriberId: string
  workspaceId: string
  deploymentMode: DeploymentMode
  lastSeenAt: number
  expiresAt: number
}

export interface DesktopSubscriberRegistry {
  heartbeat(input: {
    subscriberId: string
    workspaceId: string
    deploymentMode?: DeploymentMode
    now?: number
  }): DesktopSubscriber
  isOnline(workspaceId: string, now?: number): boolean
  /** Remove stale subscribers and return the ids removed. */
  prune(now?: number): string[]
  list(workspaceId?: string, now?: number): DesktopSubscriber[]
}

export const DEFAULT_DESKTOP_HEARTBEAT_TTL_MS = 30_000

export class ExpiringDesktopSubscriberRegistry implements DesktopSubscriberRegistry {
  private readonly subscribers = new Map<string, DesktopSubscriber>()

  constructor(private readonly ttlMs: number = DEFAULT_DESKTOP_HEARTBEAT_TTL_MS) {}

  heartbeat(input: {
    subscriberId: string
    workspaceId: string
    deploymentMode?: DeploymentMode
    now?: number
  }): DesktopSubscriber {
    const now = input.now ?? Date.now()
    const subscriber: DesktopSubscriber = {
      subscriberId: input.subscriberId,
      workspaceId: input.workspaceId,
      deploymentMode: input.deploymentMode ?? "LOCAL",
      lastSeenAt: now,
      expiresAt: now + this.ttlMs,
    }
    this.subscribers.set(input.subscriberId, subscriber)
    return subscriber
  }

  isOnline(workspaceId: string, now?: number): boolean {
    const current = now ?? Date.now()
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.workspaceId === workspaceId && subscriber.expiresAt > current) return true
    }
    return false
  }

  prune(now?: number): string[] {
    const current = now ?? Date.now()
    const removed: string[] = []
    for (const [id, subscriber] of this.subscribers) {
      if (subscriber.expiresAt <= current) {
        this.subscribers.delete(id)
        removed.push(id)
      }
    }
    return removed
  }

  list(workspaceId?: string, now?: number): DesktopSubscriber[] {
    const current = now ?? Date.now()
    const result: DesktopSubscriber[] = []
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.expiresAt <= current) continue
      if (workspaceId !== undefined && subscriber.workspaceId !== workspaceId) continue
      result.push({ ...subscriber })
    }
    return result
  }
}

// ---------------------------------------------------------------------------
// Process-scoped default registry
// ---------------------------------------------------------------------------

const defaultRegistry = new ExpiringDesktopSubscriberRegistry()

export function desktopSubscriberRegistry(): DesktopSubscriberRegistry {
  return defaultRegistry
}

/** Advisory liveness check used by the routing layer. */
export function desktopOnline(workspaceId: string, now?: number): boolean {
  defaultRegistry.prune(now)
  return defaultRegistry.isOnline(workspaceId, now)
}
