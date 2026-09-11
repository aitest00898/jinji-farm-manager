import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { handleWebApi } from "../src/web-api.ts";
import { hashWebSessionToken } from "../src/domain.ts";
import { createRecordCommand } from "../src/record-command.ts";
import { RECORDING_TAXONOMY } from "../src/recording-taxonomy.ts";
import {
  canonicalStockProjection,
  persistRecordCommand,
} from "../src/recording-write-adapter.ts";

const root = process.cwd();
const persistTo = fs.mkdtempSync(path.join(os.tmpdir(), "jinji-canonical-write-e2e-"));
const configPath = process.env.CANONICAL_WRITE_E2E_CONFIG || path.join(root, "wrangler.jsonc");
const org = "org-canonical-write-e2e";
const farm = "farm-canonical-write-e2e";
const house = "house-canonical-write-e2e";
const flock = "flock-canonical-write-e2e";
const otherOrg = "org-canonical-write-e2e-other";
const otherFarm = "farm-canonical-write-e2e-other";
const otherHouse = "house-canonical-write-e2e-other";
const otherFlock = "flock-canonical-write-e2e-other";
const sessionToken = "canonical-write-e2e-session-token-000000000000";

function timestamp(offsetSeconds = 0) {
  return new Date(Date.parse("2026-09-08T01:00:00.000Z") + offsetSeconds * 1000).toISOString();
}

