import { spawn } from "node:child_process";

export function resolveConflicts(options) {
  // pipe for those using as a library can interact
  return spawn("git", ["mergetool"], options);
}
