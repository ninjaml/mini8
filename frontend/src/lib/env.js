const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:2048' : '';

export async function listApiKeys() {
  const response = await fetch(`${API_BASE}/api/runtime/env/keys`);
  if (!response.ok) {
    throw new Error('Failed to list API keys');
  }
  return response.json();
}

export async function setApiKey(provider, key_value, base_url = '', description = '') {
  const response = await fetch(`${API_BASE}/api/runtime/env/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key_value, base_url, description }),
  });
  if (!response.ok) {
    throw new Error('Failed to set API key');
  }
  return response.json();
}

export async function deleteApiKey(provider) {
  const response = await fetch(`${API_BASE}/api/runtime/env/keys/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    throw new Error('Failed to delete API key');
  }
  return response.json();
}

export async function activateApiKey(provider) {
  const response = await fetch(`${API_BASE}/api/runtime/env/keys/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    throw new Error('Failed to activate API key');
  }
  return response.json();
}
