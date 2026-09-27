import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

import { exec, spawn } from "./run.js";
import { gitInit } from "./git-init.js";
import { commitAndTag } from "./commit-and-tag.js";
import { gitRemoveAll } from "./git-remove-all.js";

export async function createCustomRemote({
  startCommand,
  endCommand,
  startTag,
  endTag,
  reset,
  init,
}) {
  let cwd = await fs.mkdtemp(path.join(os.tmpdir(), "git-diff-apply-"));

  await gitInit({
    cwd,
  });

  // If one tag is CRLF and the other LF, the diff becomes unusable.
  // This will work around that,
  await spawn("git", ["config", "core.autocrlf", "true"], {
    cwd,
  });

  if (!(reset || init)) {
    await exec(startCommand, {
      cwd,
    });

    await commitAndTag(startTag, {
      cwd,
    });

    await gitRemoveAll({
      cwd,
    });
  }

  await exec(endCommand, {
    cwd,
  });

  await commitAndTag(endTag, {
    cwd,
  });

  return cwd;
}
