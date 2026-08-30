export type ClickableLineActionType = "postback" | "message" | "uri" | "datetimepicker" | "other";

export interface LineActionInventoryEntry {
  path: string;
  type: ClickableLineActionType;
  label: string;
  text: string | null;
  displayText: string | null;
  data: string | null;
  routingAction: string | null;
  uri: string | null;
  visibleFeedback: boolean;
  feedbackMode: "displayText" | "messageText" | "alternate_flow_required" | "missing";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function actionType(value: unknown): ClickableLineActionType | null {
  if (value === "postback" || value === "message" || value === "uri" || value === "datetimepicker") return value;
  return null;
}

function routingAction(data: string | null): string | null {
  if (!data) return null;
  try {
    return new URLSearchParams(data).get("action");
  } catch {
    return null;
  }
}

function inspectAction(value: Record<string, unknown>, path: string): LineActionInventoryEntry {
  const type = actionType(value.type) ?? "other";
  const label = stringValue(value.label) ?? "";
  const text = stringValue(value.text);
  const displayText = stringValue(value.displayText);
  const data = stringValue(value.data);
  const uri = stringValue(value.uri);
  if (type === "postback") {
    return {
      path,
      type,
      label,
      text,
      displayText,
      data,
      routingAction: routingAction(data),
      uri,
      visibleFeedback: Boolean(displayText),
      feedbackMode: displayText ? "displayText" : "missing",
    };
  }
  if (type === "message") {
    return {
      path,
      type,
      label,
      text,
      displayText,
      data,
      routingAction: null,
      uri,
      visibleFeedback: Boolean(text),
      feedbackMode: text ? "messageText" : "missing",
    };
  }
  if (type === "uri") {
    return {
      path,
      type,
      label,
      text,
      displayText,
      data,
      routingAction: null,
      uri,
      // URI actions cannot create a LINE user bubble.  The caller must prove
      // an earlier visible Postback/message step in its flow.
      visibleFeedback: false,
      feedbackMode: "alternate_flow_required",
    };
  }
  return {
    path,
    type,
    label,
    text,
    displayText,
    data,
    routingAction: null,
    uri,
    visibleFeedback: false,
    feedbackMode: "missing",
  };
}

/** Collect every nested LINE action from Flex and Quick Reply payloads. */
export function collectLineActions(value: unknown): LineActionInventoryEntry[] {
  const entries: LineActionInventoryEntry[] = [];

  function visit(current: unknown, path: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const record = asRecord(current);
    if (!record) return;
    if (actionType(record.type)) {
      entries.push(inspectAction(record, path));
      return;
    }
    Object.entries(record).forEach(([key, child]) => visit(child, `${path}.${key}`));
  }

  visit(value, "root");
  return entries;
}

export function hasInternalVisibleTextLeak(value: string | null): boolean {
  if (!value) return false;
  return /^(?:action=|menu_|ambient_|quick_record_|correction_|reliability_|ai_(?:preset|custom|followup)|candidate=|page=)/iu.test(value)
    || /(?:^|[?&])(?:action|candidate|page)=/iu.test(value);
}

export function actionTypeCounts(entries: LineActionInventoryEntry[]): Record<ClickableLineActionType, number> {
  return entries.reduce<Record<ClickableLineActionType, number>>((counts, entry) => {
    counts[entry.type] += 1;
    return counts;
  }, { postback: 0, message: 0, uri: 0, datetimepicker: 0, other: 0 });
}
