import { spawn } from "./run.js";

export async function checkOutTag(tag, options) {
  let sha = await spawn("git", ["rev-parse", tag], options);
  await spawn("git", ["checkout", sha.trim()], options);
}
