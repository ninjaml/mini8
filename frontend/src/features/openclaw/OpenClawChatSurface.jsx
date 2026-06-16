import { useEffect, useRef, useState } from "react";
import { ChatTab } from "./ChatTab";
import "./openclaw.css";

export function OpenClawChatSurface({
  chat,
  offlineMessage = "无法连接到 OpenClaw Gateway，请检查服务是否启动。",
}) {
  const [loadError, setLoadError] = useState("");
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    if (chat.connectionState === "connected") return;
    dataLoadedRef.current = false;
    setLoadError("");
  }, [chat.connectionState]);

  useEffect(() => {
    if (!chat.lastSessionsLoadedAt) return;
    dataLoadedRef.current = true;
    setLoadError("");
  }, [chat.lastSessionsLoadedAt]);

  useEffect(() => {
    if (chat.connectionState !== "connected" || dataLoadedRef.current) return;

    chat.loadSessions().catch((err) => {
      console.error("[OpenClawChatSurface] 加载会话失败:", err);
      setLoadError("无法加载 OpenClaw 会话");
    });
  }, [chat.connectionState, chat.loadSessions]);

  async function handleRetry() {
    try {
      setLoadError("");
      await chat.loadSessions();
    } catch (err) {
      console.error("[OpenClawChatSurface] 重试加载会话失败:", err);
      setLoadError("无法加载 OpenClaw 会话");
    }
  }

  const isInitialLoading =
    chat.connectionState === "connected" &&
    chat.isSessionsLoading &&
    !dataLoadedRef.current &&
    chat.sessions.length === 0 &&
    !chat.activeSessionId;

  if (chat.connectionState === "connecting") {
    return (
      <div className="openclaw-chat-surface openclaw-loading">
        <div className="openclaw-spinner"></div>
        <p>正在连接 OpenClaw Gateway...</p>
      </div>
    );
  }

  if (chat.connectionState !== "connected") {
    return (
      <div className="openclaw-chat-surface">
        <div className="openclaw-empty-state">
          <div className="openclaw-empty-icon">🔗</div>
          <h3>OpenClaw 未连接</h3>
          <p>{offlineMessage}</p>
        </div>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="openclaw-chat-surface openclaw-loading">
        <div className="openclaw-spinner"></div>
        <p>正在加载 OpenClaw 会话...</p>
      </div>
    );
  }

  if (loadError && chat.sessions.length === 0 && !chat.activeSessionId) {
    return (
      <div className="openclaw-chat-surface">
        <div className="openclaw-empty-state">
          <div className="openclaw-empty-icon">!</div>
          <h3>OpenClaw 会话加载失败</h3>
          <p>{loadError}</p>
          <button type="button" className="openclaw-empty-btn" onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="openclaw-chat-surface">
      {loadError && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            color: "#dc2626",
            background: "#fef2f2",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            className="openclaw-surface-retry-btn"
            onClick={handleRetry}
          >
            重试
          </button>
        </div>
      )}
      <ChatTab chat={chat} />
    </div>
  );
}
