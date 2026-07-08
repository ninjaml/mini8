const API_BASE = import.meta.env?.DEV ? "http://127.0.0.1:2048/api" : "/api";

import { buildRuntimeSessionPayload } from "../features/chat/runtimeSessionPayload.js";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: isFormData
      ? { ...(options.headers || {}) }
      : {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Request failed";
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) {
        if (typeof parsed.detail === "string") {
          message = parsed.detail;
        } else if (Array.isArray(parsed.detail)) {
          message = parsed.detail
            .map((item) => item?.msg || item?.message || JSON.stringify(item))
            .join("; ");
        } else {
          message = parsed.detail?.msg || parsed.detail?.message || JSON.stringify(parsed.detail);
        }
      }
    } catch {
      // 保留后端原始文本，便于前端直接显示错误。
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  login: (payload) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getWorkspaces: () => request("/workspaces"),
  getWorkspace: (workspaceId) => request(`/workspaces/${workspaceId}`),
  createWorkspace: (payload) =>
    request("/workspaces", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspace: (workspaceId, payload) =>
    request(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteWorkspace: (workspaceId) =>
    request(`/workspaces/${workspaceId}`, {
      method: "DELETE",
    }),
  pickWorkspaceWorkingDir: () =>
    request("/workspaces/pick-working-dir", {
      method: "POST",
    }),

  getAgentTeam: () => request("/agents/team"),
  getAgentTeamDetail: (agentId) => request(`/agents/team/${agentId}`),
  getPersonas: () => request("/agents/personas"),
  createCoreAgent: (payload) =>
    request("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCoreAgent: (agentId, payload) =>
    request(`/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateCoreAgentPersona: (agentId, payload) =>
    request(`/agents/${agentId}/persona`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteCoreAgent: (agentId) =>
    request(`/agents/${agentId}`, {
      method: "DELETE",
    }),
  listAgentSubagents: (agentId) => request(`/agents/${agentId}/subagents`),
  createAgentSubagent: (agentId, payload) =>
    request(`/agents/${agentId}/subagents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteAgentSubagent: (agentId, bindingId) =>
    request(`/agents/${agentId}/subagents/${bindingId}`, {
      method: "DELETE",
    }),
  // 子Agent工作模式属于具体会话，因此走 session 级 PATCH，而不是 binding 级接口。
  updateAgentSession: (sessionId, payload) =>
    request(`/agent-sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getAgents: (workspaceId) => request(`/workspaces/${workspaceId}/agents`),
  createAgent: (workspaceId, payload) =>
    request(`/workspaces/${workspaceId}/agents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAgent: (workspaceId, agentId, payload) =>
    request(`/workspaces/${workspaceId}/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAgent: (workspaceId, agentId) =>
    request(`/workspaces/${workspaceId}/agents/${agentId}`, {
      method: "DELETE",
    }),

  getWorkspaceMessages: (workspaceId, { before = null, limit = 100 } = {}) => {
    const params = new URLSearchParams();
    if (before != null) params.set("before", String(before));
    if (limit != null) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/workspaces/${workspaceId}/messages${qs ? `?${qs}` : ""}`);
  },
  createWorkspaceMessage: (workspaceId, payload) =>
    request(`/workspaces/${workspaceId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getKnowledgeSkillUrl: (knowledgeId) => `${API_BASE}/config/export/knowledge/${encodeURIComponent(knowledgeId)}`,

  getKnowledge: (workspaceId) => request(`/workspaces/${workspaceId}/knowledge`),
  createKnowledge: (workspaceId, payload) =>
    request(`/workspaces/${workspaceId}/knowledge`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateKnowledge: (knowledgeId, payload) =>
    request(`/knowledge/${knowledgeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteKnowledge: (workspaceId, knowledgeId) =>
    request(`/workspaces/${workspaceId}/knowledge/${knowledgeId}`, {
      method: "DELETE",
    }),
  getKnowledgeTree: (knowledgeId, path = "") => {
    const suffix = path ? `?path=${encodeURIComponent(path)}` : "";
    return request(`/knowledge/${knowledgeId}/tree${suffix}`);
  },
  getKnowledgeFile: (knowledgeId, path) =>
    request(`/knowledge/${knowledgeId}/file?path=${encodeURIComponent(path)}`),

  // 知识库配置
  getKbConfigs: () => request("/kb-configs"),
  createKbConfig: (payload) =>
    request("/kb-configs", { method: "POST", body: JSON.stringify(payload) }),
  updateKbConfig: (configId, payload) =>
    request(`/kb-configs/${configId}`, { method: "PUT", body: JSON.stringify(payload) }),

  // Agent 工作目录配置
  getAgentWorkingDir: ({ kind, refId }) => {
    const params = new URLSearchParams({ kind });
    if (refId != null) params.append("ref_id", refId);
    return request(`/agents/working-dir?${params.toString()}`);
  },
  updateAgentWorkingDir: ({ kind, refId, dir }) =>
    request("/agents/working-dir", {
      method: "PATCH",
      body: JSON.stringify({ kind, ref_id: refId, dir }),
    }),
  openLocalPath: (path) =>
    request("/agents/open-local-path", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  getAgentSkills: ({ kind = null, id = null, agentSessionId = null, primaryKey = null }) => {
    const params = new URLSearchParams();
    const payload = buildRuntimeSessionPayload({ kind, agentSessionId, primaryKey });
    for (const [key, value] of Object.entries(payload)) {
      params.set(key, String(value));
    }
    if (id != null) params.set("id", String(id));
    return request(`/runtime/context/skills?${params.toString()}`);
  },

  // --- 本地定时任务 (Cron) ---
  listCronJobs: ({ workspaceId = null, agentName = null } = {}) => {
    const params = new URLSearchParams();
    if (workspaceId != null) params.set("workspace_id", String(workspaceId));
    if (agentName != null) params.set("agent_name", String(agentName));
    const qs = params.toString();
    return request(`/runtime/cron/jobs${qs ? `?${qs}` : ""}`);
  },
  createCronJob: (payload) =>
    request("/runtime/cron/jobs", { method: "POST", body: JSON.stringify(payload) }),
  getCronJob: (id) => request(`/runtime/cron/jobs/${id}`),
  updateCronJob: (id, payload) =>
    request(`/runtime/cron/jobs/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCronJob: (id) =>
    request(`/runtime/cron/jobs/${id}`, { method: "DELETE" }),
  runCronJob: (id) =>
    request(`/runtime/cron/jobs/${id}/run`, { method: "POST" }),
  toggleCronJob: (id) =>
    request(`/runtime/cron/jobs/${id}/toggle`, { method: "POST" }),

  // --- 定时任务历史 (Cron History) ---
  getCronHistoryList: ({ kind, agentSessionId = null }) => {
    const params = new URLSearchParams({ kind });
    if (agentSessionId != null) params.set("agent_session_id", String(agentSessionId));
    return request(`/runtime/cron/history?${params.toString()}`);
  },
  getCronHistoryJobDetail: (jobId, { kind, agentSessionId, groupLimit, beforeCursor } = {}) => {
    const params = new URLSearchParams();
    if (kind != null) params.set("kind", kind);
    if (agentSessionId != null) params.set("agent_session_id", String(agentSessionId));
    if (groupLimit != null) params.set("group_limit", String(groupLimit));
    if (beforeCursor != null) params.set("before_cursor", String(beforeCursor));
    const qs = params.toString();
    return request(`/runtime/cron/history/jobs/${jobId}${qs ? `?${qs}` : ""}`);
  },
};

