import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  developmentAmbientAuthorization,
  maskedDevelopmentReference,
  parseDevelopmentAmbientCommand,
} from "./ambient-dev";

describe("development Ambient command surface", () => {
  it.each([
    ["開發指令", "help"],
    ["開發摘要 開始", "start"],
    ["開發摘要 鎖定", "lock"],
    ["開發摘要 狀態", "status"],
    ["開發摘要 試跑", "dry_run"],
    ["開發摘要 重跑", "rerun"],
    ["開發摘要 結果", "result"],
    ["開發摘要 全流程", "full_flow"],
    ["確認開發摘要全流程", "confirm_full_flow"],
    ["開發摘要 結束", "end"],
  ] as const)("routes only the exact normalized command: %s", (input, expected) => {
    expect(parseDevelopmentAmbientCommand(input)).toBe(expected);
  });

  it.each([
    "bare 開發摘要 試跑",
    "@Bot 開發摘要 試跑",
    "我今天在開發摘要功能",
    "開發摘要 試跑一下",
    "開發摘要",
  ])("does not fuzzy-match ordinary or unstripped text: %s", (input) => {
    expect(parseDevelopmentAmbientCommand(input)).toBeNull();
  });
});

describe("development Ambient authorization", () => {
  const env = {
    DB: {} as D1Database,
    DEV_COMMANDS_ENABLED: "true",
    DEV_AMBIENT_GROUP_ALLOWLIST: "group-dev,group-other",
    DEV_AMBIENT_ACTOR_ALLOWLIST: "actor-dev actor-other",
  };

  it("requires the feature flag and both exact allowlists", () => {
    expect(developmentAmbientAuthorization({ ...env, DEV_COMMANDS_ENABLED: "false" }, "group-dev", "actor-dev")).toMatchObject({ authorized: false, reason: "disabled" });
    expect(developmentAmbientAuthorization({ ...env, DEV_AMBIENT_GROUP_ALLOWLIST: "" }, "group-dev", "actor-dev")).toMatchObject({ authorized: false, reason: "incomplete_allowlist" });
    expect(developmentAmbientAuthorization(env, "group-no", "actor-dev")).toMatchObject({ authorized: false, reason: "group_not_allowed" });
    expect(developmentAmbientAuthorization(env, "group-dev", "actor-no")).toMatchObject({ authorized: false, reason: "actor_not_allowed" });
  });

  it("authorizes only the exact development group and actor pair", () => {
    expect(developmentAmbientAuthorization(env, "group-dev", "actor-dev")).toMatchObject({ enabled: true, authorized: true, reason: "enabled" });
  });
});

describe("development Ambient safe references", () => {
  it("does not expose full session or opaque actor identifiers", () => {
    expect(maskedDevelopmentReference("ambient-dev-1234567890")).toBe("ambi…7890");
    expect(maskedDevelopmentReference("U1234567890abcdef")).not.toBe("U1234567890abcdef");
    expect(maskedDevelopmentReference(null)).toBe("未設定");
  });
});

describe("development Ambient side-effect boundaries", () => {
  it("keeps the cohort migration metadata-only and retention-neutral", () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../migrations/0036_ambient_dev_debug_workflow.sql"), "utf8");
    expect(migration).toContain("ambient_dev_cohort_sources");
    expect(migration).toContain("source_message_id");
    expect(migration).not.toMatch(/raw_text\s+TEXT|prompt\s+TEXT|completion\s+TEXT|reasoning\s+TEXT/iu);
    expect(migration).not.toMatch(/UPDATE\s+ambient_chat_buffer|DELETE\s+FROM\s+ambient_chat_buffer/iu);
    expect(migration).toContain("dev_dry_run");
    expect(migration).toContain("dev_commit");
  });

  it("keeps semantic observability additive and content-free", () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../migrations/0037_ambient_dev_semantic_observability.sql"), "utf8");
    const sql = migration.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
    expect(migration).toContain("ALTER TABLE ambient_digest_runs ADD COLUMN dev_semantic_summary_json TEXT");
    expect(sql).not.toMatch(/raw_(?:text|completion)|prompt_(?:text|json)|reasoning|secret|user_id|group_id/iu);
    expect(sql).not.toMatch(/UPDATE\\s+ambient_chat_buffer|DELETE\\s+FROM\\s+ambient_chat_buffer/iu);
  });

  it("keeps development command replies on the no-push path", () => {
    const source = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");
    expect(source).toContain("allowPushFallback: false");
    expect(source).toContain("if (!mentionedSelf)");
    expect(source).toContain("parseDevelopmentAmbientCommand(businessText)");
  });

  it("does not expose development commands through the public menu", () => {
    const menu = readFileSync(resolve(import.meta.dirname, "line-menu.ts"), "utf8");
    expect(menu).not.toContain("開發摘要");
    expect(menu).not.toContain("確認開發摘要全流程");
  });

  it("keeps dry-run and commit as explicit execution modes on the shared core", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient.ts"), "utf8");
    expect(source).toContain('"normal" | "dev_dry_run" | "dev_commit"');
    expect(source).toContain("if (isDevDryRun) return emptyFailureRetention");
    expect(source).toContain("if (isDevDryRun) {");
    expect(source).toContain("await completeDryRun(reconciledBundle)");
  });

  it("keeps legacy trigger storage while exposing an unambiguous effective dev trigger", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient-dev.ts"), "utf8");
    expect(source).toContain("CASE WHEN execution_mode = 'normal' THEN trigger_type ELSE execution_mode END AS triggerType");
    expect(source).toContain("AI候選：");
    expect(source).toContain("devSemanticSummaryJson");
    expect(source).not.toContain("｜候選：");
  });

  it("separates rerun short summary from the read-only full result", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient-dev.ts"), "utf8");
    expect(source).toContain("function formatRerunSummary(row: DevRunRow | null)");
    expect(source).toContain('responseStyle === "short" ? formatRerunSummary(row) : formatRunResult(row)');
    expect(source).toContain('command === "rerun" ? "short" : "full"');
    expect(source).toContain("查看完整診斷：@Bot 開發摘要 結果");
    expect(source).toContain("沒有建立候選、沒有消耗訊息、沒有寫入正式資料。");
  });

  it("keeps result read-only and correlates rerun output to the returned durable run", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient-dev.ts"), "utf8");
    expect(source).toContain("async function loadRunById(env: AmbientDevelopmentEnv, sessionId: string, runId: string)");
    expect(source).toContain("loadRunById(env, session.sessionId, result.runId) ?? await loadLatestRun");
    expect(source).toContain('if (command === "result") return formatRunResult(session ? await loadLatestRun(env, session.sessionId) : null);');
    expect(source).not.toContain('if (command === "result") return runLockedCohort');
  });

  it("renders allowlisted JSON syntax diagnostics without raw response content", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient-dev.ts"), "utf8");
    expect(source).toContain("JSON語法診斷：");
    expect(source).toContain("位置區段：");
    expect(source).toContain("鄰近字元類型：");
    expect(source).toContain("JSON結構診斷：");
    expect(source).toContain("JSON掃描計數：");
    expect(source).toContain("JSON_PARSE_ERROR_CODES");
    expect(source).not.toContain("completion preview");
  });
});
