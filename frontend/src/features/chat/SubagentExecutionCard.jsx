import { useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronRight, FileSearch } from "lucide-react";

function statusLabel(status) {
  if (status === "success") return "已完成";
  if (status === "error") return "失败";
  if (status === "unfinished") return "未完成";
  return "执行中";
}

function statusClassName(status) {
  if (status === "success") return "is-success";
  if (status === "error") return "is-error";
  if (status === "unfinished") return "is-unfinished";
  return "is-running";
}

export function SubagentExecutionCard({
  card,
  renderMessage,
  onInspectExecution = null,
}) {
  // 默认收起，避免一轮子 agent 执行把主聊天区整段撑开。
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    setExpanded((value) => !value);
  };

  const canInspectExecution = Boolean(onInspectExecution && card.threadId && card.groupId);
  const eventCount = card.messages?.length || 0;
  const summaryText = useMemo(() => {
    if (card.preview) return card.preview;
    if (card.description) return card.description;
    return "";
  }, [card.preview, card.description]);

  return (
    <section className="subagent-card" data-subagent-card={card.subagentInvocationId}>
      <div className="subagent-card__header">
        <div
          className="subagent-card__header-main"
          role="button"
          tabIndex={0}
          onClick={toggleExpanded}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleExpanded();
            }
          }}
        >
          <button
            type="button"
            className="subagent-card__toggle-btn"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded();
            }}
            aria-label={expanded ? "收起子Agent执行卡片" : "展开子Agent执行卡片"}
          >
            <span className="subagent-card__toggle">
              {expanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
            </span>
          </button>
          <span className="subagent-card__avatar">
            <Bot size={16} strokeWidth={2.1} />
          </span>
          <div className="subagent-card__meta">
            <div className="subagent-card__title-row">
              <span className="subagent-card__eyebrow">子Agent执行</span>
              <span className="subagent-card__title">{card.subagentType || "SubAgent"}</span>
              <span className={`subagent-card__status ${statusClassName(card.status)}`}>
                {statusLabel(card.status)}
              </span>
            </div>
            {card.description ? (
              <div className="subagent-card__description">{card.description}</div>
            ) : null}
            {!expanded && summaryText ? (
              <div className="subagent-card__summary">{summaryText}</div>
            ) : null}
            {card.incompleteSource ? (
              <div className="subagent-card__hint">恢复态 / 不完整来源</div>
            ) : null}
          </div>
        </div>

        <div className="subagent-card__header-side">
          {card.time ? <span className="subagent-card__time">{card.time}</span> : null}
          <span className="subagent-card__count">{eventCount} 条事件</span>
          {canInspectExecution ? (
            <button
              type="button"
              className="subagent-card__inspect"
              onClick={() => onInspectExecution?.({
                threadId: card.threadId,
                groupId: card.groupId,
                agentName: card.subagentType,
              })}
            >
              <FileSearch size={14} strokeWidth={2} />
              查看完整回放
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="subagent-card__body">
          <div className="subagent-card__timeline">
            {card.messages?.map((message) => (
              <div key={message.id} className="subagent-card__message">
                {renderMessage(message, Boolean(message.streaming))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
