function assistantAvatar(name) {
  return (name || "A").slice(0, 1).toUpperCase();
}

function formatTimeLabel(value) {
  if (!value) return "";
  if (typeof value === "string" && value.length >= 16) {
    return value.slice(11, 16);
  }
  return String(value);
}

function isTaskToolEvent(type, metadata = {}) {
  // 只有带 subagent_invocation_id 的 task 事件，才应该进入子 agent 卡片分流；
  // 其他普通工具仍然留在主聊天主线里。
  return Boolean(
    metadata?.subagent_invocation_id
      && metadata?.tool_name === "task"
      && (type === "tool_call" || type === "tool_result" || type === "tool"),
  );
}

function isTaskOpenerPacket(packet) {
  return packet?.type === "tool_call" && isTaskToolEvent(packet.type, packet.metadata);
}

function isTaskCloserPacket(packet) {
  return packet?.type === "tool_result" && isTaskToolEvent(packet.type, packet.metadata);
}

function isTaskOpenerEvent(event) {
  return event?.type === "tool" && isTaskToolEvent(event.type, event.metadata);
}

function isTaskCloserEvent(event) {
  return event?.type === "tool_result" && isTaskToolEvent(event.type, event.metadata);
}

function normalizeToolCallContent(rawContent, metadata = {}) {
  // tool_call 在聊天区里统一补上工具名前缀，避免历史/实时的显示口径不一致。
  const toolName = metadata?.tool_name;
  const args = metadata?.args;
  if (toolName && args && typeof args === "object") {
    return `🔧 ${toolName}: ${toolName}(${JSON.stringify(args)})`;
  }
  if (toolName && rawContent && rawContent.startsWith(`${toolName}(`)) {
    return `🔧 ${toolName}: ${rawContent}`;
  }
  return rawContent || "";
}

function normalizeMessageType(rawType, metadata = {}) {
  if (rawType === "text" || rawType === "assistant") return "assistant";
  if (rawType === "thinking") return "thinking";
  if (rawType === "file" || rawType === "file_operation") return "file";
  if (rawType === "tool_call" || rawType === "tool_result" || rawType === "tool") {
    if (metadata?.tool_name === "write_todos" && metadata?.todos) {
      return "todos";
    }
    return "tool";
  }
  if (rawType === "todos") return "todos";
  if (rawType === "user") return "user";
  if (rawType === "system") return "system";
  if (rawType === "error") return "error";
  return rawType || "assistant";
}

function buildMessage({
  id,
  rawType,
  content,
  metadata = {},
  attachments = [],
  createdAt = "",
  messageIndex = null,
  displayName = "Agent",
  threadId = null,
  groupId = null,
  agentNameOverride = null,
  streaming = false,
}) {
  const type = normalizeMessageType(rawType, metadata);
  const normalizedContent = rawType === "tool_call"
    ? normalizeToolCallContent(content, metadata)
    : content || "";

  const base = {
    id,
    type,
    role: type === "user" ? "user" : type === "system" ? "system" : "assistant",
    content: normalizedContent,
    metadata,
    attachments,
    time: formatTimeLabel(createdAt),
    messageIndex,
    threadId,
    groupId,
    streaming,
  };

  if (type === "user") {
    return {
      ...base,
      avatar: "U",
      name: "User",
    };
  }

  if (type === "error") {
    return {
      ...base,
      avatar: "!",
      name: agentNameOverride || displayName,
    };
  }

  if (type === "assistant") {
    return {
      ...base,
      avatar: assistantAvatar(agentNameOverride || displayName),
      name: agentNameOverride || displayName,
      agentName: agentNameOverride || displayName,
    };
  }

  return base;
}

function cloneState(state) {
  return {
    ...state,
    items: [...state.items],
    rootStreams: { ...state.rootStreams },
    cardStreams: { ...state.cardStreams },
  };
}

function nextSequence(state) {
  const value = state.sequence + 1;
  state.sequence = value;
  return value;
}

function findCardIndex(items, invocationId) {
  return items.findIndex(
    (item) => item.type === "subagent_execution_card" && item.subagentInvocationId === invocationId,
  );
}

