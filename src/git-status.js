import { spawn } from "./run.js";

export async function gitStatus(options) {
  return await spawn("git", ["status", "--porcelain"], options);
}

export async function isGitClean(options) {
  return !(await gitStatus(options));
}
