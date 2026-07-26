import type { CommandModule } from "yargs"
import { UI } from "../ui"
import { EOL } from "node:os"

type Args = {
  contract?: string
  lanes?: number
  budget?: string
}

export const LoopCommand: CommandModule<{}, Args> = {
  command: "loop",
  describe: "Start an autonomous research loop with portfolio search and multi-fidelity verification",
  builder: (yargs) =>
    yargs
      .option("contract", {
        type: "string",
        describe: "Path to loop contract JSON (.arcana/loop/contract.json)",
      })
      .option("lanes", {
        type: "number",
        default: 3,
        describe: "Number of parallel search lanes (default: 3)",
      })
      .option("budget", {
        type: "string",
        describe: "Token budget limit (e.g. '100k', '1M')",
      }),
  handler: async (args: Args) => {
    if (!args.contract) {
      process.stderr.write(`Usage: arcana loop --contract .arcana/loop/contract.json${EOL}`)
      process.stderr.write(
        `${EOL}A loop contract defines what to optimize, how to verify, and when to stop.${EOL}`,
      )
      process.stderr.write(`See .arcana/loop/README.md for contract schema.${EOL}`)
      process.exit(1)
    }

    // Load the contract
    const { readFileSync, existsSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const contractPath = resolve(args.contract)
    if (!existsSync(contractPath)) {
      UI.error(`Contract not found: ${contractPath}`)
      process.exit(1)
    }

    let contract: Record<string, unknown>
    try {
      contract = JSON.parse(readFileSync(contractPath, "utf8"))
    } catch {
      UI.error(`Invalid JSON in contract: ${contractPath}`)
      process.exit(1)
    }

    // Start the loop session with the contract bound
    const { RunCommand } = await import("./run")
    const { startLoop } = await import("../../loop/runner")

    process.stderr.write(
      `${UI.logo()}${EOL}Research Loop${EOL}${EOL}`,
    )
    process.stderr.write(`Contract: ${contract.contract ?? contractPath}${EOL}`)
    process.stderr.write(`Objective: ${contract.objective ?? "(see contract)"}${EOL}`)
    process.stderr.write(`Lanes: ${args.lanes}${EOL}`)
    if (args.budget) process.stderr.write(`Budget: ${args.budget} tokens${EOL}`)
    process.stderr.write(EOL)

    await startLoop({
      contract,
      contractPath,
      lanes: args.lanes ?? 3,
      budget: args.budget,
    })
  },
}
