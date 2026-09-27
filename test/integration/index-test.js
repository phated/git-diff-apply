import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert";
import { describe, it, after, before, afterEach, mock } from "node:test";

import fixturify from "fixturify";
import Project from "fixturify-project";

import { commit } from "../helpers/commit.js";
import { buildTmp } from "../helpers/buildTmp.js";
import { processExit } from "../helpers/processExit.js";

import gitDiffApply from "../../src/index.js";
import utils from "../../src/utils.js";
import { spawn } from "../../src/run.js";
import { isGitClean } from "../../src/git-status.js";

const defaultStartTag = "v1";
const defaultEndTag = "v3";

function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "git-diff-apply-"));
}

async function ensureDir(dirpath) {
  return fs.mkdir(dirpath, { recursive: true });
}

const cpr = path.join(import.meta.dirname, "../helpers/cpr.js");

describe("git-diff-apply", function () {
  let cwd = process.cwd();
  let rootDir;
  let localDir;
  let remoteDir;

  afterEach(function () {
    mock.restoreAll();

    process.chdir(cwd);
  });

  async function merge({
    localFixtures,
    remoteFixtures,
    dirty,
    noGit,
    subDir = "",
    ignoredFiles = [],
    startTag = defaultStartTag,
    endTag = defaultEndTag,
    reset,
    init,
    createCustomDiff,
    startCommand,
    endCommand,
    beforeMerge = async () => {},
  }) {
    localDir = await buildTmp({
      fixturesPath: localFixtures,
      dirty,
      noGit,
      subDir,
    });
    remoteDir = await buildTmp({
      fixturesPath: remoteFixtures,
    });

    rootDir = path.resolve(
      localDir,
      ...subDir
        .split("/")
        .filter(Boolean)
        .map(() => ".."),
    );

    await beforeMerge();

    process.chdir(localDir);

    // this prefixes /private in OSX...
    // let's us do === against it later
    localDir = process.cwd();

    process.chdir(cwd);

    let promise = gitDiffApply({
      cwd: localDir,
      remoteUrl: remoteDir,
      startTag,
      endTag,
      ignoredFiles,
      reset,
      init,
      createCustomDiff,
      startCommand,
      endCommand,
    });

    return await processExit({
      promise,
      cwd: localDir,
      commitMessage: "local",
      noGit,
    });
  }

  async function fixtureCompare({
    mergeFixtures,
    subDir = "",
    beforeCompare = async () => {},
  }) {
    let localMergeDir = await tmpDir();

    let rootMergeDir = localMergeDir;
    localMergeDir = path.join(rootMergeDir, subDir);
    await fs.mkdir(localMergeDir, { recursive: true });

    await fs.cp(path.join(cwd, mergeFixtures), localMergeDir, {
      recursive: true,
    });

    await beforeCompare({
      localMergeDir,
      rootMergeDir,
    });

    const actual = fixturify.readSync(rootDir);
    const expected = fixturify.readSync(rootMergeDir);

    delete actual[".git"];
    delete actual["node_modules"];

    assert.deepStrictEqual(actual, expected);
  }

  it("handles no conflicts", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/noconflict",
    });

    assert.strictEqual(
      status,
      `M  changed.txt
`,
    );
  });

  it("handles dirty", async function () {
    let { status, stderr } = await merge({
      localFixtures: "test/fixtures/local/conflict",
      remoteFixtures: "test/fixtures/remote/conflict",
      dirty: true,
    });

    assert.strictEqual(
      status,
      `?? a-random-new-file
`,
    );

    assert.match(stderr, /You must start with a clean working directory/);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejectionWarning/);
  });

  it("fails without both tags", async function () {
    let { status, stderr } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
      startTag: null,
    });

    assert.strictEqual(status, "");

    assert.match(stderr, /You must supply a start tag and an end tag/);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejectionWarning/);
  });

  it("doesn't resolve conflicts by default", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/conflict",
      remoteFixtures: "test/fixtures/remote/conflict",
    });

    let actual = await fs.readFile(
      path.join(localDir, "present-changed.txt"),
      "utf8",
    );

    assert.match(actual, /<<<<<<< HEAD/);

    assert.strictEqual(
      status,
      `A  added-changed.txt
A  added-unchanged.txt
DU missing-changed.txt
AA present-added-changed.txt
UU present-changed.txt
UD removed-changed.txt
D  removed-unchanged.txt
`,
    );
  });

  it("ignores files", async function () {
    let { status, result } = await merge({
      localFixtures: "test/fixtures/local/ignored",
      remoteFixtures: "test/fixtures/remote/ignored",
      ignoredFiles: ["ignored-changed.txt"],
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/ignored",
    });

    assert.strictEqual(
      status,
      `M  changed.txt
`,
    );

    assert.deepStrictEqual(
      result,
      fixturify.readSync(path.join(cwd, "test/fixtures/ignored")),
    );
  });

  it("doesn't error if no changes", async function () {
    await merge({
      localFixtures: "test/fixtures/local/nochange",
      remoteFixtures: "test/fixtures/remote/nochange",
      ignoredFiles: ["changed.txt"],
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/nochange",
    });

    assert.strictEqual(await isGitClean({ cwd: localDir }), true);
  });

  it("does nothing when tags match", async function () {
    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
      startTag: defaultEndTag,
    });

    assert.strictEqual(await isGitClean({ cwd: localDir }), true);

    assert.match(stderr, /Tags match, nothing to apply/);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejectionWarning/);
  });

  it("does nothing when not a git repo", async function () {
    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
      noGit: true,
    });

    assert.match(stderr, /Not a git repository/);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejectionWarning/);
  });

  it("does not error when no changes between tags", async function () {
    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/no-change-between-tags",
      remoteFixtures: "test/fixtures/remote/no-change-between-tags",
    });

    assert.strictEqual(await isGitClean({ cwd: localDir }), true);

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/no-change-between-tags",
    });

    assert.strictEqual(stderr, undefined);
  });

  it("does not error when no changes between tags - custom diff", async function () {
    let remoteFixtures = "test/fixtures/remote/no-change-between-tags";

    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/no-change-between-tags",
      remoteFixtures,
      createCustomDiff: true,
      startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
      endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
    });

    assert.strictEqual(await isGitClean({ cwd: localDir }), true);

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/no-change-between-tags",
    });

    assert.strictEqual(stderr, undefined);
  });

  it("does not error when empty first commit", async function () {
    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/empty-first-commit",
      remoteFixtures: "test/fixtures/remote/empty-first-commit",
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/empty-first-commit",
    });

    assert.strictEqual(stderr, undefined);
  });

  it("does not error when empty first commit - custom diff", async function () {
    let remoteFixtures = "test/fixtures/remote/empty-first-commit";

    let { stderr } = await merge({
      localFixtures: "test/fixtures/local/empty-first-commit",
      remoteFixtures,
      createCustomDiff: true,
      startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
      endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/empty-first-commit",
    });

    assert.strictEqual(stderr, undefined);
  });

  describe("sub dir", function () {
    let subDir = "foo/bar";

    it("scopes to sub dir if run from there", async function () {
      let { status } = await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures: "test/fixtures/remote/noconflict",
        subDir,
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/noconflict",
        subDir,
      });

      assert.strictEqual(
        status,
        `M  foo/bar/changed.txt
`,
      );
    });

    it("handles sub dir with ignored files", async function () {
      let { status, result } = await merge({
        localFixtures: "test/fixtures/local/ignored",
        remoteFixtures: "test/fixtures/remote/ignored",
        subDir,
        ignoredFiles: ["ignored-changed.txt"],
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/ignored",
        subDir,
      });

      assert.strictEqual(
        status,
        `M  foo/bar/changed.txt
`,
      );

      assert.deepStrictEqual(
        result,
        fixturify.readSync(path.join(cwd, "test/fixtures/ignored")),
      );
    });

    it("preserves locally gitignored", async function () {
      await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures: "test/fixtures/remote/noconflict",
        subDir,
        async beforeMerge() {
          await Promise.all([
            ensureDir(path.join(localDir, "local-and-remote")),
            ensureDir(path.join(localDir, "local-only")),
            ensureDir(path.join(localDir, "folder/local-and-remote")),
            ensureDir(path.join(localDir, "folder/local-only")),
            fs.copyFile(
              path.join(cwd, "test/fixtures/local/gitignored/local/.gitignore"),
              path.join(rootDir, ".gitignore"),
            ),
          ]);

          await commit({ m: "local", cwd: rootDir });
        },
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/noconflict",
        subDir,
        async beforeCompare({ localMergeDir, rootMergeDir }) {
          await Promise.all([
            ensureDir(path.join(localMergeDir, "local-and-remote")),
            ensureDir(path.join(localMergeDir, "local-only")),
            ensureDir(path.join(localMergeDir, "folder/local-and-remote")),
            ensureDir(path.join(localMergeDir, "folder/local-only")),
            fs.copyFile(
              path.join(cwd, "test/fixtures/local/gitignored/local/.gitignore"),
              path.join(rootMergeDir, ".gitignore"),
            ),
          ]);
        },
      });
    });

    it("resets files to new version + preserves locally gitignored", async function () {
      await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures: "test/fixtures/remote/noconflict",
        reset: true,
        subDir,
        async beforeMerge() {
          await Promise.all([
            ensureDir(path.join(localDir, "local-and-remote")),
            ensureDir(path.join(localDir, "local-only")),
            ensureDir(path.join(localDir, "folder/local-and-remote")),
            ensureDir(path.join(localDir, "folder/local-only")),
            fs.copyFile(
              path.join(cwd, "test/fixtures/local/gitignored/local/.gitignore"),
              path.join(rootDir, ".gitignore"),
            ),
          ]);

          await commit({ m: "local", cwd: rootDir });
        },
      });

      await fixtureCompare({
        mergeFixtures: `test/fixtures/remote/noconflict/${defaultEndTag}`,
        subDir,
        async beforeCompare({ localMergeDir }) {
          await Promise.all([
            ensureDir(path.join(localMergeDir, "local-and-remote")),
            ensureDir(path.join(localMergeDir, "local-only")),
            ensureDir(path.join(localMergeDir, "folder/local-and-remote")),
            ensureDir(path.join(localMergeDir, "folder/local-only")),
          ]);
        },
      });
    });

    it("inits files to new version + preserves locally gitignored", async function () {
      await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures: "test/fixtures/remote/noconflict",
        init: true,
        subDir,
        async beforeMerge() {
          await Promise.all([
            ensureDir(path.join(localDir, "local-and-remote")),
            ensureDir(path.join(localDir, "local-only")),
            ensureDir(path.join(localDir, "folder/local-and-remote")),
            ensureDir(path.join(localDir, "folder/local-only")),
            fs.copyFile(
              path.join(cwd, "test/fixtures/local/gitignored/local/.gitignore"),
              path.join(rootDir, ".gitignore"),
            ),
          ]);

          await commit({ m: "local", cwd: rootDir });
        },
      });

      await fixtureCompare({
        mergeFixtures: `test/fixtures/remote/noconflict/${defaultEndTag}`,
        subDir,
        async beforeCompare({ localMergeDir, rootMergeDir }) {
          await Promise.all([
            ensureDir(path.join(localMergeDir, "local-and-remote")),
            ensureDir(path.join(localMergeDir, "local-only")),
            ensureDir(path.join(localMergeDir, "folder/local-and-remote")),
            ensureDir(path.join(localMergeDir, "folder/local-only")),
            fs.copyFile(
              path.join(cwd, "test/fixtures/local/gitignored/local/.gitignore"),
              path.join(rootMergeDir, ".gitignore"),
            ),
          ]);
        },
      });
    });
  });

  for (let [type, expectedStatus] of [
    [
      "reset",
      (subDir = "") => ` M ${path.posix.join(subDir, "changed.txt")}
 D ${path.posix.join(subDir, "unchanged.txt")}
`,
    ],
    [
      "init",
      (subDir = "") => ` M ${path.posix.join(subDir, "changed.txt")}
`,
    ],
  ]) {
    describe(type, function () {
      it(`${type}s files to new version`, async function () {
        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures: `test/fixtures/remote/${type}`,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });

        assert.strictEqual(status, expectedStatus());

        assert.deepStrictEqual(result.from, {});
      });

      it(`${type}s without start tag`, async function () {
        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures: `test/fixtures/remote/${type}`,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          startTag: null,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });

        assert.strictEqual(status, expectedStatus());

        assert.deepStrictEqual(result.from, {});
      });

      it(`${type}s using a custom diff`, async function () {
        let remoteFixtures = `test/fixtures/remote/${type}`;

        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          createCustomDiff: true,
          endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });

        assert.strictEqual(status, expectedStatus());

        assert.deepStrictEqual(result.from, {});
      });

      it(`${type}s using a custom diff on same tag`, async function () {
        let remoteFixtures = `test/fixtures/remote/${type}`;

        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          createCustomDiff: true,
          endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
          startTag: defaultEndTag,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });

        assert.strictEqual(status, expectedStatus());

        assert.deepStrictEqual(result.from, {});
      });

      it(`${type}s using a custom diff without start tag`, async function () {
        let remoteFixtures = `test/fixtures/remote/${type}`;

        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          createCustomDiff: true,
          endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
          startTag: null,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });

        assert.strictEqual(status, expectedStatus());

        assert.deepStrictEqual(result.from, {});
      });

      it(`${type}s using a custom diff and sub dir`, async function () {
        let remoteFixtures = `test/fixtures/remote/${type}`;
        let subDir = "foo/bar";

        let { status, result } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          createCustomDiff: true,
          subDir,
          endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
          subDir,
        });

        assert.strictEqual(status, expectedStatus(subDir));

        assert.deepStrictEqual(result.from, {});
      });

      it("ignores matching tags", async function () {
        await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures: `test/fixtures/remote/${type}`,
          [type]: true,
          ignoredFiles: ["ignored-changed.txt"],
          startTag: defaultEndTag,
        });

        await fixtureCompare({
          mergeFixtures: `test/fixtures/merge/${type}`,
        });
      });

      if (type === "reset") {
        it("reverts files after remove when error", async function () {
          mock.method(utils, "gitRemoveAll", async () => {
            throw "test remove failed";
          });

          let { stderr } = await merge({
            localFixtures: `test/fixtures/local/${type}`,
            remoteFixtures: `test/fixtures/remote/${type}`,
            [type]: true,
          });

          assert.strictEqual(await isGitClean({ cwd: localDir }), true);

          assert.match(stderr, /test remove failed/);
        });
      }

      it("reverts files after copy when error", async function () {
        let { copy } = utils;
        mock.method(utils, "copy", async function () {
          await copy.apply(this, arguments);

          if (arguments[1] !== localDir) {
            return;
          }

          assert.strictEqual(await isGitClean({ cwd: localDir }), false);

          throw "test copy failed";
        });

        let { stderr } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures: `test/fixtures/remote/${type}`,
          [type]: true,
        });

        assert.strictEqual(await isGitClean({ cwd: localDir }), true);

        assert.match(stderr, /test copy failed/);
      });

      it("reverts files after reset when error", async function () {
        let { spawn } = utils;
        mock.method(utils, "spawn", async function (cmd, args) {
          if (cmd === "git" && args.length === 1 && args[0] === "reset") {
            throw "test reset failed";
          }

          return await spawn.apply(this, arguments);
        });

        let { stderr } = await merge({
          localFixtures: `test/fixtures/local/${type}`,
          remoteFixtures: `test/fixtures/remote/${type}`,
          [type]: true,
        });

        assert.strictEqual(await isGitClean({ cwd: localDir }), true);

        assert.match(stderr, /test reset failed/);
      });

      it("preserves locally gitignored", async function () {
        await merge({
          localFixtures: "test/fixtures/local/gitignored",
          remoteFixtures: "test/fixtures/remote/gitignored",
          [type]: true,
          async beforeMerge() {
            await Promise.all([
              ensureDir(path.join(localDir, "local-and-remote")),
              ensureDir(path.join(localDir, "local-only")),
              ensureDir(path.join(localDir, "folder/local-and-remote")),
              ensureDir(path.join(localDir, "folder/local-only")),
            ]);
          },
        });

        await fixtureCompare({
          mergeFixtures:
            type === "reset"
              ? `test/fixtures/remote/gitignored/${defaultEndTag}`
              : "test/fixtures/merge/gitignored",
          async beforeCompare({ localMergeDir, rootMergeDir }) {
            await Promise.all([
              ensureDir(path.join(localMergeDir, "local-and-remote")),
              ensureDir(path.join(localMergeDir, "local-only")),
              ensureDir(path.join(localMergeDir, "folder/local-and-remote")),
              ensureDir(path.join(localMergeDir, "folder/local-only")),
              fs.copyFile(
                path.join(
                  cwd,
                  `test/fixtures/remote/gitignored/${defaultEndTag}/.gitignore`,
                ),
                path.join(rootMergeDir, ".gitignore"),
              ),
            ]);
          },
        });
      });
    });
  }

  describe("custom diff", function () {
    it("can create a custom diff", async function () {
      let remoteFixtures = "test/fixtures/remote/noconflict";

      let { status } = await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures,
        createCustomDiff: true,
        startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
        endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/noconflict",
      });

      assert.strictEqual(
        status,
        `M  changed.txt
`,
      );

      let stagedCommitMessage = await fs.readFile(
        path.join(rootDir, ".git/MERGE_MSG"),
        "utf8",
      );

      assert.strictEqual(stagedCommitMessage.trim(), "v1...v3");
    });

    it("start tag optional", async function () {
      let remoteFixtures = "test/fixtures/remote/noconflict";

      let { status } = await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures,
        createCustomDiff: true,
        startTag: null,
        startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
        endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/noconflict",
      });

      assert.strictEqual(
        status,
        `M  changed.txt
`,
      );

      let stagedCommitMessage = await fs.readFile(
        path.join(rootDir, ".git/MERGE_MSG"),
        "utf8",
      );

      assert.strictEqual(stagedCommitMessage.trim(), "v3");
    });

    it("end tag optional", async function () {
      let remoteFixtures = "test/fixtures/remote/noconflict";

      let { status } = await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures,
        createCustomDiff: true,
        endTag: null,
        startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
        endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/noconflict",
      });

      assert.strictEqual(
        status,
        `M  changed.txt
`,
      );

      let stagedCommitMessage = await fs.readFile(
        path.join(rootDir, ".git/MERGE_MSG"),
        "utf8",
      );

      assert.strictEqual(stagedCommitMessage.trim(), "v1");
    });

    it("fails without either tag", async function () {
      let { status, stderr } = await merge({
        localFixtures: "test/fixtures/local/noconflict",
        remoteFixtures: "test/fixtures/remote/noconflict",
        createCustomDiff: true,
        startTag: null,
        endTag: null,
      });

      assert.strictEqual(status, "");

      assert.match(stderr, /You must supply a start tag or an end tag/);
      assert.doesNotMatch(stderr, /UnhandledPromiseRejectionWarning/);
    });
  });

  it("preserves locally gitignored", async function () {
    await merge({
      localFixtures: "test/fixtures/local/gitignored",
      remoteFixtures: "test/fixtures/remote/gitignored",
      async beforeMerge() {
        await Promise.all([
          ensureDir(path.join(localDir, "local-and-remote")),
          ensureDir(path.join(localDir, "local-only")),
          ensureDir(path.join(localDir, "folder/local-and-remote")),
          ensureDir(path.join(localDir, "folder/local-only")),
        ]);
      },
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/gitignored",
      async beforeCompare({ localMergeDir }) {
        await Promise.all([
          ensureDir(path.join(localMergeDir, "local-and-remote")),
          ensureDir(path.join(localMergeDir, "local-only")),
          ensureDir(path.join(localMergeDir, "folder/local-and-remote")),
          ensureDir(path.join(localMergeDir, "folder/local-only")),
        ]);
      },
    });
  });

  describe("globally gitignored", function () {
    let realGlobalGitignorePath;

    before(async function () {
      try {
        realGlobalGitignorePath = (
          await spawn("git", ["config", "--global", "core.excludesfile"])
        ).trim();
      } catch {
        //  No global gitignore
      }
      let tmpGlobalGitignorePath = path.join(await tmpDir(), ".gitignore");
      await fs.writeFile(tmpGlobalGitignorePath, ".vscode");
      await spawn("git", [
        "config",
        "--global",
        "core.excludesfile",
        tmpGlobalGitignorePath,
      ]);
    });

    after(async function () {
      if (!realGlobalGitignorePath) {
        await spawn("git", [
          "config",
          "--global",
          "--unset",
          "core.excludesfile",
        ]);
      } else if (realGlobalGitignorePath.startsWith(os.tmpdir())) {
        await spawn("git", [
          "config",
          "--global",
          "core.excludesfile",
          path.join(os.homedir(), ".gitignore"),
        ]);
      } else {
        await spawn("git", [
          "config",
          "--global",
          "core.excludesfile",
          realGlobalGitignorePath,
        ]);
      }
    });

    it("works", async function () {
      await merge({
        localFixtures: "test/fixtures/local/globally-gitignored",
        remoteFixtures: "test/fixtures/remote/globally-gitignored",
        async beforeMerge() {
          await spawn("git", ["config", "--unset", "core.excludesfile"], {
            cwd: rootDir,
          });
        },
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/globally-gitignored",
      });
    });

    it("can create a custom diff", async function () {
      let remoteFixtures = "test/fixtures/remote/globally-gitignored";

      await merge({
        localFixtures: "test/fixtures/local/globally-gitignored",
        remoteFixtures,
        createCustomDiff: true,
        startCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultStartTag)} .`,
        endCommand: `node ${cpr} ${path.resolve(remoteFixtures, defaultEndTag)} .`,
        async beforeMerge() {
          await spawn("git", ["config", "--unset", "core.excludesfile"], {
            cwd: rootDir,
          });
        },
      });

      await fixtureCompare({
        mergeFixtures: "test/fixtures/merge/globally-gitignored",
      });
    });
  });

  it("handles binary files", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/binary",
      remoteFixtures: "test/fixtures/remote/binary",
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/binary",
    });

    assert.strictEqual(
      status,
      `M  changed.png
`,
    );
  });

  it("handles spaces in path", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/space in dirname",
      remoteFixtures: "test/fixtures/remote/space in dirname",
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/space in dirname",
    });

    assert.strictEqual(
      status,
      `M  "space in filename.txt"
`,
    );
  });

  it("handles ignored broken symlinks", async function () {
    // another OSX /private workaround
    let realpath = {};

    async function createBrokenSymlink(srcpath, dstpath) {
      await ensureDir(path.resolve(localDir, srcpath));
      await fs.symlink(srcpath, dstpath);
      realpath[srcpath] = await fs.realpath(path.resolve(localDir, srcpath));
      await fs.rm(path.resolve(localDir, srcpath), { recursive: true });
    }

    async function assertBrokenSymlink(srcpath, dstpath) {
      assert.strictEqual(realpath[await fs.readlink(dstpath)], srcpath);
    }

    await merge({
      localFixtures: "test/fixtures/local/gitignored",
      remoteFixtures: "test/fixtures/remote/gitignored",
      async beforeMerge() {
        await createBrokenSymlink(
          path.normalize("./broken"),
          path.join(localDir, "local-only"),
        );
      },
    });

    await assertBrokenSymlink(
      path.join(localDir, "broken"),
      path.join(localDir, "local-only"),
    );

    await fs.unlink(path.join(localDir, "local-only"));

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/gitignored",
    });
  });

  it("handles ignored files that don't exist", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
      ignoredFiles: ["missing.txt"],
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/noconflict",
    });

    assert.strictEqual(
      status,
      `M  changed.txt
`,
    );
  });

  it("handles ignored files that were added upstream", async function () {
    let { status } = await merge({
      localFixtures: "test/fixtures/local/ignored-added",
      remoteFixtures: "test/fixtures/remote/ignored-added",
      ignoredFiles: ["ignored-added.txt"],
    });

    await fixtureCompare({
      mergeFixtures: "test/fixtures/merge/ignored-added",
    });

    assert.strictEqual(
      status,
      `M  changed.txt
`,
    );
  });

  it("takes a reasonable amount of time on a large monorepo", async function () {
    let subDir = "foo/bar";

    let beforeTime;

    let { status } = await merge({
      localFixtures: "test/fixtures/local/noconflict",
      remoteFixtures: "test/fixtures/remote/noconflict",
      subDir,
      async beforeMerge() {
        let project = new Project("monorepo", "0.0.0");

        for (let i = 0; i < 100; i++) {
          project.addDependency(`package${i}`, "0.0.0");

          project.files[`index${i}.js`] = 'module.exports = "Hello, World!"';
        }

        project.writeSync(rootDir);

        await commit({ m: "local", cwd: rootDir });

        beforeTime = new Date();
      },
    });

    let afterTime = new Date();

    let delta = afterTime - beforeTime;

    let threshold = 3 * 1000;

    // Regarding https://github.com/kellyselden/git-diff-apply/pull/278
    // Testing on Mac
    // Before: ~7100ms
    // After: ~1300ms
    // 3s seems to be a good threshold
    assert(delta < threshold);

    assert.strictEqual(
      status,
      `M  foo/bar/changed.txt
`,
    );
  });
});
