#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@arcana/script"
import pkg from "../package.json"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui")

const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`ARCANA_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".map"))
    .sort()
  const imports = files.map((file, i) => {
    const spec = path.relative(dir, path.join(dist, file)).replaceAll("\\", "/")
    return `import file_${i} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  })
  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)
  return [
    `// Import all files as file_$i with type: "file"`,
    ...imports,
    `// Export with original mappings`,
    `export default {`,
    ...entries,
    `}`,
  ].join("\n")
}

const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "arm64",
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional Bun artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : allTargets

await $`rm -rf dist`

const binaries: Record<string, string> = {}

// Packages in optionalDependencies that are loaded via dynamic import() at runtime.
// Externalizing them from the compiled binary keeps the binary lean and defers
// provider installation to first use. At runtime, Bun resolves them from
// node_modules (installed) or through the Npm.add() fallback in provider.ts.
const EXTERNAL_PROVIDERS = [
  "@ai-sdk/alibaba",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/anthropic",
  "@ai-sdk/azure",
  "@ai-sdk/cerebras",
  "@ai-sdk/cohere",
  "@ai-sdk/deepinfra",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/groq",
  "@ai-sdk/mistral",
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@ai-sdk/perplexity",
  "@ai-sdk/togetherai",
  "@ai-sdk/vercel",
  "@ai-sdk/xai",
  "@openrouter/ai-sdk-provider",
  "venice-ai-sdk-provider",
  "ai-gateway-provider",
  "@aws-sdk/credential-providers",
  "google-auth-library",
]

if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@0.4.5`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const localPath = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
  const rootPath = path.resolve(dir, "../../node_modules/@opentui/core/parser.worker.js")
  const parserWorker = fs.realpathSync(fs.existsSync(localPath) ? localPath : rootPath)
  const workerPath = "./src/cli/tui/worker.ts"

  // Use platform-specific bunfs root path based on target OS
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  await Bun.build({
    conditions: ["bun", "node"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    external: ["node-gyp", ...EXTERNAL_PROVIDERS],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    splitting: true,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/arcana`,
      execArgv: [`--user-agent=arcana/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {},
    entrypoints: ["./src/index.ts", parserWorker, workerPath, ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : [])],
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      ARCANA_VERSION: `'${Script.version}'`,
      ARCANA_MODELS_DEV: generated.modelsData,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      ARCANA_WORKER_PATH: workerPath,
      ARCANA_CHANNEL: `'${Script.channel}'`,
      ARCANA_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  // Smoke test: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const binaryPath = `dist/${name}/bin/arcana`
    console.log(`Running smoke test: ${binaryPath} --version`)
    try {
      const versionOutput = await $`${binaryPath} --version`.text()
      console.log(`Smoke test passed: ${versionOutput.trim()}`)
    } catch (e) {
      console.error(`Smoke test failed for ${name}:`, e)
      process.exit(1)
    }
  }

  await $`rm -rf ./dist/${name}/bin/tui`
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version

  // Symlink node_modules into the dist directory so the compiled binary
  // can resolve external provider packages at runtime. Bun's compile target
  // excludes packages in the `external` list from the binary bundle — those
  // must be available on disk in node_modules relative to the binary.
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const distNM = path.resolve(dir, `dist/${name}/node_modules`)
    const engineNM = path.resolve(dir, "node_modules")
    // Remove existing link. rmdirSync handles Windows junctions without
    // descending into their contents (which would fail on subdirectories).
    try { fs.rmdirSync(distNM) } catch {}
    try { fs.unlinkSync(distNM) } catch {}
    try { fs.rmSync(distNM, { recursive: true, force: true }) } catch {}
    try {
      fs.symlinkSync(engineNM, distNM, process.platform === "win32" ? "junction" : "dir")
      console.log(`  node_modules linked for ${name}`)
    } catch (e) {
      // Fallback: copy individual packages. Symlink can fail on Windows
      // when the source and destination are on different volumes (junction
      // limitation). Copy is slower but works everywhere.
      console.warn(`  Symlink failed for ${name}, copying packages instead:`, (e as Error).message)
      fs.mkdirSync(distNM, { recursive: true })
      for (const pkg of EXTERNAL_PROVIDERS) {
        const localNM = path.resolve(dir, "node_modules", pkg)
        try {
          const real = fs.realpathSync(localNM)
          const dest = path.join(distNM, pkg)
          fs.rmSync(dest, { recursive: true, force: true })
          fs.cpSync(real, dest, { recursive: true })
        } catch {
          // Package not installed — Npm.add() fallback will install on first use.
        }
      }
    }
  }
}

	if (Script.release) {
	  const assets: string[] = []
	  for (const key of Object.keys(binaries)) {
	    const arcanaKey = key.replace("@arcana/engine", "arcana")
	    if (key.includes("linux")) {
	      await $`tar -czf ../../../${arcanaKey}.tar.gz *`.cwd(`dist/${key}/bin`)
	      await $`shasum -a 256 ../../${arcanaKey}.tar.gz | cut -d' ' -f1 > ../../${arcanaKey}.tar.gz.sha256`.cwd(`dist/${key}`)
	      assets.push(`./dist/${arcanaKey}.tar.gz`, `./dist/${arcanaKey}.tar.gz.sha256`)
	    } else {
	      await $`zip -r ../../../${arcanaKey}.zip *`.cwd(`dist/${key}/bin`)
	      await $`shasum -a 256 ../../${arcanaKey}.zip | cut -d' ' -f1 > ../../${arcanaKey}.zip.sha256`.cwd(`dist/${key}`)
	      assets.push(`./dist/${arcanaKey}.zip`, `./dist/${arcanaKey}.zip.sha256`)
	    }
	  }
	  await $`gh release upload ${Script.version} ${assets} --clobber --repo ${process.env.GH_REPO}`
	}

export { binaries }
