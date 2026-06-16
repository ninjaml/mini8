import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot, Send } from "lucide-react";

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

export function ChatTab({ chat }) {
  const {
    sessions,
    activeSessionId,
    messages,
    isLoading,
    error,
    createSession,
    selectSession,
    sendMessage,
    stopStreaming,
  } = chat;

  const [input, setInput] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const messagesEndRef = useRef(null);
  const initRef = useRef(false);

  const displayedSessions = showAllSessions ? sessions : sessions.slice(0, 10);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 有会话时自动选中第一个（仅一次）
  useEffect(() => {
    if (!initRef.current && sessions.length > 0 && !activeSessionId) {
      initRef.current = true;
      selectSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, selectSession]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 从 OpenClaw 的 key 格式 agent:main:dashboard:uuid 中解析会话名称
  const parseSessionName = (session) => {
    if (session.title) return session.title;
    if (session.label) return session.label;
    const key = session.key || "";
    const parts = key.split(":");
    if (parts.length >= 4) {
      // agent:main:dashboard:uuid → "dashboard · 23ad2ba8"
      const surface = parts[2];
      const uuid = parts[3].slice(0, 8);
      return `${surface} · ${uuid}`;
    }
    if (parts.length >= 3) {
      return parts[2];
    }
    if (key && !key.startsWith("sess_")) return key;
    if (session.agent) return session.agent;
    if (session.model) return session.model;
    return null;
  };

  const formatSessionTitle = (session, index) => parseSessionName(session) || `对话 ${index + 1}`;

  const formatSessionStatus = (session) => {
    if (session.hasActiveRun) return "● 实时";
    if (session.status === "done" || session.status === "completed") return "○ 已完成";
    if (session.status) return session.status;
    if (session.state) return session.state;
    return "";
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="openclaw-tab-content openclaw-chat">
      {/* Session 列表侧边栏 */}
      <div className="openclaw-chat-sidebar">
        <button type="button" className="openclaw-new-session-btn" onClick={createSession}>
          + 新对话
        </button>
        <div className="openclaw-session-list">
          {displayedSessions.map((session, idx) => (
            <button
              type="button"
              key={session.id || session.sessionId || `session-${idx}`}
              className={`openclaw-session-item ${session.id === activeSessionId ? "active" : ""}`}
              onClick={() => selectSession(session.id || session.sessionId)}
            >
              <div className="openclaw-session-row">
                <span className="openclaw-session-title" title={session.key || formatSessionTitle(session, idx)}>
                  {formatSessionTitle(session, idx)}
                </span>
                <span className="openclaw-session-status">
                  {formatSessionStatus(session)}
                </span>
              </div>
              <div className="openclaw-session-meta">
                {(session.kind || session.chatType) && (
                  <span className="openclaw-session-type">{session.kind || session.chatType}</span>
                )}
                <span className="openclaw-session-time">
                  {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : ""}
                </span>
              </div>
            </button>
          ))}
          {sessions.length > 10 && (
            <button
              type="button"
              className="openclaw-show-all-btn"
              onClick={() => setShowAllSessions(!showAllSessions)}
            >
              {showAllSessions ? "↑ 收起" : `↓ 显示全部 (${sessions.length})`}
            </button>
          )}
          {sessions.length === 0 && (
            <div className="openclaw-empty">
              <p>还没有对话</p>
              <p style={{ fontSize: "12px", color: "var(--tx-muted)", marginTop: "4px" }}>
                点击上方「+ 新对话」开始
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 聊天主区域 */}
      <div className="openclaw-chat-main">
        <div className="openclaw-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`openclaw-msg-row ${msg.role === "user" ? "user" : "assistant"}`}>
              <div className="openclaw-msg-avatar">
                {msg.role === "user" ? (
                  <div className="openclaw-avatar-user"><User size={16} /></div>
                ) : (
                  <div className="openclaw-avatar-bot"><Bot size={16} /></div>
                )}
              </div>
              <div className="openclaw-msg-body">
                <div className="openclaw-msg-meta">
                  {msg.role === "user" ? "你" : "Assistant"}
                  {msg.createdAt && (
                    <span className="openclaw-msg-time">{formatTime(msg.createdAt)}</span>
                  )}
                </div>
                <div className="openclaw-msg-bubble">
                  {msg.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="openclaw-msg-row assistant">
              <div className="openclaw-msg-avatar">
                <div className="openclaw-avatar-bot"><Bot size={16} /></div>
              </div>
              <div className="openclaw-msg-body">
                <div className="openclaw-msg-bubble openclaw-msg-typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          {messages.length === 0 && activeSessionId && (
            <div className="openclaw-welcome">
              <div className="openclaw-welcome-bot">
                <Bot size={32} />
              </div>
              <h3>有什么可以帮你的？</h3>
              <p>在下方输入框发送消息，开始与 OpenClaw 对话</p>
            </div>
          )}

          {!activeSessionId && (
            <div className="openclaw-welcome">
              <div className="openclaw-welcome-bot">
                <Bot size={32} />
              </div>
              <h3>准备开始新对话</h3>
              <p>点击左侧「+ 新对话」创建会话</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <div className="openclaw-chat-error">{error}</div>}

        <div className="openclaw-chat-input-area">
          <div className="openclaw-input-row">
            <textarea
              className="openclaw-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeSessionId ? "输入消息，按 Enter 发送…" : "创建会话后即可开始对话"}
              disabled={!activeSessionId || isLoading}
              rows={1}
            />
            {isLoading ? (
              <button type="button" className="openclaw-send-btn openclaw-stop" onClick={stopStreaming} title="停止">
                <div className="openclaw-stop-icon" />
              </button>
            ) : (
              <button
                type="button"
                className="openclaw-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || !activeSessionId}
                title="发送"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
