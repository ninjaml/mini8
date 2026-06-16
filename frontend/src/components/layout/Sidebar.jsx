import { Bot, FolderKanban, BookOpen, LayoutDashboard, Crown, Link, Radio, Building2 } from "lucide-react";
import { ChatBubbleBadge } from "../common/ChatBubbleBadge";
import { buildSpaceBuddyEntries, EXTERNAL_HERMES, EXTERNAL_OPENCLAW } from "./sidebarBuddyEntries";

export function Sidebar({
  currentWorkspace,
  isRefreshingItems,
  isRefreshingKnowledge,
  selectedItemId,
  selectedKnowledgeId,
  viewId,
  chatHubBadge,
  chatHubAgentId,
  externalAgents,
  showSuperAgentChatBadge,
  workAgentChatBadgeById,
  onOpenChatHub,
  onOpenPM,
  onOpenAgent,
  onOpenCreateAgent,
  onDeleteAgent,
  onCheckExternalAgent,
  onOpenCreateItem,
  onOpenCreateKnowledge,
  onOpenDashboard,
  onOpenOffice,
  onOpenItem,
  onOpenKnowledge,
  onRefreshItems,
  onRefreshKnowledge,
  hideHeader = false,
}) {
  // Don't show sidebar in global/home view or when no workspace
  if (viewId === 'global' || viewId === 'home' || !currentWorkspace) {
    return null;
  }

  const buddyEntries = buildSpaceBuddyEntries({
    workspace: currentWorkspace,
    externalAgents,
  });
  const pmEntry = buddyEntries.find((entry) => entry.type === "pm") || null;
  const memberEntries = buddyEntries.filter((entry) => entry.type === "agent");
  const externalEntries = buddyEntries.filter((entry) => entry.type === "external");

  function renderBuddyEntry(entry) {
    const isExternal = entry.type === "external";
    const isPM = entry.type === "pm";
    const isActive =
      viewId === "ws_chat_hub" &&
      ((isPM && !chatHubAgentId) || (!isPM && String(chatHubAgentId) === String(entry.id)));

    const icon = isPM
      ? <Crown size={16} strokeWidth={2} className="menu-icon" />
      : isExternal
      ? entry.id === EXTERNAL_OPENCLAW
        ? <Link size={16} strokeWidth={2} className="menu-icon" />
        : <Radio size={16} strokeWidth={2} className="menu-icon" />
      : <Bot size={16} strokeWidth={2} className="menu-icon" />;

    if (entry.type === "agent") {
      return (
        <div
          key={`buddy-${entry.id}`}
          className={`sidebar-menu-item plain-btn agent-row ${isActive ? "active" : ""}`}
          style={{ padding: 0, marginBottom: 4 }}
        >
          <button
            className="agent-row-main"
            type="button"
            onClick={() => onOpenAgent(entry.id)}
            style={{ width: "100%" }}
          >
            {icon}
            <span className="agent-name">{entry.label}</span>
            {workAgentChatBadgeById?.[String(entry.id)] ? (
              <ChatBubbleBadge className="sidebar-chat-bubble" />
            ) : null}
            <span
              className="item-badge count"
              title={entry.taskCount > 0 ? `binding: ${entry.tasks.join(", ")}` : "binding: 无"}
            >
              {entry.taskCount}
            </span>
          </button>
          <button
            className="agent-row-delete"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteAgent(entry.id, entry.label);
            }}
          >
            ×
          </button>
        </div>
      );
    }

    return (
      <button
        key={`buddy-${entry.id ?? "pm"}`}
        className={`sidebar-menu-item plain-btn ${isActive ? "active" : ""}`}
        type="button"
        onClick={
          isPM
            ? onOpenPM
            : async () => {
                if (entry.connected) {
                  onOpenAgent(entry.id);
                } else {
                  await onCheckExternalAgent?.(entry.id === EXTERNAL_OPENCLAW ? "openclaw" : "hermes");
                }
              }
        }
        style={{
          opacity: isExternal && !entry.connected ? 0.4 : 1,
          marginBottom: 4,
        }}
        title={
          isExternal && !entry.connected
            ? `${entry.label} 未连接，点击检查连接状态`
            : entry.label
        }
      >
        {icon}
        <span>{entry.label}</span>
        {isPM && showSuperAgentChatBadge ? <ChatBubbleBadge className="sidebar-chat-bubble" /> : null}
        {isExternal ? (
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
        ) : null}
      </button>
    );
  }

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
            className={`sidebar-menu-item plain-btn ${viewId === "ws_dashboard" ? "active" : ""}`}
            type="button"
            onClick={onOpenDashboard}
          >
            <LayoutDashboard size={16} strokeWidth={2} className="menu-icon" />
            <span>运行总览</span>
          </button>
        </div>
        <div className="sidebar-separator"></div>

        {pmEntry ? (
          <>
            <div className="sidebar-section">
              <div className="section-title" style={{ color: "#6b7280" }}>项目经理</div>
              {renderBuddyEntry(pmEntry)}
            </div>
            <div className="sidebar-separator"></div>
          </>
        ) : null}

        <div className="sidebar-section">
          <div className="section-title" style={{ color: "#6b7280" }}>
            工作成员
            <button className="section-add-btn plain-btn" type="button" onClick={onOpenCreateAgent} style={{ fontSize: 12 }}>
              + Add
            </button>
          </div>
          {memberEntries.map(renderBuddyEntry)}
        </div>
        <div className="sidebar-separator"></div>

        {externalEntries.length ? (
          <>
            <div className="sidebar-section">
              <div className="section-title" style={{ color: "#6b7280" }}>外援</div>
              {externalEntries.map(renderBuddyEntry)}
            </div>
            <div className="sidebar-separator"></div>
          </>
        ) : null}

        <div className="sidebar-section">
          <div className="section-title" style={{ color: "#6b7280" }}>
            任务
            <button className="section-add-btn plain-btn" type="button" onClick={onOpenCreateItem} style={{ fontSize: 12 }}>
              + Add
            </button>
          </div>
          {currentWorkspace.items.map((item) => (
            <button
              key={item.id}
              className={`sidebar-menu-item plain-btn ${
                viewId === "ws_items" && selectedItemId === item.id ? "active" : ""
              }`}
              type="button"
              onClick={() => onOpenItem(item.id)}
            >
              <FolderKanban size={16} strokeWidth={2} className="menu-icon" />
              <span>{item.title}</span>
              <span className="item-badge count">{item.submissions.length}</span>
            </button>
          ))}

        </div>
        <div className="sidebar-separator"></div>

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
