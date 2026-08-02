import { For, Match, Show, Switch, createSignal } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { Prompt } from "../component/prompt"
import { useDialog } from "../ui/dialog"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogMessage } from "../routes/session/dialog-message"
import { UserMessage, AssistantMessage } from "../routes/session/index"
import { PermissionPrompt } from "../routes/session/permission"
import { QuestionPrompt } from "../routes/session/question"
import { SubagentFooter } from "../routes/session/subagent-footer"
import { SplitBorder } from "../ui/border"
import { DashBorder } from "../ui/chrome"
import { useCommandShortcut } from "../keymap"
import { useOpencodeKeymap } from "../keymap"
import { usePluginRuntime } from "../plugin/runtime"
import { useSync } from "../context/sync"
import type { UserMessage as UserMessageType, AssistantMessage as AssistantMessageType } from "@arcana/sdk/v2"
import type { ShellProps } from "./types"

export function OpencodeShell(props: ShellProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const keymap = useOpencodeKeymap()
  const renderer = useRenderer()
  const sync = useSync()
  const pr = usePluginRuntime()
  const Slot = pr.Slot as any

  return (
    <Show when={props.session()}>
      <scrollbox
        ref={(r) => props.scrollRef(r as ScrollBoxRenderable)}
        viewportOptions={{
          paddingRight: props.showScrollbar() ? 1 : 0,
        }}
        verticalScrollbarOptions={{
          paddingLeft: 1,
          visible: props.showScrollbar(),
          trackOptions: {
            backgroundColor: theme.backgroundElement,
            foregroundColor: theme.border,
          },
        }}
        viewportCulling={false}
        stickyScroll={true}
        stickyStart="bottom"
        flexGrow={1}
        scrollAcceleration={props.scrollAcceleration}
      >
        <box height={1} />
        <For each={props.messages()}>
          {(message, index) => (
            <Switch>
              <Match when={message.id === props.revert()?.messageID}>
                {(function () {
                  const redoShortcut = useCommandShortcut("session.redo")
                  const [hover, setHover] = createSignal(false)

                  const handleUnrevert = async () => {
                    const confirmed = await DialogConfirm.show(
                      dialog,
                      "Confirm Redo",
                      "Are you sure you want to restore the reverted messages?",
                    )
                    if (confirmed) {
                      keymap.dispatchCommand("session.redo")
                    }
                  }

                  return (
                    <box
                      onMouseOver={() => setHover(true)}
                      onMouseOut={() => setHover(false)}
                      onMouseUp={handleUnrevert}
                      marginTop={1}
                      flexShrink={0}
                      border={["left"]}
                      customBorderChars={SplitBorder.customBorderChars}
                      borderColor={theme.backgroundPanel}
                    >
                      <box
                        paddingTop={1}
                        paddingBottom={1}
                        paddingLeft={2}
                        backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
                      >
                        <text fg={theme.textMuted}>{props.revert()!.reverted.length} message reverted</text>
                        <text fg={theme.textMuted}>
                          <span style={{ fg: theme.text }}>{redoShortcut()}</span> or /redo to restore
                        </text>
                        <Show when={props.revert()!.diffFiles?.length}>
                          <box marginTop={1}>
                            <For each={props.revert()!.diffFiles}>
                              {(file) => (
                                <text fg={theme.text}>
                                  {file.filename}
                                  <Show when={file.additions > 0}>
                                    <span style={{ fg: theme.diffAdded }}> +{file.additions}</span>
                                  </Show>
                                  <Show when={file.deletions > 0}>
                                    <span style={{ fg: theme.diffRemoved }}> -{file.deletions}</span>
                                  </Show>
                                </text>
                              )}
                            </For>
                          </box>
                        </Show>
                      </box>
                    </box>
                  )
                })()}
              </Match>
              <Match when={props.revert()?.messageID && message.id >= props.revert()!.messageID}>
                <></>
              </Match>
              <Match when={message.role === "user"}>
                <Show when={index() > 0 && props.messages()[index() - 1]?.role === "assistant"}>
                  <box
                    border={["bottom"]}
                    borderColor={theme.borderSubtle}
                    customBorderChars={DashBorder}
                    marginBottom={1}
                  />
                </Show>
                <UserMessage
                  index={index()}
                  onMouseUp={() => {
                    if (renderer.getSelection()?.getSelectedText()) return
                    dialog.replace(() => (
                      <DialogMessage
                        messageID={message.id}
                        sessionID={props.sessionID}
                        setPrompt={props.setPrompt}
                      />
                    ))
                  }}
                  message={message as UserMessageType}
                  parts={props.getParts(message.id)}
                  pending={props.pending()}
                />
              </Match>
              <Match when={message.role === "assistant"}>
                <AssistantMessage
                  last={props.lastAssistant()?.id === message.id}
                  message={message as AssistantMessageType}
                  parts={props.getParts(message.id)}
                  duration={props.assistantDuration().get(message.id) ?? 0}
                />
              </Match>
            </Switch>
          )}
        </For>
      </scrollbox>
      <box flexShrink={0}>
        <Show when={props.permissions().length > 0}>
          <PermissionPrompt
            request={props.permissions()[0] as any}
            directory={(sync.session.get((props.permissions()[0] as any).sessionID) as any)?.directory}
          />
        </Show>
        <Show when={props.permissions().length === 0 && props.questions().length > 0}>
          <QuestionPrompt
            request={props.questions()[0] as any}
            directory={(sync.session.get((props.questions()[0] as any).sessionID) as any)?.directory}
          />
        </Show>
        <Show when={props.session()?.parentID}>
          <SubagentFooter />
        </Show>
        <Show when={props.visible()}>
          <Slot
            name="session_prompt"
            mode="replace"
            session_id={props.sessionID}
            visible={props.visible()}
            disabled={props.disabled()}
            on_submit={props.toBottom}
            ref={props.bind}
          >
            <Prompt
              visible={props.visible()}
              ref={props.bind}
              disabled={props.disabled()}
              onSubmit={props.toBottom}
              sessionID={props.sessionID}
              right={<Slot name="session_prompt_right" session_id={props.sessionID} />}
            />
          </Slot>
        </Show>
      </box>
    </Show>
  )
}
