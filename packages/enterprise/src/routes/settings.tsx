import { createSignal, Show, For } from "solid-js"

interface SettingSection {
  id: string
  label: string
  description: string
}

const SECTIONS: SettingSection[] = [
  { id: "general", label: "General", description: "Engine connection and workspace settings" },
  { id: "governance", label: "Governance", description: "Approval policies and escalation rules" },
  { id: "providers", label: "Providers", description: "Model provider configuration" },
  { id: "security", label: "Security", description: "Capabilities, delegation, and provenance" },
  { id: "appearance", label: "Appearance", description: "Theme and display preferences" },
]

export default function SettingsPage() {
  const [activeSection, setActiveSection] = createSignal("general")
  const [engineUrl, setEngineUrl] = createSignal("http://localhost:4096")
  const [saved, setSaved] = createSignal(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: "2rem", "max-width": "960px" }}>
      <head><title>Settings — Arcana</title></head>

      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Settings
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Configure the enterprise console
        </p>
      </header>

      <div style={{ display: "flex", gap: "2rem" }}>
        {/* Section nav */}
        <nav style={{ width: "180px", "flex-shrink": "0", display: "flex", "flex-direction": "column", gap: "2px" }}>
          <For each={SECTIONS}>
            {(section) => (
              <button
                onClick={() => setActiveSection(section.id)}
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "0.125rem",
                  padding: "0.5rem 0.75rem",
                  "border-radius": "6px",
                  border: "none",
                  background: activeSection() === section.id ? "var(--arcana-gold-dim)" : "transparent",
                  color: activeSection() === section.id ? "var(--arcana-gold)" : "var(--arcana-text-weak)",
                  cursor: "pointer",
                  "text-align": "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (activeSection() !== section.id) {
                    e.currentTarget.style.background = "var(--arcana-surface)"
                    e.currentTarget.style.color = "var(--arcana-text)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection() !== section.id) {
                    e.currentTarget.style.background = "transparent"
                    e.currentTarget.style.color = "var(--arcana-text-weak)"
                  }
                }}
              >
                <span style={{ "font-size": "0.8125rem", "font-weight": activeSection() === section.id ? "500" : "400" }}>
                  {section.label}
                </span>
              </button>
            )}
          </For>
        </nav>

        {/* Section content */}
        <div style={{ flex: 1, "min-width": "0" }}>
          <Show when={activeSection() === "general"}>
            <Section title="General" description="Engine connection and workspace settings">
              <SettingRow label="Engine URL" description="Base URL of the Arcana engine HTTP API">
                <input
                  type="text"
                  value={engineUrl()}
                  onInput={(e) => setEngineUrl(e.currentTarget.value)}
                  style={{
                    background: "var(--arcana-surface-raised)",
                    border: "1px solid var(--arcana-border)",
                    color: "var(--arcana-text)",
                    padding: "0.35rem 0.75rem",
                    "border-radius": "6px",
                    "font-family": "var(--font-family-mono)",
                    "font-size": "0.8125rem",
                    width: "280px",
                    outline: "none",
                  }}
                />
              </SettingRow>
              <SettingRow label="Default Tenant" description="Organization ID for multi-tenant operations">
                <input
                  type="text"
                  value="org-1"
                  style={{
                    background: "var(--arcana-surface-raised)",
                    border: "1px solid var(--arcana-border)",
                    color: "var(--arcana-text)",
                    padding: "0.35rem 0.75rem",
                    "border-radius": "6px",
                    "font-family": "var(--font-family-mono)",
                    "font-size": "0.8125rem",
                    width: "160px",
                    outline: "none",
                  }}
                />
              </SettingRow>
            </Section>
          </Show>

          <Show when={activeSection() === "governance"}>
            <Section title="Governance" description="Approval policies and escalation rules">
              <SettingRow label="Approval Policy" description="How the engine handles approval-required actions">
                <select
                  style={{
                    background: "var(--arcana-surface-raised)",
                    border: "1px solid var(--arcana-border)",
                    color: "var(--arcana-text)",
                    padding: "0.35rem 0.75rem",
                    "border-radius": "6px",
                    "font-size": "0.8125rem",
                    outline: "none",
                  }}
                >
                  <option value="ask">Ask (prompt for approval)</option>
                  <option value="never">Never (auto-approve)</option>
                  <option value="always">Always (require approval)</option>
                </select>
              </SettingRow>
              <SettingRow label="Escalation Timeout" description="Seconds before an approval request escalates">
                <input
                  type="number"
                  value="300"
                  style={{
                    background: "var(--arcana-surface-raised)",
                    border: "1px solid var(--arcana-border)",
                    color: "var(--arcana-text)",
                    padding: "0.35rem 0.75rem",
                    "border-radius": "6px",
                    "font-family": "var(--font-family-mono)",
                    "font-size": "0.8125rem",
                    width: "100px",
                    outline: "none",
                  }}
                />
              </SettingRow>
            </Section>
          </Show>

          <Show when={activeSection() === "providers"}>
            <Section title="Providers" description="Model provider configuration">
              <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem" }}>
                Provider configuration is managed through the engine CLI. Use <code style={{ color: "var(--arcana-violet)", "font-family": "var(--font-family-mono)" }}>arcana provider add</code> to register providers.
              </div>
            </Section>
          </Show>

          <Show when={activeSection() === "security"}>
            <Section title="Security" description="Capabilities, delegation, and provenance">
              <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem" }}>
                Security settings are enforced by the engine runtime. The enterprise console provides visibility into capability grants, delegation chains, and provenance labels through the Auditor and Escalation consoles.
              </div>
            </Section>
          </Show>

          <Show when={activeSection() === "appearance"}>
            <Section title="Appearance" description="Theme and display preferences">
              <SettingRow label="Color Scheme" description="Console color scheme">
                <select
                  style={{
                    background: "var(--arcana-surface-raised)",
                    border: "1px solid var(--arcana-border)",
                    color: "var(--arcana-text)",
                    padding: "0.35rem 0.75rem",
                    "border-radius": "6px",
                    "font-size": "0.8125rem",
                    outline: "none",
                  }}
                >
                  <option value="dark">Arcana Dark</option>
                  <option value="light">Light</option>
                </select>
              </SettingRow>
            </Section>
          </Show>

          {/* Save button */}
          <div style={{ "margin-top": "1.5rem", display: "flex", gap: "0.75rem", "align-items": "center" }}>
            <button
              onClick={handleSave}
              style={{
                background: "var(--arcana-gold)",
                color: "var(--arcana-void)",
                border: "none",
                padding: "0.4rem 1.25rem",
                "border-radius": "6px",
                "font-size": "0.8125rem",
                "font-weight": "600",
                cursor: "pointer",
              }}
            >
              Save Changes
            </button>
            <Show when={saved()}>
              <span style={{ color: "var(--v2-state-fg-success)", "font-size": "0.8125rem" }}>Saved ✓</span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section(props: { title: string; description: string; children: any }) {
  return (
    <div>
      <h2 style={{ "font-size": "1.125rem", "font-weight": "500", color: "var(--arcana-text)", margin: "0 0 0.25rem 0" }}>
        {props.title}
      </h2>
      <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.8125rem", margin: "0 0 1.25rem 0" }}>
        {props.description}
      </p>
      <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
        {props.children}
      </div>
    </div>
  )
}

function SettingRow(props: { label: string; description: string; children: any }) {
  return (
    <div style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "1rem" }}>
      <div style={{ display: "flex", "flex-direction": "column", gap: "0.125rem" }}>
        <span style={{ "font-size": "0.8125rem", "font-weight": "500", color: "var(--arcana-text)" }}>
          {props.label}
        </span>
        <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>
          {props.description}
        </span>
      </div>
      <div style={{ "flex-shrink": "0" }}>
        {props.children}
      </div>
    </div>
  )
}
