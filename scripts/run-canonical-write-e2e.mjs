import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(root, ".canonical-write-bundle-"));
const outfile = path.join(temp, "recording-taxonomy-write-e2e.mjs");
try {
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/recording-taxonomy-write-e2e.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile,
    sourcemap: false,
  });
  execFileSync(process.execPath, [outfile], { cwd: root, stdio: "inherit" });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
