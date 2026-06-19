import { DialogSelect } from "../../ui/dialog-select"
import { useRoute } from "../../context/route"
import { Glyph } from "../../branding"

export function DialogSubagent(props: { sessionID: string }) {
  const route = useRoute()

  return (
    <DialogSelect
      title={`${Glyph.sigil} Familiar`}
      options={[
        {
          title: `${Glyph.chevron} Scry`,
          value: "subagent.view",
          description: "gaze into the familiar's chronicle",
          onSelect: (dialog) => {
            route.navigate({
              type: "session",
              sessionID: props.sessionID,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
