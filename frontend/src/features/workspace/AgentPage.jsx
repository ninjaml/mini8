import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";

function getSubagentModeLabel(mode) {
  if (mode === "collaborator") return "协作者";
  if (mode === "executor") return "执行器";
  return "未启用";
}

export function AgentPage({
  agentName,
  agentSessionId = null,
  subagentMode = null,
  hasSubagentRoster = false,
  messages,
  isStreaming,
  consoleDraft,
  onChangeDraft,
  onSubmit,
  disabled,
  hasMoreHistory,
  isLoadingMore,
  onLoadMore,
  onRollback,
  canRollback,
  queuedMessages,
  dropUploadContext,
  onChangeSubagentMode,
  subagentModeSaving = false,
}) {
  return (
    <section id="view-ws-agents" className="view-container chat-view-container">
      <div className="agent-team-detail__chat-head agent-page__chat-head">
        <div>
          <div className="agent-team-detail__chat-title">与 {agentName || "工作成员"} 对话</div>
          <div className="agent-team-detail__chat-subtitle">这里是该工作成员在当前 workspace 下的稳定会话。</div>
          {/* workspace session 和 default session 复用同一套 mode 语义，避免用户跨页面理解断裂。 */}
          <div className="agent-team-detail__mode-row">
            <span className="agent-team-detail__mode-label">子Agent工作模式</span>
            {hasSubagentRoster ? (
              <div className="agent-team-detail__mode-segmented" role="group" aria-label="子Agent工作模式">
                <button
                  type="button"
                  className={`agent-team-detail__mode-option ${subagentMode === "collaborator" ? "is-active" : ""}`}
                  onClick={() => onChangeSubagentMode?.("collaborator")}
                  disabled={subagentModeSaving}
                >
                  协作者
                </button>
                <button
                  type="button"
                  className={`agent-team-detail__mode-option ${subagentMode === "executor" ? "is-active" : ""}`}
                  onClick={() => onChangeSubagentMode?.("executor")}
                  disabled={subagentModeSaving}
                >
                  执行器
                </button>
              </div>
            ) : (
              <span className="agent-team-detail__mode-pill is-disabled">{getSubagentModeLabel(subagentMode)}</span>
            )}
          </div>
        </div>
      </div>
      <div className="chat-view-content">
        <ChatFeed
          agentName={agentName || "工作成员"}
          emptyText={`${agentName || "当前工作成员"} 还没有对话记录。`}
          messages={messages}
          isStreaming={isStreaming}
          hasMoreHistory={hasMoreHistory}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          onRollback={onRollback}
          canRollback={canRollback}
          queuedMessages={queuedMessages}
        />
      </div>
      <BottomConsole
        disabled={disabled}
        draft={consoleDraft}
        onChangeDraft={onChangeDraft}
        onSubmit={onSubmit}
        options={[{ value: "agent", label: agentName || "工作成员" }]}
        placeholder={`与 ${agentName || "工作成员"} 对话...`}
        selectedTarget="agent"
        targetLabel={agentName || "工作成员"}
        dropUploadContext={dropUploadContext}
        skillContext={agentSessionId ? { agentSessionId } : null}
      />
    </section>
  );
}
