import { api } from "./api";

function safeParseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "刚刚";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return sameDay ? `今天 ${hours}:${minutes}` : `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`;
}

function getStatusLabel(status) {
  if (status === "reviewing") return "待审批";
  if (status === "completed") return "已提交";
  if (status === "running") return "进行中";
  if (status === "rejected") return "审核不通过";
  return "待提交";
}

function getHistoryTodoCount(history) {
  let count = 0;
  if (history.superagent_review_status === "pending") count += 1;
  if (history.superone_review_status === "pending") count += 1;
  return count;
}

function buildKnowledgeSummary(entry) {
  const config = safeParseJson(entry.knowledge_json, {});
  return {
    id: String(entry.id),
    title: entry.name || "知识库",
    type: entry.type || "obsidian",
    port: config.port || "",
    apiKey: config.api_key || "",
    vaultName: config.vault_name || entry.name || "知识库",
    omnisearchPort: config.omnisearch_port || "",
    omnisearchUrl: config.omnisearch_port ? `http://127.0.0.1:${config.omnisearch_port}` : "",
    summary: config.port
      ? `已通过 Obsidian Local REST API 接入端口 ${config.port}`
      : "当前知识库尚未配置 Obsidian 接口。",
  };
}

// 把后端多个接口聚合成前端真正消费的工作空间视图模型。
export async function buildWorkspaceFromApi(rawWorkspace) {
  const [agents, items, knowledge, dashboard] = await Promise.all([
    api.getAgents(rawWorkspace.id),
    api.getItems(rawWorkspace.id),
    api.getKnowledge(rawWorkspace.id),
    api.getDashboard(rawWorkspace.id),
  ]);

  const historiesEntries = await Promise.all(
    items.map(async (item) => [item.id, await api.getItemHistories(item.id)]),
  );
  const historiesMap = Object.fromEntries(historiesEntries);

  const mappedAgents = agents.map((agent) => ({
    id: String(agent.id),
    name: agent.name,
    role: agent.type || "workAgent",
    prompt: agent.agent_json || "",
    status: agent.type === "local" ? "本地" : "在线",
    tasks: [],
  }));

  const mappedItems = items.map((item) => {
    const owner = mappedAgents.find((agent) => agent.id === String(item.agent_id));
    if (owner) owner.tasks.push(item.name);
    return {
      id: String(item.id),
      title: item.name,
      desc: item.description || "待补充任务说明。",
      currentStatus: item.current_status || "pending",
      ownerId: item.agent_id ? String(item.agent_id) : null,
      ownerName: owner ? owner.name : null,
      workRequirement: item.work_requirement || "",
      deliveryRequirement: item.delivery_requirement || "",
      needSuperagentReview: Boolean(item.need_superagent_review),
      needSuperoneReview: Boolean(item.need_superone_review),
      allowAutoComplete: Boolean(item.allow_auto_complete),
      submissions: (historiesMap[item.id] || []).map((history) => ({
        id: history.id,
        title: history.title || `成果提交 #${history.id}`,
        summary: history.summary || "当前成果已进入系统记录。",
        rawStatus: history.status || "reviewing",
        status: getStatusLabel(history.status),
        time: formatRelativeTime(history.created_at),
        createdAt: history.created_at || null,
        submittedByName: history.submitted_by_name || "Admin",
        fileCount: history.file_count || 0,
        fileDirPath: history.file_dir_path || "",
        previewText: history.preview_text || "",
        superagentReviewStatus: history.superagent_review_status || null,
        superagentReviewNote: history.superagent_review_note || "",
        superoneReviewStatus: history.superone_review_status || null,
        superoneReviewNote: history.superone_review_note || "",
        todoCount: getHistoryTodoCount(history),
        files: (history.files || []).map((file) => ({
          name: file.name,
          size: file.size || 0,
        })),
      })),
    };
  });

  const mappedKnowledge = knowledge.map(buildKnowledgeSummary);

  return {
    id: String(rawWorkspace.id),
    rawId: rawWorkspace.id,
    name: rawWorkspace.name,
    goal: rawWorkspace.goal || "待补充工作总目标",
    superAgentName: rawWorkspace.super_agent_nick_name || "项目经理",
    projectManager: {
      name: dashboard?.project_manager?.name || rawWorkspace.super_agent_nick_name || "项目经理",
      status: dashboard?.project_manager?.status || "在线",
    },
    dashboard: {
      agentCount: dashboard?.agent_count ?? mappedAgents.length,
      itemCount: dashboard?.item_count ?? mappedItems.length,
      todoCount: dashboard?.todo_count ?? 0,
      knowledgeCount: dashboard?.knowledge_count ?? mappedKnowledge.length,
      resultCount: dashboard?.result_count ?? mappedItems.reduce((total, item) => total + item.submissions.length, 0),
    },
    agents: mappedAgents,
    items: mappedItems,
    knowledge: mappedKnowledge,
  };
}

export async function hydrateWorkspacesFromApi() {
  const workspaces = await api.getWorkspaces();
  return Promise.all(workspaces.map(buildWorkspaceFromApi));
}
