// https://github.com/kellyselden/git-fixtures/blob/6b333c893b5972e2af91a9fb1e1721c7d73a0781/LICENSE
// MIT License

// Copyright (c) 2017 Kelly Selden

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

import { exec } from "../../src/run.js";
import { gitInit as _gitInit } from "../../src/git-init.js";
import { gitRemoveAll } from "../../src/git-remove-all.js";
import { commit } from "./commit.js";

const branchName = "foo";

async function gitInit({ cwd }) {
  await _gitInit({
    cwd,
  });

  await exec('git config merge.tool "vimdiff"', {
    cwd,
  });

  await exec("git config mergetool.keepBackup false", {
    cwd,
  });
}

async function postCommit({ cwd, dirty }) {
  // non-master branch test
  await exec(`git checkout -b ${branchName}`, {
    cwd,
  });

  if (dirty) {
    await fs.writeFile(path.join(cwd, "a-random-new-file"), "bar");
  }
}

export async function buildTmp({ fixturesPath, dirty, noGit, subDir = "" }) {
  let tmpPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-diff-apply-"));

  await gitInit({
    cwd: tmpPath,
  });

  let tmpSubPath = path.join(tmpPath, subDir);

  let tags = await fs.readdir(fixturesPath);

  for (let i = 0; i < tags.length; i++) {
    if (i !== 0) {
      await gitRemoveAll({
        cwd: tmpPath,
      });
    }

    let tag = tags[i];

    await fs.mkdir(tmpSubPath, { recursive: true });

    let tagPath = path.join(fixturesPath, tag);

    let files = await fs.readdir(tagPath);

    // if only a single .gitkeep, treat as an empty dir
    // and skip the copy
    if (!(files.length === 1 && files[0] === ".gitkeep")) {
      await fs.cp(tagPath, tmpSubPath, { recursive: true });
    }

    await commit({
      m: tag,
      tag,
      cwd: tmpPath,
    });
  }

  await postCommit({
    cwd: tmpPath,
    dirty,
  });

  if (noGit) {
    await fs.rm(path.join(tmpSubPath, ".git"), { recursive: true });
  }

  return tmpSubPath;
}
