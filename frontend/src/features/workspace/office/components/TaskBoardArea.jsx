import { getOfficeHoverLabel } from "../officeHoverLabels";
import { OfficeHoverLabel } from "./OfficeHoverLabel";

const T = {
  text: "#0f172a",
  dark: "#1e293b",
  dot: "#38bdf8",
  board: "#ffffff",
  boardStroke: "#cbd5e1",
  frame: "#94a3b8",
  tray: "#e2e8f0",
  tag1: "#fde68a",
  tag2: "#fecdd3",
  tag3: "#bfdbfe",
  bar: "#94a3b8",
  line: "#334155",
};

function TaskTag({ x, y, w, h, fill, rotate = 0, children }) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotate})`}>
      <rect x="0" y="0" width={w} height={h} rx="3" fill={fill} />
      {children}
    </g>
  );
}

export function TaskBoardArea({ onClick }) {
  return (
    <g
      transform="translate(900, 125)"
      className="office-interactive office-hover-anchor"
      onClick={onClick}
      onPointerDown={onClick}
    >
      <OfficeHoverLabel x={68} y={70} text={getOfficeHoverLabel("taskBoard")} />

      <rect x="-12" y="-8" width="218" height="228" fill="transparent" pointerEvents="all" />

      <style>{`
        .task-header rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-interactive:hover .task-header rect {
          fill: #1e293b;
          stroke: #1e293b;
        }
        .task-header text {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .task-header text {
          fill: #f8fafc;
        }
        .task-header circle {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .task-header circle {
          fill: #7dd3fc;
        }
      `}</style>

      <g transform="translate(0, 25) scale(1.0)" filter="url(#dropShadow)">
        <path d="M 55,140 L 45,175 M 135,140 L 145,175" stroke={T.frame} strokeWidth="5" strokeLinecap="round" />
        <path d="M 35,175 L 65,175 M 125,175 L 155,175" stroke={T.frame} strokeWidth="4" strokeLinecap="round" />

        <rect x="0" y="20" width="190" height="120" rx="4" fill={T.board} stroke={T.boardStroke} strokeWidth="2" />
        <rect x="0" y="132" width="190" height="8" rx="1" fill={T.tray} />

        <g className="task-header">
          <rect x="55" y="30" width="80" height="18" rx="4" fill={T.tray} stroke={T.boardStroke} strokeWidth="1" />
          <circle cx="74" cy="39" r="3" fill={T.dot} />
          <text
            x="83"
            y="43"
            fontSize="9"
            fontWeight="bold"
            fill={T.text}
            textAnchor="start"
            letterSpacing="0.5"
          >
            任务清单
          </text>
        </g>

        <TaskTag x="22" y="66" w="34" h="24" fill={T.tag1} rotate={-4}>
          <rect x="6" y="6" width="22" height="3" rx="1" fill={T.line} opacity="0.35" />
          <rect x="6" y="12" width="16" height="3" rx="1" fill={T.line} opacity="0.25" />
        </TaskTag>

        <TaskTag x="78" y="60" w="38" h="28" fill={T.tag2} rotate={2}>
          <rect x="6" y="6" width="20" height="3" rx="1" fill={T.line} opacity="0.35" />
          <rect x="6" y="13" width="26" height="3" rx="1" fill={T.line} opacity="0.25" />
          <circle cx="28" cy="20" r="2.5" fill={T.dot} />
        </TaskTag>

        <TaskTag x="138" y="68" w="30" h="22" fill={T.tag3} rotate={-3}>
          <rect x="6" y="6" width="18" height="3" rx="1" fill={T.line} opacity="0.35" />
          <rect x="6" y="12" width="14" height="3" rx="1" fill={T.line} opacity="0.25" />
        </TaskTag>

        <g transform="translate(50, 106) rotate(1)">
          <rect x="0" y="0" width="90" height="18" rx="3" fill={T.bar} />
          <rect x="8" y="6" width="50" height="3" rx="1" fill="#f1f5f9" opacity="0.8" />
          <rect x="8" y="11" width="34" height="3" rx="1" fill="#f1f5f9" opacity="0.6" />
        </g>
      </g>
    </g>
  );
}
