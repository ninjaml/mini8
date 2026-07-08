import { Bot, BookOpen, Link, Radio, Building2, ListTodo, MessageSquare } from "lucide-react";
import { ChatBubbleBadge } from "../common/ChatBubbleBadge";
import { buildSpaceBuddyEntries, EXTERNAL_OPENCLAW } from "./sidebarBuddyEntries";

export function Sidebar({
  currentWorkspace,
  isRefreshingKnowledge,
  selectedKnowledgeId,
  viewId,
  chatHubBadge,
  chatHubAgentId,
  externalAgents,
  workspaceAgentChatBadgeById,
  onOpenChatHub,
  onCheckExternalAgent,
  onOpenCreateKnowledge,
  onOpenOffice,
  onOpenTasks,
  onOpenKnowledge,
  onRefreshKnowledge,
  hideHeader = false,
}) {
  if (viewId === 'global' || viewId === 'home' || !currentWorkspace) {
    return null;
  }

  const buddyEntries = buildSpaceBuddyEntries({
    workspace: currentWorkspace,
    externalAgents,
  });
  const externalEntries = buddyEntries.filter((entry) => entry.type === "external");
  const chatHubIconFill = viewId === "ws_chat_hub" ? "#10b981" : "#111827";

  return (
    <aside className="app-sidebar">
      {!hideHeader && (
        <div className="sidebar-header">
          <h2>{currentWorkspace.name}</h2>
        </div>
      )}
      <div className="sidebar-content">
        <div className="sidebar-separator"></div>
        <div className="sidebar-section">
          <div className="section-title" style={{ color: "#6b7280" }}>看板</div>
          <button
            className={`sidebar-menu-item plain-btn ${viewId === "ws_office" ? "active" : ""}`}
            type="button"
            onClick={onOpenOffice}
          >
            <Building2 size={16} strokeWidth={2} className="menu-icon" />
            <span>工作室</span>
          </button>
          <button
            className={`sidebar-menu-item plain-btn ${viewId === "ws_chat_hub" ? "active" : ""}`}
            type="button"
            onClick={onOpenChatHub}
          >
            <MessageSquare size={16} strokeWidth={2.1} className="menu-icon" color={chatHubIconFill} fill="none" />
            <span>指令下达</span>
            {chatHubBadge ? <ChatBubbleBadge className="sidebar-chat-bubble" /> : null}
          </button>
          <button
            className={`sidebar-menu-item plain-btn ${viewId === "ws_tasks" ? "active" : ""}`}
            type="button"
            onClick={onOpenTasks}
          >
            <ListTodo size={16} strokeWidth={2} className="menu-icon" />
            <span>任务列表</span>
          </button>
        </div>
        <div className="sidebar-separator"></div>

        {externalEntries.length ? (
          <>
            <div className="sidebar-section">
              <div className="section-title" style={{ color: "#6b7280" }}>外援</div>
              {externalEntries.map((entry) => {
                const icon = entry.id === EXTERNAL_OPENCLAW
                  ? <Link size={16} strokeWidth={2} className="menu-icon" />
                  : <Radio size={16} strokeWidth={2} className="menu-icon" />;
                const isActive =
                  viewId === "ws_chat_hub" &&
                  String(chatHubAgentId) === String(entry.id);
                return (
                  <button
                    key={`buddy-${entry.id}`}
                    className={`sidebar-menu-item plain-btn ${isActive ? "active" : ""}`}
                    type="button"
                    onClick={async () => {
                      if (entry.connected) {
                        onOpenChatHub?.(entry.id);
                      } else {
                        await onCheckExternalAgent?.(entry.id === EXTERNAL_OPENCLAW ? "openclaw" : "hermes");
                      }
                    }}
                    style={{
                      opacity: !entry.connected ? 0.4 : 1,
                      marginBottom: 4,
                    }}
                    title={
                      !entry.connected
                        ? `${entry.label} 未连接，点击检查连接状态`
                        : entry.label
                    }
                  >
                    {icon}
                    <span>{entry.label}</span>
                    <span
                      className="item-badge"
                      style={{
                        background: entry.connected ? "#dcfce7" : "#f3f4f6",
                        color: entry.connected ? "#16a34a" : "#9ca3af",
                        fontSize: 10,
                        marginLeft: "auto",
                      }}
                    >
                      {entry.connected ? "在线" : "离线"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="sidebar-separator"></div>
          </>
        ) : null}

        <div className="sidebar-section">
          <div className="section-title" style={{ color: "#6b7280" }}>
            知识库
            <button className="section-add-btn plain-btn" type="button" onClick={onOpenCreateKnowledge} style={{ fontSize: 12 }}>
              + Add
            </button>
          </div>
          {currentWorkspace.knowledge.map((entry) => (
            <button
              key={entry.id}
              className={`sidebar-menu-item plain-btn ${
                viewId === "ws_kb" && selectedKnowledgeId === entry.id ? "active" : ""
              }`}
              type="button"
              onClick={() => onOpenKnowledge(entry.id)}
            >
              <BookOpen size={16} strokeWidth={2} className="menu-icon" />
              <span>{entry.title}</span>
            </button>
          ))}

        </div>
      </div>
    </aside>
  );
}
