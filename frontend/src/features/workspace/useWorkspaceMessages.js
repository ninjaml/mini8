import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { getAgentWorkspaceSessionId } from "../../lib/agentSessions.js";

function normalizeWorkspaceMessage(message, agentNameBySessionId = new Map()) {
  const targetSessionId = message.request_id != null ? String(message.request_id) : null;
  const targetAgentName = targetSessionId ? agentNameBySessionId.get(targetSessionId) || null : null;
  return {
    id: `workspace-message-${message.id}`,
    rawId: message.id,
    role: message.type === "human" ? "user" : "assistant",
    type: message.type === "human" ? "user" : "assistant",
    content: message.content,
    createdAt: message.created_at,
    agentSessionId: message.agent_session_id ?? null,
    agentId: message.agent_id ?? null,
    agentName: message.agent_name_snapshot || null,
    requestId: message.request_id ?? null,
    targetAgentName,
    threadId: message.thread_id ?? null,
    groupId: message.group_id ?? null,
  };
}

function mergeWorkspaceMessagesById(prevMessages, nextMessage) {
  const nextRawId = nextMessage?.rawId;
  if (nextRawId == null) {
    return [...prevMessages, nextMessage];
  }
  if (prevMessages.some((message) => message.rawId === nextRawId)) {
    return prevMessages;
  }
  return [...prevMessages, nextMessage];
}

function areWorkspaceMessagesEqual(prevMessages, nextMessages) {
  if (prevMessages === nextMessages) return true;
  if (!Array.isArray(prevMessages) || !Array.isArray(nextMessages)) return false;
  if (prevMessages.length !== nextMessages.length) return false;

  for (let i = 0; i < prevMessages.length; i += 1) {
    const prev = prevMessages[i];
    const next = nextMessages[i];
    if (
      prev?.rawId !== next?.rawId ||
      prev?.content !== next?.content ||
      prev?.createdAt !== next?.createdAt ||
      prev?.agentSessionId !== next?.agentSessionId ||
      prev?.threadId !== next?.threadId ||
      prev?.groupId !== next?.groupId
    ) {
      return false;
    }
  }
  return true;
}

export function useWorkspaceMessages({ workspaceId, agents, enabled = true }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [selectedAgentSessionId, setSelectedAgentSessionId] = useState("");

  const agentOptions = useMemo(
    () =>
      (agents || [])
        .map((agent) => ({
          agent,
          sessionId: getAgentWorkspaceSessionId(agent),
        }))
        .filter((entry) => entry.sessionId != null)
        .map(({ agent, sessionId }) => ({
          id: String(agent.id),
          sessionId: String(sessionId),
          name: agent.name || "Agent",
        })),
    [agents],
  );
  const agentNameBySessionId = useMemo(
    () => new Map(agentOptions.map((option) => [option.sessionId, option.name])),
    [agentOptions],
  );

  useEffect(() => {
    setSelectedAgentSessionId((prev) => {
      if (!prev) return "";
      if (agentOptions.some((option) => option.sessionId === prev)) return prev;
      return "";
    });
  }, [agentOptions]);

  const refresh = useCallback(async () => {
    if (!workspaceId || !enabled) return [];
    setLoading(true);
    try {
      const data = await api.getWorkspaceMessages(workspaceId, { limit: 100 });
      const nextMessages = (data || []).map((message) => normalizeWorkspaceMessage(message, agentNameBySessionId));
      // 轮询时如果消息语义没变化，就复用旧数组，避免聊天框每 3 秒整包重渲染一次。
      setMessages((prev) => (areWorkspaceMessagesEqual(prev, nextMessages) ? prev : nextMessages));
      setError("");
      return nextMessages;
    } catch (err) {
      setError(err.message || "加载工作空间消息失败");
      return [];
    } finally {
      setLoading(false);
    }
  }, [workspaceId, enabled, agentNameBySessionId]);

  useEffect(() => {
    if (!workspaceId || !enabled) return;
    refresh();
  }, [workspaceId, enabled, refresh]);

  useEffect(() => {
    if (!workspaceId || !enabled) return;
    const timer = window.setInterval(() => {
      refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [workspaceId, enabled, refresh]);

  const sendHumanMessage = useCallback(
    async (content) => {
      const trimmed = String(content || "").trim();
      if (!workspaceId) throw new Error("workspace_id is required");
      if (!trimmed) return false;
      if (!selectedAgentSessionId) {
        throw new Error("请先选择一个工作成员");
      }

      setSending(true);
      try {
        const created = await api.createWorkspaceMessage(workspaceId, {
          type: "human",
          content: trimmed,
          request_id: Number(selectedAgentSessionId),
        });
        setMessages((prev) =>
          mergeWorkspaceMessagesById(prev, normalizeWorkspaceMessage(created, agentNameBySessionId)),
        );
        setError("");
        window.setTimeout(() => {
          refresh();
        }, 800);
        return true;
      } catch (err) {
        setError(err.message || "发送工作空间消息失败");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [workspaceId, selectedAgentSessionId, agentNameBySessionId, refresh],
  );

  return {
    messages,
    loading,
    sending,
    error,
    agentOptions,
    selectedAgentSessionId,
    setSelectedAgentSessionId,
    sendHumanMessage,
    refresh,
  };
}
