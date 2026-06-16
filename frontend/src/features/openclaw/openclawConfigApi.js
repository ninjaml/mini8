const CONFIG_API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:2048/api/openclaw-configs"
  : "/api/openclaw-configs";

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

export const openclawConfigApi = {
  getConfigs: () => configRequest(""),
  updateConfig: (key, value, description) =>
    configRequest("", {
      method: "POST",
      body: JSON.stringify({ key, value, description }),
    }),
};
