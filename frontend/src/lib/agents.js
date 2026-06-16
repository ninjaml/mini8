const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:2048' : '';

export async function listAgents() {
  const response = await fetch(`${API_BASE}/api/runtime/agents`);
  if (!response.ok) {
    throw new Error('Failed to list agents');
  }
  return response.json();
}

export async function updateAgentModel(agent_name, provider, model_name = '', base_url = '') {
  const response = await fetch(`${API_BASE}/api/runtime/agents/update-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_name, provider, model_name, base_url }),
  });
  if (!response.ok) {
    throw new Error('Failed to update agent model');
  }
  return response.json();
}
