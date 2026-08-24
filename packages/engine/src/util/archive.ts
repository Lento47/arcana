import path from "path"
import * as Process from "./process"

export async function extractZip(zipPath: string, destDir: string) {
  if (process.platform === "win32") {
    const winZipPath = path.resolve(zipPath)
    const winDestDir = path.resolve(destDir)
    // bsdtar ships with Windows 10+ and extracts zip natively. Expand-Archive
    // broke whenever the parent env carried another PowerShell edition's
    // PSModulePath (module autoload failure).
    await Process.run(["tar", "-xf", winZipPath, "-C", winDestDir])
    return
  }

  await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
}

export * as Archive from "./archive"
