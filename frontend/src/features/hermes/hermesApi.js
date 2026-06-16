const API_BASE = import.meta.env.DEV ? "http://127.0.0.1:2048/api/external/hermes" : "/api/external/hermes";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const { headers: customHeaders, ...restOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: isFormData
      ? { ...(customHeaders || {}) }
      : {
          "Content-Type": "application/json",
          ...(customHeaders || {}),
        },
    ...restOptions,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Request failed";
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) message = parsed.detail;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

const CONFIG_API_BASE = import.meta.env.DEV ? "http://127.0.0.1:2048/api/hermes-configs" : "/api/hermes-configs";

async function configRequest(path, options = {}) {
  const response = await fetch(`${CONFIG_API_BASE}${path}`, {
    headers: {
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
      if (parsed?.detail) message = parsed.detail;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const hermesApi = {
  health: () => request("/health"),
  getAgent: () => request("/agent"),
  chat: (payload, sessionId) =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: sessionId ? { "X-Session-Id": sessionId } : {},
    }),
  // Phase 2: 流式对话（需要解析 SSE data: 前缀）
  // chatStream: async (payload, onChunk) => { ... },
  getJobs: () => request("/jobs"),
  createJob: (payload) => request("/jobs", { method: "POST", body: JSON.stringify(payload) }),
  updateJob: (id, payload) => request(`/jobs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteJob: (id) => request(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  triggerJob: (id) => request(`/jobs/${encodeURIComponent(id)}/trigger`, { method: "POST" }),
  pauseJob: (id) => request(`/jobs/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  resumeJob: (id) => request(`/jobs/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  getSkills: () => request("/skills"),
  toggleSkill: (name, enabled) => request(`/skills/${encodeURIComponent(name)}/toggle`, { method: "POST", body: JSON.stringify({ enabled }) }),
  installSkill: (name, content) =>
    request(`/skills/${encodeURIComponent(name)}/install`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  uninstallSkill: (name) =>
    request(`/skills/${encodeURIComponent(name)}/uninstall`, {
      method: "DELETE",
    }),
  getToolsets: () => request("/toolsets"),
  // Phase 2: 工具集编辑（需后端 POST /toolsets + ruamel.yaml 保留注释）
  // updateToolsets: (payload) =>
  //   request("/toolsets", { method: "POST", body: JSON.stringify(payload) }),

  // --- 会话管理 ---
  getSessions: (limit = 20, offset = 0) => request(`/sessions?limit=${limit}&offset=${offset}`),
  getSessionMessages: (id, limit = 20, offset = 0) => {
    const params = new URLSearchParams();
    params.set("limit", limit);
    params.set("offset", offset);
    return request(`/sessions/${encodeURIComponent(id)}/messages?${params.toString()}`);
  },
  deleteSession: (id) => request(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // --- 配置管理 ---
  getConfigs: () => configRequest(""),
  updateConfig: (key, value) =>
    configRequest("", {
      method: "POST",
      body: JSON.stringify({ key, value }),
    }),
};
