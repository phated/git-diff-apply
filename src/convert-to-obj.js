import fs from "node:fs/promises";
import path from "node:path";

export async function convertToObj(dir, includes = []) {
  const obj = {};
  for (const include of includes.values()) {
    try {
      obj[include] = await fs.readFile(path.join(dir, include), "utf8");
    } catch {
      // These are just ignored
    }
  }
  return obj;
}
