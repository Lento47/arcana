import path from "path"

export function abbreviateHome(input: string, home: string) {
  if (!home) return input
  const relative = path.relative(home, input)
  if (relative === "") return "~"
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return input
  // Display paths use forward slashes on every platform (host-neutral); path.relative
  // yields backslashes on Windows, so normalize before returning.
  return "~/" + relative.split(path.sep).join("/")
}
