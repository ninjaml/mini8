const API_BASE = "/api";
const WS_BASE = import.meta.env.DEV ? "ws://127.0.0.1:2048" : `ws://${window.location.host}`;

import {
  appendRuntimeSessionFields,
  buildRuntimeSessionPayload,
} from "../features/chat/runtimeSessionPayload.js";

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
  async createContextSession({ kind = null, agentSessionId = null, primaryKey = null }) {
    const body = buildRuntimeSessionPayload({ kind, agentSessionId, primaryKey });
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

  async fetchGroupedReplayEvents({ threadId, limitGroups = 20, beforeCursor = null }) {
    return request(`/runtime/sessions/${threadId}/events/grouped`, {
      method: "POST",
      body: JSON.stringify({
        limit_groups: limitGroups,
        before_cursor: beforeCursor,
      }),
    });
  },

  async fetchReplayGroup({ threadId, groupId }) {
    // 聊天区里的“查看完整回放”只需要直取单个 group，
    // 不再反复翻分页列表去捞目标 group。
    return request(`/runtime/sessions/${threadId}/events/grouped/${groupId}`, {
      method: "GET",
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

  async uploadFile({ file, kind = null, agentSessionId = null, primaryKey = null }) {
    const formData = new FormData();
    formData.append("file", file);
    appendRuntimeSessionFields(formData, { kind, agentSessionId, primaryKey });

    console.info("[runtime.uploadFile] start", {
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      kind,
      agentSessionId,
      primaryKey: primaryKey ? "[set]" : null,
      apiBase: API_BASE,
      pageOrigin: window.location.origin,
    });

    const targetUrl = `${API_BASE}/runtime/context/upload`;
    let response;
    try {
      response = await fetch(targetUrl, {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      console.error("[runtime.uploadFile] fetch threw", {
        targetUrl,
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      });
      throw error;
    }

    console.info("[runtime.uploadFile] response", {
      targetUrl,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
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
      console.error("[runtime.uploadFile] failed", {
        status: response.status,
        message,
        text,
      });
      throw new Error(message);
    }

    const data = await response.json();
    console.info("[runtime.uploadFile] success", data);
    return data;
  },
};
