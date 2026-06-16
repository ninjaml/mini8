import { useEffect, useState, useMemo, useRef } from "react";
import { useRuntimeChat } from "./useRuntimeChat";
import { choosePoolSlot, reconcileOccupiedSlots } from "./persistentChatPool";

const emptyRuntimeMessages = [];
const MAX_PERSISTENT_CHATS = 10;

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Manages persistent SuperAgent chat connections for multiple workspaces.
 * Maintains WebSocket connections for the most recently accessed workspaces
 * to prevent interruption of agent responses when switching workspaces.
 *
 * @param {Array} workspaces - List of all workspaces
 * @param {string|null} currentWorkspaceId - Currently selected workspace ID
 * @returns {Object} Chat instance for the current workspace
 */
export function usePersistentSuperAgentChats(workspaces, currentWorkspaceId, disabled = false) {
  // Use ref to store stable slot assignments: { slotIndex -> workspaceId }
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

  // Find workspace objects for each slot
  const slotWorkspaces = useMemo(() => {
    return occupiedSlots.map(wsId =>
      wsId ? workspaces.find(ws => ws.id === wsId) : null
    );
  }, [occupiedSlots, workspaces]);

  // Create fixed number of chat instances
  // IMPORTANT: contextKey must remain stable for each slot to avoid reconnections
  const chat1 = useRuntimeChat({
    contextKey: slotWorkspaces[0] ? `superagent-${slotWorkspaces[0].id}` : "superagent-slot1-empty",
    contextKind: slotWorkspaces[0] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[0] ? Number(slotWorkspaces[0].id) : null,
    disabled: disabled || !slotWorkspaces[0],
    displayName: slotWorkspaces[0]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat2 = useRuntimeChat({
    contextKey: slotWorkspaces[1] ? `superagent-${slotWorkspaces[1].id}` : "superagent-slot2-empty",
    contextKind: slotWorkspaces[1] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[1] ? Number(slotWorkspaces[1].id) : null,
    disabled: disabled || !slotWorkspaces[1],
    displayName: slotWorkspaces[1]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat3 = useRuntimeChat({
    contextKey: slotWorkspaces[2] ? `superagent-${slotWorkspaces[2].id}` : "superagent-slot3-empty",
    contextKind: slotWorkspaces[2] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[2] ? Number(slotWorkspaces[2].id) : null,
    disabled: disabled || !slotWorkspaces[2],
    displayName: slotWorkspaces[2]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat4 = useRuntimeChat({
    contextKey: slotWorkspaces[3] ? `superagent-${slotWorkspaces[3].id}` : "superagent-slot4-empty",
    contextKind: slotWorkspaces[3] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[3] ? Number(slotWorkspaces[3].id) : null,
    disabled: disabled || !slotWorkspaces[3],
    displayName: slotWorkspaces[3]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat5 = useRuntimeChat({
    contextKey: slotWorkspaces[4] ? `superagent-${slotWorkspaces[4].id}` : "superagent-slot5-empty",
    contextKind: slotWorkspaces[4] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[4] ? Number(slotWorkspaces[4].id) : null,
    disabled: disabled || !slotWorkspaces[4],
    displayName: slotWorkspaces[4]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat6 = useRuntimeChat({
    contextKey: slotWorkspaces[5] ? `superagent-${slotWorkspaces[5].id}` : "superagent-slot6-empty",
    contextKind: slotWorkspaces[5] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[5] ? Number(slotWorkspaces[5].id) : null,
    disabled: disabled || !slotWorkspaces[5],
    displayName: slotWorkspaces[5]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat7 = useRuntimeChat({
    contextKey: slotWorkspaces[6] ? `superagent-${slotWorkspaces[6].id}` : "superagent-slot7-empty",
    contextKind: slotWorkspaces[6] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[6] ? Number(slotWorkspaces[6].id) : null,
    disabled: disabled || !slotWorkspaces[6],
    displayName: slotWorkspaces[6]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat8 = useRuntimeChat({
    contextKey: slotWorkspaces[7] ? `superagent-${slotWorkspaces[7].id}` : "superagent-slot8-empty",
    contextKind: slotWorkspaces[7] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[7] ? Number(slotWorkspaces[7].id) : null,
    disabled: disabled || !slotWorkspaces[7],
    displayName: slotWorkspaces[7]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat9 = useRuntimeChat({
    contextKey: slotWorkspaces[8] ? `superagent-${slotWorkspaces[8].id}` : "superagent-slot9-empty",
    contextKind: slotWorkspaces[8] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[8] ? Number(slotWorkspaces[8].id) : null,
    disabled: disabled || !slotWorkspaces[8],
    displayName: slotWorkspaces[8]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chat10 = useRuntimeChat({
    contextKey: slotWorkspaces[9] ? `superagent-${slotWorkspaces[9].id}` : "superagent-slot10-empty",
    contextKind: slotWorkspaces[9] ? "workspace_superagent" : null,
    workspaceId: slotWorkspaces[9] ? Number(slotWorkspaces[9].id) : null,
    disabled: disabled || !slotWorkspaces[9],
    displayName: slotWorkspaces[9]?.superAgentName || "项目经理",
    fallbackMessages: emptyRuntimeMessages,
  });

  const chats = [chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10];

  const statusesByWorkspaceId = useMemo(() => {
    return slotWorkspaces.reduce((acc, workspace, index) => {
      if (!workspace) return acc;
      const chat = chats[index];
      const queuedCount = chat?.queuedMessages?.length || 0;
      acc[String(workspace.id)] = queuedCount > 0 ? "queued" : (chat?.status || "idle");
      return acc;
    }, {});
  }, [slotWorkspaces, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  useEffect(() => {
    setOccupiedSlots((prev) => {
      const next = reconcileOccupiedSlots(prev, workspaces);
      if (arraysEqual(prev, next)) {
        return prev;
      }

      slotAssignments.current = next.reduce((acc, workspaceId, index) => {
        if (workspaceId != null) {
          acc[index] = workspaceId;
        }
        return acc;
      }, {});
      return next;
    });
  }, [workspaces]);

  useEffect(() => {
    if (!currentWorkspaceId) return;

    const target = choosePoolSlot({
      occupiedSlots,
      currentEntityId: currentWorkspaceId,
      statusesByEntityId: statusesByWorkspaceId,
      lastTouchedAtByEntityId: lastTouchedAtRef.current,
    });

    if (!target) {
      return;
    }

    lastTouchedAtRef.current[String(currentWorkspaceId)] = Date.now();
    slotAssignments.current[target.slotIndex] = currentWorkspaceId;

    setOccupiedSlots((prev) => {
      if (prev[target.slotIndex] === currentWorkspaceId) {
        return prev;
      }
      const next = [...prev];
      next[target.slotIndex] = currentWorkspaceId;
      return next;
    });
  }, [currentWorkspaceId, occupiedSlots, statusesByWorkspaceId]);

  // Find the chat instance for the current workspace
  const currentChat = useMemo(() => {
    const slotIndex = occupiedSlots.indexOf(currentWorkspaceId);
    const completionByWorkspaceId = slotWorkspaces.reduce((acc, workspace, index) => {
      if (workspace) {
        acc[workspace.id] = chats[index]?.lastCompletedAt || 0;
      }
      return acc;
    }, {});

    if (slotIndex >= 0 && slotIndex < chats.length) {
      return {
        ...chats[slotIndex],
        completionByWorkspaceId,
      };
    }

    // If current workspace is not in any slot, return a placeholder
    return {
      contextKey: "superagent-none",
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
      threadId: "",
      lastCompletedAt: 0,
      completionByWorkspaceId,
    };
  }, [currentWorkspaceId, occupiedSlots, slotWorkspaces, chat1, chat2, chat3, chat4, chat5, chat6, chat7, chat8, chat9, chat10]);

  return {
    ...currentChat,
    statusesByWorkspaceId,
    completionByWorkspaceId: currentChat.completionByWorkspaceId,
  };
}
