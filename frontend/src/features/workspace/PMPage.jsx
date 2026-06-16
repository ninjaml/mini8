import { useState } from "react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { Modal } from "../../components/common/Modal";

export function PMPage({
  messages,
  superAgentName,
  workspaceId,
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

  const rollbackMessage = rollbackConfirm
    ? messages.find(msg => msg.id === rollbackConfirm)
    : null;

  const handleConfirmRollback = async () => {
    try {
      await confirmRollback(onChangeDraft);
    } catch (e) {
      setAlertModal({ open: true, message: e.message || "回滚失败" });
    }
  };

  return (
    <section id="view-ws-pm" className="view-container chat-view-container">
      <div className="chat-view-content">
        <ChatFeed
          emptyText={`${superAgentName} 还没有发出任何消息。`}
          messages={messages}
          isStreaming={isStreaming}
          hasMoreHistory={hasMoreHistory}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          onRollback={onRollback}
          canRollback={canRollback}
          queuedMessages={queuedMessages}
          onRemoveQueued={onRemoveQueued}
          agentName={superAgentName || "项目经理"}
        />
      </div>
      <BottomConsole
        disabled={disabled}
        draft={consoleDraft}
        onChangeDraft={onChangeDraft}
        onSubmit={onSubmit}
        options={[{ value: "pm", label: superAgentName || "项目经理" }]}
        placeholder={`与 ${superAgentName || "项目经理"} 对话...`}
        selectedTarget="pm"
        targetLabel={superAgentName || "项目经理"}
        isMultimodal={isMultimodal}
        isStreaming={isStreaming}
        onStop={stopStreaming}
        dropUploadContext={dropUploadContext}
        skillContext={{ kind: "workspace_superagent", id: workspaceId }}
      />
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
