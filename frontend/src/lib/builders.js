import { api } from "./api.js";

function safeParseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function buildKnowledgeSummary(entry) {
  const config = safeParseJson(entry.knowledge_json, {});
  return {
    id: String(entry.id),
    title: entry.name,
    type: entry.type,
    port: config.port || "",
    apiKey: config.api_key || "",
    vaultName: config.vault_name || entry.name,
    omnisearchPort: config.omnisearch_port || "",
    omnisearchUrl: config.omnisearch_url || (config.omnisearch_port ? `http://localhost:${config.omnisearch_port}` : ""),
    summary: config.port
      ? `已通过 Obsidian Local REST API 接入端口 ${config.port}`
      : "当前知识库尚未配置 Obsidian 接口。",
  };
}

function buildAgentSummary(agent) {
  return {
    id: String(agent.id),
    rawId: agent.id,
    name: agent.name,
    role: agent.type || "agent",
    prompt: agent.agent_json || "",
    status: agent.type === "local" ? "本地" : "在线",
    // workspace 壳需要保留 session 级 subagent mode，聊天页才能直接显示和切换。
    default_session_id: agent.default_session_id ?? null,
    default_session_subagent_mode: agent.default_session_subagent_mode ?? null,
    workspace_session_id: agent.workspace_session_id ?? null,
    workspace_session_subagent_mode: agent.workspace_session_subagent_mode ?? null,
    persona_name: agent.persona_name ?? null,
  };
}

function buildWorkspaceShape(rawWorkspace, { agents, knowledge }) {
  return {
    id: String(rawWorkspace.id),
    rawId: rawWorkspace.id,
    name: rawWorkspace.name,
    goal: rawWorkspace.goal || "待补充工作总目标",
    workingDir: rawWorkspace.working_dir,
    agents,
    knowledge,
  };
}

export async function buildWorkspaceShellFromApi(rawWorkspace) {
  const [agents, knowledge] = await Promise.all([
    api.getAgents(rawWorkspace.id),
    api.getKnowledge(rawWorkspace.id),
  ]);

  const mappedAgents = agents.map(buildAgentSummary);
  const mappedKnowledge = knowledge.map(buildKnowledgeSummary);

  return buildWorkspaceShape(rawWorkspace, {
    agents: mappedAgents,
    knowledge: mappedKnowledge,
  });
}

export async function hydrateWorkspaceShellsFromApi() {
  const workspaces = await api.getWorkspaces();
  return Promise.all(workspaces.map(buildWorkspaceShellFromApi));
}
