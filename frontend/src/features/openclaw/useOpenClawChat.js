import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openclawGateway } from "./openclawGateway";

export function useOpenClawChat() {
  const [connectionState, setConnectionState] = useState(openclawGateway.state);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [lastSessionsLoadedAt, setLastSessionsLoadedAt] = useState(0);
  const [error, setError] = useState("");
  const streamMessageIdRef = useRef(null);
  const activeSessionIdRef = useRef(null);
  const activeSessionKeyRef = useRef(null);
  const loadSessionsPromiseRef = useRef(null);

  // 提取消息内容（支持字符串或 OpenAI 格式的 content 数组）
  function extractContent(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((item) => item.type === "text")
        .map((item) => item.text || "")
        .join("");
    }
    return "";
  }

  // 本地缓存（chat.history 失败时的兜底）
  const cacheKey = (sid) => `oc_msg_${sid}`;
  function loadCachedMessages(sid) {
    try {
      const raw = localStorage.getItem(cacheKey(sid));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveCachedMessages(sid, msgs) {
    try {
      localStorage.setItem(cacheKey(sid), JSON.stringify(msgs));
    } catch {
      // 存储已满或隐私模式，静默忽略
    }
  }

  // 同步 ref，避免异步闭包捕获旧值
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Gateway 的 key 直接用 sessionId（规范化后的 id）
  function getSessionKey(sessionId) {
    return sessionId;
  }

  // 监听连接状态变化（subscribeState 替代轮询）
  useEffect(() => {
    const unsubscribe = openclawGateway.subscribeState((state) => {
      setConnectionState(state);
    });
    return () => unsubscribe();
  }, []);

  // 取消 session 消息订阅
  async function unsubscribeFromSession(sessionId) {
    if (!sessionId) return;
    try {
      const key = getSessionKey(sessionId);
      await openclawGateway.rpc("sessions.messages.unsubscribe", { key });
    } catch (err) {
      console.error("[OpenClaw] Unsubscribe failed:", err);
    }
  }

  // 选择 session 并加载历史
  const selectSession = useCallback(async (sessionId) => {
    const key = getSessionKey(sessionId);
    const previousId = activeSessionIdRef.current;
    activeSessionIdRef.current = sessionId;
    activeSessionKeyRef.current = key;
    setActiveSessionId(sessionId);
    setMessages([]);
    setError("");
    setIsLoading(false);
    streamMessageIdRef.current = null;

    if (previousId && previousId !== sessionId) {
      unsubscribeFromSession(previousId).catch(() => {});
    }

    try {
      // 拉取历史消息（chat.history 是官方推荐的获取历史接口）
      const historyResult = await openclawGateway.rpc("chat.history", { sessionKey: key });
      if (activeSessionIdRef.current !== sessionId) return;

      const rawMessages = historyResult.messages || historyResult.history || [];
      const history = rawMessages.map((msg, idx) => ({
        id: msg.id || `hist-${idx}`,
        role: msg.role || msg.type,
        content: extractContent(msg.content || msg.text),
        type: (msg.role || msg.type) === "user" ? "user" : "assistant",
      }));
      setMessages(history);

      await openclawGateway
        .rpc("sessions.messages.subscribe", { key })
        .catch((err) => console.error("[OpenClaw] Subscribe failed:", err));
    } catch (err) {
      console.error("[OpenClaw] Failed to load messages:", err);
      if (activeSessionIdRef.current === sessionId) {
        setMessages([]);
      }
    }
  }, []);

  // 加载 session 列表
  const loadSessions = useCallback(async () => {
    if (loadSessionsPromiseRef.current) {
      return loadSessionsPromiseRef.current;
    }

    const loadPromise = (async () => {
      setIsSessionsLoading(true);
      const result = await openclawGateway.rpc("sessions.list", {
        includeGlobal: true,
        includeUnknown: true,
      });
      const raw = result.sessions || result.payload?.sessions || [];
      // 按更新时间倒序
      const sorted = [...raw].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      // Gateway 可能用 key 而不是 id 作为标识符，统一规范化
      const list = sorted.map((s, i) => ({
        ...s,
        id: s.id || s.key || s.sessionId || `session-${i}`,
      }));
      setSessions(list);
      setLastSessionsLoadedAt(Date.now());

      // 自动选中第一个
      if (list.length > 0 && !activeSessionIdRef.current) {
        await selectSession(list[0].id);
      }

      return list;
    })();

    loadSessionsPromiseRef.current = loadPromise;

    try {
      return await loadPromise;
    } finally {
      loadSessionsPromiseRef.current = null;
      setIsSessionsLoading(false);
    }
  }, [selectSession]);

  // 创建新 session — 不依赖响应格式，创建后刷新列表
  const createSession = useCallback(async () => {
    try {
      setError("");
      await openclawGateway.rpc("sessions.create", {});
      // 刷新列表并自动选中第一个
      const result = await openclawGateway.rpc("sessions.list");
      const raw = result.sessions || [];
      const list = raw.map((s, i) => ({
        ...s,
        id: s.id || s.key || s.sessionId || `session-${i}`,
      }));
      setSessions(list);
      if (list.length > 0) {
        const first = list[0];
        activeSessionIdRef.current = first.id;
        setActiveSessionId(first.id);
        // 新会话没有缓存，空列表
        setMessages([]);
        const firstKey = getSessionKey(first.id);
        activeSessionKeyRef.current = firstKey;
        await openclawGateway.rpc("sessions.messages.subscribe", { key: firstKey });
        return first.id;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // 订阅 session 消息事件（纯监听，subscribe/unsubscribe RPC 由 selectSession 控制）
  useEffect(() => {
    if (!activeSessionId) return;

    const unsubscribe = openclawGateway.subscribe((event) => {
      // session.message：新消息到达
      if (event.event === "session.message") {
        const payload = event.payload;
        if (!payload) return;
        const eventSessionId = payload.sessionKey || payload.sessionId;
        if (eventSessionId !== activeSessionId) return;
        const msg = payload.message || payload;

        if (msg.role === "assistant") {
          setIsLoading(false);
        }

        const msgId = payload.messageId || msg.id || msg.messageId;
        const text = extractContent(msg.content);

        setMessages((prev) => {
          // 替换 pending 的乐观消息
          if (msg.role === "user") {
            const pendingIdx = prev.findIndex((m) => m.pending && m.role === msg.role && m.content === text);
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = {
                id: msgId || `msg-${Date.now()}`,
                role: msg.role,
                content: text,
                type: "user",
                pending: false,
              };
              return next;
            }
          }
          // 去重：按 id
          if (msgId && prev.find((m) => m.id === msgId)) return prev;
          // 去重：按 content + role（history 加载的消息可能没有服务端 id）
          const dupIdx = prev.findIndex((m) => m.role === msg.role && m.content === text && !m.pending);
          if (dupIdx !== -1) {
            const next = [...prev];
            next[dupIdx] = {
              id: msgId || next[dupIdx].id,
              role: msg.role,
              content: text,
              type: msg.role === "user" ? "user" : "assistant",
            };
            return next;
          }
          // 去重：assistant 消息替换流式临时消息
          if (msg.role === "assistant") {
            const streamIdx = prev.findIndex(
              (m) => m.role === "assistant" && m.id?.startsWith("assistant-")
            );
            if (streamIdx !== -1) {
              const next = [...prev];
              next[streamIdx] = {
                id: msgId || `msg-${Date.now()}`,
                role: msg.role,
                content: text,
                type: "assistant",
              };
              streamMessageIdRef.current = null;
              return next;
            }
          }
          return [
            ...prev,
            {
              id: msgId || `msg-${Date.now()}`,
              role: msg.role,
              content: text,
              type: msg.role === "user" ? "user" : "assistant",
            },
          ];
        });
      }

      // agent：流式 delta
      if (event.event === "agent") {
        const payload = event.payload;
        if (!payload) return;
        if (payload.sessionKey && payload.sessionKey !== activeSessionId) return;
        if (payload.stream === "assistant" && payload.data?.delta) {
          const delta = payload.data.delta;
          setMessages((prev) => {
            const currentId = streamMessageIdRef.current;
            const currentMsg = prev.find((m) => m.id === currentId);
            if (!currentId || !currentMsg) {
              const nextId = `assistant-${Date.now()}`;
              streamMessageIdRef.current = nextId;
              return [...prev, { id: nextId, role: "assistant", content: delta, type: "assistant" }];
            }
            return prev.map((m) =>
              m.id === currentId ? { ...m, content: (m.content || "") + delta } : m
            );
          });
        }
        if (payload.stream === "lifecycle" && payload.data?.phase === "end") {
          streamMessageIdRef.current = null;
          setIsLoading(false);
        }
      }

      // chat：最终消息确认
      if (event.event === "chat") {
        const payload = event.payload;
        if (!payload) return;
        if (payload.sessionKey && payload.sessionKey !== activeSessionId) return;
        if (payload.state === "final" && payload.message) {
          setIsLoading(false);
          const msg = payload.message;
          const msgId = payload.messageId || msg.id || `msg-${Date.now()}`;
          const text = extractContent(msg.content);
          setMessages((prev) => {
            if (prev.find((m) => m.id === msgId)) return prev;
            // 去重：按 content + role（session.message 可能已经用不同 id 插入了同一条）
            const dupIdx = prev.findIndex((m) => m.role === "assistant" && m.content === text && !m.pending);
            if (dupIdx !== -1) {
              const next = [...prev];
              next[dupIdx] = { id: msgId, role: msg.role, content: text, type: "assistant" };
              streamMessageIdRef.current = null;
              return next;
            }
            // 替换流式临时消息
            const streamIdx = prev.findIndex(
              (m) => m.role === "assistant" && m.id?.startsWith("assistant-")
            );
            if (streamIdx !== -1) {
              const next = [...prev];
              next[streamIdx] = { id: msgId, role: msg.role, content: text, type: "assistant" };
              streamMessageIdRef.current = null;
              return next;
            }
            return [
              ...prev,
              { id: msgId, role: msg.role, content: text, type: "assistant" },
            ];
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeSessionId]);

  // 发送消息
  const sendMessage = useCallback(
    async (content) => {
      if (!activeSessionId) {
        setError("请先选择一个会话");
        return;
      }
      if (!content.trim()) return;

      setError("");
      setIsLoading(true);
      streamMessageIdRef.current = null;

      // 乐观更新：本地预添加用户消息，echo 到达时通过 pending 标记 + content 匹配替换
      const optimisticId = `user-opt-${Date.now()}`;
      const optimisticMsg = {
        id: optimisticId,
        role: "user",
        content: content.trim(),
        type: "user",
        pending: true,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        await openclawGateway.rpc("sessions.send", {
          key: activeSessionId,
          message: content.trim(),
        });
      } catch (err) {
        const msg = err.message || "";
        // session 不存在时自动刷新列表
        if (msg.includes("not found") || msg.includes("not exist")) {
          setError("会话已失效，正在刷新...");
          loadSessions().catch(() => {});
        } else {
          setError(msg);
        }
        setIsLoading(false);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    },
    [activeSessionId, loadSessions]
  );

  // 中断生成
  const stopStreaming = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const key = getSessionKey(activeSessionId);
      await openclawGateway.rpc("sessions.abort", { key });
    } catch (err) {
      console.error("[OpenClaw] Abort failed:", err);
    }
    setIsLoading(false);
    streamMessageIdRef.current = null;
  }, [activeSessionId]);

  // 消息变化时自动缓存到 localStorage
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      saveCachedMessages(activeSessionId, messages);
    }
  }, [messages, activeSessionId]);

  return useMemo(() => ({
    connectionState,
    sessions,
    activeSessionId,
    messages,
    isLoading,
    isSessionsLoading,
    lastSessionsLoadedAt,
    error,
    loadSessions,
    createSession,
    selectSession,
    sendMessage,
    stopStreaming,
  }), [connectionState, sessions, activeSessionId, messages, isLoading, isSessionsLoading, lastSessionsLoadedAt, error, loadSessions, createSession, selectSession, sendMessage, stopStreaming]);
}
