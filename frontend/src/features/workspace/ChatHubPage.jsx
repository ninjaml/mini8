import { useState } from "react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import { OpenClawInlineChat } from "../openclaw/OpenClawInlineChat";
import { HermesInlineChat } from "../hermes/HermesInlineChat";
import "../openclaw/openclaw.css";

const EXTERNAL_OPENCLAW = "__openclaw__";
const EXTERNAL_HERMES = "__hermes__";

export function ChatHubPage({
  workspace,
  chatHubAgentId,
  externalAgents,
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

  const currentAgentName = isOpenClaw
    ? "OpenClaw"
    : isHermes
    ? "Hermes"
    : chatHubAgentId
    ? workspace.agents.find((a) => String(a.id) === String(chatHubAgentId))?.name || "WorkAgent"
    : workspace.superAgentName || "项目经理";

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
              disabled={disabled}
              draft={consoleDraft}
              onChangeDraft={onChangeDraft}
              onSubmit={onSubmit}
              options={[{ value: chatHubAgentId ? "agent" : "pm", label: currentAgentName }]}
              placeholder={`与 ${currentAgentName} 对话...`}
              selectedTarget={chatHubAgentId ? "agent" : "pm"}
              targetLabel={currentAgentName}
              isMultimodal={isMultimodal}
              isStreaming={isStreaming}
              onStop={stopStreaming}
              dropUploadContext={dropUploadContext}
              skillContext={
                isOpenClaw || isHermes
                  ? null
                  : chatHubAgentId
                  ? { kind: "workagent", id: chatHubAgentId }
                  : { kind: "workspace_superagent", id: workspace.id }
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
