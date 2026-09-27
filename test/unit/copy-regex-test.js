import assert from "node:assert";
import { describe, it } from "node:test";

import { copyRegex } from "../../src/copy-regex.js";

describe("copyRegex", function () {
  it("exludes git files", function () {
    assert.match("git", copyRegex);
    assert.doesNotMatch(".git", copyRegex);
    assert.doesNotMatch(".git/", copyRegex);
    assert.doesNotMatch(".git\\", copyRegex);
    assert.doesNotMatch(".git/foo", copyRegex);
    assert.doesNotMatch(".git\\foo", copyRegex);
    assert.match(".gitignore", copyRegex);
    assert.match("foo.git", copyRegex);
    assert.doesNotMatch("foo/.git", copyRegex);
    assert.doesNotMatch("foo\\.git", copyRegex);
  });

  it("exludes node_modules", function () {
    assert.doesNotMatch("node_modules", copyRegex);
    assert.match("node_moduless", copyRegex);
    assert.match("nnode_modules", copyRegex);
    assert.doesNotMatch("node_modules/foo", copyRegex);
    assert.doesNotMatch("node_modules\\foo", copyRegex);
    assert.doesNotMatch("foo/node_modules", copyRegex);
    assert.doesNotMatch("foo\\node_modules", copyRegex);
  });

  it("includes everything else", function () {
    assert.match("foo/bar", copyRegex);
    assert.match("foo\\bar", copyRegex);
  });
});
