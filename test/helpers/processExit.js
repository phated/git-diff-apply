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

import assert from "node:assert";

import { exec } from "../../src/run.js";
import { gitStatus } from "../../src/git-status.js";

const branchName = "foo";
const branchRegExp = new RegExp(`^\\* ${branchName}\\r?\\n {2}master$`);

export async function processExit({ promise, cwd, commitMessage, noGit }) {
  let obj;

  try {
    let result = await promise;

    obj = { result };
  } catch (stderr) {
    if (typeof stderr !== "string") {
      throw stderr;
    }

    assert.doesNotMatch(stderr, /Error:/);
    assert.doesNotMatch(stderr, /fatal:/);
    assert.doesNotMatch(stderr, /Command failed/);

    obj = { stderr };
  }

  if (!noGit) {
    let result = await exec("git log -1", {
      cwd,
    });

    // verify it is not committed
    assert.match(result, /Author: Your Name <you@example.com>/);
    assert.match(result, new RegExp(commitMessage));

    result = await exec("git branch", {
      cwd,
    });

    // verify branch was deleted
    assert.match(result.trim(), branchRegExp);

    let status = await gitStatus({
      cwd,
    });

    obj.status = status;
  }

  return obj;
}
