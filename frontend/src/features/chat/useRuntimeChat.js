import { useEffect, useMemo, useRef, useState } from "react";
import { runtime } from "../../lib/runtime";
import { getStoredAuth } from "../../lib/auth";
import { buildRuntimeSocketInitPayload } from "./runtimeSessionPayload.js";
import {
  annotateLastUserMessageIndex,
  createProjectionState,
  finalizeProjectionStreams,
  projectReplayGroupsToProjectionState,
  reduceRealtimePacket,
} from "./runtimeChatProjection.js";

const INITIAL_HISTORY_LIMIT = 30;
const LOAD_MORE_HISTORY_LIMIT = 10;

function playToneSequence({ notes, oscillatorType = "sine", volume = 0.06, spacing = 0.08 }) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    const now = audioContext.currentTime;

    notes.forEach((frequency, index) => {
      const start = now + index * spacing;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = oscillatorType;
      oscillator.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.09);
    });

    window.setTimeout(() => audioContext.close().catch(() => {}), notes.length * spacing * 1000 + 180);
  } catch (error) {
    console.warn("[useRuntimeChat] Completion sound could not play", error);
  }
}

function playCompletionSound(contextKind) {
  if (contextKind === "moss") {
    playToneSequence({
      notes: [440, 660, 880],
      oscillatorType: "sine",
      volume: 0.075,
      spacing: 0.09,
    });
    return;
  }

  playToneSequence({
    notes: [587, 740],
    oscillatorType: "triangle",
    volume: 0.045,
    spacing: 0.11,
  });
}

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function assistantAvatar(name) {
  return (name || "A").slice(0, 1).toUpperCase();
}

function createUserMessage({ text, authorName, attachments = [] }) {
  // 用户消息在发送前先本地生成一份标准消息对象，
  // 队列重放、普通发送、回滚后重连都复用同一套形状。
  const message = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "user",
    role: "user",
    avatar: (authorName || "U").slice(0, 1).toUpperCase(),
    name: authorName || "User",
    time: nowLabel(),
    content: text,
    messageIndex: null,
  };

  if (attachments.length > 0) {
    message.attachments = attachments.map((att) => ({
      type: att.type,
      name: att.filename,
      url: att.data,
    }));
  }

  return message;
}

async function processAttachments(attachments) {
  // 运行时 websocket 直接消费 base64 附件，因此前端先在发送前统一完成转换。
  return Promise.all(
    (attachments || []).map(async (att) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          type: att.type.startsWith("image/") ? "image" : "document",
          data: reader.result,
          filename: att.name,
          mime_type: att.type,
        });
      };
      reader.onerror = () => reject(new Error(`无法读取文件: ${att.name}`));
      reader.readAsDataURL(att.file);
    })),
  );
}

