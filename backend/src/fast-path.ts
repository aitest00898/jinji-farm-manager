import { parseCommand, type ParsedCommand } from "./core";
import { hasSelfMention, stripSelfMention, type AmbientMentionee } from "./ambient";
import { navigationActionForText, parseLinePostback } from "./line-menu";

/**
 * The deliberately small public event shape used by the Fast Path classifier.
 * It is kept independent from the Worker handler's private webhook type so
 * the allowlist can be unit-tested without importing the whole Worker.
 */
export interface FastPathEvent {
  type: string;
  message?: {
    type?: string;
    text?: string;
    mention?: { mentionees?: AmbientMentionee[] };
  };
  postback?: { data?: string };
}
export type FastPathAction = "menu_home" | "menu_more" | "menu_help";
export type FastPathResponseKind = "main_menu" | "more_menu" | "help";

export interface FastPathDecision {
  eligible: boolean;
  action: FastPathAction | null;
  responseKind: FastPathResponseKind | null;
  reason: string;
  source: "message" | "postback" | "none";
}

const denied = (reason: string, source: FastPathDecision["source"] = "none"): FastPathDecision => ({
  eligible: false,
  action: null,
  responseKind: null,
  reason,
  source,
});

function allowed(action: FastPathAction, source: "message" | "postback", reason: string): FastPathDecision {
  return {
    eligible: true,
    action,
    responseKind: action === "menu_home" ? "main_menu" : action === "menu_more" ? "more_menu" : "help",
    reason,
    source,
  };
}

function actionFromCommand(command: ParsedCommand): FastPathDecision | null {
  if (command.kind === "menu") return allowed("menu_home", "message", "exact_public_menu_command");
  if (command.kind === "menu_help") return allowed("menu_help", "message", "exact_static_help_command");
  return null;
}

function messageBusinessText(event: FastPathEvent): string {
  const text = event.message?.text ?? "";
  const mentionees = event.message?.mention?.mentionees;
  return hasSelfMention(mentionees) ? stripSelfMention(text, mentionees) : text.trim();
}

/**
 * Classify only fixed public navigation/help actions.
 *
 * This function is intentionally default-deny.  It does not inspect D1,
 * Candidate state, AI, admin sessions, or free-form semantics.  Any action
 * not explicitly proven to be fixed and read-only remains on the reliable
 * Queue path.
 */
export function classifyLineFastPath(event: FastPathEvent): FastPathDecision {
  if (event.type === "postback") {
    const parsed = parseLinePostback(event.postback?.data ?? "");
    if (!parsed) return denied("invalid_or_unknown_postback", "postback");
    const entries = [...parsed.params.entries()];
    const onlyAction = entries.length === 1 && entries[0]?.[0] === "action";
    if (!onlyAction) return denied("postback_has_stateful_parameters", "postback");
    if (parsed.action === "menu_home") return allowed("menu_home", "postback", "allowlisted_public_navigation");
    if (parsed.action === "menu_more") return allowed("menu_more", "postback", "allowlisted_public_navigation");
    if (parsed.action === "menu_help") return allowed("menu_help", "postback", "allowlisted_static_help");
    return denied("postback_not_in_fast_path_allowlist", "postback");
  }

  if (event.type !== "message" || event.message?.type !== "text") return denied("event_type_not_fast_path");
  const text = messageBusinessText(event);
  if (!text) return denied("empty_message", "message");

  const commandDecision = actionFromCommand(parseCommand(text));
  if (commandDecision) return commandDecision;

  const navigation = navigationActionForText(text);
  if (navigation === "menu_home") return allowed("menu_home", "message", "exact_public_navigation");
  if (navigation === "menu_more") return allowed("menu_more", "message", "exact_public_navigation");
  return denied("message_not_in_fast_path_allowlist", "message");
}
