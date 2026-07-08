export const EXTERNAL_OPENCLAW = "__openclaw__";
export const EXTERNAL_HERMES = "__hermes__";

export function buildSpaceBuddyEntries({ workspace, externalAgents }) {
  const entries = [];

  for (const agent of workspace?.agents || []) {
    entries.push({
      type: "agent",
      id: String(agent.id),
      label: agent.name,
    });
  }

  if (externalAgents?.openclaw?.configured) {
    entries.push({
      type: "external",
      id: EXTERNAL_OPENCLAW,
      label: "OpenClaw",
      connected: !!externalAgents.openclaw.connected,
    });
  }

  if (externalAgents?.hermes?.configured) {
    entries.push({
      type: "external",
      id: EXTERNAL_HERMES,
      label: "Hermes",
      connected: !!externalAgents.hermes.connected,
    });
  }

  return entries;
}
