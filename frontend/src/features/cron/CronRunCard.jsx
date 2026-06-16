import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle, HelpCircle, RefreshCw } from "lucide-react";

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6})\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  let s = isoString.trim();
  if (s.includes(" ") && !s.includes("T")) {
    s = s.replace(" ", "T");
  }
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return isoString;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusBadge({ status }) {
  if (status === "running") {
    return (
      <span className="cron-run-status cron-run-status--running">
        <RefreshCw size={12} className="cron-spin" />
        执行中
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="cron-run-status cron-run-status--success">
        <CheckCircle size={12} />
        成功
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="cron-run-status cron-run-status--error">
        <AlertCircle size={12} />
        失败
      </span>
    );
  }
  return (
    <span className="cron-run-status cron-run-status--unknown">
      <HelpCircle size={12} />
      未知
    </span>
  );
}

function EventRow({ event }) {
  const typeLabel = {
    user: "输入",
    assistant: "回答",
    tool: "工具",
    file: "文件",
    error: "错误",
  }[event.type] || event.type;

  const typeClass = `cron-event-row cron-event-row--${event.type}`;

  return (
    <div className={typeClass}>
      <span className="cron-event-label">{typeLabel}</span>
      <span className="cron-event-content">{event.content}</span>
    </div>
  );
}

export function CronRunCard({ group, defaultExpanded = false, showEvents = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const durationText =
    group.duration_ms != null
      ? group.duration_ms < 1000
        ? `${group.duration_ms}ms`
        : `${(group.duration_ms / 1000).toFixed(1)}s`
      : null;

  return (
    <div className="cron-run-card">
      <button
        className="cron-run-card__header"
        type="button"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={14} className="cron-run-card__chevron" />
        ) : (
          <ChevronRight size={14} className="cron-run-card__chevron" />
        )}
        <span className="cron-run-card__time">{formatDateTime(group.started_at)}</span>
        <StatusBadge status={group.status} />
        {durationText && (
          <span className="cron-run-card__duration">
            <Clock size={12} />
            {durationText}
          </span>
        )}
        <span className="cron-run-card__summary">
          {stripMarkdown(group.summary) || "无摘要"}
        </span>
      </button>

      {expanded && (
        <div className="cron-run-card__body">
          {group.final_answer && (
            <div className="cron-run-answer">
              <strong>最终回答</strong>
              <div className="cron-run-answer__text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {group.final_answer}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {showEvents && group.events?.length > 0 && (
            <div className="cron-run-events">
              <strong>事件流</strong>
              {group.events.map((evt) => (
                <EventRow key={evt.id} event={evt} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
