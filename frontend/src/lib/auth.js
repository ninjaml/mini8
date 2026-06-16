const AUTH_STORAGE_KEY = "CamphorEOS_auth_user";

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(payload) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getCurrentUserLabel(auth) {
  const base = auth?.nickname || auth?.username || auth?.user_id || "ADM";
  return String(base);
}

export function getCurrentUserDisplayName(auth) {
  return auth?.nickname || auth?.username || auth?.user_id || "Admin";
}
