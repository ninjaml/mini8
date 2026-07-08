export function buildWorkspaceViewState(workspace, options = {}) {
  const requestedViewId = options.viewId || "ws_office";
  return {
    viewId: requestedViewId,
    wsId: workspace?.id ?? null,
    selectedAgentId: options.selectedAgentId ?? workspace?.agents?.[0]?.id ?? null,
    selectedKnowledgeId: options.selectedKnowledgeId ?? workspace?.knowledge?.[0]?.id ?? null,
    chatHubAgentId: options.chatHubAgentId ?? null,
  };
}