function updateMessageStreaming(messages, messageId, streaming) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return messages;
  const next = [...messages];
  next[index] = { ...next[index], streaming };
  return next;
}

function updateRootMessage(items, messageId, updater) {
  const index = items.findIndex((item) => item.id === messageId);
  if (index === -1) return items;
  const next = [...items];
  next[index] = updater(next[index]);
  return next;
}

function updateCard(items, invocationId, updater) {
  const index = findCardIndex(items, invocationId);
  if (index === -1) return items;
  const next = [...items];
  next[index] = updater(next[index]);
  return next;
}

function closeStreamLane(state, containerKey, kind) {
  // 每条流式 lane 结束时都要把 streaming 标记收口；
  // root 和子卡片内部共用这套状态机。
  const streamStore = containerKey === "root"
    ? state.rootStreams
    : state.cardStreams[containerKey];
  if (!streamStore) return state;

  const messageIdKey = `${kind}MessageId`;
  const messageId = streamStore[messageIdKey];
  if (!messageId) return state;

  const next = cloneState(state);
  if (containerKey === "root") {
    next.items = updateRootMessage(next.items, messageId, (message) => ({ ...message, streaming: false }));
    next.rootStreams[messageIdKey] = null;
  } else {
    next.items = updateCard(next.items, containerKey, (card) => ({
      ...card,
      messages: updateMessageStreaming(card.messages, messageId, false),
    }));
    next.cardStreams[containerKey] = {
      ...(next.cardStreams[containerKey] || {}),
      [messageIdKey]: null,
    };
  }
  return next;
}

function closeContainerStreams(state, containerKey) {
  let next = closeStreamLane(state, containerKey, "assistant");
  next = closeStreamLane(next, containerKey, "thinking");
  return next;
}

export function finalizeProjectionStreams(state, { unfinishedCards = true } = {}) {
  // 连接中断、手动停止、done 收口时，都统一走这里把流式消息封口；
  // 仍处于 running 的子卡片会被标记成 unfinished，方便历史和实时表现一致。
  let next = cloneState(state);

  next = closeContainerStreams(next, "root");
  Object.keys(next.cardStreams).forEach((invocationId) => {
    next = closeContainerStreams(next, invocationId);
  });

  if (unfinishedCards) {
    next.items = next.items.map((item) => {
      if (item.type !== "subagent_execution_card" || item.status !== "running") {
        return item;
      }
      return {
        ...item,
        status: "unfinished",
      };
    });
  }

  return next;
}

function ensureCard(state, {
  invocationId,
  subagentType,
  description,
  namespaceKey,
  status = "running",
  preview = "",
  createdAt = "",
  threadId = null,
  groupId = null,
  firstEventId = null,
  lastEventId = null,
  recovered = false,
  incompleteSource = null,
}) {
  // opener / closer / 中途流式文本都可能先后乱序到达；
  // 因此卡片必须是“幂等 upsert”，而不是假设 opener 一定先来。
  const existingIndex = findCardIndex(state.items, invocationId);
  if (existingIndex !== -1) {
    const next = cloneState(state);
    next.items[existingIndex] = {
      ...next.items[existingIndex],
      subagentType: subagentType || next.items[existingIndex].subagentType,
      description: description ?? next.items[existingIndex].description,
      namespaceKey: namespaceKey || next.items[existingIndex].namespaceKey,
      status: next.items[existingIndex].status === "success" || next.items[existingIndex].status === "error"
        ? next.items[existingIndex].status
        : status,
      preview: preview || next.items[existingIndex].preview,
      time: next.items[existingIndex].time || formatTimeLabel(createdAt),
      startedAt: next.items[existingIndex].startedAt || createdAt || null,
      firstEventId: next.items[existingIndex].firstEventId ?? firstEventId,
      lastEventId: lastEventId ?? next.items[existingIndex].lastEventId,
      recovered: next.items[existingIndex].recovered || recovered,
      incompleteSource: incompleteSource ?? next.items[existingIndex].incompleteSource,
      threadId: threadId || next.items[existingIndex].threadId,
      groupId: groupId || next.items[existingIndex].groupId,
    };
    next.cardStreams[invocationId] = next.cardStreams[invocationId] || {
      assistantMessageId: null,
      thinkingMessageId: null,
    };
    return next;
  }

  const next = cloneState(state);
  next.items.push({
    id: `subagent-card-${invocationId}`,
    type: "subagent_execution_card",
    subagentInvocationId: invocationId,
    subagentType: subagentType || "SubAgent",
    description: description || "",
    status,
    preview,
    time: formatTimeLabel(createdAt),
    startedAt: createdAt || null,
    finishedAt: null,
    firstEventId,
    lastEventId,
    namespaceKey: namespaceKey || null,
    recovered,
    incompleteSource: incompleteSource ?? recovered,
    threadId,
    groupId,
    messages: [],
  });
  next.cardStreams[invocationId] = {
    assistantMessageId: null,
    thinkingMessageId: null,
  };
  return next;
}

