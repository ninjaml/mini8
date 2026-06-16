import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";

export function AgentPage({
  agentName,
  agentId,
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
}) {
  return (
    <section id="view-ws-agents" className="view-container chat-view-container">
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
        skillContext={agentId ? { kind: "workagent", id: agentId } : null}
      />
    </section>
  );
}
