import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FORMAL_REPOSITORY = "aitest00898/jinji-farm-manager";
const FORMAL_PAGES_PATH = "/jinji-farm-manager/";
const FORBIDDEN_RUNTIME_MARKERS = [
  "jinji-web-v14r-lab",
  "data-app-id=\"jinji-web-v14r-lab\"",
  "V14R Plus",
  "/jinji-web-v14r-lab",
];

function fail(message) {
  console.error(`[repository-authority] FAIL: ${message}`);
  process.exitCode = 1;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function walk(relative) {
  const absolute = path.join(ROOT, relative);
  const out = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(next));
    else out.push(next);
  }
  return out;
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.name !== "chicken-line-production") fail("root package identity changed unexpectedly");

const webPackage = JSON.parse(read("web/package.json"));
if (webPackage.name !== "jinji-farm-manager") fail("formal Web package identity is not jinji-farm-manager");

const vite = read("web/vite.config.ts");
if (!vite.includes(`base: "${FORMAL_PAGES_PATH}"`)) fail(`formal Web Vite base must be ${FORMAL_PAGES_PATH}`);

const pages = read(".github/workflows/formal-web-pages.yml");
if (!pages.includes(`github.repository == '${FORMAL_REPOSITORY}'`)) fail("formal Pages workflow is not pinned to the authoritative repository");
if (!pages.includes("github.event.workflow_run.head_branch == 'main'")) fail("formal Pages workflow must publish only from main");
if (!pages.includes("path: web/dist")) fail("formal Pages workflow must publish web/dist");

const runtimeFiles = walk("web").filter((file) => file !== "web/README.md");
for (const file of runtimeFiles) {
  const content = read(file);
  for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
    if (content.includes(marker)) fail(`non-authoritative Lab marker ${JSON.stringify(marker)} found in formal runtime file ${file}`);
  }
}

const readme = read("web/README.md");
if (!readme.includes("Formal repository: `aitest00898/jinji-farm-manager`")) fail("formal Web README lost repository authority declaration");
if (!readme.includes("non-authoritative Prototype / Pre-Production Lab")) fail("formal Web README lost Lab boundary declaration");

if (!process.exitCode) {
  console.log(JSON.stringify({
    authority: "PASS",
    repository: FORMAL_REPOSITORY,
    formalWebPath: "web/",
    formalPagesPath: FORMAL_PAGES_PATH,
    scannedRuntimeFiles: runtimeFiles.length,
  }));
}
