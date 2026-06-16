import test from "node:test";
import assert from "node:assert/strict";

async function loadOfficeSelection() {
  try {
    return await import("./officeSelection.js");
  } catch {
    assert.fail("office selection module is missing");
  }
}

test("office selection is empty before any desk is chosen", async () => {
  const { getOfficeSelectionState } = await loadOfficeSelection();

  assert.deepEqual(
    getOfficeSelectionState({ officeFocusTarget: null }),
    { selectedPm: false, selectedAgentId: null },
  );
});

test("office selection highlights the PM desk when PM was the chosen focus", async () => {
  const { getOfficeSelectionState } = await loadOfficeSelection();

  assert.deepEqual(
    getOfficeSelectionState({ officeFocusTarget: "pm" }),
    { selectedPm: true, selectedAgentId: null },
  );
});

test("office selection highlights the chosen agent desk only for local agents", async () => {
  const { getOfficeSelectionState } = await loadOfficeSelection();

  assert.deepEqual(
    getOfficeSelectionState({ officeFocusTarget: "agent-7" }),
    { selectedPm: false, selectedAgentId: "agent-7" },
  );

  assert.deepEqual(
    getOfficeSelectionState({ officeFocusTarget: "__hermes__" }),
    { selectedPm: false, selectedAgentId: null },
  );
});
