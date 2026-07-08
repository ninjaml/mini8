export function resolveWorkspaceMessageTarget(content, agentOptions, fallbackSessionId) {
  const raw = String(content || "");
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("@")) {
    return {
      sessionId: fallbackSessionId || "",
      content: raw.trim(),
      mentionName: null,
    };
  }

  const mentionMatch = trimmed.match(/^@([^\s@]+)\s*(.*)$/s);
  if (!mentionMatch) {
    return {
      sessionId: fallbackSessionId || "",
      content: raw.trim(),
      mentionName: null,
    };
  }

  const mentionName = mentionMatch[1];
  const remainder = mentionMatch[2] ?? "";
  const matchedOption = (agentOptions || []).find((option) => option.name === mentionName);

  if (!matchedOption) {
    return {
      sessionId: fallbackSessionId || "",
      content: raw.trim(),
      mentionName,
    };
  }

  return {
    sessionId: matchedOption.sessionId,
    content: remainder.trimStart(),
    mentionName,
  };
}

export function extractTrailingWorkspaceMention(content) {
  const raw = String(content || "");
  const match = raw.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;

  return {
    query: match[2] || "",
    before: raw.slice(0, match.index),
    separator: match[1] || "",
  };
}

export function applyWorkspaceMention(content, mentionName) {
  const raw = String(content || "");
  const match = extractTrailingWorkspaceMention(raw);
  if (!match) {
    return `@${mentionName} `;
  }

  return `${match.before}${match.separator}@${mentionName} `;
}
