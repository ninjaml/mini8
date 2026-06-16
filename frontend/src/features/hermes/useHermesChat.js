import { useCallback, useEffect, useRef, useState } from "react";
import { hermesApi } from "./hermesApi";

const SESSIONS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 20;

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function useHermesChat(agent) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatting, setChatting] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(true);
  const [sessionMessagesLoading, setSessionMessagesLoading] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(true);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [error, setError] = useState("");

  const chatEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // agent 在线时自动加载会话列表
  useEffect(() => {
    if (agent?.status === "online") {
      loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.status]);

  const loadSessions = useCallback(async (append = false) => {
    const offset = append ? sessions.length : 0;
    const setLoading = append ? setSessionsLoadingMore : setSessionsLoading;
    setLoading(true);
    try {
      const data = await hermesApi.getSessions(SESSIONS_PAGE_SIZE, offset);
      const newSessions = data.sessions || [];
      if (append) {
        setSessions((prev) => [...prev, ...newSessions]);
      } else {
        setSessions(newSessions);
      }
      setSessionsHasMore(newSessions.length === SESSIONS_PAGE_SIZE);
    } catch (err) {
      setError(`获取会话列表失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSession = useCallback(async (sessionId, append = false) => {
    if (!append && activeSessionId === sessionId) return;
    if (!append) {
      setActiveSessionId(sessionId);
      setMessages([]);
      setMessagesOffset(0);
      setMessagesHasMore(true);
    }
    const offset = append ? messagesOffset : 0;
    const setLoading = append ? setMessagesLoadingMore : setSessionMessagesLoading;
    setLoading(true);
    try {
      const data = await hermesApi.getSessionMessages(sessionId, MESSAGES_PAGE_SIZE, offset);
      const msgs = (data.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      const total = data.total || 0;
      if (append) {
        setMessages((prev) => [...msgs, ...prev]);
        setMessagesOffset(offset + MESSAGES_PAGE_SIZE);
      } else {
        setMessages(msgs);
        setMessagesOffset(MESSAGES_PAGE_SIZE);
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 0);
      }
      setMessagesHasMore(offset + msgs.length < total);
    } catch (err) {
      setError(`加载会话消息失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, messagesOffset]);

  const startNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }, []);

  const handleDeleteSession = useCallback(async (sessionId) => {
    try {
      await hermesApi.deleteSession(sessionId);
      if (activeSessionId === sessionId) {
        startNewConversation();
      }
      loadSessions();
    } catch (err) {
      setError(`删除会话失败: ${err.message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, loadSessions, startNewConversation]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || chatting) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setChatting(true);

    try {
      const payload = {
        model: agent?.model || "hermes-agent",
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: text },
        ],
        stream: false,
      };
      const response = await hermesApi.chat(payload, activeSessionId);
      const content = response?.choices?.[0]?.message?.content || JSON.stringify(response);
      const now = Date.now() / 1000;
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "user", content: text, timestamp: now },
        { role: "assistant", content, timestamp: now },
      ]);
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 0);

      const returnedSessionId = response?._session_id;
      if (!activeSessionId && returnedSessionId) {
        setActiveSessionId(returnedSessionId);
      }

      setTimeout(() => loadSessions(), 500);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ 错误: ${err.message}` }]);
    } finally {
      setChatting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, chatting, agent?.model, messages, activeSessionId]);

  const handleMessagesScroll = useCallback((e) => {
    const el = e.target;
    const nearTop = el.scrollTop < 30;
    if (nearTop && messagesHasMore && !messagesLoadingMore && !sessionMessagesLoading && activeSessionId) {
      selectSession(activeSessionId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesHasMore, messagesLoadingMore, sessionMessagesLoading, activeSessionId]);

  return {
    messages,
    input,
    setInput,
    chatting,
    sessions,
    activeSessionId,
    sessionsLoading,
    sessionsLoadingMore,
    sessionsHasMore,
    sessionMessagesLoading,
    messagesLoadingMore,
    messagesHasMore,
    error,
    messagesContainerRef,
    chatEndRef,
    formatTime,
    loadSessions,
    selectSession,
    startNewConversation,
    handleSend,
    handleDeleteSession,
    handleMessagesScroll,
  };
}
