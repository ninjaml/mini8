/**
 * 将 workspace 数据映射到办公室场景的具体位置。
 *
 * 规则：
 * - projectManager / superAgent 永远坐 PM 工位
 * - agents[0..5] 依次坐到 6 个普通工位，不足时空椅子，超出时截断
 * - agents[6..7] 进入休息区候补（本期不渲染）
 * - agents[8..9] 进入特殊独立图标位（sanitation / web，本期仅渲染 sanitation）
 */
export function useOfficeLayout(workspace) {
  const pm = workspace?.projectManager || {
    name: workspace?.superAgentName || "项目经理",
    status: "在线",
  };

  const agents = workspace?.agents || [];

  const activeAgents = agents.slice(0, 6).map((agent, index) => ({
    ...agent,
    deskIndex: index,
  }));

  const restingAgents = agents.slice(6, 8).map((agent, index) => ({
    ...agent,
    chairIndex: index,
  }));

  const specialAgents = agents.slice(8, 10).map((agent, index) => ({
    ...agent,
    iconType: index === 0 ? "sanitation" : "web",
  }));

  return {
    pm,
    activeAgents,
    restingAgents,
    specialAgents,
    knowledge: workspace?.knowledge || [],
    items: workspace?.items || [],
  };
}