function splitSqlStatements(source) {
  const statements = [];
  let statement = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let parentheses = 0;
  let trigger = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        statement += "\n";
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      statement += character;
      if (character === quote && source[index + 1] === quote) {
        statement += source[index + 1];
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      statement += character;
      continue;
    }
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses = Math.max(0, parentheses - 1);
    if (character === ";" && parentheses === 0) {
      const normalized = statement.trim().toUpperCase();
      if (!trigger || /\bEND\s*$/u.test(normalized)) {
        if (normalized) statements.push(statement.trim());
        statement = "";
        trigger = false;
        continue;
      }
    }
    statement += character;
    if (!trigger && /^CREATE\s+TRIGGER\b/u.test(statement.trim().toUpperCase())) trigger = true;
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

function baseRecord(id, taxonomyId, offsetSeconds = 0) {
  const definition = RECORDING_TAXONOMY.find((item) => item.id === taxonomyId);
  assert.ok(definition, taxonomyId);
  return {
    id,
    taxonomyId,
    family: definition.family,
    type: definition.canonicalType,
    subtype: definition.canonicalSubtypes[0],
    occurredAt: "2026-09-08T01:00:00.000Z",
    createdAt: timestamp(offsetSeconds),
    farmId: farm,
    houseId: house,
    flockId: flock,
    sourceChannel: "web",
    rawText: `synthetic ${taxonomyId}`,
    clientOperationId: `client-${id}`,
  };
}

function validRecord(id, taxonomyId, offsetSeconds = 0) {
  const record = baseRecord(id, taxonomyId, offsetSeconds);
  switch (taxonomyId) {
    case "O1":
      return { ...record, maleCount: 600, femaleCount: 400, condition: "good" };
    case "O2":
      return { ...record, subtype: "vaccination", content: "synthetic vaccine" };
    case "O3":
      return { ...record, subtype: "shipment", quantity: 10, sex: "male", totalWeight: 20, weightUnit: "kg" };
    case "O4":
      return { ...record, subtype: "weigh", averageWeight: 1.8, sex: "mixed", weightUnit: "kg", chickInDate: "2026-09-01" };
    case "O5":
      return { ...record, subtype: "feed_order", vendor: "synthetic vendor", weight: 100, weightUnit: "kg" };
    case "O6":
      return { ...record, subtype: "lab_test", submittedAt: "2026-09-08T01:00:00.000Z", content: "synthetic lab", workflowStatus: "waiting_result" };
    case "O7":
      return { ...record, subtype: "disinfection", workflowStatus: "pending" };
    case "O8":
      return { ...record, subtype: "maintenance", maintenanceContent: "synthetic maintenance" };
    case "O9":
      return { ...record, subtype: "mortality", quantity: 5, unit: "隻" };
    case "A1":
      return { ...record, subtype: "mortality_abnormality", extent: "small", linkedMortalityEventId: "e2e-O9" };
    case "A12":
      return { ...record, subtype: "other", extent: "small", detail: "synthetic equipment detail" };
    default:
      return { ...record, subtype: RECORDING_TAXONOMY.find((item) => item.id === taxonomyId).canonicalSubtypes[0], extent: "small" };
  }
}

async function rows(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all();
  return result.results;
}

async function expectReject(label, operation, expectedCode) {
  await assert.rejects(operation, (error) => {
    const message = String(error?.message || error);
    return message.includes(expectedCode);
  }, label);
}

async function apiCall(db, token, pathname, body, origin = "http://localhost:5173") {
  const request = new Request(`https://canonical-write-e2e.test${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await handleWebApi(request, { DB: db });
  const payload = await response.json();
  return { response, payload };
}

async function main() {
  const platform = await getPlatformProxy({ configPath, persist: { path: persistTo }, remoteBindings: false });
  const db = platform.env.DB;
  try {
    const migrationFiles = fs.readdirSync(path.join(root, "migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of migrationFiles) {
      const source = fs.readFileSync(path.join(root, "migrations", name), "utf8");
      for (const statement of splitSqlStatements(source)) await db.prepare(statement).run();
    }
    const seedSql = `
      PRAGMA foreign_keys = ON;
      INSERT INTO organizations (id, name, active) VALUES ('${org}', 'canonical write e2e org', 1);
      INSERT INTO organizations (id, name, active) VALUES ('${otherOrg}', 'canonical write e2e other org', 1);
      INSERT INTO farms (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction, environment, farm_structure_mode)
        VALUES ('${farm}', '${org}', 'canonical write e2e farm', 1, 1, 1, 'test', 'multi_house');
      INSERT INTO farms (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction, environment)
        VALUES ('${otherFarm}', '${otherOrg}', 'canonical write e2e other farm', 1, 1, 1, 'test');
      INSERT INTO line_groups (group_id, status, organization_id, farm_id) VALUES ('group-canonical-write-e2e', 'bound', '${org}', '${farm}');
      INSERT INTO houses (id, farm_id, name, normalized_name) VALUES ('${house}', '${farm}', 'canonical write e2e house', 'canonical-write-e2e-house');
      INSERT INTO houses (id, farm_id, name, normalized_name) VALUES ('${otherHouse}', '${otherFarm}', 'other house', 'other-house');
      INSERT INTO flocks (id, farm_id, house_id, batch_code, chick_in_date, initial_count, status)
        VALUES ('${flock}', '${farm}', '${house}', 'E2E-001', '2026-09-01', 1000, 'active');
      INSERT INTO flocks (id, farm_id, house_id, batch_code, chick_in_date, initial_count, status)
        VALUES ('${otherFlock}', '${otherFarm}', '${otherHouse}', 'OTHER-001', '2026-09-01', 1000, 'active');
    `;
    for (const statement of splitSqlStatements(seedSql)) await db.prepare(statement).run();

    const context = {
      organizationId: org,
      actorType: "system",
      actorId: "canonical-write-e2e",
      requestId: "canonical-write-e2e-request",
      environment: "test",
      expectedSourceChannel: "web",
    };
    const commands = new Map();
    const records = new Map();
    let offset = 1;
    for (const definition of RECORDING_TAXONOMY) {
      const record = validRecord(`e2e-${definition.id}`, definition.id, offset++);
      if (definition.id === "A1") record.linkedMortalityEventId = "e2e-O9";
      const command = createRecordCommand(record);
      const result = await persistRecordCommand({ DB: db }, command, context);
      assert.equal(result.created, true, definition.id);
      assert.equal(result.taxonomyId, definition.id);
      commands.set(definition.id, command);
      records.set(definition.id, record);
    }
    assert.equal(commands.size, 25);

    for (const id of ["O1", "O2", "O3", "A1"]) {
      const replay = await persistRecordCommand({ DB: db }, commands.get(id), context);
      assert.equal(replay.created, false, `idempotency ${id}`);
      assert.equal(replay.id, `e2e-${id}`);
    }
    const changedReplay = createRecordCommand({
      ...validRecord("e2e-O1-replay-with-new-id", "O1", 50),
      maleCount: 999,
      femaleCount: 1,
      clientOperationId: "client-e2e-O1",
    });
    const changedReplayResult = await persistRecordCommand({ DB: db }, changedReplay, context);
    assert.equal(changedReplayResult.created, false);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count, male_count AS maleCount FROM recording_events WHERE organization_id = ? AND client_operation_id = ?", org, "client-e2e-O1"))[0].count, 1);
    assert.equal((await rows(db, "SELECT male_count AS maleCount FROM recording_events WHERE id = 'e2e-O1'"))[0].maleCount, 600);
    const crossDestinationReplay = createRecordCommand({
      ...validRecord("e2e-cross-destination-replay", "A2", 51),
      clientOperationId: "client-e2e-O1",
    });
    await expectReject("cross destination idempotency reuse", () => persistRecordCommand({ DB: db }, crossDestinationReplay, context), "CANONICAL_IDEMPOTENCY_DESTINATION_MISMATCH");

    const o1Correction = {
      ...validRecord("e2e-O1-correction", "O1", 100),
      maleCount: 700,
      femaleCount: 500,
      correctionOfId: "e2e-O1",
      clientOperationId: "client-e2e-O1-correction",
    };
    const o5Correction = {
      ...validRecord("e2e-O5-correction", "O5", 101),
      vendor: "synthetic vendor corrected",
      correctionOfId: "e2e-O5",
      clientOperationId: "client-e2e-O5-correction",
    };
    const o3Correction = {
      ...validRecord("e2e-O3-correction", "O3", 102),
      quantity: 7,
      totalWeight: 14,
      correctionOfId: "e2e-O3",
      clientOperationId: "client-e2e-O3-correction",
    };
    const a2Correction = {
      ...validRecord("e2e-A2-correction", "A2", 103),
      correctionOfId: "e2e-A2",
      clientOperationId: "client-e2e-A2-correction",
    };
    for (const record of [o1Correction, o5Correction, o3Correction, a2Correction]) {
      const result = await persistRecordCommand({ DB: db }, createRecordCommand(record), context);
      assert.equal(result.created, true, `correction ${record.taxonomyId}`);
      assert.equal(result.lineage.kind, "correction");
    }
    const o9Reversal = {
      ...validRecord("e2e-O9-reversal", "O9", 104),
      reversalOfId: "e2e-O9",
      clientOperationId: "client-e2e-O9-reversal",
    };
    const reversalResult = await persistRecordCommand({ DB: db }, createRecordCommand(o9Reversal), context);
    assert.equal(reversalResult.lineage.kind, "reversal");

    const originalO3 = (await rows(db, "SELECT quantity, raw_message, reversed_at, correction_of_event_id FROM operational_events WHERE id = 'e2e-O3'"))[0];
    assert.deepEqual(originalO3, { quantity: 10, raw_message: "synthetic O3", reversed_at: null, correction_of_event_id: null });
    const originalO1 = (await rows(db, "SELECT male_count, female_count, lifecycle_status FROM recording_events WHERE id = 'e2e-O1'"))[0];
    assert.deepEqual(originalO1, { male_count: 600, female_count: 400, lifecycle_status: "active" });
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM operational_events WHERE correction_of_event_id = 'e2e-O3'"))[0].count, 1);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM operational_events WHERE reversal_of_event_id = 'e2e-O9'"))[0].count, 1);

    const projection = await canonicalStockProjection({ DB: db }, org, farm);
    assert.equal(projection.duplicateAuthorityCount, 0);
    assert.equal(projection.currentStockDelta, 1193);
    assert.equal(projection.appliedFactCount, 25);

    const invalidQuantity = validRecord("bad-quantity", "O9");
    delete invalidQuantity.quantity;
    await expectReject("missing required quantity", async () => persistRecordCommand({ DB: db }, createRecordCommand(invalidQuantity), context), "RECORDING_REQUIRED_FIELD:quantity");
    const invalidSubtype = { ...validRecord("bad-subtype", "O2"), subtype: "not-a-subtype" };
    await expectReject("invalid subtype", async () => createRecordCommand(invalidSubtype), "RECORDING_TAXONOMY_UNSUPPORTED");
    const invalidFamily = { ...validRecord("bad-family", "O9"), family: "operational_action" };
    await expectReject("invalid family/type", async () => createRecordCommand(invalidFamily), "RECORDING_TAXONOMY_UNSUPPORTED");
    const wrongScope = createRecordCommand({ ...validRecord("bad-scope", "O9"), farmId: "missing-farm" });
    await expectReject("wrong scope", () => persistRecordCommand({ DB: db }, wrongScope, context), "CANONICAL_SCOPE_INVALID");
    const missingFlock = { ...validRecord("bad-flock", "O1"), flockId: undefined };
    await expectReject("house without required flock", async () => createRecordCommand(missingFlock), "RECORDING_REQUIRED_FIELD:flockId");
    const selfReference = { ...validRecord("bad-self", "O9"), correctionOfId: "bad-self" };
    await expectReject("self reference", async () => createRecordCommand(selfReference), "RECORDING_LINEAGE_SELF_REFERENCE");
    const crossOrgReference = {
      ...validRecord("cross-org-row", "O1"),
      farmId: otherFarm,
      houseId: otherHouse,
      flockId: otherFlock,
      sourceChannel: "web",
      clientOperationId: "cross-org-row-client",
    };
    await db.prepare(
      `INSERT INTO recording_events
        (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, house_id, flock_id, male_count, female_count, total_count, condition, source_channel, raw_text, client_operation_id)
       VALUES (?, ?, 'O1', 'operational_event', 'event', 'chick_in', ?, ?, ?, ?, ?, 1, 1, 2, 'good', 'web', ?, ?)`,
    ).bind("cross-org-row", otherOrg, timestamp(200), timestamp(200), otherFarm, otherHouse, otherFlock, "cross org row", "cross-org-row-client").run();
    const crossOrgCorrection = createRecordCommand({ ...validRecord("bad-cross-org-lineage", "O1", 201), correctionOfId: "cross-org-row" });
    await expectReject("cross organization lineage", () => persistRecordCommand({ DB: db }, crossOrgCorrection, context), "CANONICAL_LINEAGE_REFERENCE_NOT_FOUND");
    const futureLineage = createRecordCommand({ ...validRecord("bad-future-lineage", "O1", 1), correctionOfId: "e2e-O1" });
    await expectReject("future/invalid lineage ordering", () => persistRecordCommand({ DB: db }, futureLineage, context), "RECORDING_LINEAGE_ORDER_INVALID");
    const taxonomyMismatch = createRecordCommand({ ...validRecord("bad-taxonomy-lineage", "O5", 202), correctionOfId: "e2e-O1" });
    await expectReject("cross-destination lineage mismatch", () => persistRecordCommand({ DB: db }, taxonomyMismatch, context), "CANONICAL_LINEAGE_REFERENCE_NOT_FOUND");
    const badA1Link = createRecordCommand({ ...validRecord("bad-a1-link", "A1", 203), linkedMortalityEventId: "missing-mortality" });
    await expectReject("invalid mortality link", () => persistRecordCommand({ DB: db }, badA1Link, context), "CANONICAL_MORTALITY_LINK_INVALID");

    const destinationCounts = await rows(db, `
      SELECT taxonomyId, SUM(count) AS count FROM (
        SELECT taxonomy_id AS taxonomyId, COUNT(*) AS count FROM recording_events WHERE organization_id = ? GROUP BY taxonomy_id
        UNION ALL SELECT taxonomy_id AS taxonomyId, COUNT(*) AS count FROM operational_actions WHERE organization_id = ? GROUP BY taxonomy_id
        UNION ALL SELECT taxonomy_id AS taxonomyId, COUNT(*) AS count FROM operational_events WHERE organization_id = ? AND taxonomy_id IS NOT NULL GROUP BY taxonomy_id
        UNION ALL SELECT taxonomy_id AS taxonomyId, COUNT(*) AS count FROM abnormal_events WHERE organization_id = ? AND taxonomy_id IS NOT NULL GROUP BY taxonomy_id
      ) GROUP BY taxonomyId`, org, org, org, org);
    assert.equal(destinationCounts.length, 25);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM abnormal_events WHERE organization_id = ? AND taxonomy_id = 'A1' AND linked_mortality_event_id = 'e2e-O9'", org))[0].count, 1);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = ? AND entity_type IN ('recording_events', 'operational_actions', 'operational_events', 'abnormal_events')", org))[0].count >= 25, true);

    const tokenHash = await hashWebSessionToken(sessionToken);
    await db.prepare(
      `INSERT INTO web_admin_sessions (id, organization_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    ).bind("session-canonical-write-e2e", org, tokenHash, "2099-01-01T00:00:00.000Z").run();

    const apiIds = ["O1", "O2", "O3", "O4", "O6", "O9", "A1", "A8", "A12", "A16"];
    const apiResults = new Map();
    for (const id of apiIds) {
      const record = validRecord(`api-${id}`, id, 300 + apiResults.size);
      record.clientOperationId = `api-client-${id}`;
      if (id === "A1") record.linkedMortalityEventId = "api-O9";
      if (id === "A12") {
        record.subtype = "other";
        record.detail = "api equipment detail";
      }
      const { response, payload } = await apiCall(db, sessionToken, "/api/records?environment=test", { record });
      assert.equal(response.status, 201, `API ${id}`);
      assert.equal(payload.record.taxonomyId, id);
      apiResults.set(id, payload.record);
    }
    const replayRecord = { ...validRecord("api-O1", "O1", 300), clientOperationId: "api-client-O1" };
    const replayApi = await apiCall(db, sessionToken, "/api/records?environment=test", { record: replayRecord });
    assert.equal(replayApi.response.status, 200);
    assert.equal(replayApi.payload.record.created, false);
    const correctedApi = await apiCall(db, sessionToken, `/api/records/${encodeURIComponent(apiResults.get("O2").id)}/correct?environment=test`, {
      record: { ...validRecord("api-O2-correction", "O2", 320), subtype: "vaccination", content: "api corrected vaccine", clientOperationId: "api-client-O2-correction" },
    });
    assert.equal(correctedApi.response.status, 201);
    assert.equal(correctedApi.payload.record.lineage.kind, "correction");
    const reversedApi = await apiCall(db, sessionToken, `/api/records/${encodeURIComponent(apiResults.get("O9").id)}/reverse?environment=test`, {
      record: { ...validRecord("api-O9-reversal", "O9", 321), subtype: "mortality", clientOperationId: "api-client-O9-reversal" },
    });
    assert.equal(reversedApi.response.status, 201);
    assert.equal(reversedApi.payload.record.lineage.kind, "reversal");
    const legacyCanonicalAbnormal = await apiCall(db, sessionToken, "/api/abnormal-events?environment=test", {
      record: { ...validRecord("api-compat-A8", "A8", 322), clientOperationId: "api-client-compat-A8" },
    });
    assert.equal(legacyCanonicalAbnormal.response.status, 201);
    assert.equal(legacyCanonicalAbnormal.payload.record.destination, "abnormal_events");

    const legacyOperationalCorrection = await apiCall(db, sessionToken, "/api/operational-events?environment=test", {
      farmId: farm,
      houseId: house,
      flockId: flock,
      intent: "feed",
      quantity: 10,
      unit: "kg",
      eventDate: "2026-09-11",
    });
    assert.equal(legacyOperationalCorrection.response.status, 201);
    const legacyOperationalCorrectionId = legacyOperationalCorrection.payload.event.id;
    const legacyOperationalCorrectionResult = await apiCall(db, sessionToken, `/api/operational-events/${encodeURIComponent(legacyOperationalCorrectionId)}/correct?environment=test`, {
      quantity: 12,
      note: "legacy correction",
      clientOperationId: "api-legacy-operational-correction",
    });
    assert.equal(legacyOperationalCorrectionResult.response.status, 201);
    assert.equal(legacyOperationalCorrectionResult.payload.corrected, true);
    assert.equal((await rows(db, "SELECT reversed_at FROM operational_events WHERE id = ?", legacyOperationalCorrectionId))[0].reversed_at, null);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM operational_events WHERE correction_of_event_id = ?", legacyOperationalCorrectionId))[0].count, 1);

    const legacyOperationalReversal = await apiCall(db, sessionToken, "/api/operational-events?environment=test", {
      farmId: farm,
      houseId: house,
      flockId: flock,
      intent: "water",
      quantity: 20,
      unit: "L",
      eventDate: "2026-09-11",
    });
    assert.equal(legacyOperationalReversal.response.status, 201);
    const legacyOperationalReversalId = legacyOperationalReversal.payload.event.id;
    const legacyOperationalReversalResult = await apiCall(db, sessionToken, `/api/operational-events/${encodeURIComponent(legacyOperationalReversalId)}/reverse?environment=test`, {
      reason: "legacy reversal",
      clientOperationId: "api-legacy-operational-reversal",
    });
    assert.equal(legacyOperationalReversalResult.response.status, 200);
    assert.equal(legacyOperationalReversalResult.payload.reversed, true);
    assert.equal((await rows(db, "SELECT reversed_at FROM operational_events WHERE id = ?", legacyOperationalReversalId))[0].reversed_at, null);
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM operational_events WHERE reversal_of_event_id = ?", legacyOperationalReversalId))[0].count, 1);

    const legacyAbnormalCorrection = await apiCall(db, sessionToken, "/api/abnormal-events?environment=test", {
      farmId: farm,
      houseId: house,
      flockId: flock,
      rawText: "咳嗽",
    });
    assert.equal(legacyAbnormalCorrection.response.status, 201);
    const legacyAbnormalCorrectionId = legacyAbnormalCorrection.payload.id;
    const legacyAbnormalCorrectionResult = await apiCall(db, sessionToken, `/api/abnormal-events/${encodeURIComponent(legacyAbnormalCorrectionId)}/correct?environment=test`, {
      rawText: "喘",
      reason: "legacy abnormal correction",
      clientOperationId: "api-legacy-abnormal-correction",
    });
    assert.equal(legacyAbnormalCorrectionResult.response.status, 201);
    assert.equal(legacyAbnormalCorrectionResult.payload.corrected, true);
    assert.equal((await rows(db, "SELECT status FROM abnormal_events WHERE id = ?", legacyAbnormalCorrectionId))[0].status, "active");
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM abnormal_events WHERE correction_of_id = ?", legacyAbnormalCorrectionId))[0].count, 1);

    const legacyAbnormalReversal = await apiCall(db, sessionToken, "/api/abnormal-events?environment=test", {
      farmId: farm,
      houseId: house,
      flockId: flock,
      rawText: "臭腳",
    });
    assert.equal(legacyAbnormalReversal.response.status, 201);
    const legacyAbnormalReversalId = legacyAbnormalReversal.payload.id;
    const legacyAbnormalReversalResult = await apiCall(db, sessionToken, `/api/abnormal-events/${encodeURIComponent(legacyAbnormalReversalId)}/reverse?environment=test`, {
      reason: "legacy abnormal reversal",
      clientOperationId: "api-legacy-abnormal-reversal",
    });
    assert.equal(legacyAbnormalReversalResult.response.status, 200);
    assert.equal(legacyAbnormalReversalResult.payload.reversed, true);
    assert.equal((await rows(db, "SELECT status FROM abnormal_events WHERE id = ?", legacyAbnormalReversalId))[0].status, "active");
    assert.equal((await rows(db, "SELECT COUNT(*) AS count FROM abnormal_events WHERE reversal_of_id = ?", legacyAbnormalReversalId))[0].count, 1);

    const listed = await apiCall(db, sessionToken, "/api/records?environment=test&limit=100");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.records.some((item) => item.taxonomyId === "A16" && item.destination === "abnormal_events"), true);
    assert.equal(Array.isArray(listed.payload.lifecycleSummaries), true);
    assert.equal(listed.payload.lifecycleSummaries.length, 1);
    assert.equal(typeof listed.payload.lifecycleSummaries[0].labSubmission.pendingSubmissionCount, "number");
    assert.equal(typeof listed.payload.lifecycleSummaries[0].labSubmission.hasOverdueLabSubmission, "boolean");
    assert.equal(typeof listed.payload.lifecycleSummaries[0].labSubmission.statusLabel, "string");
    const lifecycle = await apiCall(db, sessionToken, `/api/lifecycle?environment=test&farmId=${farm}&houseId=${house}`);
    assert.equal(lifecycle.response.status, 200);
    assert.equal(lifecycle.payload.lifecycleSummaries.length, 1);
    assert.equal(typeof lifecycle.payload.lifecycleSummaries[0].lifecycleStatus, "string");
    assert.equal(lifecycle.payload.lifecycleSummaries[0].labSubmission.pendingSubmissionCount, 2);
    assert.equal(lifecycle.payload.lifecycleSummaries[0].labSubmission.hasOverdueLabSubmission, true);
    assert.equal(lifecycle.payload.lifecycleSummaries[0].labSubmission.incompleteReason, "OVERDUE_UNRESOLVED_SUBMISSION");

    const unauthenticated = await handleWebApi(new Request("https://canonical-write-e2e.test/api/records?environment=test", { method: "GET" }), { DB: db });
    assert.equal(unauthenticated.status, 401);
    const badOrigin = await apiCall(db, sessionToken, "/api/records?environment=test", validRecord("bad-origin", "O9"), "https://not-allowed.example");
    assert.equal(badOrigin.response.status, 403);
    const defaultProduction = await apiCall(db, sessionToken, "/api/records", { record: validRecord("wrong-default-environment", "O9", 400) });
    assert.equal(defaultProduction.response.status, 400);
    assert.equal(defaultProduction.payload.error, "CANONICAL_ENVIRONMENT_SCOPE_INVALID");

    console.log("CANONICAL_WRITE_LOCAL_D1=PASS");
    console.log("TOTAL_TAXONOMY_CATEGORIES=25");
    console.log("LOCAL_WRITE_E2E=25/25");
    console.log("DESTINATION_ROUTING=25/25");
    console.log("WRONG_DESTINATION=0");
    console.log("DUPLICATE_AUTHORITY=0");
    console.log("APPEND_ONLY_CORRECTION=PASS");
    console.log("IDEMPOTENCY=PASS");
    console.log("LINEAGE=PASS");
    console.log("STOCK_INVARIANT=PASS");
    console.log("WEB_API_CONTRACT=PASS");
    console.log("LEGACY_LINEAGE_ROUTES=PASS");
    console.log("LIFECYCLE_READ_MODEL=PASS");
    console.log("WEB_SECURITY_SCOPE=PASS");
    console.log("NEGATIVE_FAIL_CLOSED=PASS");
  } finally {
    await platform.dispose();
    fs.rmSync(persistTo, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error));
  process.exitCode = 1;
});
