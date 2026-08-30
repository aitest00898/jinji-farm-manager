export type CandidateRepairField = "farm" | "house" | "flock" | "quantity" | "event";

export type CandidateRepairIntent =
  | { kind: "show"; rawText: string }
  | { kind: "cancel"; rawText: string }
  | { kind: "ignore"; rawText: string }
  | { kind: "snooze"; rawText: string }
  | { kind: "confirm"; rawText: string }
  | { kind: "dismiss_clue"; field: "caretaker"; rawText: string }
  | { kind: "select_field"; field?: CandidateRepairField; rawText: string }
  | { kind: "clear_field"; field: CandidateRepairField; rawText: string }
  | { kind: "set_field"; field: CandidateRepairField; value: string; rawText: string }
  | { kind: "unknown"; rawText: string };

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function valueAfter(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  const value = match?.[1]?.trim().replace(/[。！!？?]+$/gu, "");
  return value && value.length <= 200 ? value : null;
}

function stripFieldSuffix(value: string): string {
  return value.replace(/^(?:雞場|鸡场|場|场)\s*/u, "").trim();
}

/**
 * Parse only the small, high-confidence repair vocabulary. It intentionally
 * returns an explicit unknown/select-field result instead of treating an
 * unfamiliar sentence as a new operational event.
 */
export function parseCandidateRepairIntent(input: string): CandidateRepairIntent {
  const rawText = clean(input);
  if (!rawText) return { kind: "unknown", rawText };

  if (/^(?:查看|顯示|显示|看看|目前內容|目前内容|候選內容|候选内容|這筆內容|这笔内容)$/u.test(rawText)) {
    return { kind: "show", rawText };
  }
  if (/^(?:確認紀錄|确认纪录|確認|确认|可以記|可以记|就這筆|就这笔)$/u.test(rawText)) {
    return { kind: "confirm", rawText };
  }
  if (/^(?:忽略|忽略這筆|忽略这笔|先不記|先不记)$/u.test(rawText)) {
    return { kind: "ignore", rawText };
  }
  if (/^(?:稍後|稍后|晚點處理|晚点处理|之後再說|之后再说)$/u.test(rawText)) {
    return { kind: "snooze", rawText };
  }
  if (/(?:取消|算了|這筆不要|这笔不要|不要記這筆|不要记这笔|不要這筆|不要这笔|剛才那筆取消|刚才那笔取消|不記這筆|不记这笔)/u.test(rawText)) {
    return { kind: "cancel", rawText };
  }
  if (/(?:不要管|不管|先不管|忽略).*(?:飼養者|饲养者|照顧者|照顾者|林志騰|林志腾)/u.test(rawText)) {
    return { kind: "dismiss_clue", field: "caretaker", rawText };
  }

  const quantity = valueAfter(rawText, /(?:數量|数量|死亡|淘汰)?\s*(?:不是|改成|改為|改爲|應該是|应该是|其實是|其实是|實際是|实际是)\s*(?:\d+(?:\.\d+)?\s*[，,；;]\s*(?:是|改成|改為|改爲)?\s*)?(\d+(?:\.\d+)?)/u);
  if (quantity) return { kind: "set_field", field: "quantity", value: quantity, rawText };

  const farmFromContrast = valueAfter(rawText, /(?:不是|非)\s*[^，,；;]+[，,；;]\s*(?:是|改成|改為|改爲|換成|换成)\s*(.+)$/u);
  if (farmFromContrast && /(?:場|场|雞場|鸡场)/u.test(farmFromContrast)) {
    return { kind: "set_field", field: "farm", value: stripFieldSuffix(farmFromContrast), rawText };
  }
  const farmFromChange = valueAfter(rawText, /(?:改成|改為|改爲|換成|换成|改到|改到)\s*(.+)$/u);
  if (farmFromChange && /(?:場|场|雞場|鸡场)/u.test(farmFromChange)) {
    return { kind: "set_field", field: "farm", value: stripFieldSuffix(farmFromChange), rawText };
  }
  const farmFromChoice = valueAfter(rawText, /(?:就用|使用|選擇|选择|選定|选定)\s*(.+)$/u);
  if (farmFromChoice && /(?:場|场|雞場|鸡场)/u.test(farmFromChoice)) {
    return { kind: "set_field", field: "farm", value: stripFieldSuffix(farmFromChoice), rawText };
  }
  const farmFromCorrection = valueAfter(rawText, /(?:雞場|鸡场|場|场)\s*(?:選錯|选错|改(?:成|為|爲)?|換成|换成)\s*(?:了)?(?:，|,|；|;)?\s*(?:不是|改成|改為|改爲|是)?\s*(.+)?$/u);
  if (farmFromCorrection && /(?:場|场|雞場|鸡场)/u.test(farmFromCorrection)) {
    return { kind: "set_field", field: "farm", value: stripFieldSuffix(farmFromCorrection), rawText };
  }

  const house = valueAfter(rawText, /(?:改(?:成|為|爲)|換成|换成|舍別|舍别|雞舍|鸡舍)\s*(?:是)?\s*([^，,；;。]+舍)/u);
  if (house) return { kind: "set_field", field: "house", value: house, rawText };

  const flock = valueAfter(rawText, /(?:批次|批號|批号)\s*(?:改成|改為|改爲|是)?\s*([^，,；;。\s]+)/u);
  if (flock) return { kind: "set_field", field: "flock", value: flock, rawText };

  const event = valueAfter(rawText, /(?:事件內容|事件内容|異常內容|异常内容|事件|異常|异常)\s*(?:改成|改為|改爲|是)?\s*(.+)$/u);
  if (event) return { kind: "set_field", field: "event", value: event, rawText };

  const clearField = rawText.match(/^(?:清除|移除|不要)\s*(雞場|鸡场|場|场|舍別|舍别|雞舍|鸡舍|批次|數量|数量|事件|異常|异常)$/u);
  if (clearField) {
    const label = clearField[1];
    const field: CandidateRepairField = /場|场/u.test(label) ? "farm"
      : /舍/u.test(label) ? "house"
        : /批次/u.test(label) ? "flock"
          : /數|数/u.test(label) ? "quantity" : "event";
    return { kind: "clear_field", field, rawText };
  }

  if (/(?:這筆不對|这笔不对|不對|不对|有問題|有问题|改一下|選錯|选错)/u.test(rawText)) {
    const field = /場|场|雞場|鸡场/u.test(rawText) ? "farm"
      : /舍|雞舍|鸡舍/u.test(rawText) ? "house"
        : /批次|批號|批号/u.test(rawText) ? "flock"
          : /數量|数量|死亡|淘汰/u.test(rawText) ? "quantity" : undefined;
    return { kind: "select_field", field, rawText };
  }

  return { kind: "unknown", rawText };
}
