import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createWriteStream } from "node:fs";

import utils from "./utils.js";
import { getRootDir } from "./get-root-dir.js";
import { getSubDir } from "./get-sub-dir.js";
import { gitInit, gitConfigInit } from "./git-init.js";
import { gitStatus, isGitClean } from "./git-status.js";
import { commit } from "./commit.js";
import { checkOutTag } from "./check-out-tag.js";
import { convertToObj } from "./convert-to-obj.js";
import { resolveConflicts } from "./resolve-conflicts.js";
import { commitAndTag } from "./commit-and-tag.js";
import { gitRemoveAll } from "./git-remove-all.js";
import { createCustomRemote } from "./create-custom-remote.js";
import { exec, spawn } from "./run.js";

const tempBranchName = crypto.randomUUID();

const fallbackTagName = "tag-not-supplied";

function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "git-diff-apply-"));
}

export default async function gitDiffApply({
  cwd = process.cwd(),
  remoteUrl,
  startTag,
  endTag,
  resolveConflicts: _resolveConflicts,
  ignoredFiles = [],
  reset,
  init,
  createCustomDiff,
  startCommand,
  endCommand,
}) {
  let _tmpDir;
  let tmpWorkingDir;

  let hasConflicts;
  let returnObject;

  let isCodeUntracked;
  let isCodeModified;

  let root;

  let err;

  if (reset || init) {
    if (!endTag) {
      throw "You must supply an end tag";
    }
  } else {
    if (!createCustomDiff && !(startTag && endTag)) {
      throw "You must supply a start tag and an end tag";
    }
    if (createCustomDiff && !startTag && !endTag) {
      throw "You must supply a start tag or an end tag";
    }
  }

  let safeStartTag = startTag || fallbackTagName;
  let safeEndTag = endTag || fallbackTagName;

  async function buildReturnObject() {
    let from;

    if (reset || init) {
      from = {};
    } else {
      await checkOutTag(safeStartTag, { cwd: _tmpDir });

      from = await convertToObj(_tmpDir, ignoredFiles);
    }

    await checkOutTag(safeEndTag, { cwd: _tmpDir });

    let to = await convertToObj(_tmpDir, ignoredFiles);

    return {
      from,
      to,
    };
  }

  async function namespaceRepoWithSubDir(subDir) {
    let newTmpDir = await tmpDir();

    await gitInit({ cwd: newTmpDir });

    let newTmpSubDir = path.join(newTmpDir, subDir);

    async function copyToSubDir(tag) {
      await fs.mkdir(newTmpSubDir, { recursive: true });

      await checkOutTag(tag, { cwd: _tmpDir });

      await utils.copy(_tmpDir, newTmpSubDir);

      await commitAndTag(tag, { cwd: newTmpDir });
    }

    if (!(reset || init)) {
      await copyToSubDir(safeStartTag);

      await gitRemoveAll({ cwd: newTmpDir });
    }

    await copyToSubDir(safeEndTag);

    _tmpDir = newTmpDir;
    tmpWorkingDir = newTmpSubDir;
  }

  async function copy() {
    await utils.copy(tmpWorkingDir, cwd);
  }

  async function resetIgnoredFiles(cwd) {
    for (let ignoredFile of ignoredFiles) {
      // An exist check is not good enough.
      // `git checkout` will fail unless it is also tracked.
      let isTracked = await spawn("git", ["ls-files", ignoredFile], { cwd });
      if (isTracked) {
        await spawn("git", ["checkout", "--", ignoredFile], { cwd });
      } else {
        try {
          await fs.rm(path.join(cwd, ignoredFile), { recursive: true });
        } catch {
          // Ignored if no file to remove
        }
      }
    }
  }

  async function createPatchFile() {
    let patchFile = path.join(await tmpDir(), "file.patch");
    let ps = spawn("git", ["diff", safeStartTag, safeEndTag, "--binary"], {
      cwd: _tmpDir,
    });
    ps.stdout.pipe(createWriteStream(patchFile));
    await ps;
    if ((await fs.readFile(patchFile, "utf8")) !== "") {
      return patchFile;
    }
  }

  async function applyPatch(patchFile) {
    // --whitespace=fix seems to prevent any unnecessary conflicts with line endings
    // https://stackoverflow.com/questions/6308625/how-to-avoid-git-apply-changing-line-endings#comment54419617_11189296
    await spawn("git", ["apply", "--whitespace=fix", patchFile], {
      cwd: _tmpDir,
    });
  }

  async function go() {
    if (reset || init) {
      await checkOutTag(safeEndTag, { cwd: _tmpDir });

      isCodeUntracked = true;
      isCodeModified = true;
      if (reset) {
        await utils.gitRemoveAll({ cwd: root });
      }

      await copy();

      await utils.spawn("git", ["reset"], { cwd });

      await resetIgnoredFiles(cwd);

      return;
    }

    await checkOutTag(safeStartTag, { cwd: _tmpDir });

    await spawn("git", ["branch", tempBranchName], { cwd: _tmpDir });
    await spawn("git", ["checkout", tempBranchName], { cwd: _tmpDir });

    let patchFile = await createPatchFile();
    if (!patchFile) {
      return;
    }

    await applyPatch(patchFile);

    await resetIgnoredFiles(tmpWorkingDir);

    let wereAnyChanged = !(await isGitClean({ cwd: _tmpDir }));

    if (wereAnyChanged) {
      let message = [startTag, endTag].filter(Boolean).join("...");

      await commit(message, { cwd: _tmpDir });

      let sha = await spawn("git", ["rev-parse", "HEAD"], { cwd: _tmpDir });

      await spawn("git", ["remote", "add", tempBranchName, _tmpDir], { cwd });
      await spawn("git", ["fetch", "--no-tags", tempBranchName], { cwd });

      try {
        await spawn("git", ["cherry-pick", "--no-commit", sha.trim()], { cwd });
      } catch (err) {
        hasConflicts = true;
      }

      await spawn("git", ["remote", "remove", tempBranchName], { cwd });
    }
  }

  try {
    if (startTag === endTag && !(reset || init)) {
      throw "Tags match, nothing to apply";
    }

    let isClean;

    try {
      isClean = await isGitClean({ cwd });
    } catch (err) {
      throw "Not a git repository";
    }

    if (!isClean) {
      throw "You must start with a clean working directory";
    }

    if (createCustomDiff) {
      let tmpPath = await createCustomRemote({
        startCommand,
        endCommand,
        startTag: safeStartTag,
        endTag: safeEndTag,
        reset,
        init,
      });

      remoteUrl = tmpPath;
    }

    _tmpDir = await tmpDir();
    tmpWorkingDir = _tmpDir;

    await spawn("git", ["clone", remoteUrl, _tmpDir]);

    // needed because we are going to be committing in here
    await gitConfigInit({ cwd: _tmpDir });

    returnObject = await buildReturnObject();

    root = await getRootDir({ cwd });
    let subDir = await getSubDir({ cwd });
    if (subDir) {
      await namespaceRepoWithSubDir(subDir);
    }

    await go();
  } catch (_err) {
    err = _err;

    try {
      if (isCodeUntracked) {
        await spawn("git", ["clean", "-f"], { cwd });
      }
      if (isCodeModified) {
        await spawn("git", ["reset", "--hard"], { cwd });
      }
    } catch (err2) {
      throw {
        err,
        err2,
      };
    }
  }

  if (err) {
    throw err;
  }

  if (hasConflicts && _resolveConflicts) {
    let processOpts =
      typeof _resolveConflicts === "object" ? _resolveConflicts : {};
    returnObject.resolveConflictsProcess = resolveConflicts({
      cwd,
      ...processOpts,
    });
  }

  return returnObject;
}

export { exec, gitInit, gitStatus, isGitClean, gitRemoveAll };
