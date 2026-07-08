export function getOfficeSelectionState({ officeFocusTarget }) {
  if (!officeFocusTarget) {
    return { selectedWorkspace: false, selectedAgentId: null };
  }

  if (String(officeFocusTarget).startsWith("__")) {
    return { selectedWorkspace: false, selectedAgentId: null };
  }

  return { selectedWorkspace: false, selectedAgentId: String(officeFocusTarget) };
}
