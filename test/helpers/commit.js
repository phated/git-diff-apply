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

import { exec } from "../../src/run.js";

export async function commit({ m = "initial commit", tag, cwd }) {
  await exec("git add -A", {
    cwd,
  });

  // allow empty first commit
  // or no changes between tags
  await exec(`git commit --allow-empty -m "${m}"`, {
    cwd,
  });

  if (tag) {
    await exec(`git tag ${tag}`, {
      cwd,
    });
  }
}
