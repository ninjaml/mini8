import { useState, useEffect } from "react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { Modal } from "../../components/common/Modal";

export function GlobalPage({
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
  rollbackConfirm,
  confirmRollback,
  cancelRollback,
  onRemoveQueued,
  isMultimodal,
  stopStreaming,
  displayName,
  dropUploadContext,
}) {
  const [showWelcome, setShowWelcome] = useState(false);
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });

  useEffect(() => {
    // Check if user has started conversation with MOSS in this session
    const hasStartedMoss = sessionStorage.getItem("moss_conversation_started");
    console.log('[GlobalPage] hasStartedMoss:', hasStartedMoss);
    console.log('[GlobalPage] messages.length:', messages.length);
    console.log('[GlobalPage] Should show welcome:', !hasStartedMoss);

    // Show welcome screen if this is a new session (regardless of message history)
    if (!hasStartedMoss) {
      setShowWelcome(true);
    } else {
      setShowWelcome(false);
    }
  }, [messages.length]);

  const handleStartConversation = () => {
    console.log('[GlobalPage] Starting conversation, setting sessionStorage');
    sessionStorage.setItem("moss_conversation_started", "true");
    setShowWelcome(false);
  };

  const handleSubmit = (attachments) => {
    if (showWelcome) {
      handleStartConversation();
    }
    onSubmit(attachments);
  };

  // Find the message content for preview
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
    <section className="view-container chat-view-container">
      <div className={`chat-view-content ${showWelcome ? "chat-view-content--welcome" : ""}`}>
        {showWelcome ? (
          <div className="moss-welcome-screen">
            <div className="moss-welcome-content">
              <div className="moss-big-icon">🧠</div>
              <h2>你好, {displayName || "Admin"}. 我是 MOSS.</h2>
              <p>
                我是 Mini8 的全局意识，负责监控系统稳定性、调度跨空间资源以及处理企业级逻辑。您可以直接下达全局指令，也可以在左侧新建并接管新的工作空间。
              </p>
              <button className="primary-btn moss-start-btn" onClick={handleStartConversation}>
                开始对话
              </button>
            </div>
          </div>
        ) : (
          <ChatFeed
            emptyText="MOSS 当前没有新的系统消息。"
            messages={messages}
            isStreaming={isStreaming}
            hasMoreHistory={hasMoreHistory}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            onRollback={onRollback}
            canRollback={canRollback}
            queuedMessages={queuedMessages}
            onRemoveQueued={onRemoveQueued}
            agentName="MOSS"
          />
        )}
      </div>
      {!showWelcome ? (
        <BottomConsole
          disabled={disabled}
          draft={consoleDraft}
          onChangeDraft={onChangeDraft}
          onSubmit={handleSubmit}
          options={[{ value: "moss", label: "MOSS" }]}
          placeholder="键入指令或与 MOSS 对话..."
          selectedTarget="moss"
          targetLabel="MOSS"
          isMultimodal={isMultimodal}
          isStreaming={isStreaming}
          onStop={stopStreaming}
          dropUploadContext={dropUploadContext}
          skillContext={{ kind: "moss" }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={!!rollbackConfirm}
        title="确认回滚"
            message="回滚到此消息之前？这将删除此消息及之后的所有对话，且无法撤销。消息内容将被放入输入框。"
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

