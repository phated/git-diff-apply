import fs from "node:fs/promises";

import { copyRegex } from "./copy-regex.js";

export async function copy(from, to) {
  await fs.cp(from, to, {
    recursive: true,
    filter(src) {
      return copyRegex.test(src);
    },
  });
}
