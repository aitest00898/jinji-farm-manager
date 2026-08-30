import type {
  AmbientCandidate,
  AmbientCandidateConflictEvidence,
  AmbientCandidateEvidence,
} from "./ambient";
import type { ConversationV2Goal, ConversationV2SemanticMemory, ConversationV2Topic } from "./conversation-v2";

export interface GroundedResponseInput {
  goal: ConversationV2Goal;
  topic: ConversationV2Topic | null;
  candidate: AmbientCandidate;
  conflictEvidence?: AmbientCandidateConflictEvidence | null;
  evidence?: AmbientCandidateEvidence[];
  memory?: ConversationV2SemanticMemory | null;
}

function eventLabel(candidate: AmbientCandidate): string {
  return candidate.items.map((item) => {
    const label = item.type === "mortality" ? "死亡" : item.type === "cull" ? "淘汰" : item.raw;
    return item.quantity === null ? `${label}（數量待確認）` : `${label}${item.quantity}`;
  }).join("、") || "尚未辨識事件";
}

function blockerLabel(candidate: AmbientCandidate): string {
  const uncertainty = candidate.uncertainties ?? [];
  const farmResolved = Boolean(candidate.resolution?.resolvedFarmId);
  const houseResolved = Boolean(candidate.resolution?.resolvedHouseId);
  const flockResolved = Boolean(candidate.resolution?.resolvedFlockId);
  if (!farmResolved) return "雞場";
  if (uncertainty.some((item) => /house|舍/u.test(item)) || (candidate.houseText && !houseResolved)) return "舍別";
  if (uncertainty.some((item) => /flock|batch|批次/u.test(item)) || (candidate.flockText && !flockResolved)) return "批次";
  if (candidate.items.some((item) => item.type !== "abnormal" && item.quantity === null)) return "數量";
  return "最後確認";
}

function factLines(candidate: AmbientCandidate): string[] {
  return [
    `事件：${eventLabel(candidate)}`,
    `雞場：${candidate.farmText ?? "尚未確定"}`,
    `舍別：${candidate.houseText ?? "未提供或尚未確定"}`,
    `批次：${candidate.flockText ?? "未提供或尚未確定"}`,
  ];
}

