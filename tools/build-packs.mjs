/*!
 * Daggerheart: Store
 * 2025 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["pack", "unpack"].includes(mode)) {
  console.error("Usage: node tools/build-packs.mjs <pack|unpack>");
  process.exit(1);
}

const { packs } = JSON.parse(readFileSync(join(ROOT, "module.json"), "utf8"));
for (const { name, path } of packs) {
  const source = join(ROOT, "packs", "_source", name);
  const compiled = join(ROOT, path);
  if (mode === "pack") {
    // compilePack only adds and overwrites keys; a document deleted from the source would
    // survive in an existing LevelDB, so start from an empty one.
    rmSync(compiled, { recursive: true, force: true });
    await compilePack(source, compiled, { recursive: true, log: true });
  } else {
    await extractPack(compiled, source, { clean: true, omitVolatile: true, log: true });
  }
}
