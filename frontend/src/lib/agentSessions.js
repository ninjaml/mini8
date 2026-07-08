export function getAgentDefaultSessionId(agent) {
  return agent?.default_session_id ?? null;
}

export function getAgentWorkspaceSessionId(agent) {
  return agent?.workspace_session_id ?? null;
}

// 前端统一从 agent 摘要里取 session 级 mode，避免组件自己硬编码字段名。
export function getAgentDefaultSessionSubagentMode(agent) {
  return agent?.default_session_subagent_mode ?? null;
}

export function getAgentWorkspaceSessionSubagentMode(agent) {
  return agent?.workspace_session_subagent_mode ?? null;
}

export function findAgentById(agents, agentId) {
  if (!Array.isArray(agents) || agentId == null) return null;
  return agents.find((agent) => String(agent.id) === String(agentId)) || null;
}
