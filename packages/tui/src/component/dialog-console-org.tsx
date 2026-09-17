import { createResource, createMemo, createSignal } from "solid-js"
import { Space } from "../ui/chrome"
import { DialogSelect } from "../ui/dialog-select"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { Glyph } from "../branding"
import { Locale } from "../util/locale"
import type { ExperimentalConsoleListOrgsResponse } from "@arcana/sdk/v2"

type OrgOption = ExperimentalConsoleListOrgsResponse["orgs"][number]

const accountHost = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const accountLabel = (item: Pick<OrgOption, "accountEmail" | "accountUrl">) =>
  `${item.accountEmail}  ${accountHost(item.accountUrl)}`

export function DialogConsoleOrg() {
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()

  const [orgs, { refetch: refetchOrgs }] = createResource(async () => {
    const result = await sdk.client.experimental.console.listOrgs({}, { throwOnError: true })
    return result.data?.orgs ?? []
  })
  // Guard against double-submit while the org switch is in flight. The row
  // shows "Switching…" so the operator gets feedback without a busy overlay.
  const [switching, setSwitching] = createSignal<string | undefined>(undefined)

  const current = createMemo(() => orgs()?.find((item) => item.active))

  const options = createMemo(() => {
    if (orgs.loading) {
      return [
        {
          title: "Loading orgs…",
          description: "Fetching organizations for this account.",
          value: "loading",
          onSelect: () => {},
        },
      ]
    }

    if (orgs.error) {
      return [
        {
          title: "Could not load orgs",
          description:
            "Press enter to retry. If it keeps failing, check your connection, then sign in with `arcana console login`.",
          value: "error",
          onSelect: () => void refetchOrgs(),
        },
      ]
    }

    const listed = orgs()
    if (listed === undefined) {
      return [
        {
          title: "Loading orgs…",
          description: "Fetching organizations for this account.",
          value: "loading",
          onSelect: () => {},
        },
      ]
    }

    if (listed.length === 0) {
      return [
        {
          title: "No orgs found",
          description: "Join or create an org in the Arcana console, then reopen this dialog.",
          value: "empty",
          onSelect: () => {},
        },
      ]
    }

    return listed
      .toSorted((a, b) => {
        const activeAccountA = a.active ? 0 : 1
        const activeAccountB = b.active ? 0 : 1
        if (activeAccountA !== activeAccountB) return activeAccountA - activeAccountB

        const accountCompare = accountLabel(a).localeCompare(accountLabel(b))
        if (accountCompare !== 0) return accountCompare

        return a.orgName.localeCompare(b.orgName)
      })
      .map((item) => ({
        title: item.orgName,
        value: item,
        category: accountLabel(item),
        categoryView: (
          <box flexDirection="row" gap={Space.gapWide}>
            {/* Both halves are bounded readouts, not prose: each is already
                truncated to its own 40 columns, and neither may be the segment
                that gives way. Left elastic, a too-narrow dialog wrapped the
                email and the host onto separate lines and the category above
                the row grew to three. Reserving them means the worst case is a
                clip at the dialog's edge, with every readout still whole. */}
            <text fg={theme.accent} wrapMode="none" flexShrink={0}>
              {Locale.truncate(item.accountEmail, 40)}
            </text>
            <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
              {Locale.truncate(accountHost(item.accountUrl), 40)}
            </text>
          </box>
        ),
        description: switching() === item.orgID ? "Switching…" : undefined,
        onSelect: async () => {
          if (item.active) {
            dialog.clear()
            return
          }
          if (switching()) return

          setSwitching(item.orgID)
          try {
            await sdk.client.experimental.console.switchOrg(
              {
                accountID: item.accountID,
                orgID: item.orgID,
              },
              { throwOnError: true },
            )

            await sdk.client.instance.dispose()
            toast.show({
              message: `Switched to ${item.orgName}`,
              variant: "info",
            })
            dialog.clear()
          } catch {
            toast.show({
              message: `Could not switch to ${item.orgName} — check your connection and try again.`,
              variant: "error",
            })
          } finally {
            setSwitching(undefined)
          }
        },
      }))
  })

  return <DialogSelect<string | OrgOption> title={`${Glyph.sigil} Switch org`} options={options()} current={current()} />
}
