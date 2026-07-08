export function buildRuntimeSessionPayload({
  kind = null,
  agentSessionId = null,
  primaryKey = null,
} = {}) {
  const payload = {};
  if (kind !== null) {
    payload.kind = kind;
  }
  if (agentSessionId !== null) {
    payload.agent_session_id = agentSessionId;
  }
  if (primaryKey !== null) {
    payload.primary_key = primaryKey;
  }
  return payload;
}

export function appendRuntimeSessionFields(formData, options = {}) {
  const payload = buildRuntimeSessionPayload(options);
  for (const [key, value] of Object.entries(payload)) {
    formData.append(key, String(value));
  }
  return formData;
}

export function buildRuntimeSocketInitPayload({
  autoApprove = true,
  ...runtimeSessionOptions
} = {}) {
  return {
    auto_approve: autoApprove,
    ...buildRuntimeSessionPayload(runtimeSessionOptions),
  };
}
