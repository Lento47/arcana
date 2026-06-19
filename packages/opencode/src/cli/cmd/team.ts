import { cmd } from "./cmd"
import { UI } from "../ui"

export const TeamCommand = cmd({
  command: "team",
  describe: "manage team vault and shared resources",
  builder: (yargs) =>
    yargs
      .command({
        command: "status",
        describe: "show team vault status",
        async handler() {
          UI.println("⛧ Team Vault")
          UI.println("   Status: enterprise feature")
          UI.println("   Run: arcana license status to check your plan")
        },
      })
      .command({
        command: "sessions",
        describe: "list shared team sessions",
        async handler() {
          UI.println("Team session sharing requires a Team or Enterprise license.")
          UI.println("Upgrade at https://arcana.otnelhq.com")
        },
      })
      .command({
        command: "skills",
        describe: "list team-wide skills",
        async handler() {
          UI.println("Team skill registry requires a Team or Enterprise license.")
          UI.println("Upgrade at https://arcana.otnelhq.com")
        },
      })
      .demandCommand(),
  async handler() {},
})
