const API_BASE = import.meta.env.DEV ? "http://127.0.0.1:2048/api" : "/api";

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
        message = parsed.detail;
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
  getDashboard: (workspaceId) => request(`/workspaces/${workspaceId}/dashboard`),

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

  getItems: (workspaceId) => request(`/workspaces/${workspaceId}/items`),
  createItem: (workspaceId, payload) =>
    request(`/workspaces/${workspaceId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getItem: (itemId) => request(`/items/${itemId}`),
  updateItem: (itemId, payload) =>
    request(`/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  bindItemAgent: (itemId, agentId) =>
    request(`/items/${itemId}/bind-agent`, {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }),
  deleteItem: (itemId) =>
    request(`/items/${itemId}`, {
      method: "DELETE",
    }),

  getItemHistories: (itemId) => request(`/items/${itemId}/histories`),
  createHistory: (itemId, payload) =>
    request(`/items/${itemId}/histories`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadHistory: (itemId, formData) =>
    request(`/items/${itemId}/histories/upload`, {
      method: "POST",
      body: formData,
    }),
  reviewHistory: (historyId, payload) =>
    request(`/histories/${historyId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteHistory: (historyId) =>
    request(`/histories/${historyId}`, {
      method: "DELETE",
    }),
  getHistoryPreviewUrl: (historyId, fileName) =>
    `${API_BASE}/histories/${historyId}/files/${encodeURIComponent(fileName)}`,
  getHistoryDownloadUrl: (historyId) => `${API_BASE}/histories/${historyId}/download`,
  getWorkspaceSkillUrl: (workspaceId) => `${API_BASE}/config/export/superagent?workspace_id=${encodeURIComponent(workspaceId)}`,
  getItemSkillUrl: (itemId) => `${API_BASE}/config/export/items/${encodeURIComponent(itemId)}`,
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

  // 团队知识图谱
  getEnterpriseStatus: () => request("/enterprise/status"),
  getEnterpriseCollections: (primaryKey) =>
    request(`/enterprise/collections?primary_key=${encodeURIComponent(primaryKey)}`),
  getEnterpriseFolders: (primaryKey, collectionId) =>
    request(`/enterprise/collections/${collectionId}/folders?primary_key=${encodeURIComponent(primaryKey)}`),
  getEnterpriseDocuments: (primaryKey, collectionId, params = {}) => {
    const qs = new URLSearchParams({ primary_key: primaryKey });
    if (params.folderId != null) qs.set("folder_id", params.folderId);
    if (params.rootOnly) qs.set("root_only", "true");
    if (params.keyword) qs.set("keyword", params.keyword);
    if (params.mimeType) qs.set("mime_type", params.mimeType);
    return request(`/enterprise/collections/${collectionId}/documents?${qs.toString()}`);
  },
  enterpriseSearch: (payload) =>
    request("/enterprise/search", { method: "POST", body: JSON.stringify(payload) }),
  enterpriseRag: (payload) =>
    request("/enterprise/rag", { method: "POST", body: JSON.stringify(payload) }),
  downloadEnterpriseDocument: async (primaryKey, documentId) => {
    const response = await fetch(`${API_BASE}/enterprise/documents/${documentId}/download?primary_key=${encodeURIComponent(primaryKey)}`);
    if (!response.ok) throw new Error("下载失败");
    return response.blob();
  },
  getEnterpriseDocumentDownloadUrl: (primaryKey, documentId) =>
    `${API_BASE}/enterprise/documents/${documentId}/download?primary_key=${encodeURIComponent(primaryKey)}`,
  uploadEnterpriseDocument: (primaryKey, collectionId, formData) => {
    formData.append("primary_key", primaryKey);
    return request(`/enterprise/collections/${collectionId}/documents`, {
      method: "POST",
      body: formData,
    });
  },

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

  getAgentSkills: ({ kind, id }) => {
    const params = new URLSearchParams({ kind });
    if (id != null) params.set("id", String(id));
    return request(`/runtime/context/skills?${params.toString()}`);
  },

  // --- 本地定时任务 (Cron) ---
  listCronJobs: () => request("/runtime/cron/jobs"),
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
  getCronHistoryList: ({ kind, targetId }) => {
    const params = new URLSearchParams({ kind });
    if (targetId != null) params.set("target_id", String(targetId));
    return request(`/runtime/cron/history?${params.toString()}`);
  },
  getCronHistoryJobDetail: (jobId, { kind, targetId, groupLimit, beforeCursor } = {}) => {
    const params = new URLSearchParams();
    if (kind != null) params.set("kind", kind);
    if (targetId != null) params.set("target_id", String(targetId));
    if (groupLimit != null) params.set("group_limit", String(groupLimit));
    if (beforeCursor != null) params.set("before_cursor", String(beforeCursor));
    const qs = params.toString();
    return request(`/runtime/cron/history/jobs/${jobId}${qs ? `?${qs}` : ""}`);
  },
};
