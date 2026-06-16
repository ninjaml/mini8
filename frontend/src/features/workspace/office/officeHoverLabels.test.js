import test from "node:test";
import assert from "node:assert/strict";

async function loadOfficeHoverLabels() {
  try {
    return await import("./officeHoverLabels.js");
  } catch {
    assert.fail("office hover label module is missing");
  }
}

test("office hover labels define stable text for knowledge and task areas", async () => {
  const { getOfficeHoverLabel } = await loadOfficeHoverLabels();

  assert.equal(getOfficeHoverLabel("knowledge"), "知识库");
  assert.equal(getOfficeHoverLabel("taskBoard"), "任务中心");
  assert.equal(getOfficeHoverLabel("tokenBar"), "Token Bar");
  assert.equal(getOfficeHoverLabel("unknown"), "");
});
