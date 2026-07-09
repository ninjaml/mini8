const API_BASE = import.meta.env?.DEV ? "http://127.0.0.1:2048/api" : "/api";

async function buildRequestError(response) {
  const text = await response.text();
  let message = text || "Request failed";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === "string") {
      message = parsed.detail;
    } else if (Array.isArray(parsed?.detail)) {
      message = parsed.detail
        .map((item) => item?.msg || item?.message || JSON.stringify(item))
        .join("; ");
    } else if (parsed?.detail) {
      message = parsed.detail?.msg || parsed.detail?.message || JSON.stringify(parsed.detail);
    }
  } catch {
    // 保留后端返回的原始文本，便于前端直接展示。
  }
  return new Error(message);
}

function resolveDownloadFilename(response, fallbackName) {
  const contentDisposition = response.headers.get("content-disposition") || "";
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return plainMatch?.[1] || fallbackName;
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

export async function importAgentPackageFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/agent-packages/import`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw await buildRequestError(response);
  }
  return response.json();
}

export async function downloadAgentPackage(agentId) {
  const response = await fetch(`${API_BASE}/agent-packages/${encodeURIComponent(agentId)}/export`);
  if (!response.ok) {
    throw await buildRequestError(response);
  }

  const blob = await response.blob();
  const filename = resolveDownloadFilename(response, `agent-team-${agentId}.zip`);
  triggerBrowserDownload(blob, filename);
  return filename;
}
