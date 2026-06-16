/**
 * AI 市场 API 客户端。
 *
 * 所有请求通过后端代理 (/api/market/*) 转发到远程市场 API，
 * 避免前端 CORS 问题，且 API Base 由后端 config.py 统一管理。
 */

const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:2048/api/market"
  : "/api/market";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(data?.detail || text || "请求失败");
  }
  return data;
}

export const marketApi = {
  getTags: (options) => request("/tags", options),
  getSkills: (options) => request("/skills?status=enable", options),
  getPrompts: (options) => request("/prompts", options),
  downloadSkill: async (skillId, slug) => {
    const response = await fetch(`${API_BASE}/skills/${skillId}/download`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "下载失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "skill"}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
