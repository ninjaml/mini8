import { Brain, Building2, User, Store, BarChart3, Users } from "lucide-react";
import { Tooltip } from "../common/Tooltip";
import { ChatBubbleBadge } from "../common/ChatBubbleBadge";

export function AppRail({
  activeWorkspaceId,
  currentUserLabel,
  currentViewId,
  cronHistoryContext,
  isRefreshing,
  showMossChatBadge,
  workspaceChatBadgeByWorkspaceId,
  onOpenHome,
  onOpenGlobal,
  onOpenAgentTeam,
  onOpenGlobalStats,
  onOpenBizExpert,
  onOpenAIMarket,
  onOpenWorkspace,
  onRefreshWorkspaces,
  onToggleUserPanel,
  onOpenWorkspaceModal,
  onOpenScene,
  workspaces,
}) {
  return (
    <nav className="app-rail">
      <div className="rail-top-group">
        <button
          className="rail-logo"
          type="button"
          onClick={onOpenHome}
        >
          Mini8 · CamphorAgents
        </button>

        <div className="rail-separator"></div>

        <Tooltip text="看板">
          <button
            className={`rail-item plain-btn ${currentViewId === "global_stats" ? "active" : ""}`}
            type="button"
            onClick={onOpenGlobalStats}
          >
            <div className="rail-icon"><BarChart3 size={20} strokeWidth={2} /></div>
            <span className="rail-label">看板</span>
          </button>
        </Tooltip>

        <button
          className={`rail-item moss-btn plain-btn ${currentViewId === "global" ? "active" : ""}`}
          type="button"
          onClick={onOpenGlobal}
        >
          <div className="rail-icon">
            <Brain size={20} strokeWidth={2} />
          </div>
          <span className="rail-label">
            MOSS
            {showMossChatBadge ? <ChatBubbleBadge className="rail-chat-bubble" /> : null}
          </span>
        </button>

        <Tooltip text="Agent 团队">
          <button
            className={`rail-item plain-btn ${currentViewId === "agent_team" || currentViewId === "agent_team_detail" ? "active" : ""}`}
            type="button"
            onClick={onOpenAgentTeam}
          >
            <div className="rail-icon">
              <Users size={20} strokeWidth={2} />
            </div>
            <span className="rail-label">Agent团队</span>
          </button>
        </Tooltip>

        <div className="rail-separator"></div>

        <div className="rail-group-header">
          <div className="rail-group-label" style={{ color: "#6b7280", fontSize: 12 }}>工作空间</div>
          <Tooltip text="Add Workspace">
            <span className="rail-item add-btn plain-btn rail-label" onClick={onOpenWorkspaceModal} style={{ fontSize: 12 }}>
              + Add
            </span>
          </Tooltip>
        </div>

        {workspaces.map((workspace) => (
          <Tooltip key={workspace.id} text={workspace.name}>
            <button
              className={`rail-item plain-btn ws-item ${currentViewId?.startsWith("ws_") && String(activeWorkspaceId) === workspace.id ? "active" : ""}`}
              type="button"
              onClick={() => onOpenWorkspace(workspace)}
            >
              <div className="rail-icon">
                {workspace.name.slice(0, 1)}
              </div>
              <span className="rail-label">
                {workspace.name.length > 8 ? workspace.name.slice(0, 8) + "…" : workspace.name}
                {workspaceChatBadgeByWorkspaceId?.[workspace.id] ? <ChatBubbleBadge className="rail-chat-bubble" /> : null}
              </span>
            </button>
          </Tooltip>
        ))}

        <div className="rail-separator"></div>

        <div className="rail-group-header">
          <div className="rail-group-label" style={{ color: "#6b7280", fontSize: 12 }}>资源</div>
        </div>

        {onOpenBizExpert && (
          <Tooltip text="专家人格">
            <button
              className={`rail-item plain-btn ${currentViewId === "biz_expert" ? "active" : ""}`}
              type="button"
              onClick={onOpenBizExpert}
            >
              <div className="rail-icon"><Users size={20} strokeWidth={2} /></div>
              <span className="rail-label">专家人格</span>
            </button>
          </Tooltip>
        )}

        <Tooltip text="资源包">
          <button
            className={`rail-item plain-btn ${currentViewId === "ai_market" ? "active" : ""}`}
            type="button"
            onClick={onOpenAIMarket}
          >
            <div className="rail-icon"><Store size={20} strokeWidth={2} /></div>
            <span className="rail-label">资源包</span>
          </button>
        </Tooltip>

        <Tooltip text="场景案例">
          <button
            className={`rail-item plain-btn ${currentViewId === "scene" ? "active" : ""}`}
            type="button"
            onClick={onOpenScene}
          >
            <div className="rail-icon"><Building2 size={20} strokeWidth={2} /></div>
            <span className="rail-label">场景案例</span>
          </button>
        </Tooltip>

      </div>

      <div className="rail-spacer"></div>

      <button className="rail-item admin-btn plain-btn" type="button" onClick={onToggleUserPanel}>
        <div className="rail-icon"><User size={20} strokeWidth={2} /></div>
        <span className="rail-label">{currentUserLabel}</span>
        <div className="status-dot"></div>
      </button>
    </nav>
  );
}

