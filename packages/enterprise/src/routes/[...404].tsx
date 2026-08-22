import { A } from "@solidjs/router"

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        "min-height": "60vh",
        gap: "1.5rem",
        "text-align": "center",
      }}
    >
      <div
        style={{
          "font-size": "4rem",
          color: "var(--arcana-gold)",
          "font-weight": "300",
          "letter-spacing": "0.2em",
          opacity: 0.6,
        }}
      >
        404
      </div>
      <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
        <h1
          style={{
            "font-size": "1.25rem",
            "font-weight": "500",
            color: "var(--arcana-text)",
            margin: 0,
          }}
        >
          Path not found
        </h1>
        <p
          style={{
            color: "var(--arcana-text-weak)",
            "font-size": "0.85rem",
            margin: 0,
          }}
        >
          The requested route does not exist in the governed surface.
        </p>
      </div>
      <A
        href="/"
        style={{
          color: "var(--arcana-gold)",
          "text-decoration": "none",
          "font-size": "0.85rem",
          padding: "0.4rem 1rem",
          border: "1px solid var(--arcana-gold-dim)",
          "border-radius": "6px",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--arcana-gold-dim)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
      >
        ← Return to Dashboard
      </A>
    </div>
  )
}
