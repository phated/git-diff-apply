import { commit } from "./commit.js";
import { spawn } from "./run.js";

export async function commitAndTag(tag, options) {
  await commit(tag, options);
  await spawn("git", ["tag", tag], options);
}
