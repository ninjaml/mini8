import { officePalette } from "../officePalette";

const STATUS_SIZE = 24;
const NAME_FONT_SIZE = 12;

function estimateTextWidth(text, fontSize = NAME_FONT_SIZE) {
  if (!text) return 0;
  let width = 0;
  for (const char of String(text)) {
    width += char.charCodeAt(0) > 127 ? fontSize * 1.0 : fontSize * 0.58;
  }
  return width;
}

function NameLabel({ name }) {
  const text = name || "";
  const textWidth = estimateTextWidth(text, NAME_FONT_SIZE);
  const paddingLeft = 20;
  const paddingRight = 12;
  const rectWidth = Math.max(52, textWidth + paddingLeft + paddingRight);
  const rectX = 80 - rectWidth / 2;
  return (
    <g className="agent-name-label">
      <rect x={rectX} y="168" width={rectWidth} height="18" rx="4" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx={rectX + 10} cy="177" r="2.5" fill="#38bdf8" />
      <text x={rectX + paddingLeft + 2} y="181" fontSize={NAME_FONT_SIZE} fontWeight="bold" fill="#0f172a" textAnchor="start">
        {text}
      </text>
    </g>
  );
}

const STATUS_CONFIG = {
  streaming: { type: "gear", color: "#38bdf8", label: "处理中" },
  queued: { type: "gear", color: "#f97316", label: "排队中" },
  ready: { type: "sprout", color: "#22c55e", label: "就绪" },
  idle: { type: "moon", color: "#94a3b8", label: "空闲" },
};

const MESSAGE_CONFIG = { type: "chat", color: "#22c55e", label: "新消息" };

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.idle;
}