function appendRootMessage(state, message) {
  const next = cloneState(state);
  next.items.push(message);
  return next;
}

function upsertCardMessage(state, invocationId, message) {
  const next = cloneState(state);
  next.items = updateCard(next.items, invocationId, (card) => {
    const existingIndex = card.messages.findIndex((item) => item.id === message.id);
    if (existingIndex === -1) {
      return {
        ...card,
        messages: [...card.messages, message],
      };
    }
    const nextMessages = [...card.messages];
    nextMessages[existingIndex] = { ...nextMessages[existingIndex], ...message };
    return {
      ...card,
      messages: nextMessages,
    };
  });
  return next;
}

function upsertStreamMessage(state, {
  containerKey,
  kind,
  chunk,
  displayName,
  createdAt,
  metadata = {},
  threadId = null,
  groupId = null,
  agentNameOverride = null,
}) {
  // thinking 和 assistant 都按“同一容器内单 lane 续写”的方式处理，
  // 这样流式 chunk 不会在 UI 里裂成很多碎消息。
  let next = closeStreamLane(state, containerKey, kind === "assistant" ? "thinking" : "assistant");
  const messageIdKey = `${kind}MessageId`;
  const streamStore = containerKey === "root"
    ? next.rootStreams
    : (next.cardStreams[containerKey] || { assistantMessageId: null, thinkingMessageId: null });
  const activeMessageId = streamStore[messageIdKey];

  if (activeMessageId) {
    if (containerKey === "root") {
      next.items = updateRootMessage(next.items, activeMessageId, (message) => ({
        ...message,
        content: `${message.content || ""}${chunk}`,
        streaming: true,
      }));
    } else {
      next.items = updateCard(next.items, containerKey, (card) => ({
        ...card,
        messages: card.messages.map((message) => (
          message.id === activeMessageId
            ? { ...message, content: `${message.content || ""}${chunk}`, streaming: true }
            : message
        )),
      }));
    }
    return next;
  }

  const sequence = nextSequence(next);
  const messageId = containerKey === "root"
    ? `root-${kind}-stream-${sequence}`
    : `${containerKey}-${kind}-stream-${sequence}`;
  const message = buildMessage({
    id: messageId,
    rawType: kind,
    content: chunk,
    metadata,
    createdAt,
    displayName,
    threadId,
    groupId,
    agentNameOverride,
    streaming: true,
  });

  if (containerKey === "root") {
    next.items.push(message);
    next.rootStreams[messageIdKey] = messageId;
  } else {
    next.items = updateCard(next.items, containerKey, (card) => ({
      ...card,
      messages: [...card.messages, message],
    }));
    next.cardStreams[containerKey] = {
      ...(next.cardStreams[containerKey] || { assistantMessageId: null, thinkingMessageId: null }),
      [messageIdKey]: messageId,
    };
  }
  return next;
}

function mapReplayEventToMessage(event, { displayName, threadId, groupId, agentNameOverride = null }) {
  return buildMessage({
    id: `history-${event.id}`,
    rawType: event.type,
    content: event.content,
    metadata: event.metadata,
    attachments: event.attachments || [],
    createdAt: event.created_at,
    messageIndex: typeof event.message_index === "number" ? event.message_index : null,
    displayName,
    threadId,
    groupId,
    agentNameOverride,
  });
}

