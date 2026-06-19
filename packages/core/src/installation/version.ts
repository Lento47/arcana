declare global {
  const ARCANA_VERSION: string
  const ARCANA_CHANNEL: string
}

export const InstallationVersion = typeof ARCANA_VERSION === "string" ? ARCANA_VERSION : "local"
export const InstallationChannel = typeof ARCANA_CHANNEL === "string" ? ARCANA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
