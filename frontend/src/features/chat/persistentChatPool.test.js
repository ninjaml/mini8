import test from "node:test";
import assert from "node:assert/strict";

import {
  choosePoolSlot,
  reconcileOccupiedSlots,
} from "./persistentChatPool.js";

test("choosePoolSlot returns existing slot for current entity", () => {
  const result = choosePoolSlot({
    occupiedSlots: ["a", "b", "c", null, null],
    currentEntityId: "b",
    statusesByEntityId: {},
    lastTouchedAtByEntityId: {},
  });

  assert.deepEqual(result, { slotIndex: 1, reason: "existing" });
});

test("choosePoolSlot prefers an empty slot", () => {
  const result = choosePoolSlot({
    occupiedSlots: ["a", "b", null, "c", null],
    currentEntityId: "d",
    statusesByEntityId: {},
    lastTouchedAtByEntityId: {},
  });

  assert.deepEqual(result, { slotIndex: 2, reason: "empty" });
});

test("choosePoolSlot evicts the least recently touched inactive slot", () => {
  const result = choosePoolSlot({
    occupiedSlots: ["a", "b", "c", "d", "e"],
    currentEntityId: "f",
    statusesByEntityId: {
      a: "ready",
      b: "streaming",
      c: "idle",
      d: "connecting",
      e: "error",
    },
    lastTouchedAtByEntityId: {
      a: 200,
      b: 100,
      c: 50,
      d: 10,
      e: 300,
    },
  });

  assert.deepEqual(result, { slotIndex: 2, reason: "inactive-rotation" });
});

test("choosePoolSlot does not evict when all slots are active", () => {
  const result = choosePoolSlot({
    occupiedSlots: ["a", "b", "c", "d", "e"],
    currentEntityId: "f",
    statusesByEntityId: {
      a: "streaming",
      b: "connecting",
      c: "queued",
      d: "streaming",
      e: "connecting",
    },
    lastTouchedAtByEntityId: {
      a: 200,
      b: 100,
      c: 50,
      d: 10,
      e: 300,
    },
  });

  assert.equal(result, null);
});

test("reconcileOccupiedSlots clears entities that no longer exist", () => {
  const result = reconcileOccupiedSlots(["a", "b", "c", null, "d"], [
    { id: "a" },
    { id: "c" },
  ]);

  assert.deepEqual(result, ["a", null, "c", null, null]);
});