function mapRealtimePacketToMessage(packet, {
  displayName,
  createdAt,
  threadId,
  groupId,
  agentNameOverride = null,
  forceId = null,
}) {
  const sequenceSuffix = forceId || `${packet.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return buildMessage({
    id: sequenceSuffix,
    rawType: packet.type,
    content: packet.content,
    metadata: packet.metadata,
    createdAt,
    displayName,
    threadId,
    groupId,
    agentNameOverride,
  });
}

function cardStatusFromMetadata(metadata = {}) {
  return metadata?.status === "error" ? "error" : "success";
}

export function createProjectionState(initialItems = []) {
  return {
    items: initialItems,
    sequence: 0,
    rootStreams: {
      assistantMessageId: null,
      thinkingMessageId: null,
    },
    cardStreams: {},
  };
}

export function reduceRealtimePacket(state, packet, {
  displayName,
  createdAt,
  threadId,
}) {
  const metadata = packet?.metadata || {};
  const invocationId = metadata?.subagent_invocation_id || null;
  const groupId = metadata?.group_id || null;

  if (isTaskOpenerPacket(packet)) {
    // task opener 本身也保留在卡片内，方便用户看到“这次到底派了什么任务”。
    let next = ensureCard(state, {
      invocationId,
      subagentType: metadata.subagent_type,
      description: metadata.description,
      namespaceKey: metadata.namespace_key,
      status: "running",
      createdAt,
      threadId,
      groupId,
      recovered: false,
      // 只要 opener 到了，这张卡片就不该再显示“恢复态”提示。
      incompleteSource: false,
    });
    next = closeContainerStreams(next, invocationId);
    next = upsertCardMessage(
      next,
      invocationId,
      mapRealtimePacketToMessage(packet, {
        displayName,
        createdAt,
        threadId,
        groupId,
        agentNameOverride: metadata.subagent_type || displayName,
        forceId: `card-${invocationId}-opener`,
      }),
    );
    return next;
  }

  if (invocationId) {
    // 只要事件已经带了 invocation_id，就无论它是文本、thinking 还是 tool_result，
    // 都应进入对应子卡片，而不是落回 root 主线。
    const hasExistingCard = findCardIndex(state.items, invocationId) !== -1;
    let next = ensureCard(state, {
      invocationId,
      subagentType: metadata.subagent_type,
      description: metadata.description,
      namespaceKey: metadata.namespace_key,
      status: packet.type === "tool_result" ? cardStatusFromMetadata(metadata) : "running",
      createdAt,
      threadId,
      groupId,
      // 只有缺少 opener、不得不靠中途事件补建卡片时，才算恢复态来源。
      recovered: !hasExistingCard,
      incompleteSource: !hasExistingCard,
    });

    if (packet.type === "text" || packet.type === "thinking") {
      return upsertStreamMessage(next, {
        containerKey: invocationId,
        kind: packet.type === "text" ? "assistant" : "thinking",
        chunk: packet.content || "",
        displayName,
        createdAt,
        metadata,
        threadId,
        groupId,
        agentNameOverride: metadata.subagent_type || displayName,
      });
    }

    next = closeContainerStreams(next, invocationId);
    const messageId = isTaskCloserPacket(packet)
      ? `card-${invocationId}-closer`
      : `${invocationId}-${packet.type}-${metadata.tool_call_id || nextSequence(next)}`;
    next = upsertCardMessage(
      next,
      invocationId,
      mapRealtimePacketToMessage(packet, {
        displayName,
        createdAt,
        threadId,
        groupId,
        agentNameOverride: metadata.subagent_type || displayName,
        forceId: messageId,
      }),
    );
    next.items = updateCard(next.items, invocationId, (card) => ({
      ...card,
      status: isTaskCloserPacket(packet) ? cardStatusFromMetadata(metadata) : card.status,
      preview: isTaskCloserPacket(packet) ? (packet.content || card.preview) : card.preview,
      finishedAt: isTaskCloserPacket(packet) ? createdAt : card.finishedAt,
      time: card.time || formatTimeLabel(createdAt),
      threadId: threadId || card.threadId,
      groupId: groupId || card.groupId,
    }));
    return next;
  }

  if (packet.type === "text" || packet.type === "thinking") {
    return upsertStreamMessage(state, {
      containerKey: "root",
      kind: packet.type === "text" ? "assistant" : "thinking",
      chunk: packet.content || "",
      displayName,
      createdAt,
      metadata,
      threadId,
      groupId,
      agentNameOverride: displayName,
    });
  }

  let next = closeContainerStreams(state, "root");
  next = appendRootMessage(
    next,
    mapRealtimePacketToMessage(packet, {
      displayName,
      createdAt,
      threadId,
      groupId,
      forceId: `root-${packet.type}-${metadata.tool_call_id || nextSequence(next)}`,
    }),
  );
  return next;
}

function buildInvocationCard(invocation, { displayName, threadId, groupId }) {
  // 历史 hydrate 直接把后端返回的 invocation 摘要还原成同构卡片，
  // 这样刷新页面后和实时聊天看到的是同一种 UI 结构。
  const agentName = invocation.subagent_type || displayName;
  return {
    id: `subagent-card-${invocation.subagent_invocation_id}`,
    type: "subagent_execution_card",
    subagentInvocationId: invocation.subagent_invocation_id,
    subagentType: invocation.subagent_type || "SubAgent",
    description: invocation.description || "",
    status: invocation.status || "unfinished",
    preview: invocation.preview || "",
    time: formatTimeLabel(invocation.started_at),
    startedAt: invocation.started_at || null,
    finishedAt: invocation.finished_at || null,
    firstEventId: invocation.first_event_id ?? null,
    lastEventId: invocation.last_event_id ?? null,
    namespaceKey: invocation.namespace_key || null,
    recovered: false,
    incompleteSource: invocation.status === "unfinished",
    threadId,
    groupId,
    messages: (invocation.events || []).map((event) => mapReplayEventToMessage(event, {
      displayName,
      threadId,
      groupId,
      agentNameOverride: agentName,
    })),
  };
}

function groupAnchor(group) {
  const rootIds = (group.root_events || []).map((event) => event.id);
  const invocationIds = (group.invocations || [])
    .map((invocation) => invocation.first_event_id)
    .filter((value) => typeof value === "number");
  const ids = [...rootIds, ...invocationIds];
  if (!ids.length) return Number.MAX_SAFE_INTEGER;
  return Math.min(...ids);
}

export function projectReplayGroupToItems(group, { displayName, threadId }) {
  const groupId = group.group_id;
  const topLevel = [];

  for (const event of group.root_events || []) {
    topLevel.push({
      anchorId: event.id,
      item: mapReplayEventToMessage(event, {
        displayName,
        threadId,
        groupId,
      }),
    });
  }

  for (const invocation of group.invocations || []) {
    topLevel.push({
      anchorId: invocation.first_event_id ?? Number.MAX_SAFE_INTEGER,
      item: buildInvocationCard(invocation, {
        displayName,
        threadId,
        groupId,
      }),
    });
  }

  topLevel.sort((a, b) => a.anchorId - b.anchorId);
  return topLevel.map((entry) => entry.item);
}

export function projectReplayGroupsToProjectionState(groups, {
  displayName,
  threadId,
  fallbackItems = [],
}) {
  // 主聊天区历史统一走 grouped replay 投影；
  // 就算某次 run 没有 subagent，也仍然会产出一条纯 root 主线。
  if (!Array.isArray(groups) || groups.length === 0) {
    return createProjectionState(fallbackItems);
  }

  const orderedGroups = [...groups].sort((a, b) => groupAnchor(a) - groupAnchor(b));
  const items = orderedGroups.flatMap((group) => projectReplayGroupToItems(group, { displayName, threadId }));
  return createProjectionState(items.length ? items : fallbackItems);
}

export function annotateLastUserMessageIndex(items, messageIndex) {
  const next = [...items];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const item = next[i];
    if (item?.role === "user" && item?.messageIndex == null) {
      next[i] = { ...item, messageIndex };
      break;
    }
  }
  return next;
}
