const API_BASE = "https://ep2048.cn/market/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "请求失败");
  }
  return response.json();
}

export const sceneApi = {
  getScenarios: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.query) qs.set("query", params.query);
    if (params.status) qs.set("status", params.status);
    if (params.tag_id) qs.set("tag_id", params.tag_id);
    if (params.query_field) qs.set("query_field", params.query_field);
    const queryStr = qs.toString();
    return request(`/scenarios${queryStr ? "?" + queryStr : ""}`);
  },

  getScenario: (id) => request(`/scenarios/${id}`),

  getTags: () => request("/tags"),

  getImageUrl: (scenarioId, imageId) =>
    `${API_BASE}/scenarios/${scenarioId}/images/${imageId}`,

  downloadScenario: async (scenarioId, slug) => {
    const response = await fetch(`${API_BASE}/scenarios/${scenarioId}/download`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "下载失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "scenario"}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