function caretakerClues(candidate: AmbientCandidate, evidence: AmbientCandidateEvidence[]): string[] {
  const fromCandidate = candidate.caretakerClues ?? (candidate.caretakerText ? [candidate.caretakerText] : []);
  const fromEvidence = evidence
    .filter((item) => item.evidenceType === "caretaker_clue" && typeof item.normalizedValue === "string")
    .map((item) => item.normalizedValue as string);
  return [...new Set([...fromCandidate, ...fromEvidence].map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}

function explainConflict(candidate: AmbientCandidate, conflict: AmbientCandidateConflictEvidence | null | undefined, evidence: AmbientCandidateEvidence[]): string[] {
  const clues = caretakerClues(candidate, evidence);
  if (!conflict && !candidate.conflict && !candidate.conflictText) {
    return ["目前沒有找到需要另外解釋的衝突。", `下一步只需要${blockerLabel(candidate)}。`];
  }
  if (!conflict) {
    return [
      `目前只保留到「${candidate.conflictText ?? "資料有不同說法"}」這個結果，沒有足夠的原始證據可可靠還原是哪兩項內容不一致。`,
      "我不會自行補猜缺少的姓名或資料；如果要繼續，請直接指定要採用的內容。",
    ];
  }
  if (conflict.type === "caretaker_farm_mismatch") {
    const clueText = clues.length ? clues.map((value) => `「${value}」`).join("、") : "飼養者線索（姓名證據未完整保存）";
    const assigned = conflict.dbFacts.assignedFarms?.length
      ? conflict.dbFacts.assignedFarms.join("、")
      : "目前沒有有效的雞場關聯";
    const selectedFarm = conflict.facts.selectedFarm ?? candidate.farmText ?? "尚未確定";
    const relation = conflict.dbFacts.activeCaretakerAssignment
      ? `資料中的有效關聯指向：${assigned}。`
      : `資料中查不到這些線索與任何有效雞場的關聯。`;
    const consequence = conflict.blocking
      ? `目前因此還不能安全完成雞場解析，下一步是確認${blockerLabel(candidate)}。`
      : "這個差異不會阻止死亡紀錄；合法雞場已由你明確指定，死亡數量與雞場仍可照既有安全流程繼續確認。";
    return [
      `原始聊天保留了${clueText}，所以系統把它當成飼養者線索。`,
      `你目前指定的雞場是「${selectedFarm}」；${relation}`,
      "兩邊不一致的原因，是聊天線索與目前雞場的飼養者關聯無法互相印證。",
      "飼養者不是死亡正式紀錄的必要欄位，因此它屬於線索，不會取代你明確選定的合法雞場。",
      consequence,
    ];
  }
  const reason = conflict.dbFacts.assignedFarms?.length
    ? `資料關聯顯示：${conflict.dbFacts.assignedFarms.join("、")}`
    : "目前資料沒有足夠的關聯可互相印證";
  return [
    `這筆資料的來源之間有不同說法（${candidate.conflictText ?? conflict.type}）。`,
    reason + "。",
    conflict.businessRule.caretakerRequiredForMortality
      ? "依目前資料規則，這個欄位是完成紀錄前需要確認的條件。"
      : "這個線索不是死亡正式紀錄的必要欄位。",
    conflict.blocking ? `所以目前真正卡住的是${blockerLabel(candidate)}。` : "因此它目前不會阻止正式紀錄，仍會保留作為來源說明。",
  ];
}

export function composeGroundedCandidateResponse(input: GroundedResponseInput): string {
  const evidence = input.evidence ?? input.candidate.evidence ?? [];
  const conflict = input.conflictEvidence ?? input.candidate.conflictEvidence?.[0] ?? null;
  if (input.goal === "SHOW_STATE") {
    const lines = ["目前這筆我知道：", ...factLines(input.candidate).map((line) => `• ${line}`)];
    const clues = caretakerClues(input.candidate, evidence);
    if (clues.length) lines.push(`• 聊天中有飼養者線索：${clues.join("、")}`);
    if (input.candidate.userOverrides?.caretaker) lines.push(`• 這個線索目前${input.candidate.userOverrides.caretaker.status === "dismissed" ? "已被忽略" : "已由你的明確選擇覆蓋"}`);
    if (input.candidate.reconciliation?.status === "possibly_recorded") lines.push("• 與正式紀錄相似度較高，目前仍要確認是否同一筆");
    if (input.candidate.reconciliation?.status === "already_recorded") lines.push("• 已有高信心的正式紀錄相符，不會直接重複新增");
    lines.push(`目前還需要：${blockerLabel(input.candidate)}。`);
    if (conflict && !conflict.blocking) lines.push("另外有一個不影響死亡紀錄的線索差異，我可以再說明原因。");
    return lines.join("\n");
  }
  if (input.goal === "ADVISE") {
    return [
      "如果你現在先不處理，可以有這幾個選擇：",
      "• 取消：不新增正式紀錄，這批原始訊息不會重新整理成同一筆。",
      "• 稍後處理：保留這筆待確認資訊，之後再回來處理。",
      "• 修改：只改你指定的欄位，其他已知資料會保留。",
      "• 繼續確認：補齊真正缺少的資料後，再進入正式確認。",
      "這只是說明選項；我目前沒有替你取消、修改或寫入資料。",
    ].join("\n");
  }
  if (input.goal === "EXPLAIN" || input.goal === "COMPARE" || input.goal === "ANALYZE" || input.goal === "QUERY") {
    const heading = input.topic === "candidate_consequence"
      ? "這個提示對正式紀錄的影響"
      : input.topic === "candidate_blockers"
        ? "目前真正卡住的原因"
        : "這筆資料哪裡需要說明";
    return [heading, ...explainConflict(input.candidate, conflict, evidence)].join("\n");
  }
  return `目前我知道${eventLabel(input.candidate)}；如果你要修改，請直接說明要改哪一項。`;
}
