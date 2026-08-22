import { type ParentProps, Show, createSignal, createMemo } from "solid-js"
import { A, useLocation } from "@solidjs/router"

interface NavItem {
  href: string
  label: string
  icon: string
  badge?: string | number
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "◈" },
  { href: "/sessions", label: "Sessions", icon: "◇" },
  { href: "/models", label: "Models", icon: "◆" },
  { href: "/skills", label: "Skills", icon: "⬡" },
  { href: "/proofs", label: "Proofs", icon: "⊞" },
  { href: "/auditor", label: "Auditor", icon: "⊡" },
  { href: "/escalation", label: "Escalation", icon: "⊟" },
  { href: "/settings", label: "Settings", icon: "⊙" },
]

export function AppLayout(props: ParentProps) {
  const location = useLocation()
  const [collapsed, setCollapsed] = createSignal(false)

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/"
    return location.pathname.startsWith(href)
  }

  return (
    <div
      style={{
        display: "flex",
        "min-height": "100vh",
        background: "var(--arcana-void)",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed() ? "56px" : "220px",
          "min-height": "100vh",
          background: "var(--arcana-surface)",
          "border-right": "1px solid var(--arcana-border)",
          display: "flex",
          "flex-direction": "column",
          transition: "width 0.2s ease",
          overflow: "hidden",
          "flex-shrink": "0",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "1.25rem 1rem",
            display: "flex",
            "align-items": "center",
            gap: "0.75rem",
            "border-bottom": "1px solid var(--arcana-border)",
            cursor: "pointer",
            "min-height": "56px",
          }}
          onClick={() => setCollapsed(!collapsed())}
        >
          <span
            style={{
              "font-size": "1.25rem",
              color: "var(--arcana-gold)",
              "font-weight": "bold",
              "letter-spacing": "0.15em",
              "white-space": "nowrap",
            }}
          >
            ⛧
          </span>
          <Show when={!collapsed()}>
            <span
              style={{
                "font-size": "0.85rem",
                color: "var(--arcana-gold)",
                "font-weight": "600",
                "letter-spacing": "0.25em",
                "text-transform": "uppercase",
                "white-space": "nowrap",
              }}
            >
              Arcana
            </span>
          </Show>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "0.5rem", display: "flex", "flex-direction": "column", gap: "2px" }}>
          {NAV_ITEMS.map((item) => (
            <A
              href={item.href}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "0.75rem",
                padding: "0.5rem 0.75rem",
                "border-radius": "6px",
                "text-decoration": "none",
                "font-size": "0.8125rem",
                "font-weight": isActive(item.href) ? "500" : "400",
                color: isActive(item.href) ? "var(--arcana-gold)" : "var(--arcana-text-weak)",
                background: isActive(item.href) ? "var(--arcana-gold-dim)" : "transparent",
                transition: "all 0.15s ease",
                "white-space": "nowrap",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.href)) {
                  e.currentTarget.style.color = "var(--arcana-text)"
                  e.currentTarget.style.background = "var(--arcana-surface-raised)"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.href)) {
                  e.currentTarget.style.color = "var(--arcana-text-weak)"
                  e.currentTarget.style.background = "transparent"
                }
              }}
            >
              <span style={{ "font-size": "1rem", width: "1rem", "text-align": "center", "flex-shrink": "0" }}>
                {item.icon}
              </span>
              <Show when={!collapsed()}>
                <span>{item.label}</span>
              </Show>
            </A>
          ))}
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: "0.75rem 1rem",
            "border-top": "1px solid var(--arcana-border)",
            display: "flex",
            "align-items": "center",
            gap: "0.5rem",
          }}
        >
          <Show when={!collapsed()}>
            <span style={{ "font-size": "0.7rem", color: "var(--arcana-text-faint)", "white-space": "nowrap" }}>
              governed autonomy runtime
            </span>
          </Show>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          "min-width": "0",
          display: "flex",
          "flex-direction": "column",
        }}
      >
        {props.children}
      </main>
    </div>
  )
}
