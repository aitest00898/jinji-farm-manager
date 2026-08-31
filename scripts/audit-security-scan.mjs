import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredSegments = [".git", "node_modules", "dist", "coverage", "test-results", "playwright-report", ".wrangler", ".vite", ".audit-output"];
const candidateRoots = ["AGENTS.md", "README.md", ".gitignore", ".github", "package.json", "package-lock.json", "index.html", "tsconfig.json", "vite.config.ts", "vitest.config.ts", "playwright.config.ts", "src", "tests", "public", "docs/external-local-audit.md", "scripts", "repomix.audit.config.json", "repomix.web-ux.config.json"];

function ignored(path) {
  return ignoredSegments.some((segment) => path.split("/").includes(segment));
}

function inCandidateScope(path) {
  return candidateRoots.some((rootPath) => path === rootPath || path.startsWith(`${rootPath}/`));
}

function trackedAndUntrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root });
  return output.toString("utf8").split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
}

const files = trackedAndUntrackedFiles().filter((path) => !ignored(path) && inCandidateScope(path));
const findings = [];
let binaryCount = 0;
let largeCount = 0;
const allowedBinaryExtensions = /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/iu;

// These expressions detect credential-shaped material, not ordinary words such as
// "password" in documentation. Findings print only the path and a safe category.
const sensitivePatterns = [
  { category: "PRIVATE_KEY", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { category: "CLOUD_TOKEN", pattern: /(?:ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})[A-Za-z0-9_\-]{8,}/u },
  { category: "BEARER_TOKEN", pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{24,}/u },
  { category: "JWT_SHAPED", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u },
  { category: "SECRET_ASSIGNMENT", pattern: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[A-Za-z0-9+/=_-]{16,}/iu },
  { category: "PRIVATE_CREDENTIAL_FILE", pattern: /\.(?:pem|key|p12|pfx)$/iu },
];

for (const path of files) {
  const absolute = join(root, path);
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    findings.push({ path, category: "MISSING_FILE" });
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size > 1_500_000) {
    largeCount += 1;
    findings.push({ path, category: "LARGE_FILE" });
    continue;
  }
  const buffer = readFileSync(absolute);
  if (buffer.includes(0)) {
    if (allowedBinaryExtensions.test(path)) continue;
    binaryCount += 1;
    findings.push({ path, category: "BINARY_FILE" });
    continue;
  }
  const content = buffer.toString("utf8");
  for (const { category, pattern } of sensitivePatterns) {
    if (pattern.test(content)) findings.push({ path, category });
  }
}

const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.path}:${finding.category}`, finding])).values()];
const secretFindings = uniqueFindings.filter((finding) => ["PRIVATE_KEY", "CLOUD_TOKEN", "BEARER_TOKEN", "JWT_SHAPED", "SECRET_ASSIGNMENT", "PRIVATE_CREDENTIAL_FILE"].includes(finding.category));
const exportSafe = uniqueFindings.length === 0;

for (const finding of uniqueFindings) console.log(`FINDING path=${finding.path} category=${finding.category}`);
console.log(`SCANNED_PATHS=${files.length}`);
console.log(`SECRET_SCAN=${secretFindings.length === 0 ? "PASS" : "FAIL"}`);
console.log(`PRODUCTION_IDENTIFIER_SCAN=${exportSafe ? "PASS" : "REVIEW_REQUIRED"}`);
console.log(`LARGE_FILE_SCAN=${largeCount === 0 ? "PASS" : "FAIL"}`);
console.log(`BINARY_SCAN=${binaryCount === 0 ? "PASS" : "REVIEW_REQUIRED"}`);
console.log(`SAFE_FOR_REPOMIX=${exportSafe && largeCount === 0 && binaryCount === 0 ? "YES" : "NO"}`);

if (secretFindings.length || largeCount) process.exitCode = 1;
