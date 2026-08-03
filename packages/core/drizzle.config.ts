import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts", "./src/epistemic/*-sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: "/home/thdxr/.local/share/opencode/opencode.db",
  },
})
