import { Brain, Plus, User, Link, BarChart3 } from "lucide-react";
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
  onOpenGlobal,
  onOpenGlobalStats,
  onOpenWorkspace,
  onRefreshWorkspaces,
  onToggleUserPanel,
  onOpenWorkspaceModal,
  onOpenOtherAgentHub,
  workspaces,
}) {
  return (
    <nav className="app-rail">
      <div className="rail-top-group">
        <button
          className="rail-logo"
          type="button"
          onClick={onOpenGlobalStats}
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

        <Tooltip text="连接智能体">
          <button
            className={`rail-item plain-btn ${currentViewId === "other_agent_hub" ? "active" : ""}`}
            type="button"
            onClick={onOpenOtherAgentHub}
          >
            <div className="rail-icon"><Link size={20} strokeWidth={2} /></div>
            <span className="rail-label">连接智能体</span>
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