export function useRuntimeChat({
  contextKey,
  contextKind = null,
  agentSessionId = null,
  disabled = false,
  displayName = "Agent",
  fallbackMessages = [],
}) {
  const [draft, setDraft] = useState("");
  const [projectionState, setProjectionState] = useState(() => createProjectionState(fallbackMessages));
  const [status, setStatus] = useState(disabled ? "disabled" : "idle");
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState(null);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [isMultimodal, setIsMultimodal] = useState(false);
  const [lastCompletedAt, setLastCompletedAt] = useState(0);
  const [connectionNonce, setConnectionNonce] = useState(0);
  const socketRef = useRef(null);
  const activeThreadRef = useRef("");
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    if (!activeThreadRef.current) {
      setProjectionState(createProjectionState(fallbackMessages));
    }
  }, [fallbackMessages]);

  function setItems(updater) {
    setProjectionState((prev) => ({
      ...prev,
      items: updater(prev.items),
    }));
  }

  function applyRealtimePacket(packet) {
    // 所有 websocket 包都先进入投影层，再由投影层决定是主线消息还是子卡片消息。
    const createdAt = new Date().toISOString();
    setProjectionState((prev) => reduceRealtimePacket(prev, packet, {
      displayName,
      createdAt,
      threadId: activeThreadRef.current || null,
    }));
  }

  function markIncompleteAndCloseStreams() {
    setProjectionState((prev) => finalizeProjectionStreams(prev, { unfinishedCards: true }));
  }

  function finalizeRunCycle({ playSound = false, markUnfinished = true } = {}) {
    // 一次 run 结束时，不直接手写 UI 收尾，而是统一让投影层收口。
    if (markUnfinished) {
      markIncompleteAndCloseStreams();
    } else {
      setProjectionState((prev) => finalizeProjectionStreams(prev, { unfinishedCards: false }));
    }

    if (playSound) {
      playCompletionSound(contextKind);
      setLastCompletedAt(Date.now());
    }

    setStatus("ready");
    isProcessingQueueRef.current = false;

    setQueuedMessages((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const [nextMessage, ...rest] = prev;
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return prev;
      }

      // 队列里的下一条消息会按“真实发送”的完整路径再走一遍，
      // 包括附件处理、本地插入 user message、切到 streaming 状态。
      isProcessingQueueRef.current = true;
      void (async () => {
        try {
          const processedAttachments = await processAttachments(nextMessage.attachments || []);
          const userMessage = createUserMessage({
            text: nextMessage.text,
            authorName: nextMessage.authorName,
            attachments: processedAttachments,
          });

          setItems((items) => [...items, userMessage]);

          const payload = {
            message: nextMessage.text,
            auto_approve: true,
          };

          if (processedAttachments.length > 0) {
            payload.is_multimodal = true;
            payload.attachments = processedAttachments;
          }

          if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket closed during message processing");
          }

          setStatus("streaming");
          socketRef.current.send(JSON.stringify(payload));
        } catch (error) {
          console.error(`[useRuntimeChat] Failed to process/send queued message - ${displayName}`, error);
          setQueuedMessages((current) => [nextMessage, ...current]);
          setStatus("ready");
          isProcessingQueueRef.current = false;
        }
      })();

      return rest;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (disabled || (contextKind == null && agentSessionId == null)) {
        setStatus("disabled");
        activeThreadRef.current = "";
        if (socketRef.current) {
          socketRef.current.close();
          socketRef.current = null;
        }
        setProjectionState(createProjectionState(fallbackMessages));
        return;
      }

      setStatus("connecting");

      try {
        const auth = getStoredAuth();
        const session = await runtime.createContextSession({
          kind: contextKind,
          agentSessionId,
          primaryKey: auth?.user_id ?? null,
        });
        if (cancelled) return;

        activeThreadRef.current = session.thread_id;

        const history = await runtime.fetchGroupedReplayEvents({
          threadId: session.thread_id,
          limitGroups: INITIAL_HISTORY_LIMIT,
        });
        if (cancelled) return;

        // 历史 hydrate 直接用 grouped replay 投影初始化聊天区，
        // 不再区分“普通消息列表”和“子 agent 历史”两条分支。
        setHasMoreHistory(Boolean(history?.has_more));
        setHistoryCursor(history?.next_cursor ?? null);
        setProjectionState(projectReplayGroupsToProjectionState(history?.groups || [], {
          displayName,
          threadId: session.thread_id,
          fallbackItems: fallbackMessages,
        }));

        if (socketRef.current) {
          try {
            socketRef.current.close(1000, "Switching context");
          } catch (error) {
            console.error(`[useRuntimeChat] Error closing old socket - ${displayName}`, error);
          }
          socketRef.current = null;
        }

        const socket = runtime.createSocket({ threadId: session.thread_id });
        socketRef.current = socket;

        socket.onopen = () => {
          socket.send(
            JSON.stringify(
              buildRuntimeSocketInitPayload({
                kind: contextKind,
                agentSessionId,
                primaryKey: auth?.user_id ?? null,
              }),
            ),
          );
        };

        socket.onmessage = (event) => {
          const packet = JSON.parse(event.data);

          if (packet.type === "ready") {
            setStatus("ready");
            setIsMultimodal(packet.is_multimodal || false);
            return;
          }

          if (packet.type === "message_index") {
            const parsedIndex = Number(packet.content);
            if (!Number.isNaN(parsedIndex)) {
              // rollback 仍然依赖 user message 的 messageIndex，
              // 这里只给最近一条尚未落索引的 user message 回填即可。
              setItems((items) => annotateLastUserMessageIndex(items, parsedIndex));
            }
            return;
          }

          if (packet.type === "done") {
            finalizeRunCycle({ playSound: true, markUnfinished: true });
            return;
          }

          if (packet.type === "interrupted") {
            finalizeRunCycle({ playSound: false, markUnfinished: true });
            return;
          }

          if (packet.type === "error") {
            applyRealtimePacket(packet);
            markIncompleteAndCloseStreams();
            setStatus("error");
            return;
          }

          applyRealtimePacket(packet);
        };

        socket.onerror = (error) => {
          console.error(`[useRuntimeChat] WebSocket error - ${displayName}`, error);
          markIncompleteAndCloseStreams();
          setStatus("error");
          setQueuedMessages([]);
        };

        socket.onclose = (event) => {
          markIncompleteAndCloseStreams();
          if (!cancelled) {
            setStatus(disabled ? "disabled" : "idle");
            setQueuedMessages((prev) => prev.map((message) => ({ ...message, status: "waiting" })));
            if (event.code !== 1000) {
              setItems((items) => [
                ...items,
                {
                  id: `ws-displaced-${Date.now()}`,
                  type: "system",
                  role: "system",
                  time: nowLabel(),
                  content: "Agent连接已断开，请刷新",
                },
              ]);
            }
          }
        };
      } catch (error) {
        if (cancelled) return;
        markIncompleteAndCloseStreams();
        setStatus("error");
        setItems((items) => [
          ...items,
          {
            id: `runtime-init-error-${Date.now()}`,
            type: "error",
            role: "assistant",
            avatar: "!",
            name: displayName,
            time: nowLabel(),
            content: error.message || "Runtime 初始化失败。",
          },
        ]);
      }
    }

    connect();

    return () => {
      cancelled = true;
    };
  }, [contextKey, contextKind, agentSessionId, disabled, connectionNonce, displayName]);

  async function sendMessage({ text, authorName, attachments = [] }) {
    const message = text.trim();
    if (!message || disabled) {
      return false;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setQueuedMessages((prev) => [
        ...prev,
        {
          id: `queued-${Date.now()}`,
          text: message,
          authorName,
          attachments,
          status: "waiting",
          timestamp: Date.now(),
        },
      ]);
      return false;
    }

    if (status === "streaming" || isProcessingQueueRef.current) {
      // 当前 run 未结束时，后续消息进入队列，避免和同一条 websocket 执行流互相打架。
      setQueuedMessages((prev) => [
        ...prev,
        {
          id: `queued-${Date.now()}`,
          text: message,
          authorName,
          attachments,
          status: "queued",
          timestamp: Date.now(),
        },
      ]);
      return true;
    }

    const processedAttachments = await processAttachments(attachments);
    const userMessage = createUserMessage({
      text: message,
      authorName,
      attachments: processedAttachments,
    });

    setItems((items) => [...items, userMessage]);
    setStatus("streaming");

    const payload = {
      message,
      auto_approve: true,
    };

    if (processedAttachments.length > 0) {
      payload.is_multimodal = true;
      payload.attachments = processedAttachments;
    }

    socketRef.current.send(JSON.stringify(payload));
    return true;
  }

  async function loadMoreMessages() {
    if (!activeThreadRef.current || isLoadingMore || !hasMoreHistory) {
      return false;
    }

    setIsLoadingMore(true);
    try {
      const history = await runtime.fetchGroupedReplayEvents({
        threadId: activeThreadRef.current,
        limitGroups: LOAD_MORE_HISTORY_LIMIT,
        beforeCursor: historyCursor,
      });

      const olderProjection = projectReplayGroupsToProjectionState(history?.groups || [], {
        displayName,
        threadId: activeThreadRef.current,
        fallbackItems: [],
      });

      // 分页历史按 group 级别整体前插，保证一次 run 的 root 消息和子卡片不会被拆散。
      setProjectionState((prev) => ({
        ...prev,
        items: [...olderProjection.items, ...prev.items],
      }));
      setHasMoreHistory(Boolean(history?.has_more));
      setHistoryCursor(history?.next_cursor ?? null);
      setIsLoadingMore(false);
      return true;
    } catch (error) {
      console.error(`[useRuntimeChat] Failed to load more messages - ${displayName}`, error);
      setIsLoadingMore(false);
      return false;
    }
  }

  async function rollbackToMessage(messageId) {
    if (!activeThreadRef.current || isRollingBack || status === "streaming") {
      return false;
    }

    setRollbackConfirm(messageId);
    return false;
  }

  async function confirmRollback(onDraftChange) {
    const messageId = rollbackConfirm;
    setRollbackConfirm(null);

    if (!messageId) return false;

    const originalItems = projectionState.items;
    const targetMessageIndex = originalItems.findIndex((message) => message.id === messageId);
    if (targetMessageIndex === -1) {
      throw new Error("消息未找到");
    }

    const targetMessage = originalItems[targetMessageIndex];
    if (targetMessage && targetMessage.role === "user" && onDraftChange) {
      onDraftChange(targetMessage.content || "");
    }

    setIsRollingBack(true);
    try {
      const messageIndex = targetMessage?.messageIndex;
      if (typeof messageIndex !== "number") {
        throw new Error("消息索引未就绪，请稍后再试");
      }

      await runtime.rollbackSession({
        threadId: activeThreadRef.current,
        messageIndex,
      });

      // rollback 成功后，本地先裁掉回滚点之后的投影，再重连拿干净的新 runtime 状态。
      setProjectionState((prev) => ({
        ...prev,
        items: prev.items.slice(0, targetMessageIndex),
      }));
      isProcessingQueueRef.current = false;
      setQueuedMessages([]);
      if (socketRef.current) {
        socketRef.current.close(1000, "Rollback refresh");
        socketRef.current = null;
      }
      setStatus("connecting");
      setConnectionNonce((value) => value + 1);
      setIsRollingBack(false);
      return true;
    } catch (error) {
      console.error(`[useRuntimeChat] Rollback failed - ${displayName}:`, error.message || error);
      setProjectionState(createProjectionState(originalItems));
      if (onDraftChange) {
        onDraftChange("");
      }
      setIsRollingBack(false);
      throw new Error(`回滚失败，请重试。错误：${error.message || "未知错误"}`);
    }
  }

  function removeQueuedMessage(messageId) {
    setQueuedMessages((prev) => prev.filter((message) => message.id !== messageId));
  }

  function stopStreaming() {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn(`[useRuntimeChat] Cannot stop - socket not open - ${displayName}`);
      return;
    }

    try {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
      // stop 也是一次“非正常完成”的 run 收口，所以要把 running 子卡片打成 unfinished。
      setProjectionState((prev) => finalizeProjectionStreams(prev, { unfinishedCards: true }));
      setStatus("ready");
    } catch (error) {
      console.error(`[useRuntimeChat] Failed to stop streaming - ${displayName}`, error);
    }
  }

  async function deleteCurrentSession() {
    const threadId = activeThreadRef.current;
    if (!threadId) {
      console.warn(`[useRuntimeChat] No active session to delete - ${displayName}`);
      return false;
    }

    try {
      if (socketRef.current) {
        socketRef.current.close(1000, "Session deleted");
        socketRef.current = null;
      }

      await runtime.deleteSession({ threadId });

      setProjectionState(createProjectionState(fallbackMessages));
      setQueuedMessages([]);
      isProcessingQueueRef.current = false;
      setStatus("idle");
      setConnectionNonce((value) => value + 1);
      return true;
    } catch (error) {
      console.error(`[useRuntimeChat] Failed to delete session - ${displayName}:`, error);
      setConnectionNonce((value) => value + 1);
      return false;
    }
  }

  return useMemo(
    () => ({
      contextKey,
      draft,
      messages: projectionState.items,
      disabled,
      status,
      hasMoreHistory,
      isLoadingMore,
      isRollingBack,
      queuedMessages,
      rollbackConfirm,
      isMultimodal,
      lastCompletedAt,
      setDraft,
      sendMessage,
      loadMoreMessages,
      rollbackToMessage,
      confirmRollback,
      cancelRollback: () => setRollbackConfirm(null),
      removeQueuedMessage,
      stopStreaming,
      deleteCurrentSession,
      threadId: activeThreadRef.current,
    }),
    [
      contextKey,
      disabled,
      draft,
      projectionState.items,
      status,
      hasMoreHistory,
      isLoadingMore,
      isRollingBack,
      queuedMessages,
      rollbackConfirm,
      isMultimodal,
      lastCompletedAt,
    ],
  );
}
