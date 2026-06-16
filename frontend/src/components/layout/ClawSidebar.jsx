import { Zap, Bot, Activity, Package, Wrench, Clock, LayoutDashboard, MessageSquare } from "lucide-react";

export function ClawSidebar({
  viewId,
  onOpenHermes,
  onOpenOpenClaw,
  subNav,
  onSubNavChange,
  openclawSubNav,
  onOpenclawSubNavChange,
  agent,
  skillsCount,
  jobsCount,
  toolsetsCount,
  hideHeader = false,
}) {
  const isHermesActive = viewId === "hermes";
  const isOpenClawActive = viewId === "openclaw";

  return (
    <aside className="app-sidebar">
      {!hideHeader && (
        <div className="sidebar-header">
          <h2>连接智能体</h2>
        </div>
      )}
      <div className="sidebar-content">
        {isHermesActive && (
          <>
            <div className="sidebar-section">
              <div className="section-title">Hermes</div>
              <button
                className={`sidebar-menu-item plain-btn ${subNav === "agent" ? "active" : ""}`}
                type="button"
                onClick={() => onSubNavChange("agent")}
              >
                <Activity size={16} strokeWidth={2} className="menu-icon" />
                <span>Agent</span>
                {agent?.status === "online" && (
                  <span className="claw-nav-status online" title="在线">●</span>
                )}
              </button>
              <button
                className={`sidebar-menu-item plain-btn ${subNav === "job" ? "active" : ""}`}
                type="button"
                onClick={() => onSubNavChange("job")}
              >
                <Clock size={16} strokeWidth={2} className="menu-icon" />
                <span>任务</span>
                <span className="item-badge count">{jobsCount}</span>
              </button>
              <button
                className={`sidebar-menu-item plain-btn ${subNav === "skill" ? "active" : ""}`}
                type="button"
                onClick={() => onSubNavChange("skill")}
              >
                <Package size={16} strokeWidth={2} className="menu-icon" />
                <span>技能</span>
                <span className="item-badge count">{skillsCount}</span>
              </button>
              <button
                className={`sidebar-menu-item plain-btn ${subNav === "tool" ? "active" : ""}`}
                type="button"
                onClick={() => onSubNavChange("tool")}
              >
                <Wrench size={16} strokeWidth={2} className="menu-icon" />
                <span>工具</span>
                <span className="item-badge count">{toolsetsCount}</span>
              </button>
            </div>
          </>
        )}

        {isOpenClawActive && (
          <>
            <div className="sidebar-section">
              <div className="section-title">OpenClaw</div>
              <button
                className={`sidebar-menu-item plain-btn ${openclawSubNav === "chat" ? "active" : ""}`}
                type="button"
                onClick={() => onOpenclawSubNavChange("chat")}
              >
                <MessageSquare size={16} strokeWidth={2} className="menu-icon" />
                <span>对话</span>
              </button>
              <button
                className={`sidebar-menu-item plain-btn ${openclawSubNav === "overview" ? "active" : ""}`}
                type="button"
                onClick={() => onOpenclawSubNavChange("overview")}
              >
                <LayoutDashboard size={16} strokeWidth={2} className="menu-icon" />
                <span>概览</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
