import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Trash2 } from "lucide-react";
import { useHermesChat } from "./useHermesChat";

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};
import "./hermes.css";

export function HermesInlineChat({ agent }) {
  const chat = useHermesChat(agent);
  const inputRef = useRef(null);

  const isOnline = agent?.status === "online";

  useEffect(() => {
    chat.chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  if (!isOnline) {
    return (
      <div className="hermes-empty-state">
        <div className="hermes-empty-icon">📡</div>
        <h3>Hermes 未连接</h3>
        <p>无法连接到 Hermes 服务，请在「连接智能体」页面检查配置。</p>
      </div>
    );
  }

  return (
    <div className="hermes-agent-layout">
      <div className="hermes-session-sidebar">
        <button className="hermes-new-chat-btn" onClick={chat.startNewConversation}>
          + 新对话
        </button>
        <div className="hermes-session-list">
          {chat.sessionsLoading && <div className="hermes-session-loading">加载中...</div>}
          {!chat.sessionsLoading && chat.sessions.length === 0 && (
            <div className="hermes-session-empty">暂无会话</div>
          )}
          {chat.sessions.map((s) => (
            <div
              key={s.id}
              className={`hermes-session-item ${chat.activeSessionId === s.id ? "active" : ""} ${s.is_active ? "live" : ""}`}
              onClick={() => chat.selectSession(s.id)}
              title={s.preview || s.title || "未命名会话"}
            >
              <div className="hermes-session-title">
                {s.title || s.preview || "未命名会话"}
              </div>
              <div className="hermes-session-meta">
                <span>{s.message_count || 0} 条消息</span>
                <span>{chat.formatTime(s.last_active)}</span>
              </div>
              <button
                className="hermes-session-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  chat.handleDeleteSession(s.id);
                }}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="hermes-chat-area">
        <div
          className="hermes-messages"
          ref={chat.messagesContainerRef}
          onScroll={chat.handleMessagesScroll}
        >
          {chat.messagesLoadingMore && (
            <div className="hermes-messages-loading-more">加载历史消息...</div>
          )}
          {chat.sessionMessagesLoading && chat.messages.length === 0 && (
            <div className="hermes-chat-loading">加载中...</div>
          )}
          {!chat.sessionMessagesLoading && chat.messages.length === 0 && (
            <div className="hermes-welcome">
              <div className="hermes-welcome-bot"><Bot size={28} /></div>
              <h3>{chat.activeSessionId ? "继续对话" : "准备开始新对话"}</h3>
              <p>{chat.activeSessionId ? "在下方输入消息" : "点击左侧「新对话」或选择会话"}</p>
            </div>
          )}
          {chat.messages.map((msg, i) => (
            <div
              key={msg.id || `${msg.role}-${msg.timestamp || i}`}
              className={`hermes-msg ${msg.role === "assistant" ? "hermes-msg--assistant" : "hermes-msg--user"} ${msg.role}`}
            >
              <div className="hermes-msg-label">{msg.role === "user" ? "你" : "Hermes"}</div>
              {msg.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
              ) : (
                <pre>{msg.content}</pre>
              )}
            </div>
          ))}
          <div ref={chat.chatEndRef} />
        </div>

        {chat.error && <div className="hermes-chat-error">{chat.error}</div>}
        <div className="hermes-input-row">
          <input
            ref={inputRef}
            className="hermes-input"
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && chat.handleSend()}
            placeholder={chat.activeSessionId ? "继续对话..." : "输入消息开始新对话..."}
            disabled={chat.chatting}
          />
          <button
            className="hermes-send-btn"
            onClick={chat.handleSend}
            disabled={chat.chatting || !chat.input.trim()}
          >
            {chat.chatting ? "..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
