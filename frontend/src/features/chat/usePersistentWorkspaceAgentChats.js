import { useEffect, useState, useMemo, useRef } from "react";
import { useRuntimeChat } from "./useRuntimeChat";
import { getAgentWorkspaceSessionId } from "../../lib/agentSessions.js";
import { choosePoolSlot, reconcileOccupiedSlots, normalizeId } from "./persistentChatPool";

const emptyRuntimeMessages = [];
const MAX_PERSISTENT_CHATS = 10;


function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Manages persistent workspace-agent chat connections for multiple agents.
 * Maintains WebSocket connections for the most recently accessed agents
 * to prevent interruption of agent responses when switching agents.
 *
 * @param {Array} agents - List of all agents in current workspace
 * @param {string|null} currentAgentId - Currently selected agent ID
 * @param {string|null} currentWorkspaceId - Currently selected workspace ID
 * @returns {Object} Chat instance for the current agent
 */
export function usePersistentWorkspaceAgentChats(agents, currentAgentId, currentWorkspaceId, disabled = false, priorityAgentIds = []) {
  // Use ref to store stable slot assignments: { slotIndex -> agentSessionId }
  const slotAssignments = useRef({});
  const lastTouchedAtRef = useRef({});

  const sessionIdToAgent = useMemo(() => {
    const map = new Map();
    for (const agent of agents) {
      const sessionId = normalizeId(getAgentWorkspaceSessionId(agent));
      if (!sessionId) continue;
      map.set(sessionId, agent);
    }
    return map;
  }, [agents]);

  const slotEntities = useMemo(() => {
    return agents
      .map((agent) => ({ id: getAgentWorkspaceSessionId(agent) }))
      .filter((entry) => normalizeId(entry.id));
  }, [agents]);

  const currentAgentSessionId = useMemo(() => {
    const currentAgent = agents.find((agent) => String(agent.id) === String(currentAgentId));
    return normalizeId(getAgentWorkspaceSessionId(currentAgent));
  }, [agents, currentAgentId]);

  const priorityAgentSessionIds = useMemo(() => {
    return priorityAgentIds
      .map((agentId) => {
        const agent = agents.find((entry) => String(entry.id) === String(agentId));
        return normalizeId(getAgentWorkspaceSessionId(agent));
      })
      .filter(Boolean);
  }, [agents, priorityAgentIds]);

  // Track which slots are occupied
  const [occupiedSlots, setOccupiedSlots] = useState([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  // Find agent objects for each slot
  const slotAgents = useMemo(() => {
    return occupiedSlots.map((agentSessionId) => {
      const normalizedSessionId = normalizeId(agentSessionId);
      return normalizedSessionId ? sessionIdToAgent.get(normalizedSessionId) ?? null : null;
    });
  }, [occupiedSlots, sessionIdToAgent]);

  // Create fixed number of chat instances
  // IMPORTANT: contextKey must remain stable for each slot to avoid reconnections
  const chat1 = useRuntimeChat({
    contextKey: slotAgents[0] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[0])}` : "workspace-agent-slot1-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[0]),
    disabled: disabled || !slotAgents[0],
    displayName: slotAgents[0]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat2 = useRuntimeChat({
    contextKey: slotAgents[1] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[1])}` : "workspace-agent-slot2-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[1]),
    disabled: disabled || !slotAgents[1],
    displayName: slotAgents[1]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat3 = useRuntimeChat({
    contextKey: slotAgents[2] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[2])}` : "workspace-agent-slot3-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[2]),
    disabled: disabled || !slotAgents[2],
    displayName: slotAgents[2]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat4 = useRuntimeChat({
    contextKey: slotAgents[3] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[3])}` : "workspace-agent-slot4-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[3]),
    disabled: disabled || !slotAgents[3],
    displayName: slotAgents[3]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat5 = useRuntimeChat({
    contextKey: slotAgents[4] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[4])}` : "workspace-agent-slot5-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[4]),
    disabled: disabled || !slotAgents[4],
    displayName: slotAgents[4]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat6 = useRuntimeChat({
    contextKey: slotAgents[5] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[5])}` : "workspace-agent-slot6-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[5]),
    disabled: disabled || !slotAgents[5],
    displayName: slotAgents[5]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat7 = useRuntimeChat({
    contextKey: slotAgents[6] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[6])}` : "workspace-agent-slot7-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[6]),
    disabled: disabled || !slotAgents[6],
    displayName: slotAgents[6]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat8 = useRuntimeChat({
    contextKey: slotAgents[7] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[7])}` : "workspace-agent-slot8-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[7]),
    disabled: disabled || !slotAgents[7],
    displayName: slotAgents[7]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat9 = useRuntimeChat({
    contextKey: slotAgents[8] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[8])}` : "workspace-agent-slot9-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[8]),
    disabled: disabled || !slotAgents[8],
    displayName: slotAgents[8]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat10 = useRuntimeChat({
    contextKey: slotAgents[9] ? `workspace-agent-session-${getAgentWorkspaceSessionId(slotAgents[9])}` : "workspace-agent-slot10-empty",
    contextKind: null,
    agentSessionId: getAgentWorkspaceSessionId(slotAgents[9]),
    disabled: disabled || !slotAgents[9],
    displayName: slotAgents[9]?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chats = [chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10];

  const statusesBySessionId = useMemo(() => {
    return slotAgents.reduce((acc, agent, index) => {
      if (!agent) return acc;
      const chat = chats[index];
      const queuedCount = chat?.queuedMessages?.length || 0;
      const sessionId = normalizeId(getAgentWorkspaceSessionId(agent));
      if (!sessionId) return acc;
      acc[sessionId] = queuedCount > 0 ? "queued" : (chat?.status || "idle");
      return acc;
    }, {});
  }, [slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  const statusesByAgentId = useMemo(() => {
    return slotAgents.reduce((acc, agent, index) => {
      if (!agent) return acc;
      const chat = chats[index];
      const queuedCount = chat?.queuedMessages?.length || 0;
      acc[String(agent.id)] = queuedCount > 0 ? "queued" : (chat?.status || "idle");
      return acc;
    }, {});
  }, [slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  useEffect(() => {
    setOccupiedSlots((prev) => {
      const next = reconcileOccupiedSlots(prev, slotEntities);
      if (arraysEqual(prev, next)) {
        return prev;
      }

      slotAssignments.current = next.reduce((acc, agentSessionId, index) => {
        if (agentSessionId != null) {
          acc[index] = agentSessionId;
        }
        return acc;
      }, {});
      return next;
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

    if (!target) {
      return;
    }

    lastTouchedAtRef.current[currentAgentSessionId] = Date.now();
    slotAssignments.current[target.slotIndex] = currentAgentSessionId;

    setOccupiedSlots((prev) => {
      if (normalizeId(prev[target.slotIndex]) === currentAgentSessionId) {
        return prev;
      }
      const next = [...prev];
      next[target.slotIndex] = currentAgentSessionId;
      return next;
    });
  }, [currentAgentSessionId, occupiedSlots, statusesBySessionId]);

  // Ensure priority agents (e.g., visible in office view) occupy pool slots
  // so their live statuses are available even when not currently selected.
  const prevPriorityAgentIds = useRef([]);
  useEffect(() => {
    if (arraysEqual(prevPriorityAgentIds.current, priorityAgentSessionIds)) return;
    prevPriorityAgentIds.current = priorityAgentSessionIds;

    setOccupiedSlots((prev) => {
      const next = [...prev];
      let changed = false;

      for (const agentSessionId of priorityAgentSessionIds) {
        const normalizedId = normalizeId(agentSessionId);
        if (!normalizedId) continue;
        if (next.some((id) => normalizeId(id) === normalizedId)) continue;

        const target = choosePoolSlot({
          occupiedSlots: next,
          currentEntityId: agentSessionId,
          statusesByEntityId: statusesBySessionId,
          lastTouchedAtByEntityId: lastTouchedAtRef.current,
        });

        if (!target) continue;

        lastTouchedAtRef.current[normalizedId] = Date.now();
        slotAssignments.current[target.slotIndex] = agentSessionId;
        next[target.slotIndex] = agentSessionId;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [priorityAgentSessionIds, statusesBySessionId]);

  // Find the chat instance for the current agent
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

    // If current agent is not in any slot, return a placeholder
    return {
      contextKey: "workspace-agent-session-none",
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
      threadId: "",
      lastCompletedAt: 0,
      completionByAgentId,
    };
  }, [currentAgentSessionId, occupiedSlots, slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  return {
    ...currentChat,
    statusesByAgentId,
    completionByAgentId: currentChat.completionByAgentId,
  };
}
