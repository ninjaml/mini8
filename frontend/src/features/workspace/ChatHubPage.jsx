import { useState } from "react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import { OpenClawInlineChat } from "../openclaw/OpenClawInlineChat";
import { HermesInlineChat } from "../hermes/HermesInlineChat";
import { WorkspaceMessagePanel } from "./WorkspaceMessagePanel";
import "../openclaw/openclaw.css";
import { getAgentWorkspaceSessionId } from "../../lib/agentSessions.js";

const EXTERNAL_OPENCLAW = "__openclaw__";
const EXTERNAL_HERMES = "__hermes__";

export function ChatHubPage({
  workspace,
  chatHubAgentId,
  externalAgents,
  workspaceMessages,
  workspaceMessageLoading,
  workspaceMessageSending,
  workspaceMessageError,
  workspaceMessageAgents,
  selectedWorkspaceMessageAgentSessionId,
  onChangeWorkspaceMessageAgentSessionId,
  onSubmitWorkspaceMessage,
  onRefreshWorkspaceMessages,
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
  onRemoveQueued,
  rollbackConfirm,
  confirmRollback,
  cancelRollback,
  isMultimodal,
  stopStreaming,
  dropUploadContext,
}) {
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });
  const isOpenClaw = chatHubAgentId === EXTERNAL_OPENCLAW;
  const isHermes = chatHubAgentId === EXTERNAL_HERMES;

  if (workspace && !isOpenClaw && !isHermes) {
    return (
      <section id="view-ws-chat-hub" className="view-container chat-view-container workspace-chat-page">
        <WorkspaceMessagePanel
          workspace={workspace}
          currentUserName={null}
          messages={workspaceMessages}
          loading={workspaceMessageLoading}
          sending={workspaceMessageSending}
          error={workspaceMessageError}
          agentOptions={workspaceMessageAgents}
          selectedAgentSessionId={selectedWorkspaceMessageAgentSessionId}
          onChangeSelectedAgentSessionId={onChangeWorkspaceMessageAgentSessionId}
          onSubmit={onSubmitWorkspaceMessage}
          onRefresh={onRefreshWorkspaceMessages}
        />
        </section>
      );
    }

  const currentAgent =
    !isOpenClaw && !isHermes && chatHubAgentId
      ? workspace.agents.find((a) => String(a.id) === String(chatHubAgentId)) || null
      : null;
  const showAgentSelectionEmpty = !isOpenClaw && !isHermes && !chatHubAgentId;

  const currentAgentName = isOpenClaw
    ? "OpenClaw"
    : isHermes
    ? "Hermes"
    : chatHubAgentId
    ? currentAgent?.name || "Agent"
    : "工作会话";

  const rollbackMessage = rollbackConfirm
    ? messages.find((msg) => msg.id === rollbackConfirm)
    : null;

  const handleConfirmRollback = async () => {
    try {
      await confirmRollback(onChangeDraft);
    } catch (e) {
      setAlertModal({ open: true, message: e.message || "回滚失败" });
    }
  };

  return (
    <section id="view-ws-chat-hub" className="view-container chat-view-container">
      <div className="chat-hub-chat-area" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {isOpenClaw ? (
          <OpenClawInlineChat />
        ) : isHermes ? (
          <HermesInlineChat agent={externalAgents?.hermes?.agent || null} />
        ) : showAgentSelectionEmpty ? (
          <div className="view-empty">请选择一个工作成员或外援，开始当前工作空间的会话。</div>
        ) : (
          <>
            <div className="chat-view-content" style={{ flex: 1, overflow: "auto" }}>
              <ChatFeed
                emptyText={`${currentAgentName} 还没有发出任何消息。`}
                messages={messages}
                isStreaming={isStreaming}
                hasMoreHistory={hasMoreHistory}
                isLoadingMore={isLoadingMore}
                onLoadMore={onLoadMore}
                onRollback={onRollback}
                canRollback={canRollback}
                queuedMessages={queuedMessages}
                onRemoveQueued={onRemoveQueued}
                agentName={currentAgentName}
              />
            </div>
            <BottomConsole
              disabled={disabled || showAgentSelectionEmpty}
              draft={consoleDraft}
              onChangeDraft={onChangeDraft}
              onSubmit={onSubmit}
              options={[{ value: "agent", label: currentAgentName }]}
              placeholder={`与 ${currentAgentName} 对话...`}
              selectedTarget="agent"
              targetLabel={currentAgentName}
              isMultimodal={isMultimodal}
              isStreaming={isStreaming}
              onStop={stopStreaming}
              dropUploadContext={dropUploadContext}
              skillContext={
                isOpenClaw || isHermes
                  ? null
                  : getAgentWorkspaceSessionId(currentAgent)
                  ? { agentSessionId: getAgentWorkspaceSessionId(currentAgent) }
                  : null
              }
            />
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!rollbackConfirm}
        title="确认回滚"
        message="回滚到此消息之前？该消息及之后的所有对话将被删除，且无法撤销。如果是用户消息，内容将被放入输入框。"
        messagePreview={rollbackMessage?.content}
        onConfirm={handleConfirmRollback}
        onCancel={cancelRollback}
      />

      <Modal open={alertModal.open} onClose={() => setAlertModal({ open: false, message: "" })}>
        <div style={{ padding: "24px", minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#111827" }}>提示</h3>
          <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
            {alertModal.message}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="primary-btn compact"
              onClick={() => setAlertModal({ open: false, message: "" })}
              style={{ minWidth: 80 }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
