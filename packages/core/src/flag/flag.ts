import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["ARCANA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("ARCANA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  ARCANA_AUTO_HEAP_SNAPSHOT: truthy("ARCANA_AUTO_HEAP_SNAPSHOT"),
  ARCANA_GIT_BASH_PATH: process.env["ARCANA_GIT_BASH_PATH"],
  ARCANA_CONFIG: process.env["ARCANA_CONFIG"],
  ARCANA_CONFIG_CONTENT: process.env["ARCANA_CONFIG_CONTENT"],
  ARCANA_DISABLE_AUTOUPDATE: truthy("ARCANA_DISABLE_AUTOUPDATE"),
  ARCANA_ALWAYS_NOTIFY_UPDATE: truthy("ARCANA_ALWAYS_NOTIFY_UPDATE"),
  ARCANA_DISABLE_PRUNE: truthy("ARCANA_DISABLE_PRUNE"),
  ARCANA_DISABLE_TERMINAL_TITLE: truthy("ARCANA_DISABLE_TERMINAL_TITLE"),
  ARCANA_SHOW_TTFD: truthy("ARCANA_SHOW_TTFD"),
  ARCANA_PROFILE_STARTUP: truthy("ARCANA_PROFILE_STARTUP"),
  ARCANA_DISABLE_AUTOCOMPACT: truthy("ARCANA_DISABLE_AUTOCOMPACT"),
  ARCANA_DISABLE_MODELS_FETCH: truthy("ARCANA_DISABLE_MODELS_FETCH"),
  ARCANA_DISABLE_MOUSE: truthy("ARCANA_DISABLE_MOUSE"),
  ARCANA_FAKE_VCS: process.env["ARCANA_FAKE_VCS"],
  ARCANA_SERVER_PASSWORD: process.env["ARCANA_SERVER_PASSWORD"],
  ARCANA_SERVER_USERNAME: process.env["ARCANA_SERVER_USERNAME"],
  ARCANA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("ARCANA_DISABLE_FFF"),

  // Experimental
  ARCANA_EXPERIMENTAL_FILEWATCHER: Config.boolean("ARCANA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ARCANA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("ARCANA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  ARCANA_MODELS_URL: process.env["ARCANA_MODELS_URL"],
  ARCANA_MODELS_PATH: process.env["ARCANA_MODELS_PATH"],
  ARCANA_DB: process.env["ARCANA_DB"],

  ARCANA_WORKSPACE_ID: process.env["ARCANA_WORKSPACE_ID"],
  ARCANA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("ARCANA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get ARCANA_DISABLE_PROJECT_CONFIG() {
    return truthy("ARCANA_DISABLE_PROJECT_CONFIG")
  },
  get ARCANA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("ARCANA_EXPERIMENTAL_REFERENCES")
  },
  get ARCANA_TUI_CONFIG() {
    return process.env["ARCANA_TUI_CONFIG"]
  },
  get ARCANA_CONFIG_DIR() {
    return process.env["ARCANA_CONFIG_DIR"]
  },
  get ARCANA_PURE() {
    return truthy("ARCANA_PURE")
  },
  get ARCANA_PERMISSION() {
    return process.env["ARCANA_PERMISSION"]
  },
  get ARCANA_PLUGIN_META_FILE() {
    return process.env["ARCANA_PLUGIN_META_FILE"]
  },
  get ARCANA_CLIENT() {
    return process.env["ARCANA_CLIENT"] ?? "cli"
  },
  get ARCANA_LICENSE_KEY() {
    return process.env["ARCANA_LICENSE_KEY"]
  },
}
