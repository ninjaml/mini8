import { useState } from "react";
import { Brain, Plus, Building2, User, Store, Link, Network, BarChart3, Users, Workflow, Database } from "lucide-react";
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
  onOpenGlobalStats,
  onOpenEnterprise,
  onOpenBizExpert,
  onOpenWorkflow,
  onOpenDataCenter,
  onOpenAIMarket,
  onOpenWorkspace,
  onRefreshWorkspaces,
  onToggleUserPanel,
  onOpenWorkspaceModal,
  onOpenOtherAgentHub,
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
          <div className="rail-group-label" style={{ color: "#6b7280", fontSize: 12 }}>团队空间</div>
        </div>

        {onOpenEnterprise && (
          <Tooltip text="知识图谱">
            <button
              className={`rail-item enterprise-btn plain-btn ${currentViewId === "enterprise" ? "active" : ""}`}
              type="button"
              onClick={onOpenEnterprise}
            >
              <div className="rail-icon"><Network size={20} strokeWidth={2} /></div>
              <span className="rail-label">知识图谱</span>
            </button>
          </Tooltip>
        )}

        {onOpenBizExpert && (
          <Tooltip text="业务专家">
            <button
              className={`rail-item plain-btn ${currentViewId === "biz_expert" ? "active" : ""}`}
              type="button"
              onClick={onOpenBizExpert}
            >
              <div className="rail-icon"><Users size={20} strokeWidth={2} /></div>
              <span className="rail-label">业务专家</span>
            </button>
          </Tooltip>
        )}

        {onOpenWorkflow && (
          <Tooltip text="工作流">
            <button
              className={`rail-item plain-btn ${currentViewId === "workflow" ? "active" : ""}`}
              type="button"
              onClick={onOpenWorkflow}
            >
              <div className="rail-icon"><Workflow size={20} strokeWidth={2} /></div>
              <span className="rail-label">工作流</span>
            </button>
          </Tooltip>
        )}

        {onOpenDataCenter && (
          <Tooltip text="数据中心">
            <button
              className={`rail-item plain-btn ${currentViewId === "data_center" ? "active" : ""}`}
              type="button"
              onClick={onOpenDataCenter}
            >
              <div className="rail-icon"><Database size={20} strokeWidth={2} /></div>
              <span className="rail-label">数据中心</span>
            </button>
          </Tooltip>
        )}

        <div className="rail-separator"></div>

        <div className="rail-group-header">
          <div className="rail-group-label" style={{ color: "#6b7280", fontSize: 12 }}>资源</div>
        </div>

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
