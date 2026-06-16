import { useEffect, useState, useMemo, useRef } from "react";
import { useRuntimeChat } from "./useRuntimeChat";
import { choosePoolSlot, reconcileOccupiedSlots, normalizeId } from "./persistentChatPool";

const emptyRuntimeMessages = [];
const MAX_PERSISTENT_CHATS = 10;

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Manages persistent WorkAgent chat connections for multiple agents.
 * Maintains WebSocket connections for the most recently accessed agents
 * to prevent interruption of agent responses when switching agents.
 *
 * @param {Array} agents - List of all agents in current workspace
 * @param {string|null} currentAgentId - Currently selected agent ID
 * @param {string|null} currentWorkspaceId - Currently selected workspace ID
 * @returns {Object} Chat instance for the current agent
 */
export function usePersistentWorkAgentChats(agents, currentAgentId, currentWorkspaceId, currentItemId = null, disabled = false, priorityAgentIds = []) {
  // Use ref to store stable slot assignments: { slotIndex -> agentId }
  const slotAssignments = useRef({});
  const lastTouchedAtRef = useRef({});

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
    return occupiedSlots.map(agentId =>
      agentId ? agents.find(agent => String(agent.id) === String(agentId)) : null
    );
  }, [occupiedSlots, agents]);

  // Create fixed number of chat instances
  // IMPORTANT: contextKey must remain stable for each slot to avoid reconnections
  const chat1 = useRuntimeChat({
    contextKey: slotAgents[0] ? `workagent-${slotAgents[0].id}` : "workagent-slot1-empty",
    contextKind: slotAgents[0] ? "workagent" : null,
    workspaceId: slotAgents[0] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[0] ? Number(slotAgents[0].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[0],
    displayName: slotAgents[0]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat2 = useRuntimeChat({
    contextKey: slotAgents[1] ? `workagent-${slotAgents[1].id}` : "workagent-slot2-empty",
    contextKind: slotAgents[1] ? "workagent" : null,
    workspaceId: slotAgents[1] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[1] ? Number(slotAgents[1].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[1],
    displayName: slotAgents[1]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat3 = useRuntimeChat({
    contextKey: slotAgents[2] ? `workagent-${slotAgents[2].id}` : "workagent-slot3-empty",
    contextKind: slotAgents[2] ? "workagent" : null,
    workspaceId: slotAgents[2] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[2] ? Number(slotAgents[2].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[2],
    displayName: slotAgents[2]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat4 = useRuntimeChat({
    contextKey: slotAgents[3] ? `workagent-${slotAgents[3].id}` : "workagent-slot4-empty",
    contextKind: slotAgents[3] ? "workagent" : null,
    workspaceId: slotAgents[3] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[3] ? Number(slotAgents[3].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[3],
    displayName: slotAgents[3]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat5 = useRuntimeChat({
    contextKey: slotAgents[4] ? `workagent-${slotAgents[4].id}` : "workagent-slot5-empty",
    contextKind: slotAgents[4] ? "workagent" : null,
    workspaceId: slotAgents[4] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[4] ? Number(slotAgents[4].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[4],
    displayName: slotAgents[4]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat6 = useRuntimeChat({
    contextKey: slotAgents[5] ? `workagent-${slotAgents[5].id}` : "workagent-slot6-empty",
    contextKind: slotAgents[5] ? "workagent" : null,
    workspaceId: slotAgents[5] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[5] ? Number(slotAgents[5].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[5],
    displayName: slotAgents[5]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat7 = useRuntimeChat({
    contextKey: slotAgents[6] ? `workagent-${slotAgents[6].id}` : "workagent-slot7-empty",
    contextKind: slotAgents[6] ? "workagent" : null,
    workspaceId: slotAgents[6] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[6] ? Number(slotAgents[6].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[6],
    displayName: slotAgents[6]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat8 = useRuntimeChat({
    contextKey: slotAgents[7] ? `workagent-${slotAgents[7].id}` : "workagent-slot8-empty",
    contextKind: slotAgents[7] ? "workagent" : null,
    workspaceId: slotAgents[7] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[7] ? Number(slotAgents[7].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[7],
    displayName: slotAgents[7]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat9 = useRuntimeChat({
    contextKey: slotAgents[8] ? `workagent-${slotAgents[8].id}` : "workagent-slot9-empty",
    contextKind: slotAgents[8] ? "workagent" : null,
    workspaceId: slotAgents[8] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[8] ? Number(slotAgents[8].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[8],
    displayName: slotAgents[8]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat10 = useRuntimeChat({
    contextKey: slotAgents[9] ? `workagent-${slotAgents[9].id}` : "workagent-slot10-empty",
    contextKind: slotAgents[9] ? "workagent" : null,
    workspaceId: slotAgents[9] && currentWorkspaceId ? Number(currentWorkspaceId) : null,
    agentId: slotAgents[9] ? Number(slotAgents[9].id) : null,
    currentItemId,
    disabled: disabled || !slotAgents[9],
    displayName: slotAgents[9]?.name || "WorkAgent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chats = [chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10];

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
      const next = reconcileOccupiedSlots(prev, agents);
      if (arraysEqual(prev, next)) {
        return prev;
      }

      slotAssignments.current = next.reduce((acc, agentId, index) => {
        if (agentId != null) {
          acc[index] = agentId;
        }
        return acc;
      }, {});
      return next;
    });
  }, [agents]);

  useEffect(() => {
    if (!currentAgentId) return;

    const target = choosePoolSlot({
      occupiedSlots,
      currentEntityId: currentAgentId,
      statusesByEntityId: statusesByAgentId,
      lastTouchedAtByEntityId: lastTouchedAtRef.current,
    });

    if (!target) {
      return;
    }

    lastTouchedAtRef.current[String(currentAgentId)] = Date.now();
    slotAssignments.current[target.slotIndex] = currentAgentId;

    setOccupiedSlots((prev) => {
      if (prev[target.slotIndex] === currentAgentId) {
        return prev;
      }
      const next = [...prev];
      next[target.slotIndex] = currentAgentId;
      return next;
    });
  }, [currentAgentId, occupiedSlots, statusesByAgentId]);

  // Ensure priority agents (e.g., visible in office view) occupy pool slots
  // so their live statuses are available even when not currently selected.
  const prevPriorityAgentIds = useRef([]);
  useEffect(() => {
    if (arraysEqual(prevPriorityAgentIds.current, priorityAgentIds)) return;
    prevPriorityAgentIds.current = priorityAgentIds;

    setOccupiedSlots((prev) => {
      const next = [...prev];
      let changed = false;

      for (const agentId of priorityAgentIds) {
        const normalizedId = normalizeId(agentId);
        if (!normalizedId) continue;
        if (next.some((id) => normalizeId(id) === normalizedId)) continue;

        const target = choosePoolSlot({
          occupiedSlots: next,
          currentEntityId: agentId,
          statusesByEntityId: statusesByAgentId,
          lastTouchedAtByEntityId: lastTouchedAtRef.current,
        });

        if (!target) continue;

        lastTouchedAtRef.current[normalizedId] = Date.now();
        slotAssignments.current[target.slotIndex] = agentId;
        next[target.slotIndex] = agentId;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [priorityAgentIds, statusesByAgentId]);

  // Find the chat instance for the current agent
  const currentChat = useMemo(() => {
    const slotIndex = occupiedSlots.indexOf(currentAgentId);
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
      contextKey: "workagent-none",
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
  }, [currentAgentId, occupiedSlots, slotAgents, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  return {
    ...currentChat,
    statusesByAgentId,
    completionByAgentId: currentChat.completionByAgentId,
  };
}
