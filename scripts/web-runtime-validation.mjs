import { randomBytes, pbkdf2Sync } from "node:crypto";
import { spawn } from "node:child_process";

const port = String(8790 + Math.floor(Math.random() * 20));
const base = `http://127.0.0.1:${port}`;
const cwd = new URL("..", import.meta.url).pathname;
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, 100000, 32, "sha256");
const verifier = `pbkdf2-sha256$100000$${salt.toString("base64")}$${derived.toString("base64")}`;
const child = spawn("npx", ["wrangler", "dev", "--local", "--port", port, "--var", `FARM_ADMIN_PASSWORD_HASH:${verifier}`], {
  cwd,
  stdio: ["ignore", "ignore", "ignore"],
});
const checks = [];

function check(name, pass) {
  checks.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", "http://localhost:5173");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { text }; }
  return { response, body };
}

async function waitForWorker() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("local_worker_timeout");
}

async function main() {
  await waitForWorker();
  const before = await request("/api/web/auth/session");
  check("SESSION_REQUIRES_LOGIN", before.response.status === 200 && before.body.authenticated === false);

  const disallowed = await fetch(`${base}/api/dashboard`, { headers: { origin: "https://not-allowed.example" } });
  check("CORS_ALLOWLIST", disallowed.status === 403);

  const login = await request("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password }) });
  const token = typeof login.body.token === "string" ? login.body.token : "";
  check("WEB_LOGIN", login.response.status === 200 && Boolean(token));
  const authHeaders = { authorization: `Bearer ${token}` };

  const dashboard = await request("/api/dashboard", { headers: authHeaders });
  check("DASHBOARD_READ", dashboard.response.status === 200 && dashboard.body.counts?.productionFarms === 8);
  const finance = await request("/api/finance", { headers: authHeaders });
  check("FINANCE_READ", finance.response.status === 200 && Number(finance.body.totals?.allocated) === 434838.6 && Number(finance.body.totals?.expense) === 5500 && Number(finance.body.totals?.net) === 429338.6);

  const session = await request("/api/web/auth/session", { headers: authHeaders });
  check("SESSION_REUSE_FOR_MANAGEMENT", session.response.status === 200 && session.body.authenticated === true && !("privileged" in session.body));
  const legacyAuthorize = await request("/api/web/auth/authorize", { method: "POST", headers: authHeaders, body: JSON.stringify({ password }) });
  check("REPEATED_PASSWORD_ENDPOINT_REMOVED", legacyAuthorize.response.status === 404);

  const suffix = Date.now().toString(36);
  const caretaker = await request("/api/caretakers", { method: "POST", headers: authHeaders, body: JSON.stringify({ name: `本機驗證飼養者-${suffix}` }) });
  check("CARETAKER_CREATE", caretaker.response.status === 201);
  const farm = await request("/api/farms", { method: "POST", headers: authHeaders, body: JSON.stringify({ name: `本機驗證測試場-${suffix}`, environment: "test", structureMode: "multi_house" }) });
  const farmId = farm.body.farm?.id;
  check("TEST_FARM_CREATE", farm.response.status === 201 && typeof farmId === "string");
  const house = await request("/api/houses", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, name: "驗證1舍" }) });
  const houseId = house.body.house?.id;
  check("HOUSE_CREATE", house.response.status === 201 && typeof houseId === "string");
  const flock = await request("/api/flocks", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, batchCode: `WEB-${suffix}`, chickInDate: "2026-08-19", initialCount: 1000, expectedShipmentDate: "2026-11-19" }) });
  const flockId = flock.body.flock?.id;
  check("FLOCK_CREATE", flock.response.status === 201 && typeof flockId === "string");
  const event = await request("/api/operational-events", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, flockId, intent: "mortality", quantity: 5, unit: "隻", eventDate: "2026-08-20" }) });
  const eventId = event.body.event?.id;
  check("OPERATIONAL_EVENT_CREATE", event.response.status === 201 && typeof eventId === "string");
  const events = await request("/api/operational-events?limit=100", { headers: authHeaders });
  check("EVENT_READBACK", events.response.status === 200 && events.body.events?.some((row) => row.id === eventId));
  const eventPage = await request("/api/operational-events?limit=1", { headers: authHeaders });
  const eventPage2 = eventPage.body.nextCursor ? await request(`/api/operational-events?limit=1&cursor=${encodeURIComponent(eventPage.body.nextCursor)}`, { headers: authHeaders }) : { response: { status: 200 }, body: { events: [] } };
  check("EVENT_CURSOR_PAGINATION", eventPage.response.status === 200 && eventPage.body.nextCursor && eventPage2.response.status === 200);
  const mortalityChart = await request(`/api/charts/mortality?from=2026-08-20&to=2026-08-20&farmId=${encodeURIComponent(farmId)}`, { headers: authHeaders });
  check("CHART_MORTALITY_D1_AGGREGATION", mortalityChart.response.status === 200 && mortalityChart.body.series?.some((point) => Number(point.value) === 5));
  const stockChart = await request(`/api/charts/stock?from=2026-08-20&to=2026-08-20&farmId=${encodeURIComponent(farmId)}&houseId=${encodeURIComponent(houseId)}&flockId=${encodeURIComponent(flockId)}`, { headers: authHeaders });
  check("CHART_DERIVED_STOCK", stockChart.response.status === 200 && Number(stockChart.body.series?.[0]?.value) === 995);
  const rateChart = await request(`/api/charts/mortality-rate?from=2026-08-20&to=2026-08-20&farmId=${encodeURIComponent(farmId)}`, { headers: authHeaders });
  check("CHART_MORTALITY_RATE_DENOMINATOR", rateChart.response.status === 200 && Number(rateChart.body.denominator) === 1000 && Number(rateChart.body.series?.[0]?.value) === 0.5);
  const chartMetrics = ["mortality", "mortality-cumulative", "mortality-rate", "stock", "cull", "cull-cumulative", "feed", "feed-cumulative", "water", "water-cumulative", "shipment", "farm-profit", "portfolio-net"];
  const chartMetricResults = await Promise.all(chartMetrics.map((metric) => request(`/api/charts/${metric}?from=2026-08-20&to=2026-08-20&farmId=${encodeURIComponent(farmId)}`, { headers: authHeaders })));
  check("CHART_METRIC_WHITELIST_RUNTIME", chartMetricResults.every((result) => result.response.status === 200 && Array.isArray(result.body.series)));
  const health = await request("/api/data-health", { headers: authHeaders });
  check("DATA_HEALTH_READ", health.response.status === 200 && Array.isArray(health.body.checks));
  const correctionEvent = await request("/api/operational-events", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, flockId, intent: "mortality", quantity: 4, unit: "隻", eventDate: "2026-08-20" }) });
  const correctionEventId = correctionEvent.body.event?.id;
  const correction = await request(`/api/operational-events/${encodeURIComponent(correctionEventId)}/correct`, { method: "POST", headers: authHeaders, body: JSON.stringify({ quantity: 2 }) });
  check("CORRECTION_REASON_OPTIONAL", correctionEvent.response.status === 201 && correction.response.status === 201);
  const correctedId = correction.body.eventId;
  check("CORRECTION_CHAIN", correction.response.status === 201 && typeof correctedId === "string");
  const correctedReverse = await request(`/api/operational-events/${encodeURIComponent(correctedId)}/reverse`, { method: "POST", headers: authHeaders, body: JSON.stringify({}) });
  check("CORRECTION_CLEANUP_REVERSAL", correctedReverse.response.status === 200 && correctedReverse.body.reversed === true);
  const reversal = await request(`/api/operational-events/${encodeURIComponent(eventId)}/reverse`, { method: "POST", headers: authHeaders, body: JSON.stringify({}) });
  check("AUDIT_SAFE_REVERSAL", reversal.response.status === 200 && reversal.body.reversed === true);
  const audit = await request("/api/audit?limit=100", { headers: authHeaders });
  check("AUDIT_READBACK", audit.response.status === 200 && audit.body.auditLogs?.some((row) => row.entityId === eventId));
  const auditPage = await request("/api/audit?limit=1", { headers: authHeaders });
  const auditPage2 = auditPage.body.nextCursor ? await request(`/api/audit?limit=1&cursor=${encodeURIComponent(auditPage.body.nextCursor)}`, { headers: authHeaders }) : { response: { status: 200 }, body: { auditLogs: [] } };
  check("AUDIT_CURSOR_PAGINATION", auditPage.response.status === 200 && auditPage.body.nextCursor && auditPage2.response.status === 200);
  check("AUDIT_BEFORE_AFTER_DIFF", audit.body.auditLogs?.some((row) => row.entityId === correctedId && row.before && row.after));

  const flockRow = flock.body.flock;
  const close = await request(`/api/flocks/${encodeURIComponent(flockId)}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ version: flockRow.version, status: "closed" }) });
  check("FLOCK_CLOSE_FOR_CLEANUP", close.response.status === 200);
  const freshFarm = await request(`/api/farms/${encodeURIComponent(farmId)}`, { headers: authHeaders });
  const archive = await request(`/api/farms/${encodeURIComponent(farmId)}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ version: freshFarm.body.farm.version, active: false }) });
  check("SOFT_ARCHIVE_CLEANUP", archive.response.status === 200 && archive.body.farm.active === false);
  const cleanupEvents = await request(`/api/operational-events?farmId=${encodeURIComponent(farmId)}&limit=100`, { headers: authHeaders });
  check("SYNTHETIC_ACTIVE_EVENT_CLEANUP", cleanupEvents.response.status === 200 && cleanupEvents.body.events?.every((row) => Boolean(row.reversedAt)));
  const stale = await request(`/api/farms/${encodeURIComponent(farmId)}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ version: 1, note: "stale" }) });
  check("OPTIMISTIC_CONCURRENCY", stale.response.status === 409 && stale.body.error === "stale_write");
  const logout = await request("/api/web/auth/logout", { method: "POST", headers: authHeaders });
  const afterLogout = await request("/api/dashboard", { headers: authHeaders });
  check("LOGOUT_REVOKES_SESSION", logout.response.status === 200 && afterLogout.response.status === 401);

  const passed = checks.filter(Boolean).length;
  console.log(`WEB_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`WEB_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => { console.error(`WEB_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }).finally(() => { child.kill("SIGTERM"); });
