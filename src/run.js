import { promisify } from "node:util";
import { exec as _exec, spawn as _spawn } from "node:child_process";

const execPromise = promisify(_exec);

export async function exec(command, options) {
  let { stdout } = await execPromise(command, options);
  return stdout;
}

export function spawn(cmd, args, options) {
  let command = [cmd, ...args].join(" ");

  let child = _spawn(cmd, args, options);

  let promise = new Promise(function (resolve, reject) {
    let stdout = "";
    let errorMessage = "";

    child.stdout.on("data", function (data) {
      stdout += data;
    });
    child.stderr.on("data", function (data) {
      errorMessage += data;
    });
    child.on("close", function (status) {
      if (status === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} failed with message ${errorMessage}`));
      }
    });
  });

  return Object.assign(promise, child);
}
