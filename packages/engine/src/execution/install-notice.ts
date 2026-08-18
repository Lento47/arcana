// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/** Last parked install per session, so a later operator reply can notify the model. */

export type ParkedInstall = {
  requestID: string
  command: string
}

const parked = new Map<string, ParkedInstall>()

export function noteParkedInstall(sessionID: string, requestID: string, command: string) {
  const text = command.trim()
  if (!sessionID || !requestID || !text) return
  parked.set(sessionID, { requestID, command: text })
}

export function takeParkedInstall(sessionID: string, requestID: string): ParkedInstall | undefined {
  const current = parked.get(sessionID)
  if (!current || current.requestID !== requestID) return undefined
  parked.delete(sessionID)
  return current
}

export function formatInstallApprovedNotice(command: string): string {
  return [
    "<installation_status>",
    "Operator approved this installation request.",
    `Command: ${command}`,
    "If the command succeeded, proceed to use the installed binary in this session.",
    "Do not ask the user to edit permission JSON. Do not treat this as a new install request unless the command failed.",
    "</installation_status>",
  ].join("\n")
}

export function formatInstallResumePrompt(command: string): string {
  return [
    "<system-reminder>",
    "The operator approved your parked installation request in the background.",
    `Authorized command: ${command}`,
    "Continue the original task. If the install has not run yet, execute that exact command, then use the installed tool.",
    "Do not ask for permission-file edits. Do not invent a successful install if the command has not completed.",
    "</system-reminder>",
  ].join("\n")
}