function StatusIcon({ config, x, y }) {
  const half = STATUS_SIZE / 2;
  const tx = x - half;
  const ty = y - half;
  const color = config.color;

  const isSpin = config.type === "gear";
  const isBounce = config.type === "chat";
  const isBreathe = config.type === "sprout" || config.type === "moon";

  let animationClass = "";
  if (isSpin) animationClass = "office-status-spin";
  else if (isBounce) animationClass = "office-status-bounce";
  else if (isBreathe) animationClass = "office-status-breathe";

  const paths = {
    gear: (
      <>
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="2" />
      </>
    ),
    sprout: (
      <>
        <path
          d="M12 22V11"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M12 11C8 6 3 7 2 11c4 2 8 1 10 0z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 11c4-5 9-4 10 0-4 2-8 1-10 0z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    chat: (
      <>
        <path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    moon: (
      <>
        <path
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  };

  const shape = paths[config.type];
  if (!shape) return null;

  return (
    <>
      {/* soft glow pulse for active states */}
      {isSpin && (
        <circle cx={x} cy={y} r="12" fill={color} opacity="0.16">
          <animate
            attributeName="r"
            values="10;17;10"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.22;0.06;0.22"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      <g
        transform={`translate(${tx}, ${ty})`}
        className={animationClass || undefined}
      >
        {shape}
      </g>
    </>
  );
}

function DeskShadowLayer({ selected = false }) {
  const floorOpacity = selected ? officePalette.deskShadow.floorOpacity : "0.045";
  const floorBlur = selected ? officePalette.deskShadow.floorBlur : "8";
  const depthOpacity = selected ? officePalette.deskShadow.deskDepthOpacity : "0.14";
  return (
    <>
      <ellipse
        cx="82"
        cy="150"
        rx="72"
        ry="20"
        fill={officePalette.deskShadow.floor}
        opacity={floorOpacity}
        style={{ filter: `blur(${floorBlur}px)` }}
      />
      <ellipse
        cx="82"
        cy="70"
        rx="66"
        ry="10"
        fill={officePalette.deskShadow.deskDepth}
        opacity={depthOpacity}
      />
    </>
  );
}

function PmDeskAccent({ selected = false }) {
  return (
    <g className="pm-desk-accent" opacity={selected ? "1" : "0.88"}>
      <ellipse
        cx="82"
        cy="154"
        rx="88"
        ry="26"
        fill="#cfdbe7"
        opacity={selected ? "0.28" : "0.16"}
        style={{ filter: `blur(${selected ? 14 : 10}px)` }}
      />
      <rect x="10" y="8" width="144" height="116" rx="20" fill="#f8fbfd" opacity="0.9" />
      <rect x="22" y="18" width="120" height="10" rx="5" fill="#d8e4ef" opacity="0.75" />
      <rect x="55" y="30" width="54" height="16" rx="8" fill="#1f3a33" opacity="0.96" />
      <text x="82" y="41" fontSize="10" fontWeight="700" fill="#ecfdf5" textAnchor="middle">
        项目经理
      </text>
      <path d="M 30,104 Q 82,86 134,104" fill="none" stroke="#dbe4ec" strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

export function OfficeGridArea({ pm, activeAgents = [], actions, agentStatuses, selectedAgentId = null, selectedPm = false }) {
  const deskPositions = [
    { x: 15, y: 160 },
    { x: 187, y: 160 },
    { x: 359, y: 160 },
    { x: 15, y: 320 },
    { x: 187, y: 320 },
    { x: 359, y: 320 },
  ];

  function getAgentStatus(agent) {
    if (!agent?.id) return null;
    const id = String(agent.id);
    const status = agentStatuses?.workAgentStatuses?.[id];
    const completion = agentStatuses?.workAgentCompletions?.[id] || 0;
    const seen = agentStatuses?.workAgentSeenCompletions?.[id] || 0;
    return { status, completion, seen };
  }

  function renderStatusEffects(agentState) {
    const status = agentState?.status;
    const completion = agentState?.completion || 0;
    const seen = agentState?.seen || 0;
    const hasNewMessage = completion > 0 && completion > seen;

    if (hasNewMessage) {
      return <StatusIcon config={MESSAGE_CONFIG} x={148} y={30} />;
    }

    const config = getStatusConfig(status);
    return <StatusIcon config={config} x={24} y={38} />;
  }

  function renderPmStatusEffects() {
    const status = agentStatuses?.pm?.status;
    const completion = agentStatuses?.pm?.lastCompletedAt || 0;
    const seen = agentStatuses?.pm?.lastSeenAt || 0;
    const hasNewMessage = completion > 0 && completion > seen;

    if (hasNewMessage) {
      return <StatusIcon config={MESSAGE_CONFIG} x={42} y={32} />;
    }

    const config = getStatusConfig(status);
    return <StatusIcon config={config} x={132} y={32} />;
  }

  return (
    <g transform="translate(320, 185)">
      <style>{`
        .agent-name-label rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label rect {
          fill: #1e293b;
          stroke: #1e293b;
        }
        .agent-name-label text {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label text {
          fill: #f8fafc;
        }
        .agent-name-label circle {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label circle {
          fill: #86efac;
        }
        .office-pm-desk .pm-desk-accent rect,
        .office-pm-desk .pm-desk-accent path,
        .office-pm-desk .pm-desk-accent ellipse {
          transition: opacity 0.2s ease, fill 0.2s ease, stroke 0.2s ease;
        }
        .office-pm-desk:hover .pm-desk-accent rect:first-of-type {
          fill: #ffffff;
        }
      `}</style>

      {/* PM 工位 */}
      <g
        transform="translate(180, -4) scale(0.84)"
        className="office-interactive office-hover-anchor office-pm-desk"
        onClick={() => actions?.onOpenPM?.()}
      >
        <PmDeskAccent selected={selectedPm} />
        <DeskShadowLayer selected={selectedPm} />
        <use href="#office-desk-v2" />
        <path d="M 120,24 L 60,65 L 140,65 Z" fill="#fef08a" opacity="0.15" />
        <path d="M 125,24 L 115,10 Q 120,0 130,12 L 126,24 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
        <ellipse cx="125" cy="24" rx="6" ry="2" fill="#facc15" />
        <rect x="124" y="50" width="18" height="6" rx="3" fill="#0f172a" opacity="0.12" />
        <rect x="30" y="42" width="24" height="14" rx="7" fill="#ffffff" stroke="#d6e2eb" strokeWidth="1" />
        <text x="42" y="52" fontSize="9" fontWeight="700" fill="#1e293b" textAnchor="middle">
          经理
        </text>
        <use href="#office-chair" />
        <use href="#person-sitting" x="80" y="146" />
        <NameLabel name={pm?.name || "项目经理"} />
        {renderPmStatusEffects()}
      </g>

      {/* Agent 工位 */}
      {deskPositions.map((pos, index) => {
        const agent = activeAgents[index];
        const agentState = getAgentStatus(agent);

        if (!agent) {
          return (
            <g
              key={index}
              transform={`translate(${pos.x}, ${pos.y}) scale(0.78)`}
              className="office-interactive"
              onClick={() => actions?.onCreateAgent?.()}
            >
              <DeskShadowLayer selected={false} />
              <use href="#office-desk-v2" />
              <use href="#office-chair" />
            </g>
          );
        }

        return (
          <g
            key={index}
            transform={`translate(${pos.x}, ${pos.y}) scale(0.78)`}
            className="office-interactive office-hover-anchor"
            onClick={() => actions?.onOpenAgent?.(agent.id)}
          >
            <DeskShadowLayer selected={String(agent?.id) === String(selectedAgentId)} />
            <use href="#office-desk-v2" />
            <use href="#office-chair" />
            <use href="#person-sitting" x="80" y="146" />
            {renderStatusEffects(agentState)}
            <NameLabel name={agent.name} />
          </g>
        );
      })}
    </g>
  );
}
