import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredSegments = new Set([".git", "node_modules", "dist", "coverage", "test-results", "playwright-report", ".wrangler", ".vite", ".audit-output"]);
const allowedRemoteHosts = new Set(["registry.npmjs.org", "registry.yarnpkg.com", "nodejs.org", "github.com", "githubusercontent.com", "opencollective.com", "tidelift.com", "local-audit.invalid"]);
const maxFileSize = 1_500_000;

function ignored(path) {
  return path.split("/").some((segment) => ignoredSegments.has(segment));
}

function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (ignored(path)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) files.push({ path, absolute, symlink: true });
    else if (entry.isDirectory()) files.push(...collectFiles(absolute, path));
    else if (entry.isFile()) files.push({ path, absolute, symlink: false });
  }
  return files;
}

// These expressions are intentionally generic. The scanner must remain reusable
// in a disposable mirror and must not contain project-specific secrets, hashes,
// identifiers, URLs, or other production fingerprints.
const sensitivePatterns = [
  { category: "PRIVATE_KEY", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { category: "CLOUD_TOKEN", pattern: /(?:ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})[A-Za-z0-9_-]{8,}/u },
  { category: "BEARER_TOKEN", pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{24,}/u },
  { category: "JWT_SHAPED", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u },
  { category: "SECRET_ASSIGNMENT", pattern: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[A-Za-z0-9+/=_-]{16,}/iu },
];
const runtimeEndpointPattern = /\bhttps?:\/\/[^\s"'`<>]+\.(?:workers\.dev|pages\.dev|github\.io)(?:[/?#][^\s"'`<>]*)?/iu;
const remoteUrlPattern = /\bhttps?:\/\/([^\s"'`<>/]+)(?:[/?#][^\s"'`<>]*)?/giu;
const allowedBinaryExtensions = /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/iu;

const findings = [];
let binaryCount = 0;
let largeCount = 0;
let symlinkCount = 0;
let remoteUrlCount = 0;
const files = collectFiles(root);

for (const file of files) {
  if (file.symlink) {
    symlinkCount += 1;
    findings.push({ path: file.path, category: "SYMLINK" });
    continue;
  }
  let stat;
  try {
    stat = lstatSync(file.absolute);
  } catch {
    findings.push({ path: file.path, category: "MISSING_FILE" });
    continue;
  }
  if (stat.size > maxFileSize) {
    largeCount += 1;
    findings.push({ path: file.path, category: "LARGE_FILE" });
    continue;
  }
  if (/\.(?:pem|key|p12|pfx)$/iu.test(file.path)) findings.push({ path: file.path, category: "PRIVATE_CREDENTIAL_FILE" });
  const buffer = readFileSync(file.absolute);
  if (buffer.includes(0)) {
    if (allowedBinaryExtensions.test(file.path)) continue;
    binaryCount += 1;
    findings.push({ path: file.path, category: "BINARY_FILE" });
    continue;
  }
  const content = buffer.toString("utf8");
  for (const { category, pattern } of sensitivePatterns) if (pattern.test(content)) findings.push({ path: file.path, category });
  if (runtimeEndpointPattern.test(content)) findings.push({ path: file.path, category: "RUNTIME_ENDPOINT" });
  for (const match of content.matchAll(remoteUrlPattern)) {
    const host = match[1].toLowerCase();
    if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("[::1]") && !allowedRemoteHosts.has(host)) remoteUrlCount += 1;
  }
}

const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.path}:${finding.category}`, finding])).values()];
const sensitiveCategories = new Set(sensitivePatterns.map(({ category }) => category));
const sensitiveFindings = uniqueFindings.filter((finding) => sensitiveCategories.has(finding.category));
const runtimeFindings = uniqueFindings.filter((finding) => finding.category === "RUNTIME_ENDPOINT");
const structuralFindings = uniqueFindings.filter((finding) => ["LARGE_FILE", "BINARY_FILE", "SYMLINK", "MISSING_FILE"].includes(finding.category));

for (const finding of uniqueFindings) console.log(`FINDING path=${finding.path} category=${finding.category}`);
console.log(`SCANNED_PATHS=${files.length}`);
console.log(`SECRET_SCAN=${sensitiveFindings.length === 0 ? "PASS" : "FAIL"}`);
console.log(`RUNTIME_ENDPOINT_SCAN=${runtimeFindings.length === 0 ? "PASS" : "FAIL"}`);
console.log(`REMOTE_URL_SCAN=${remoteUrlCount === 0 ? "PASS" : "REVIEW_REQUIRED"}`);
console.log(`BINARY_SCAN=${binaryCount === 0 ? "PASS" : "REVIEW_REQUIRED"}`);
console.log(`SYMLINK_SCAN=${symlinkCount === 0 ? "PASS" : "FAIL"}`);
console.log(`MIRROR_STRUCTURE_SCAN=${structuralFindings.length === 0 ? "PASS" : "REVIEW_REQUIRED"}`);
console.log(`SAFE_FOR_REPOMIX=${sensitiveFindings.length === 0 && runtimeFindings.length === 0 && structuralFindings.length === 0 ? "YES" : "NO"}`);

if (sensitiveFindings.length || runtimeFindings.length || structuralFindings.some((finding) => finding.category === "LARGE_FILE")) process.exitCode = 1;
