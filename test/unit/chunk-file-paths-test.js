import assert from "node:assert";
import { describe, it } from "node:test";

import { chunkFilePaths } from "../../src/git-remove-all.js";
const filePaths = ["a".repeat(5), "b".repeat(4), "c".repeat(2)];

describe("chunkFilePaths", function () {
  it("divides the input into chunks", function () {
    let result = chunkFilePaths(filePaths, 6);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].length, 1);
    assert.deepStrictEqual(result[0], [filePaths[0]]);
    assert.strictEqual(result[1].length, 2);
    assert.deepStrictEqual(result[1], [filePaths[1], filePaths[2]]);
  });

  it("handles everything being in the same chunk", function () {
    let result = chunkFilePaths(filePaths, 1000);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], filePaths);
  });

  it("handles when individual elements are bigger than the chunk size", function () {
    let result = chunkFilePaths(filePaths, 4);
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], [filePaths[0]]);
    assert.deepStrictEqual(result[1], [filePaths[1]]);
  });
});
