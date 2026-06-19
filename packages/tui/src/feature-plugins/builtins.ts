import type { TuiPlugin, TuiPluginModule } from "@arcana/plugin/tui"
import HomeFooter from "./home/footer"
import HomeTips from "./home/tips"
import DiffViewer from "./system/diff-viewer"
import Notifications from "./system/notifications"
import PluginManager from "./system/plugins"
import StatusBar from "./system/statusbar"
import WhichKey from "./system/which-key"
import ArtifactsSidebar from "./sidebar/artifacts"

export type BuiltinTuiPlugin = Omit<TuiPluginModule, "id"> & {
  id: string
  tui: TuiPlugin
  enabled?: boolean
}

export function createBuiltinPlugins(options: { experimentalEventSystem: boolean }): BuiltinTuiPlugin[] {
  return [
    HomeFooter,
    HomeTips,
    Notifications,
    PluginManager,
    StatusBar,
    WhichKey,
    DiffViewer,
    ArtifactsSidebar,
  ]
}
