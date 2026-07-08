import { useMemo, useState } from "react";
import { Clock3, MessageSquareText, Sparkles } from "lucide-react";
import { useOfficeLayout } from "./hooks/useOfficeLayout";
import { RoomShell } from "./components/RoomShell";
import { BackWallHeader } from "./components/BackWallHeader";
import { TopWallDecors } from "./components/TopWallDecors";
import { BottomWallDecors } from "./components/BottomWallDecors";
import { KnowledgeArea } from "./components/KnowledgeArea";
import { SanitationArea } from "./components/SanitationArea";
import { TaskBoardArea } from "./components/TaskBoardArea";
import { OfficeGridArea } from "./components/OfficeGridArea";
import { RestArea } from "./components/RestArea";
import { EntranceArea } from "./components/EntranceArea";
import { TokenBarArea } from "./components/TokenBarArea";
import { OfficeListModal } from "./components/OfficeListModal";
import { officePalette } from "./officePalette";

export function OfficeRoom({ workspace, currentUserName, actions, agentStatuses }) {
  const layout = useOfficeLayout(workspace);
  const [listModal, setListModal] = useState({ open: false, type: null });
  const [agentActionMenu, setAgentActionMenu] = useState(null);

  function handleKnowledgeClick() {
    if (layout.knowledge.length === 0) {
      actions?.onCreateKnowledge?.();
      return;
    }
    if (layout.knowledge.length === 1) {
      actions?.onOpenKnowledge?.(layout.knowledge[0].id);
      return;
    }
    setListModal({ open: true, type: "knowledge" });
  }

  function closeListModal() {
    setListModal({ open: false, type: null });
  }

  function closeAgentActionMenu() {
    setAgentActionMenu(null);
  }

  function openAgentActionMenu(payload) {
    if (!payload?.agentId) return;
    setAgentActionMenu({
      agentId: String(payload.agentId),
      x: payload.clientX ?? 0,
      y: payload.clientY ?? 0,
    });
  }

  const modalData = {
    title: "查看知识库详情",
    items: layout.knowledge,
    emptyText: "暂无可选知识库",
    onSelect: (id) => {
      closeListModal();
      actions?.onOpenKnowledge?.(id);
    },
    onCreate: () => {
      closeListModal();
      actions?.onCreateKnowledge?.();
    },
    renderItem: (item) => (
      <span>
        {item.title}
        {item.type && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>({item.type})</span>
        )}
      </span>
    ),
  };

  const selectedAgent = useMemo(
    () => layout.activeAgents.find((agent) => String(agent.id) === String(agentActionMenu?.agentId)) || null,
    [agentActionMenu?.agentId, layout.activeAgents],
  );

  return (
    <>
      <div className="office-room-stage" onClick={closeAgentActionMenu}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1150 805"
          width="100%"
          height="100%"
          className="office-room-svg"
          style={{ fontFamily: "-apple-system, Sans-Serif" }}
        >
          <rect x="0" y="0" width="1150" height="805" fill="#ffffff" />
          <defs>
          <linearGradient id="floorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={officePalette.room.floorTop} />
            <stop offset="100%" stopColor={officePalette.room.floorBottom} />
          </linearGradient>
          <linearGradient id="windowSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
          <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dx="0" dy="6" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.25" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <g id="office-desk-v2">
            <rect x="18" y="68" width="8" height="42" rx="2" fill="#94a3b8" />
            <rect x="134" y="68" width="8" height="42" rx="2" fill="#94a3b8" />
            <path d="M 4,56 L 156,56 L 156,66 Q 156,72 150,72 L 10,72 Q 4,72 4,66 Z" fill="#e2e8f0" />
            <rect x="4" y="20" width="152" height="40" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="62" y="4" width="44" height="30" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
            <rect x="65" y="7" width="38" height="24" rx="2" fill="#334155" />
            <rect x="67" y="9" width="30" height="3" fill="#38bdf8" opacity="0.7" />
            <rect x="67" y="14" width="22" height="2" fill="#94a3b8" opacity="0.6" />
            <rect x="80" y="34" width="10" height="6" rx="1" fill="#cbd5e1" />
            <ellipse cx="85" cy="40" rx="10" ry="2" fill="#e2e8f0" />
            <rect x="52" y="46" width="56" height="10" rx="2" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="56" y1="49" x2="104" y2="49" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 1" />
            <line x1="56" y1="53" x2="100" y2="53" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 1" />
            <rect x="116" y="48" width="7" height="10" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="0.5" />
            <circle cx="28" cy="40" r="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
            <circle cx="28" cy="40" r="4.5" fill="#b45309" />
          </g>

          <g id="office-chair" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5">
            <rect x="56" y="104" width="48" height="44" rx="14" />
            <rect x="60" y="134" width="40" height="12" rx="5" fill="#eef2f7" />
            <rect x="44" y="112" width="6" height="24" rx="3" fill="#e2e8f0" />
            <rect x="110" y="112" width="6" height="24" rx="3" fill="#e2e8f0" />
            <path d="M 80,148 L 66,160 M 80,148 L 94,160 M 80,148 L 80,132 M 80,148 L 64,142 M 80,148 L 96,142" stroke="#b8c3d2" strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx="66" cy="160" r="2.5" fill="#94a3b8" stroke="none" />
            <circle cx="94" cy="160" r="2.5" fill="#94a3b8" stroke="none" />
            <circle cx="80" cy="132" r="2.5" fill="#94a3b8" stroke="none" />
          </g>

          <g id="person-sitting">
            <ellipse cx="0" cy="-6" rx="18" ry="7" fill="#dbe6f0" opacity="0.35" />
            <rect x="-16" y="-41" width="32" height="28" rx="8" fill="#263547" stroke="#55677c" strokeWidth="1.6" />
            <rect x="-11" y="-36" width="22" height="18" rx="5" fill="#0f1d2d" />
            <rect x="-9" y="-32" width="6" height="6" rx="2" fill="#38bdf8" />
            <rect x="3" y="-32" width="6" height="6" rx="2" fill="#38bdf8" />
            <path d="M -5 -21 Q 0 -18 5 -21" fill="none" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M 0,-41 L 0,-47" stroke="#8ea0b5" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="0" cy="-49" r="2.6" fill="#38bdf8" />
            <rect x="-8" y="-11" width="16" height="12" rx="6" fill="#6f8196" />
            <path d="M -8,-4 L -14,0 M 8,-4 L 14,0" fill="none" stroke="#a9b8c8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M -3,1 L -8,10 M 3,1 L 8,10" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M -10,12 L -6,8 M 10,12 L 6,8" fill="none" stroke="#b8c3d2" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          <g id="person-sleeping">
            <circle cx="12" cy="0" r="10" fill="#fca5a5" />
            <path d="M 5,-5 Q 12,-10 20,-5" stroke="#1e293b" strokeWidth="2" fill="none" />
            <ellipse cx="9" cy="-1" rx="1.2" ry="0.8" fill="#1e293b" />
            <ellipse cx="16" cy="-1" rx="1.2" ry="0.8" fill="#1e293b" />
            <path d="M 10,10 L 55,10 Q 60,10 60,16 Q 60,22 55,22 L 15,22 Q 8,22 8,10" fill="#475569" />
            <text x="55" y="-12" fontSize="12" fontWeight="800" fill="#94a3b8">z</text>
            <text x="66" y="-20" fontSize="9" fontWeight="800" fill="#94a3b8">z</text>
          </g>

          <g id="lounge-chair">
            <rect x="4" y="18" width="62" height="36" rx="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="8" y="0" width="54" height="42" rx="10" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="0" y="28" width="8" height="22" rx="3" fill="#cbd5e1" />
            <rect x="62" y="28" width="8" height="22" rx="3" fill="#cbd5e1" />
          </g>
        </defs>

        <RoomShell />

        <TopWallDecors onClick={actions?.onOpenOffice} />
        <BottomWallDecors />

        <BackWallHeader
          name={workspace.name}
          goal={workspace.goal}
          onClick={actions?.onOpenWorkspaceEdit}
        />

        <KnowledgeArea knowledge={layout.knowledge} onClick={handleKnowledgeClick} />

        <SanitationArea sanitationAgent={layout.specialAgents.find((a) => a.iconType === "sanitation")} />

        <TaskBoardArea onClick={actions?.onOpenWorkspaceTaskBoard || actions?.onOpenTasks} />

        {/* 办公区工作岛 */}
        <g className="office-work-island">
          <rect
            x="308"
            y="156"
            width="520"
            height="560"
            rx="72"
            fill="#edf3f8"
            opacity="0.9"
          />
          <rect
            x="322"
            y="170"
            width="492"
            height="532"
            rx="66"
            fill={officePalette.room.coreFill}
            opacity="0.5"
            stroke="#dbe4ec"
            strokeOpacity="0.9"
            strokeWidth="1.2"
          />
          <rect
            x="340"
            y="188"
            width="456"
            height="496"
            rx="56"
            fill={officePalette.room.coreFill}
            opacity={officePalette.room.coreFillOpacity}
            stroke={officePalette.room.coreStroke}
            strokeOpacity={officePalette.room.coreStrokeOpacity}
            strokeWidth="1"
          />
          <path
            d="M 368 226 C 440 208 514 205 580 205 C 645 205 717 208 768 226"
            fill="none"
            stroke="#d7e1ea"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 368 646 C 440 664 514 667 580 667 C 645 667 717 664 768 646"
            fill="none"
            stroke="#d7e1ea"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle cx="580" cy="214" r="62" fill={officePalette.room.coreFill} opacity="0.08" />
          <circle cx="462" cy="396" r="66" fill={officePalette.room.coreFill} opacity="0.05" />
          <circle cx="698" cy="396" r="66" fill={officePalette.room.coreFill} opacity="0.05" />
        </g>

          <OfficeGridArea
            activeAgents={layout.activeAgents}
            actions={{
              ...actions,
              onOpenAgentActionMenu: openAgentActionMenu,
            }}
            agentStatuses={agentStatuses}
            selectedAgentId={actions?.selectedAgentId ?? null}
          />

        <RestArea actions={actions} currentUserName={currentUserName} />

        <EntranceArea />

        <TokenBarArea onClick={actions?.onOpenWorkspaceSettings} />
        </svg>

        {selectedAgent && agentActionMenu ? (
          <div
            className="office-agent-action-menu"
            style={{ left: `${agentActionMenu.x}px`, top: `${agentActionMenu.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="office-agent-action-menu__panel">
              <button
                type="button"
                className="office-agent-action-menu__button"
                onClick={() => {
                  actions?.onOpenTasks?.(selectedAgent.workspace_session_id ?? null);
                  closeAgentActionMenu();
                }}
              >
                <Clock3 size={14} />
                <span>任务</span>
              </button>
              <button
                type="button"
                className="office-agent-action-menu__button"
                onClick={() => {
                  actions?.onOpenChat?.(selectedAgent.id);
                  closeAgentActionMenu();
                }}
              >
                <MessageSquareText size={14} />
                <span>聊天</span>
              </button>
              <button
                type="button"
                className="office-agent-action-menu__button"
                onClick={() => {
                  actions?.onOpenPersona?.(selectedAgent.id);
                  closeAgentActionMenu();
                }}
              >
                <Sparkles size={14} />
                <span>设置</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <OfficeListModal
        open={listModal.open}
        title={modalData.title}
        items={modalData.items}
        emptyText={modalData.emptyText}
        onSelect={modalData.onSelect}
        onCreate={modalData.onCreate}
        onClose={closeListModal}
        renderItem={modalData.renderItem}
      />
    </>
  );
}
