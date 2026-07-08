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

export function OfficeGridArea({ activeAgents = [], actions, agentStatuses, selectedAgentId = null }) {
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
    const status = agentStatuses?.workspaceAgentStatuses?.[id];
    const completion = agentStatuses?.workspaceAgentCompletions?.[id] || 0;
    const seen = agentStatuses?.workspaceAgentSeenCompletions?.[id] || 0;
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

  return (
    <g transform="translate(320, 125)">
      <style>{`
        .agent-name-label rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label rect {
          fill: #e7eef7;
          stroke: #c9d6e5;
        }
        .agent-name-label text {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label text {
          fill: #0f172a;
        }
        .agent-name-label circle {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .agent-name-label circle {
          fill: #38bdf8;
        }
        .office-agent-hover-actions {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.16s ease, transform 0.16s ease;
          transform: translateY(4px);
          overflow: visible;
        }
        .office-hover-anchor:hover .office-agent-hover-actions,
        .office-agent-hover-actions--visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .office-agent-hover-actions__button rect {
          transition: fill 0.16s ease, stroke 0.16s ease;
        }
        .office-agent-hover-actions__button text {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0;
        }
        .office-agent-hover-actions__button:hover rect {
          fill: #ffffff;
          stroke: #7c8ea3;
        }
        .office-agent-hover-actions__button text,
        .office-agent-hover-actions__button path,
        .office-agent-hover-actions__button circle {
          transition: stroke 0.16s ease, fill 0.16s ease;
        }
        .office-agent-hover-actions__button:hover text,
        .office-agent-hover-actions__button:hover path,
        .office-agent-hover-actions__button:hover circle {
          stroke: #0f172a;
          fill: #0f172a;
        }
      `}</style>

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
            onClick={(event) => {
              event.stopPropagation();
              actions?.onOpenAgentActionMenu?.({
                agentId: agent.id,
                clientX: event.clientX,
                clientY: event.clientY,
              });
            }}
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
