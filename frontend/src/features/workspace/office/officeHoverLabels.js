const OFFICE_HOVER_LABELS = {
  knowledge: "知识库",
  taskBoard: "任务清单",
  tokenBar: "Token Bar",
};

export function getOfficeHoverLabel(area) {
  return OFFICE_HOVER_LABELS[area] ?? "";
}
