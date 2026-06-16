function JoyIcon() {
  return (
    <svg
      className="joy-header-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function MossBrainIcon() {
  return (
    <svg
      className="header-moss-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 18V5"></path>
      <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"></path>
      <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"></path>
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"></path>
      <path d="M18 18a4 4 0 0 0 2-7.464"></path>
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"></path>
      <path d="M6 18a4 4 0 0 1-2-7.464"></path>
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"></path>
    </svg>
  );
}

import { useState, useEffect } from "react";
import { FolderOpen, Puzzle, Settings, Eraser, HelpCircle, Gift, MessageCircle, ExternalLink, Clock3, History, ArrowLeft } from "lucide-react";
import { Tooltip } from "../common/Tooltip";
import { Modal } from "../common/Modal";
import { AgentWorkingDirModal } from "../../features/modals/AgentWorkingDirModal";
import { CronManager } from "../../features/cron/CronPage";
import { useCronUnread } from "../../features/cron/useCronUnread";

function toCronScope(agentKind, agentRefId, title) {
  if (!agentKind) return null;
  if (agentKind === "moss") {
    return { kind: "moss", targetId: null, label: title || "MOSS" };
  }
  if (agentKind === "superagent") {
    return {
      kind: "workspace_superagent",
      targetId: agentRefId,
      label: title ? `${title} 的定时任务` : `项目经理 #${agentRefId}`,
    };
  }
  if (agentKind === "workagent") {
    return {
      kind: "workagent",
      targetId: agentRefId,
      label: title ? `${title} 的定时任务` : `执行专员 #${agentRefId}`,
    };
  }
  return null;
}

export function Header({ currentWorkspaceName, title, icon, onOpenExternalLink, onOpenSettings, onDeleteSession, showBrand = true, isHome = false, agentKind = null, agentRefId = null, showCronHistoryEntry = false, onOpenCronHistory, onCronMutated, isInCronHistory = false, onBackToChat }) {
  const [showDirModal, setShowDirModal] = useState(false);
  const [showCronModal, setShowCronModal] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const cronScope = toCronScope(agentKind, agentRefId, title);
  const { hasUnread, markRead } = useCronUnread({
    kind: cronScope?.kind,
    targetId: cronScope?.targetId,
    enabled: !!agentKind && !!cronScope && !isInCronHistory,
  });

  useEffect(() => {
    if (!helpOpen) return;
    function handleDocClick(e) {
      if (!e.target.closest('.help-menu-wrapper')) {
        setHelpOpen(false);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [helpOpen]);
  return (
    <header className="top-header">
      <div className="header-left">
        {isHome ? (
          <span className="header-brand">Mini8</span>
        ) : (
          <>
            {showBrand ? (
              <>
                <span className="header-brand">Mini8</span>
                <span className="header-divider">|</span>
              </>
            ) : null}
            <span className="header-title-icon">{icon || <MossBrainIcon />}</span>
            <h1>{title}</h1>
            <div className="header-status">
              <span className="dot green"></span>
              {currentWorkspaceName ? `${currentWorkspaceName} 已接入` : "系统核心已连接"}
            </div>
            {agentKind && (
              <div style={{ display: 'flex', marginLeft: 8 }}>
                <Tooltip text="当前对象的定时任务">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setShowCronModal(true)}
                  >
                    <Clock3 size={16} strokeWidth={2} />
                  </button>
                </Tooltip>
                <Tooltip text="工作目录">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setShowDirModal(true)}
                  >
                    <FolderOpen size={16} strokeWidth={2} />
                  </button>
                </Tooltip>
                <Tooltip text="清空当前对话">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={onDeleteSession}
                  >
                    <Eraser size={16} strokeWidth={2} />
                  </button>
                </Tooltip>
                {showCronHistoryEntry && (
                  <Tooltip text={isInCronHistory ? "返回对话" : "定时任务历史"}>
                    <button
                      className="icon-btn icon-btn--label"
                      type="button"
                      onClick={isInCronHistory ? onBackToChat : () => { markRead(); onOpenCronHistory(); }}
                      style={{ marginLeft: 14, position: "relative" }}
                    >
                      {isInCronHistory ? (
                        <ArrowLeft size={14} strokeWidth={2} />
                      ) : (
                        <History size={14} strokeWidth={2} />
                      )}
                      {isInCronHistory ? "返回对话" : "定时任务历史"}
                      {hasUnread && !isInCronHistory && (
                        <span
                          style={{
                            position: "absolute",
                            top: 1,
                            right: 1,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "#ef4444",
                            border: "2px solid #fff",
                          }}
                        />
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="header-right">
        <div className="header-context-actions"></div>
        <div className="help-menu-wrapper">
          <Tooltip text="帮助">
            <button
              className="icon-btn"
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
            >
              <HelpCircle className="header-help-icon" size={20} strokeWidth={2} />
            </button>
          </Tooltip>
          {helpOpen && (
            <div className="help-dropdown">
              <a
                className="help-dropdown-item"
                href="https://ocnko0ovs8al.feishu.cn/wiki/Gj2KwDzTRiQXgPkR9ZVcQQHqnWb?from=from_copylink"
                target="_blank"
                rel="noreferrer"
                onClick={() => setHelpOpen(false)}
              >
                <Gift size={14} strokeWidth={2} />
                <span>新手必读</span>
              </a>
              <div className="help-dropdown-divider"></div>
              <div className="help-dropdown-item help-dropdown-wechat-item">
                <MessageCircle size={14} strokeWidth={2} />
                <span>联系作者</span>
                <div className="help-dropdown-wechat-qr">
                  <img src="/weixin.png" alt="微信二维码" />
                </div>
              </div>
              <div className="help-dropdown-divider"></div>
              <a
                className="help-dropdown-item"
                href="https://github.com/ninjaml/mini8"
                target="_blank"
                rel="noreferrer"
                onClick={() => setHelpOpen(false)}
              >
                <ExternalLink size={14} strokeWidth={2} />
                <span>Github</span>
              </a>
            </div>
          )}
        </div>
        <Tooltip text="Agent社区">
          <button className="icon-btn" type="button" onClick={() => onOpenExternalLink("agentPlayground")}>
            <Puzzle className="header-agent-icon" size={18} strokeWidth={2} />
          </button>
        </Tooltip>
        <Tooltip text="乔伊来了社区">
          <button className="icon-btn" type="button" onClick={() => onOpenExternalLink("joyCommunity")}>
            <JoyIcon />
          </button>
        </Tooltip>
        <Tooltip text="系统配置">
          <button className="icon-btn" type="button" onClick={onOpenSettings}>
            <Settings className="header-settings-icon" size={18} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
      <AgentWorkingDirModal
        open={showDirModal}
        onClose={() => setShowDirModal(false)}
        agentKind={agentKind}
        agentRefId={agentRefId}
      />
      <Modal open={showCronModal} onClose={() => setShowCronModal(false)} className="modal-cron">
        <div style={{ padding: 24 }}>
          <CronManager
            scope={cronScope}
            title={cronScope ? `${title} · 定时任务` : "定时任务"}
            subtitle="只管理当前 agent 的自动化任务。"
            embedded
            showSummary={false}
            emptyText="当前对象还没有定时任务"
            onMutate={onCronMutated}
          />
        </div>
      </Modal>
    </header>
  );
}
