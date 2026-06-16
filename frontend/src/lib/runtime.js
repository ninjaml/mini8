const API_BASE = import.meta.env.DEV ? "http://127.0.0.1:2048/api" : "/api";
const WS_BASE = import.meta.env.DEV ? "ws://127.0.0.1:2048" : `ws://${window.location.host}`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Runtime request failed";
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) {
        message = parsed.detail;
      }
    } catch {
      // 保留原始错误文本，方便 UI 直接展示。
    }
    throw new Error(message);
  }

  return response.json();
}

export const runtime = {
  async createContextSession({ kind, workspaceId = null, agentId = null, currentItemId = null, userId = null }) {
    const body = { kind };
    // 决策7：workagent 请求中前端不传 workspace_id，后端从 agent 推导
    if (kind !== "workagent" && workspaceId !== null) {
      body.workspace_id = workspaceId;
    }
    if (agentId !== null) {
      body.agent_id = agentId;
    }
    if (currentItemId !== null) {
      body.current_item_id = currentItemId;
    }
    if (userId !== null) {
      body.user_id = userId;
    }
    return request("/runtime/context/session", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async fetchSessionEvents({ threadId, limit = 10, beforeId = null }) {
    return request(`/runtime/sessions/${threadId}/events`, {
      method: "POST",
      body: JSON.stringify({
        limit,
        before_id: beforeId,
      }),
    });
  },

  createSocket({ threadId }) {
    return new WebSocket(`${WS_BASE}/api/runtime/chat/${threadId}/stream`);
  },

  async rollbackSession({ threadId, messageIndex }) {
    return request(`/runtime/sessions/${threadId}/rollback`, {
      method: "POST",
      body: JSON.stringify({
        message_index: messageIndex,
      }),
    });
  },

  async deleteSession({ threadId }) {
    return request(`/runtime/sessions/delete`, {
      method: "DELETE",
      body: JSON.stringify({
        thread_id: threadId,
      }),
    });
  },

  async uploadFile({ file, kind, workspaceId = null, agentId = null }) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    if (workspaceId !== null) {
      formData.append("workspace_id", String(workspaceId));
    }
    if (agentId !== null) {
      formData.append("agent_id", String(agentId));
    }

    const response = await fetch(`${API_BASE}/runtime/context/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = text || "Upload failed";
      try {
        const parsed = JSON.parse(text);
        if (parsed?.detail) {
          message = parsed.detail;
        }
      } catch {
        // 保留原始错误文本
      }
      throw new Error(message);
    }

    return response.json();
  },
};
