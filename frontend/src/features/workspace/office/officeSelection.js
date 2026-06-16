export function getOfficeSelectionState({ officeFocusTarget }) {
  if (!officeFocusTarget) {
    return { selectedPm: false, selectedAgentId: null };
  }

  if (officeFocusTarget === "pm") {
    return { selectedPm: true, selectedAgentId: null };
  }

  if (String(officeFocusTarget).startsWith("__")) {
    return { selectedPm: false, selectedAgentId: null };
  }

  return { selectedPm: false, selectedAgentId: String(officeFocusTarget) };
}
