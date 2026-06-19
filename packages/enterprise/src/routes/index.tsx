import { createSignal, onMount } from "solid-js"

const gold = "#d4a853"
const violet = "#9d7cd8"
const bg = "#0d0a14"

export default function Dashboard() {
  const [status, setStatus] = createSignal("scrying…")

  onMount(async () => {
    try {
      const res = await fetch("/api/global/health")
      if (res.ok) setStatus("connected")
      else setStatus(`offline (${res.status})`)
    } catch {
      setStatus("offline")
    }
  })

  return (
    <div
      style={{
        "min-height": "100vh",
        background: bg,
        color: "#e0d8c8",
        "font-family": "system-ui, monospace",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        gap: "2rem",
      }}
    >
      <header style={{ "text-align": "center" }}>
        <h1 style={{ color: gold, "font-size": "3rem", margin: 0, "letter-spacing": "0.3em" }}>
          ⛧ ARCANA
        </h1>
        <p style={{ color: "#666", "font-size": "0.9rem", "font-style": "italic" }}>
          « decrypt the arcane »
        </p>
      </header>

      <section style={{ display: "flex", gap: "2rem", "flex-wrap": "wrap", "justify-content": "center" }}>
        <Card label="status" value={status()} accent={status() === "connected" ? gold : "#c44"} />
        <Card label="models" value="350+" accent={violet} />
        <Card label="skills" value="174" accent={violet} />
        <Card label="sessions" value="—" accent="#666" />
      </section>

      <footer style={{ color: "#444", "font-size": "0.8rem" }}>
        arcana enterprise · v0.1.0
      </footer>
    </div>
  )
}

function Card(props: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        border: `1px solid ${props.accent}33`,
        "border-radius": "8px",
        padding: "1.5rem 2rem",
        "text-align": "center",
        "min-width": "120px",
        background: `${props.accent}0a`,
      }}
    >
      <div style={{ color: props.accent, "font-size": "1.8rem", "font-weight": "bold" }}>
        {props.value}
      </div>
      <div style={{ color: "#666", "font-size": "0.75rem", "text-transform": "uppercase", "letter-spacing": "0.2em" }}>
        {props.label}
      </div>
    </div>
  )
}
