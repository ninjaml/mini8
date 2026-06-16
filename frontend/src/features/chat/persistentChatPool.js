const ACTIVE_STATUSES = new Set(["streaming", "connecting", "queued"]);

export function normalizeId(value) {
  if (value == null) return null;
  return String(value);
}

export function reconcileOccupiedSlots(occupiedSlots, entities) {
  const validIds = new Set((entities || []).map((entity) => normalizeId(entity?.id)).filter(Boolean));
  return occupiedSlots.map((entityId) => (validIds.has(normalizeId(entityId)) ? entityId : null));
}

export function choosePoolSlot({
  occupiedSlots,
  currentEntityId,
  statusesByEntityId,
  lastTouchedAtByEntityId,
}) {
  const normalizedCurrentId = normalizeId(currentEntityId);
  if (!normalizedCurrentId) {
    return null;
  }

  const existingIndex = occupiedSlots.findIndex((entityId) => normalizeId(entityId) === normalizedCurrentId);
  if (existingIndex !== -1) {
    return { slotIndex: existingIndex, reason: "existing" };
  }

  const emptyIndex = occupiedSlots.findIndex((entityId) => entityId == null);
  if (emptyIndex !== -1) {
    return { slotIndex: emptyIndex, reason: "empty" };
  }

  const inactiveCandidates = occupiedSlots
    .map((entityId, slotIndex) => {
      const normalizedEntityId = normalizeId(entityId);
      const status = statusesByEntityId?.[normalizedEntityId] || "idle";
      if (ACTIVE_STATUSES.has(status)) {
        return null;
      }
      return {
        slotIndex,
        lastTouchedAt: lastTouchedAtByEntityId?.[normalizedEntityId] || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.lastTouchedAt - right.lastTouchedAt || left.slotIndex - right.slotIndex);

  if (inactiveCandidates.length === 0) {
    return null;
  }

  return { slotIndex: inactiveCandidates[0].slotIndex, reason: "inactive-rotation" };
}
