import { useState } from "react";
import { ArrowLeft, Bot, Clock3, FolderOpen, Eraser, GitBranch, History, MessageSquareText, Settings, Sparkles, Waypoints } from "lucide-react";
import { ChatFeed } from "../chat/ChatFeed";
import { BottomConsole } from "../../components/layout/BottomConsole";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import { CronManager } from "../cron/CronPage";
import { useCronUnread } from "../cron/useCronUnread";
import { api } from "../../lib/api";
import { getAgentDefaultSessionId } from "../../lib/agentSessions.js";

function formatWorkspaceList(bindings) {
  if (!bindings?.length) return "未加入工作空间";
  return bindings.map((binding) => binding.workspace_name).join("、");
}

export function AgentTeamDetailPage({
  agent,
  subagents = [],
  subagentsLoading = false,
  onExportAgentPackage,
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
  onBack,
  onOpenConfig,
  onManageSubagents,
  onOpenSubagent,
  onClearSession,
  onOpenCronHistory,
  showCronHistoryEntry = false,
  onCronMutated,
  primaryKey = null,
  onChangeSubagentMode,
  subagentModeSaving = false,
}) {
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });
  const [clearSessionConfirmOpen, setClearSessionConfirmOpen] = useState(false);
  const [cronModalOpen, setCronModalOpen] = useState(false);
  const defaultSessionId = getAgentDefaultSessionId(agent);
  const rollbackMessage = rollbackConfirm
    ? messages.find((message) => message.id === rollbackConfirm)
    : null;
  const { hasUnread, markRead } = useCronUnread({
    kind: "agent_session",
    agentSessionId: defaultSessionId,
    enabled: Boolean(defaultSessionId) && showCronHistoryEntry,
  });

  const handleConfirmRollback = async () => {
    try {
      await confirmRollback(onChangeDraft);
    } catch (error) {
      setAlertModal({ open: true, message: error.message || "回滚失败" });
    }
  };

  const handleClearSession = () => {
    setClearSessionConfirmOpen(true);
  };

  const handleConfirmClearSession = async () => {
    try {
      setClearSessionConfirmOpen(false);
      const ok = await onClearSession?.();
      if (ok === false) {
        setAlertModal({ open: true, message: "清理会话历史失败" });
      }
    } catch (error) {
      setAlertModal({ open: true, message: error.message || "清理会话历史失败" });
    }
  };

  const handleOpenLocalPath = async (path) => {
    if (!path) {
      setAlertModal({ open: true, message: "本地路径未设置" });
      return;
    }
    try {
      await api.openLocalPath(path);
    } catch (error) {
      setAlertModal({ open: true, message: error.message || "打开本地目录失败" });
    }
  };

  if (!agent) {
    return <div className="view-empty">正在加载 Agent 详情...</div>;
  }

  return (
    <section id="view-agent-team-detail" className="view-container agent-team-detail">
      <aside className="dash-card agent-team-detail__sidebar">
        <div className="agent-team-detail__sidebar-scroll">
          <div className="agent-team-detail__toolbar">
            <button className="plain-btn agent-team-detail__toolbar-btn" type="button" onClick={onBack}>
              <ArrowLeft size={14} />
              返回团队
            </button>
            <div className="agent-team-detail__toolbar-actions">
              <button className="plain-btn agent-team-detail__toolbar-btn" type="button" onClick={onExportAgentPackage}>
                导出 Agent
              </button>
              <button className="plain-btn agent-team-detail__toolbar-btn" type="button" onClick={onOpenConfig}>
                <Settings size={14} />
                配置
              </button>
            </div>
          </div>

          <div className="agent-team-detail__hero">
            <div className="agent-team-detail__hero-icon">
              <Bot size={24} strokeWidth={2.1} />
            </div>
            <div className="agent-team-detail__hero-copy">
              <div className="agent-team-detail__hero-title">{agent.name}</div>
              <div className="agent-team-detail__hero-subtitle">主会话</div>
            </div>
          </div>

          <div className="agent-team-detail__summary-grid">
            <div className="agent-team-detail__summary-card">
              <div className="agent-team-detail__summary-label">当前专家人格</div>
              <div className="agent-team-detail__summary-value is-tagged">
                <Sparkles size={14} strokeWidth={2.1} />
                {agent.persona_name || "无"}
              </div>
            </div>
            <div className="agent-team-detail__summary-card">
              <div className="agent-team-detail__summary-label">技能数量</div>
              <div className="agent-team-detail__summary-value">{agent.base_resources?.total_skill_count || 0} 个技能</div>
            </div>
          </div>

          <div className="agent-team-detail__section">
            <div className="agent-team-detail__section-title">
              <Waypoints size={14} strokeWidth={2.1} />
              服务中的工作空间
            </div>
            <div className="agent-team-detail__section-content">{formatWorkspaceList(agent.workspace_bindings)}</div>
          </div>

          <div className="agent-team-detail__section">
            <div className="agent-team-detail__section-title">
              <FolderOpen size={14} strokeWidth={2.1} />
              工作目录
            </div>
            <div className="agent-team-detail__section-content agent-team-detail__path">{agent.effective_default_working_dir || agent.default_working_dir || "未设置"}</div>
            {(agent.effective_default_working_dir || agent.default_working_dir) ? (
              <button className="plain-btn agent-team-detail__inline-btn" type="button" onClick={() => handleOpenLocalPath(agent.effective_default_working_dir || agent.default_working_dir)}>
                <FolderOpen size={14} />
                打开本地目录
              </button>
            ) : null}
          </div>

          <div className="agent-team-detail__section">
            <div className="agent-team-detail__section-title agent-team-detail__section-title--spread">
              <span className="agent-team-detail__section-title-text">
                <GitBranch size={14} strokeWidth={2.1} />
                子Agent团队
              </span>
              <span className="agent-team-detail__thread-chip">{subagents.length} 个</span>
            </div>
            {subagentsLoading ? (
              <div className="agent-team-detail__section-content">正在加载子Agent...</div>
            ) : subagents.length === 0 ? (
              <div className="agent-team-detail__section-content">当前还没有配置子Agent。</div>
            ) : (
              <div className="agent-team-detail__subagent-list">
                {subagents.map((binding) => (
                  <button
                    key={binding.id}
                    type="button"
                    className="plain-btn agent-team-detail__subagent-item"
                    onClick={() => onOpenSubagent?.(binding.child_agent_id)}
                  >
                    <div className="agent-team-detail__subagent-top">
                      <span className="agent-team-detail__subagent-name">{binding.subagent_name}</span>
                      <span className="agent-team-detail__subagent-target">{binding.child_agent_name || `Agent #${binding.child_agent_id}`}</span>
                    </div>
                    <div className="agent-team-detail__subagent-desc">{binding.description}</div>
                  </button>
                ))}
              </div>
            )}
            <button className="plain-btn agent-team-detail__inline-btn" type="button" onClick={onManageSubagents}>
              <Settings size={14} />
              管理子Agent
            </button>
          </div>
        </div>
      </aside>

        <div className="dash-card agent-team-detail__chat-shell chat-view-container">
          <div className="agent-team-detail__chat-head">
            <div>
              <div className="agent-team-detail__chat-title">
                <MessageSquareText size={18} strokeWidth={2.1} />
                与 {agent.name} 对话
              </div>
              <div className="agent-team-detail__chat-subtitle">这里是该 Agent 的主会话，专家人格会在运行时以内存叠加方式叠加。</div>
            </div>
            <div className="agent-team-detail__chat-actions">
              {defaultSessionId ? (
                <button className="plain-btn agent-team-detail__clear-btn" type="button" onClick={() => setCronModalOpen(true)}>
                  <Clock3 size={14} />
                  配置定时
                </button>
              ) : null}
              {onOpenCronHistory && showCronHistoryEntry ? (
                <button
                  className="plain-btn agent-team-detail__clear-btn agent-team-detail__history-btn"
                  type="button"
                  onClick={() => {
                    markRead();
                    onOpenCronHistory();
                  }}
                >
                  <History size={14} />
                  查看历史
                  {hasUnread ? <span className="agent-team-detail__history-dot" /> : null}
                </button>
              ) : null}
              <button className="plain-btn agent-team-detail__clear-btn" type="button" onClick={handleClearSession}>
                <Eraser size={14} />
                清空会话历史
              </button>
            </div>
          </div>

        <div className="chat-view-content agent-team-detail__chat-feed">
          <ChatFeed
            agentName={agent.name}
            emptyText={`${agent.name} 还没有对话记录。`}
            messages={messages}
            isStreaming={isStreaming}
            hasMoreHistory={hasMoreHistory}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            onRollback={onRollback}
            canRollback={canRollback}
            queuedMessages={queuedMessages}
            onRemoveQueued={onRemoveQueued}
          />
        </div>

        <BottomConsole
          disabled={disabled}
          draft={consoleDraft}
          onChangeDraft={onChangeDraft}
          onSubmit={onSubmit}
          options={[{ value: "agent", label: agent.name }]}
          placeholder={`与 ${agent.name} 对话...`}
          selectedTarget="agent"
          targetLabel={agent.name}
          isMultimodal={isMultimodal}
          isStreaming={isStreaming}
          onStop={stopStreaming}
          dropUploadContext={{ agentSessionId: defaultSessionId, primaryKey }}
          skillContext={defaultSessionId ? { agentSessionId: defaultSessionId } : null}
        />
      </div>

      <ConfirmDialog
        isOpen={!!rollbackConfirm}
        title="确认回滚"
        message="回滚到此消息之前？该消息及之后的所有对话将被删除，且无法撤销。如果是用户消息，内容将被放入输入框。"
        messagePreview={rollbackMessage?.content}
        onConfirm={handleConfirmRollback}
        onCancel={cancelRollback}
      />

      <ConfirmDialog
        isOpen={clearSessionConfirmOpen}
        title="确认清空会话历史"
        message="清空后，这个会话的历史消息将被删除，且无法撤销。是否继续？"
        onConfirm={handleConfirmClearSession}
        onCancel={() => setClearSessionConfirmOpen(false)}
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

      <Modal open={cronModalOpen} onClose={() => setCronModalOpen(false)} className="modal-cron">
        <div style={{ padding: 24 }}>
          <CronManager
            scope={defaultSessionId ? {
              kind: "agent_session",
              agentRefId: agent.id,
              agentSessionId: defaultSessionId,
              label: `${agent.name} 的定时任务`,
            } : null}
            title={agent ? `${agent.name} · 定时任务` : "定时任务"}
            subtitle="只管理当前 agent 的自动化任务。"
            embedded
            showSummary={false}
            emptyText="当前对象还没有定时任务"
            onMutate={onCronMutated}
          />
        </div>
      </Modal>
    </section>
  );
}



