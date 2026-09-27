import fs from "node:fs";

const [_node, _file, src, dest] = process.argv;

fs.cpSync(src, dest, { recursive: true });
