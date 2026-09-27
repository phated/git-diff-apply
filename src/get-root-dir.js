import { spawn } from "./run.js";

export async function getRootDir(options) {
  let root = (
    await spawn("git", ["rev-parse", "--show-toplevel"], options)
  ).trim();
  return root;
}
