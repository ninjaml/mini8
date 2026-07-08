import { useEffect, useMemo, useRef, useState } from "react";
import { useRuntimeChat } from "./useRuntimeChat";
import { getAgentDefaultSessionId } from "../../lib/agentSessions.js";
import { choosePoolSlot, reconcileOccupiedSlots, normalizeId } from "./persistentChatPool";

const emptyRuntimeMessages = [];
const MAX_PERSISTENT_CHATS = 10;

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function useSlotChat(agent, disabled, slotIndex) {
  return useRuntimeChat({
    contextKey: agent ? `global-agent-session-${getAgentDefaultSessionId(agent)}` : `global-agent-slot${slotIndex + 1}-empty`,
    contextKind: null,
    agentSessionId: getAgentDefaultSessionId(agent),
    disabled: disabled || !agent,
    displayName: agent?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });
}

export function usePersistentGlobalAgentChats(agents, currentAgentId, disabled = false) {
  const lastTouchedAtRef = useRef({});

  const sessionIdToAgent = useMemo(() => {
    const map = new Map();
    for (const agent of agents) {
      const sessionId = normalizeId(getAgentDefaultSessionId(agent));
      if (!sessionId) continue;
      map.set(sessionId, agent);
    }
    return map;
  }, [agents]);

  const slotEntities = useMemo(
    () => agents.map((agent) => ({ id: getAgentDefaultSessionId(agent) })).filter((entry) => normalizeId(entry.id)),
    [agents],
  );

  const currentAgentSessionId = useMemo(() => {
    const currentAgent = agents.find((agent) => String(agent.id) === String(currentAgentId));
    return normalizeId(getAgentDefaultSessionId(currentAgent));
  }, [agents, currentAgentId]);

  const [occupiedSlots, setOccupiedSlots] = useState(Array(MAX_PERSISTENT_CHATS).fill(null));

  const slotAgents = useMemo(
    () => occupiedSlots.map((agentSessionId) => (normalizeId(agentSessionId) ? sessionIdToAgent.get(normalizeId(agentSessionId)) ?? null : null)),
    [occupiedSlots, sessionIdToAgent],
  );

  const chat1 = useSlotChat(slotAgents[0], disabled, 0);
  const chat2 = useSlotChat(slotAgents[1], disabled, 1);
  const chat3 = useSlotChat(slotAgents[2], disabled, 2);
  const chat4 = useSlotChat(slotAgents[3], disabled, 3);
  const chat5 = useSlotChat(slotAgents[4], disabled, 4);
  const chat6 = useSlotChat(slotAgents[5], disabled, 5);
  const chat7 = useSlotChat(slotAgents[6], disabled, 6);
  const chat8 = useSlotChat(slotAgents[7], disabled, 7);
  const chat9 = useSlotChat(slotAgents[8], disabled, 8);
  const chat10 = useSlotChat(slotAgents[9], disabled, 9);

  const chats = [chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10];

  const statusesBySessionId = useMemo(() => {
    return slotAgents.reduce((acc, agent, index) => {
      if (!agent) return acc;
      const chat = chats[index];
      const queuedCount = chat?.queuedMessages?.length || 0;
      const sessionId = normalizeId(getAgentDefaultSessionId(agent));
      if (!sessionId) return acc;
      acc[sessionId] = queuedCount > 0 ? "queued" : (chat?.status || "idle");
      return acc;
    }, {});
  }, [slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  useEffect(() => {
    setOccupiedSlots((prev) => {
      const next = reconcileOccupiedSlots(prev, slotEntities);
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [slotEntities]);

  useEffect(() => {
    if (!currentAgentSessionId) return;

    const target = choosePoolSlot({
      occupiedSlots,
      currentEntityId: currentAgentSessionId,
      statusesByEntityId: statusesBySessionId,
      lastTouchedAtByEntityId: lastTouchedAtRef.current,
    });

    if (!target) return;

    lastTouchedAtRef.current[currentAgentSessionId] = Date.now();

    setOccupiedSlots((prev) => {
      if (normalizeId(prev[target.slotIndex]) === currentAgentSessionId) {
        return prev;
      }
      const next = [...prev];
      next[target.slotIndex] = currentAgentSessionId;
      return next;
    });
  }, [currentAgentSessionId, occupiedSlots, statusesBySessionId]);

  const currentChat = useMemo(() => {
    const slotIndex = occupiedSlots.findIndex((agentSessionId) => normalizeId(agentSessionId) === currentAgentSessionId);
    const completionByAgentId = slotAgents.reduce((acc, agent, index) => {
      if (agent) {
        acc[String(agent.id)] = chats[index]?.lastCompletedAt || 0;
      }
      return acc;
    }, {});

    if (slotIndex >= 0 && slotIndex < chats.length) {
      return {
        ...chats[slotIndex],
        completionByAgentId,
      };
    }

    return {
      contextKey: "global-agent-session-none",
      draft: "",
      messages: emptyRuntimeMessages,
      disabled: true,
      status: "disabled",
      hasMoreHistory: false,
      isLoadingMore: false,
      isRollingBack: false,
      queuedMessages: [],
      rollbackConfirm: null,
      setDraft: () => {},
      sendMessage: async () => false,
      loadMoreMessages: async () => false,
      rollbackToMessage: async () => false,
      confirmRollback: async () => false,
      cancelRollback: () => {},
      removeQueuedMessage: () => {},
      stopStreaming: () => {},
      deleteCurrentSession: async () => false,
      threadId: "",
      lastCompletedAt: 0,
      completionByAgentId,
    };
  }, [currentAgentSessionId, occupiedSlots, slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  const statusesByAgentId = useMemo(() => {
    return slotAgents.reduce((acc, agent, index) => {
      if (!agent) return acc;
      const chat = chats[index];
      const queuedCount = chat?.queuedMessages?.length || 0;
      acc[String(agent.id)] = queuedCount > 0 ? "queued" : (chat?.status || "idle");
      return acc;
    }, {});
  }, [slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  return {
    ...currentChat,
    statusesByAgentId,
    completionByAgentId: currentChat.completionByAgentId,
  };
}
