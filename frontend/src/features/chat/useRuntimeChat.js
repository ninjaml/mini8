import { useEffect, useMemo, useRef, useState } from "react";
import { runtime } from "../../lib/runtime";
import { getStoredAuth } from "../../lib/auth";

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

export function useRuntimeChat({
  contextKey,
  contextKind = null,
  workspaceId = null,
  agentId = null,
  currentItemId = null,
  disabled = false,
  displayName = "Agent",
  fallbackMessages = [],
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(fallbackMessages);
  const [status, setStatus] = useState(disabled ? "disabled" : "idle");
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState(null);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [isMultimodal, setIsMultimodal] = useState(false);
  const [lastCompletedAt, setLastCompletedAt] = useState(0);
  const [connectionNonce, setConnectionNonce] = useState(0);
  const socketRef = useRef(null);
  const activeThreadRef = useRef("");
  const assistantStreamMessageIdRef = useRef("");
  const assistantStreamContentRef = useRef("");
  const thinkingStreamMessageIdRef = useRef("");
  const thinkingStreamContentRef = useRef("");
  const streamSequenceRef = useRef(0);
  const isProcessingQueueRef = useRef(false);

  function createStreamMessageId(kind) {
    streamSequenceRef.current += 1;
    return `${kind}-${streamSequenceRef.current}`;
  }

  function closeAssistantStreamLane() {
    assistantStreamMessageIdRef.current = "";
    assistantStreamContentRef.current = "";
  }

  function closeThinkingStreamLane() {
    thinkingStreamMessageIdRef.current = "";
    thinkingStreamContentRef.current = "";
  }

  function closeAllStreamLanes() {
    closeAssistantStreamLane();
    closeThinkingStreamLane();
  }

  function hasActiveStreamLanes() {
    return Boolean(assistantStreamMessageIdRef.current || thinkingStreamMessageIdRef.current);
  }

  function assignStreamChunk(kind, chunk) {
    if (kind === "assistant") {
      closeThinkingStreamLane();
      const isNew = !assistantStreamMessageIdRef.current;
      if (isNew) {
        assistantStreamMessageIdRef.current = createStreamMessageId("assistant");
        assistantStreamContentRef.current = "";
      }
      assistantStreamContentRef.current = `${assistantStreamContentRef.current}${chunk}`;
      return {
        messageId: assistantStreamMessageIdRef.current,
        content: assistantStreamContentRef.current,
        isNew,
      };
    }

    closeAssistantStreamLane();
    const isNew = !thinkingStreamMessageIdRef.current;
    if (isNew) {
      thinkingStreamMessageIdRef.current = createStreamMessageId("thinking");
      thinkingStreamContentRef.current = "";
    }
    thinkingStreamContentRef.current = `${thinkingStreamContentRef.current}${chunk}`;
    return {
      messageId: thinkingStreamMessageIdRef.current,
      content: thinkingStreamContentRef.current,
      isNew,
    };
  }

  function upsertStreamMessage(prev, { messageId, type, content }) {
    const messageIndex = prev.findIndex((message) => message.id === messageId);
    if (messageIndex !== -1) {
      const next = [...prev];
      next[messageIndex] = {
        ...next[messageIndex],
        content,
      };
      return next;
    }

    if (type === "assistant") {
      return [
        ...prev,
        {
          id: messageId,
          type: "assistant",
          role: "assistant",
          avatar: assistantAvatar(displayName),
          name: displayName,
          time: nowLabel(),
          content,
        },
      ];
    }

    return [
      ...prev,
      {
        id: messageId,
        type: "thinking",
        role: "assistant",
        content,
        time: nowLabel(),
      },
    ];
  }

  useEffect(() => {
    setMessages(fallbackMessages);
  }, [fallbackMessages]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (disabled || !contextKind) {
        console.log(`[useRuntimeChat] Disabled - ${displayName} (${contextKey})`);
        setStatus("disabled");
        activeThreadRef.current = "";
        if (socketRef.current) {
          console.log(`[useRuntimeChat] Closing socket - ${displayName}`);
          socketRef.current.close();
          socketRef.current = null;
        }
        return;
      }

      console.log(`[useRuntimeChat] Connecting - ${displayName} (${contextKey})`);
      setStatus("connecting");

      try {
        const auth = getStoredAuth();
        const session = await runtime.createContextSession({ kind: contextKind, workspaceId, agentId, currentItemId, userId: auth?.user_id ?? null });
        if (cancelled) return;

        console.log(`[useRuntimeChat] Session created - ${displayName}, threadId: ${session.thread_id}`);
        activeThreadRef.current = session.thread_id;
        const history = await runtime.fetchSessionEvents({
          threadId: session.thread_id,
          limit: INITIAL_HISTORY_LIMIT,
        });
        if (cancelled) return;

        setHasMoreHistory(history?.has_more || false);
        setOldestMessageId(history?.oldest_id || null);

        const hydratedMessages = (history?.events || [])
          .map((event) => ({
            id: `history-${event.id}`,
            type: event.type,
            role: event.type === "user" ? "user" : "assistant",
            avatar:
              event.type === "user"
                ? "U"
                : assistantAvatar(displayName),
            name: event.type === "user" ? "User" : displayName,
            time: event.created_at ? String(event.created_at).slice(11, 16) : "",
            content: event.content || "",
            messageIndex: typeof event.message_index === "number" ? event.message_index : null,
          }));
        setMessages(hydratedMessages.length ? hydratedMessages : fallbackMessages);

        if (socketRef.current) {
          const oldSocket = socketRef.current;
          const oldSocketId = oldSocket._debugId || 'unknown';
          console.log(`[useRuntimeChat] Closing old socket - ${displayName}, socketId: ${oldSocketId}, readyState: ${oldSocket.readyState}`);

          // 重新注册 onclose 事件，确保能捕获关闭事件
          oldSocket.onclose = (event) => {
            console.log(`[useRuntimeChat] Old WebSocket closed - ${displayName}, socketId: ${oldSocketId}, code: ${event.code}, reason: ${event.reason}`);
          };

          socketRef.current = null;
          try {
            oldSocket.close(1000, 'Switching context');
            console.log(`[useRuntimeChat] Old socket close() called - ${displayName}, socketId: ${oldSocketId}`);
          } catch (error) {
            console.error(`[useRuntimeChat] Error closing old socket - ${displayName}, socketId: ${oldSocketId}`, error);
          }
        }

        const socket = runtime.createSocket({ threadId: session.thread_id });
        const socketId = `${displayName}-${Date.now()}`;
        socket._debugId = socketId;
        socketRef.current = socket;
        console.log(`[useRuntimeChat] WebSocket created - ${displayName}, threadId: ${session.thread_id}, socketId: ${socketId}`);

        socket.onopen = () => {
          console.log(`[useRuntimeChat] WebSocket opened - ${displayName}, socketId: ${socketId}`);
          socket.send(JSON.stringify({ auto_approve: true }));
        };

        socket.onclose = (event) => {
          console.log(`[useRuntimeChat] WebSocket closed - ${displayName}, socketId: ${socketId}, code: ${event.code}, reason: ${event.reason}`);
        };

        socket.onerror = (error) => {
          console.error(`[useRuntimeChat] WebSocket error - ${displayName}, socketId: ${socketId}`, error);
        };

        socket.onmessage = (event) => {
          const packet = JSON.parse(event.data);

          console.log(
            `[WS Message] type=${packet.type}, assistantLane=${assistantStreamMessageIdRef.current}, thinkingLane=${thinkingStreamMessageIdRef.current}, content=${packet.content?.substring(0, 50)}`,
          );

          if (packet.type === "ready") {
            console.log(`[WS Ready] is_multimodal: ${packet.is_multimodal}`);
            setStatus("ready");
            setIsMultimodal(packet.is_multimodal || false);
            return;
          }

          if (packet.type === "text") {
            const content = packet.content || "";
            const target = assignStreamChunk("assistant", content);

            console.log(
              `[WS Text] ${target.isNew ? "Creating" : "Updating"} assistant lane, id=${target.messageId}, content="${content.substring(0, 50)}"`,
            );
            setMessages((prev) =>
              upsertStreamMessage(prev, {
                messageId: target.messageId,
                type: "assistant",
                content: target.content,
              }),
            );
            return;
          }

          if (packet.type === "thinking") {
            const content = packet.content || "";
            const target = assignStreamChunk("thinking", content);

            console.log(
              `[WS Thinking] ${target.isNew ? "Creating" : "Updating"} thinking lane, id=${target.messageId}, content="${content.substring(0, 50)}"`,
            );
            setMessages((prev) =>
              upsertStreamMessage(prev, {
                messageId: target.messageId,
                type: "thinking",
                content: target.content,
              }),
            );
            return;
          }

          if (packet.type === "tool_call") {
            closeAllStreamLanes();
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${Date.now()}`,
                type: "tool",
                role: "assistant",
                content: packet.content || "",
                metadata: packet.metadata,
                time: nowLabel(),
              },
            ]);
            return;
          }

          if (packet.type === "file_operation") {
            closeAllStreamLanes();
            setMessages((prev) => [
              ...prev,
              {
                id: `file-${Date.now()}`,
                type: "file",
                role: "assistant",
                content: packet.content || "",
                metadata: packet.metadata,
                time: nowLabel(),
              },
            ]);
            return;
          }

          if (packet.type === "todos") {
            closeAllStreamLanes();
            setMessages((prev) => [
              ...prev,
              {
                id: `todos-${Date.now()}`,
                type: "todos",
                role: "assistant",
                content: packet.content,
                metadata: packet.metadata,
                time: nowLabel(),
              },
            ]);
            return;
          }

          if (packet.type === "tool_result") {
            closeAllStreamLanes();
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-result-${Date.now()}`,
                type: "tool",
                role: "assistant",
                content: packet.content || "",
                metadata: packet.metadata,
                time: nowLabel(),
              },
            ]);
            return;
          }

          if (packet.type === "message_index") {
            console.log(`[WS MessageIndex] Received message_index: ${packet.content}`);
            const parsedIndex = Number(packet.content);
            if (!Number.isNaN(parsedIndex)) {
              setMessages((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i -= 1) {
                  if (next[i].role === "user" && next[i].messageIndex == null) {
                    next[i] = { ...next[i], messageIndex: parsedIndex };
                    break;
                  }
                }
                return next;
              });
            }
            return;
          }

          if (packet.type === "done") {
            console.log(
              `[WS Done] Received 'done' event. Closing lanes assistant=${assistantStreamMessageIdRef.current}, thinking=${thinkingStreamMessageIdRef.current}, current messages count: ${messages.length}, isProcessingQueue: ${isProcessingQueueRef.current}`,
            );
            playCompletionSound(contextKind);
            setLastCompletedAt(Date.now());
            closeAllStreamLanes();
            setStatus("ready");

            isProcessingQueueRef.current = false;

            setQueuedMessages((prev) => {
              if (prev.length === 0) {
                console.log(`[WS Done] Queue is empty, nothing to process`);
                return prev;
              }

              const [nextMsg, ...rest] = prev;

              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                isProcessingQueueRef.current = true;
                closeAllStreamLanes();

                const processAndSend = async () => {
                  try {
                    const processedAttachments = nextMsg.attachments ? await Promise.all(
                      nextMsg.attachments.map(async (att) => {
                        return new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            resolve({
                              type: att.type.startsWith('image/') ? 'image' : 'document',
                              data: reader.result,
                              filename: att.name,
                              mime_type: att.type,
                            });
                          };
                          reader.onerror = () => reject(new Error(`无法读取文件: ${att.name}`));
                          reader.readAsDataURL(att.file);
                        });
                      })
                    ) : [];

                    const userMessage = {
                      id: `user-${Date.now()}`,
                      role: "user",
                      avatar: (nextMsg.authorName || "U").slice(0, 1).toUpperCase(),
                      name: nextMsg.authorName || "User",
                      time: nowLabel(),
                      content: nextMsg.text,
                    };

                    if (processedAttachments.length > 0) {
                      userMessage.attachments = processedAttachments.map(att => ({
                        type: att.type,
                        name: att.filename,
                        url: att.data,
                      }));
                    }

                    setMessages((prevMsgs) => [...prevMsgs, userMessage]);

                    const payload = {
                      message: nextMsg.text,
                      auto_approve: true,
                    };

                    if (processedAttachments.length > 0) {
                      payload.is_multimodal = true;
                      payload.attachments = processedAttachments;
                    }

                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                      setStatus("streaming");
                      socketRef.current.send(JSON.stringify(payload));
                      console.log(`[WS Done] Sent queued message: ${nextMsg.text.substring(0, 50)}`);
                    } else {
                      throw new Error('WebSocket closed during message processing');
                    }
                  } catch (error) {
                    console.error(`[useRuntimeChat] Failed to process/send queued message - ${displayName}`, error);
                    setQueuedMessages((current) => [nextMsg, ...current]);
                    setStatus("ready");
                    isProcessingQueueRef.current = false;
                  }
                };

                processAndSend();
                return rest;
              }

              return prev;
            });
            return;
          }

          if (packet.type === "error") {
            closeAllStreamLanes();
            setStatus("error");
            setMessages((prev) => [
              ...prev,
              {
                id: `runtime-error-${Date.now()}`,
                type: "error",
                role: "assistant",
                avatar: "!",
                name: displayName,
                time: nowLabel(),
                content: packet.content || "Runtime 执行失败。",
              },
            ]);
          }
        };

        socket.onerror = () => {
          closeAllStreamLanes();
          setStatus("error");
          // Clear queue on error since messages can't be sent
          setQueuedMessages([]);
        };

        socket.onclose = (event) => {
          closeAllStreamLanes();
          if (!cancelled) {
            setStatus(disabled ? "disabled" : "idle");
            // Update queued messages to 'waiting' status since socket is closed
            setQueuedMessages((prev) =>
              prev.map((msg) => ({ ...msg, status: 'waiting' }))
            );
            if (event.code !== 1000) {
              setMessages((prev) => [
                ...prev,
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
        closeAllStreamLanes();
        setStatus("error");
        setMessages((prev) => [
          ...prev,
          {
            id: `runtime-init-error-${Date.now()}`,
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
      console.log(`[useRuntimeChat] Cleanup - ${displayName} (${contextKey})`);
      cancelled = true;
      closeAllStreamLanes();
      // 不在这里关闭 socket，让 connect() 函数负责关闭
      // 这样可以确保 onclose 事件能够正常触发
    };
  }, [contextKey, contextKind, disabled, workspaceId, agentId, currentItemId, connectionNonce]);

  async function sendMessage({ text, authorName, attachments = [] }) {
    const message = text.trim();
    if (!message || disabled) {
      return false;
    }

    console.log(
      `[sendMessage] Called with status="${status}", assistantLane="${assistantStreamMessageIdRef.current}", thinkingLane="${thinkingStreamMessageIdRef.current}", isProcessingQueue=${isProcessingQueueRef.current}`,
    );

    // If socket is not ready, queue the message
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.log(`[sendMessage] Socket not ready, queueing message`);
      const queuedMsg = {
        id: `queued-${Date.now()}`,
        text: message,
        authorName,
        attachments,
        status: 'waiting',
        timestamp: Date.now(),
      };
      setQueuedMessages((prev) => [...prev, queuedMsg]);
      return false;
    }

    // If already streaming or processing queue, queue the message
    if (status === "streaming" || hasActiveStreamLanes() || isProcessingQueueRef.current) {
      console.log(
        `[sendMessage] Already busy (status=${status}, assistantLane=${assistantStreamMessageIdRef.current}, thinkingLane=${thinkingStreamMessageIdRef.current}, processing=${isProcessingQueueRef.current}), queueing message`,
      );
      const queuedMsg = {
        id: `queued-${Date.now()}`,
        text: message,
        authorName,
        attachments,
        status: 'queued',
        timestamp: Date.now(),
      };
      setQueuedMessages((prev) => [...prev, queuedMsg]);
      return true;
    }

    console.log(`[sendMessage] Sending message immediately`);

    // Convert attachments to base64
    const processedAttachments = await Promise.all(
      attachments.map(async (att) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              type: att.type.startsWith('image/') ? 'image' : 'document',
              data: reader.result,
              filename: att.name,
              mime_type: att.type,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(att.file);
        });
      })
    );

    closeAllStreamLanes();

    // Add user message with attachments to UI
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      avatar: (authorName || "U").slice(0, 1).toUpperCase(),
      name: authorName || "User",
      time: nowLabel(),
      content: message,
      messageIndex: null,
    };

    // Add attachment info for display
    if (processedAttachments.length > 0) {
      userMessage.attachments = processedAttachments.map(att => ({
        type: att.type,
        name: att.filename,
        url: att.data,
      }));
    }

    setMessages((prev) => [...prev, userMessage]);
    setStatus("streaming");

    // Send to backend with attachments
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
      const history = await runtime.fetchSessionEvents({
        threadId: activeThreadRef.current,
        limit: LOAD_MORE_HISTORY_LIMIT,
        beforeId: oldestMessageId,
      });

      const olderMessages = (history?.events || [])
        .map((event) => ({
          id: `history-${event.id}`,
          type: event.type,
          role: event.type === "user" ? "user" : "assistant",
          avatar:
            event.type === "user"
              ? "U"
              : assistantAvatar(displayName),
          name: event.type === "user" ? "User" : displayName,
          time: event.created_at ? String(event.created_at).slice(11, 16) : "",
          content: event.content || "",
          messageIndex: typeof event.message_index === "number" ? event.message_index : null,
        }));

      setMessages((prev) => [...olderMessages, ...prev]);
      setHasMoreHistory(history?.has_more || false);
      setOldestMessageId(history?.oldest_id || null);
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

    // Show confirmation dialog
    setRollbackConfirm(messageId);
  }

  async function confirmRollback(onDraftChange) {
    const messageId = rollbackConfirm;
    setRollbackConfirm(null);

    if (!messageId) return false;

    // Store original messages for rollback on failure
    const originalMessages = messages;

    // Find the message being rolled back to
    const targetMessageIndex = originalMessages.findIndex((msg) => msg.id === messageId);
    if (targetMessageIndex === -1) {
      throw new Error('消息未找到');
    }

    const targetMessage = originalMessages[targetMessageIndex];

    // If it's a user message, put its content in the draft via callback
    if (targetMessage && targetMessage.role === 'user' && onDraftChange) {
      onDraftChange(targetMessage.content || '');
    }

    setIsRollingBack(true);
    try {
      // messageIndex must be present - we don't allow rollback without it
      const messageIndex = targetMessage?.messageIndex;
      if (typeof messageIndex !== "number") {
        throw new Error('消息索引未就绪，请稍后再试');
      }

      await runtime.rollbackSession({
        threadId: activeThreadRef.current,
        messageIndex: messageIndex,
      });

      // Remove messages from the rollback point onwards (including the target message)
      setMessages((prev) => {
        const index = prev.findIndex((msg) => msg.id === messageId);
        if (index === -1) return prev;
        return prev.slice(0, index);
      });
      closeAllStreamLanes();
      isProcessingQueueRef.current = false;
      setQueuedMessages([]);
      if (socketRef.current) {
        socketRef.current.close(1000, "Rollback refresh");
        socketRef.current = null;
      }
      setStatus("connecting");
      setConnectionNonce((value) => value + 1);

      console.log(`[useRuntimeChat] Rollback successful - ${displayName}`);
      setIsRollingBack(false);
      return true;
    } catch (error) {
      console.error(`[useRuntimeChat] Rollback failed - ${displayName}:`, error.message || error);
      // Revert to original state on failure
      setMessages(originalMessages);
      if (onDraftChange) {
        onDraftChange('');
      }
      setIsRollingBack(false);
      // Show error to user
      throw new Error('回滚失败，请重试。错误：' + (error.message || '未知错误'));
    }
  }

  // Remove a message from the queue
  function removeQueuedMessage(messageId) {
    setQueuedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }

  // Stop streaming
  function stopStreaming() {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn(`[useRuntimeChat] Cannot stop - socket not open - ${displayName}`);
      return;
    }

    try {
      console.log(`[useRuntimeChat] Stopping streaming - ${displayName}`);
      socketRef.current.send(JSON.stringify({ type: 'stop' }));
      setStatus("ready");
      closeAllStreamLanes();
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
      // Close socket first
      if (socketRef.current) {
        socketRef.current.close(1000, "Session deleted");
        socketRef.current = null;
      }

      await runtime.deleteSession({ threadId });
      console.log(`[useRuntimeChat] Session deleted - ${displayName}, threadId: ${threadId}`);

      // Reset state
      setMessages(fallbackMessages);
      setQueuedMessages([]);
      closeAllStreamLanes();
      isProcessingQueueRef.current = false;
      setStatus("idle");

      // Trigger reconnect to create a new session
      setConnectionNonce((value) => value + 1);
      return true;
    } catch (error) {
      console.error(`[useRuntimeChat] Failed to delete session - ${displayName}:`, error);
      // Trigger reconnect anyway
      setConnectionNonce((value) => value + 1);
      return false;
    }
  }

  return useMemo(
    () => ({
      contextKey,
      draft,
      messages,
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
    [contextKey, disabled, draft, messages, status, hasMoreHistory, isLoadingMore, isRollingBack, queuedMessages, rollbackConfirm, isMultimodal, lastCompletedAt],
  );
}
