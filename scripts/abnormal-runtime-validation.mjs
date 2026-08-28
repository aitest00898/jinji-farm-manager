import { randomBytes, pbkdf2Sync } from "node:crypto";
import { spawn } from "node:child_process";

const port = String(8830 + Math.floor(Math.random() * 20));
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
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { body = { raw }; }
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
  const suffix = Date.now().toString(36);
  const login = await request("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password }) });
  const token = typeof login.body.token === "string" ? login.body.token : "";
  const authHeaders = { authorization: `Bearer ${token}` };
  check("WEB_LOGIN", login.response.status === 200 && Boolean(token));

  const farm = await request("/api/farms", { method: "POST", headers: authHeaders, body: JSON.stringify({ name: `異常紀錄本機測試場-${suffix}`, environment: "test", structureMode: "multi_house" }) });
  const farmId = farm.body.farm?.id;
  check("TEST_FARM_CREATE", farm.response.status === 201 && typeof farmId === "string");
  const house = await request("/api/houses", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, name: "異常測試舍" }) });
  const houseId = house.body.house?.id;
  check("HOUSE_CREATE", house.response.status === 201 && typeof houseId === "string");
  const flock = await request("/api/flocks", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, batchCode: `ABNORMAL-${suffix}`, chickInDate: "2026-08-19", initialCount: 1000, expectedShipmentDate: "2026-11-19" }) });
  const flockId = flock.body.flock?.id;
  check("FLOCK_CREATE", flock.response.status === 201 && typeof flockId === "string");

  const missingFarm = await request("/api/abnormal-events", { method: "POST", headers: authHeaders, body: JSON.stringify({ rawText: "咳嗽" }) });
  check("ABNORMAL_REQUIRES_FARM", missingFarm.response.status === 400 && missingFarm.body.error === "invalid_abnormal_event");
  const event = await request("/api/abnormal-events", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, flockId, rawText: "咳嗽" }) });
  const abnormalId = event.body.id;
  check("ABNORMAL_RAW_INSERT", event.response.status === 201 && typeof abnormalId === "string" && event.body.rawText === "咳嗽");

  const list = await request(`/api/abnormal-events?farmId=${encodeURIComponent(farmId)}&limit=10`, { headers: authHeaders });
  const listed = list.body.abnormalEvents?.find((row) => row.id === abnormalId);
  check("ABNORMAL_READBACK", list.response.status === 200 && listed?.rawText === "咳嗽" && listed?.houseId === houseId && listed?.flockId === flockId);
  const timeline = await request(`/api/timeline?farmId=${encodeURIComponent(farmId)}&limit=10`, { headers: authHeaders });
  check("TIMELINE_READBACK", timeline.response.status === 200 && timeline.body.timeline?.some((row) => row.id === abnormalId && row.itemType === "abnormal"));
  const weather = await request(`/api/weather?farmId=${encodeURIComponent(farmId)}&limit=10`, { headers: authHeaders });
  check("WEATHER_ENDPOINT_READONLY", weather.response.status === 200 && Array.isArray(weather.body.weather));
  const liveStatus = await request("/api/ai/live-status", { headers: authHeaders });
  check("AI_LIVE_STATUS_READONLY", liveStatus.response.status === 200 && liveStatus.body.aiInvoked === false);

  const correctionEvent = await request("/api/abnormal-events", { method: "POST", headers: authHeaders, body: JSON.stringify({ farmId, houseId, flockId, rawText: "咳嗽已改善" }) });
  const correctionId = correctionEvent.body.id;
  const correction = await request(`/api/abnormal-events/${encodeURIComponent(correctionId)}/correct`, { method: "POST", headers: authHeaders, body: JSON.stringify({ rawText: "咳嗽已改善，持續觀察" }) });
  check("ABNORMAL_CORRECTION_REASON_OPTIONAL", correctionEvent.response.status === 201 && correction.response.status === 201 && typeof correction.body.correctedId === "string");
  const reversal = await request(`/api/abnormal-events/${encodeURIComponent(abnormalId)}/reverse`, { method: "POST", headers: authHeaders, body: JSON.stringify({}) });
  check("ABNORMAL_REVERSAL_REASON_OPTIONAL", reversal.response.status === 200 && reversal.body.reversed === true);
  const after = await request(`/api/abnormal-events?farmId=${encodeURIComponent(farmId)}&limit=10`, { headers: authHeaders });
  check("ABNORMAL_ACTIVE_EFFECT_CLEARED", after.response.status === 200 && after.body.abnormalEvents?.find((row) => row.id === abnormalId)?.status === "reversed");
  const audit = await request(`/api/audit?limit=100`, { headers: authHeaders });
  check("ABNORMAL_AUDIT_READBACK", audit.response.status === 200 && audit.body.auditLogs?.some((row) => row.entityId === abnormalId));

  const close = await request(`/api/flocks/${encodeURIComponent(flockId)}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ version: flock.body.flock.version, status: "closed" }) });
  check("FLOCK_CLOSE", close.response.status === 200);
  const freshFarm = await request(`/api/farms/${encodeURIComponent(farmId)}`, { headers: authHeaders });
  const archive = await request(`/api/farms/${encodeURIComponent(farmId)}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ version: freshFarm.body.farm.version, active: false }) });
  check("TEST_FARM_SOFT_ARCHIVE", archive.response.status === 200 && archive.body.farm.active === false);

  const passed = checks.filter(Boolean).length;
  console.log(`ABNORMAL_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`ABNORMAL_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => { console.error(`ABNORMAL_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }).finally(() => { child.kill("SIGTERM"); });
