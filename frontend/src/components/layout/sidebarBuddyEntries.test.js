import test from "node:test";
import assert from "node:assert/strict";

import { buildSpaceBuddyEntries } from "./sidebarBuddyEntries.js";

test("buildSpaceBuddyEntries orders PM, local agents, then configured external agents", () => {
  const entries = buildSpaceBuddyEntries({
    workspace: {
      id: "ws-1",
      superAgentName: "项目经理",
      agents: [
        { id: "a1", name: "Agent A", tasks: ["1", "2"] },
        { id: "a2", name: "Agent B", tasks: [] },
      ],
    },
    externalAgents: {
      openclaw: { configured: true, connected: false },
      hermes: { configured: true, connected: true },
    },
  });

  assert.deepEqual(
    entries.map((entry) => ({
      type: entry.type,
      id: entry.id,
      label: entry.label,
      taskCount: entry.taskCount,
      connected: entry.connected,
    })),
    [
      { type: "pm", id: null, label: "项目经理", taskCount: undefined, connected: undefined },
      { type: "agent", id: "a1", label: "Agent A", taskCount: 2, connected: undefined },
      { type: "agent", id: "a2", label: "Agent B", taskCount: 0, connected: undefined },
      { type: "external", id: "__openclaw__", label: "OpenClaw", taskCount: undefined, connected: false },
      { type: "external", id: "__hermes__", label: "Hermes", taskCount: undefined, connected: true },
    ],
  );
});

test("buildSpaceBuddyEntries excludes unconfigured external agents", () => {
  const entries = buildSpaceBuddyEntries({
    workspace: {
      id: "ws-1",
      superAgentName: "",
      agents: [],
    },
    externalAgents: {
      openclaw: { configured: false, connected: true },
      hermes: { configured: false, connected: true },
    },
  });

  assert.deepEqual(entries.map((entry) => entry.id), [null]);
  assert.equal(entries[0].label, "项目经理");
});
