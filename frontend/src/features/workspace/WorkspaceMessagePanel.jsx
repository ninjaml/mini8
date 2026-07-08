import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, MessageSquare } from "lucide-react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { Tooltip } from "../../components/common/Tooltip";
import { api } from "../../lib/api";
import { runtime } from "../../lib/runtime";
import { RuntimeReplayModal } from "../modals/RuntimeReplayModal";

export function WorkspaceMessagePanel({
  workspace,
  currentUserName,
  messages,
  loading,
  sending,
  error,
  agentOptions,
  selectedAgentSessionId,
  onChangeSelectedAgentSessionId,
  onSubmit,
  onRefresh,
}) {
  const [draft, setDraft] = useState("");
  const [executionDetail, setExecutionDetail] = useState(null);
  const [executionDetailOpen, setExecutionDetailOpen] = useState(false);
  const [executionDetailLoading, setExecutionDetailLoading] = useState(false);
  const [executionDetailError, setExecutionDetailError] = useState("");
  const [targetFlash, setTargetFlash] = useState(false);
  const targetFlashTimerRef = useRef(null);

  const selectedAgent = useMemo(
    () => agentOptions.find((option) => option.sessionId === selectedAgentSessionId) || null,
    [agentOptions, selectedAgentSessionId],
  );
  const workspaceDir = workspace?.workingDir || "";

  useEffect(() => {
    return () => {
      if (targetFlashTimerRef.current) {
        window.clearTimeout(targetFlashTimerRef.current);
        targetFlashTimerRef.current = null;
      }
    };
  }, []);

  async function handleInspectExecution(message) {
    if (!message?.threadId || !message?.groupId) return;
    setExecutionDetailOpen(true);
    setExecutionDetailLoading(true);
    setExecutionDetailError("");
    try {
      // 直接按 group_id 取单次执行明细，避免前端为了一张卡片把整段分页历史全翻一遍。
      const payload = await runtime.fetchReplayGroup({
        threadId: message.threadId,
        groupId: message.groupId,
      });
      const replayGroup = payload?.group || null;

      setExecutionDetail({
        agentName: message.agentName || message.targetAgentName || "Agent",
        threadId: message.threadId,
        groupId: message.groupId,
        replayGroup,
      });
    } catch (err) {
      setExecutionDetail(null);
      setExecutionDetailError(err.message || "加载执行详情失败");
    } finally {
      setExecutionDetailLoading(false);
    }
  }

  async function handleSubmit(_attachments = [], overrideText = null) {
    const text = (overrideText ?? draft).trim();
    if (!text) return;
    if (!selectedAgentSessionId) {
      setTargetFlash(false);
      window.requestAnimationFrame(() => setTargetFlash(true));
      if (targetFlashTimerRef.current) {
        window.clearTimeout(targetFlashTimerRef.current);
      }
      targetFlashTimerRef.current = window.setTimeout(() => {
        setTargetFlash(false);
        targetFlashTimerRef.current = null;
      }, 900);
      return false;
    }
    const ok = await onSubmit(text);
    if (ok) {
      setDraft("");
    }
  }

  return (
    <aside className="office-page__chat-panel dash-card chat-view-container">
      <div className="office-page__chat-head">
        <div>
          <div className="office-page__chat-title">
            <MessageSquare size={16} strokeWidth={2} className="office-page__chat-title-icon menu-icon" color="#10b981" fill="none" />
            工作空间消息
          </div>
          <div className="office-page__chat-subtitle">
            先选一个回复对象，再发送消息。
          </div>
        </div>
        <div className="office-page__chat-head-actions">
          <div className="office-page__chat-working-dir-inline">
            {workspaceDir || "未设置"}
          </div>
          <Tooltip text={workspaceDir ? "打开本地目录" : "未设置工作目录"}>
            <button
              className="office-page__chat-title-action"
              type="button"
              disabled={!workspaceDir}
              onClick={() => {
                if (!workspaceDir) return;
                api.openLocalPath(workspaceDir);
              }}
            >
              <FolderOpen size={14} strokeWidth={2} />
              打开本地工作目录
            </button>
          </Tooltip>
        </div>
      </div>

      {error ? <div className="office-page__chat-error">{error}</div> : null}

      <div className="office-page__chat-feed">
        <ChatFeed
          emptyText={loading ? "正在加载工作空间消息..." : "当前还没有工作空间消息。"}
          messages={Array.isArray(messages) ? messages : []}
          isStreaming={false}
          onInspectExecution={handleInspectExecution}
        />
      </div>

      <BottomConsole
        disabled={sending || agentOptions.length === 0}
        draft={draft}
        onChangeDraft={setDraft}
        onSubmit={handleSubmit}
        placeholder={selectedAgent ? `对 ${selectedAgent.name} 说点什么...` : "先选择一个对象，再说点什么..."}
        isSubmitting={sending}
        submittingLabel={selectedAgent ? `正在等待 ${selectedAgent.name}` : "执行中"}
        isStreaming={false}
        workspaceTargetOptions={agentOptions}
        workspaceTargetSelected={selectedAgentSessionId}
        workspaceTargetFlash={targetFlash}
        onChangeWorkspaceTarget={onChangeSelectedAgentSessionId}
      />

      <RuntimeReplayModal
        open={executionDetailOpen}
        detail={executionDetail}
        loading={executionDetailLoading}
        error={executionDetailError}
        onClose={() => {
          setExecutionDetailOpen(false);
          setExecutionDetail(null);
          setExecutionDetailError("");
        }}
      />
    </aside>
  );
}
