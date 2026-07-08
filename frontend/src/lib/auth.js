const AUTH_STORAGE_KEY = "CamphorEOS_auth_user";
let memoryAuth = null;

function readFromStorage() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function getStoredAuth() {
  try {
    const stored = readFromStorage();
    memoryAuth = stored;
    return stored;
  } catch {
    return memoryAuth;
  }
}

export function setStoredAuth(payload) {
  memoryAuth = payload;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 某些受限环境（如隐私沙箱或只读浏览器容器）没有可用 localStorage，退回内存态。
  }
}

export function clearStoredAuth() {
  memoryAuth = null;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // 内存态已清空，无需继续抛错。
  }
}

export function getCurrentUserLabel(auth) {
  const base = auth?.nickname || auth?.username || auth?.user_id || "ADM";
  return String(base);
}

export function getCurrentUserDisplayName(auth) {
  return auth?.nickname || auth?.username || auth?.user_id || "Admin";
}
