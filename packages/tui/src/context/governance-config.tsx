import { watch } from "node:fs"
import path from "node:path"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { loadGovernanceConfig, type LoadedGovernanceConfig } from "@arcana/core/governance-config"
import { createSimpleContext } from "./helper"
import { useProject } from "./project"

export const { use: useGovernanceConfig, provider: GovernanceConfigProvider } = createSimpleContext({
  name: "GovernanceConfig",
  init: () => {
    const project = useProject()
    const [loaded, setLoaded] = createSignal<LoadedGovernanceConfig>(loadGovernanceConfig(project.instance.directory()))

    let watcher: ReturnType<typeof watch> | undefined

    const reload = () => {
      setLoaded(loadGovernanceConfig(project.instance.directory()))
    }

    createEffect(() => {
      const directory = project.instance.directory()
      reload()
      watcher?.close()
      watcher = undefined

      const arcanaDirectory = path.join(directory, ".arcana")
      try {
        watcher = watch(arcanaDirectory, { persistent: false }, reload)
      } catch {
        try {
          watcher = watch(directory, { persistent: false }, reload)
        } catch {
          watcher = undefined
        }
      }
    })

    onCleanup(() => {
      watcher?.close()
    })

    return {
      config: () => loaded().config,
      path: () => loaded().path,
      reload,
    }
  },
})
