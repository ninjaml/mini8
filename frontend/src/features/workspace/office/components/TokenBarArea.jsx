import { officePalette } from "../officePalette";

const T = {
  text: "#0f172a",
  dark: "#1e293b",
  dot: "#22c55e",
  board: "#ffffff",
  boardStroke: "#cbd5e1",
  header: "#e2e8f0",
  headerStroke: "#cbd5e1",
  support: "#94a3b8",
};

export function TokenBarArea({ onClick }) {
  return (
    <g
      transform="translate(85, 585)"
      className="office-interactive office-hover-anchor"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <style>{`
        .token-header rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-interactive:hover .token-header rect {
          fill: #1e293b;
          stroke: #1e293b;
        }
        .token-header text {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .token-header text {
          fill: #f8fafc;
        }
        .token-header circle {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .token-header circle {
          fill: #86efac;
        }
      `}</style>

      {/* 白色框体，加高 */}
      <rect x="0" y="15" width="130" height="70" rx="6" fill={T.board} stroke={T.boardStroke} strokeWidth="1.5" filter="url(#dropShadow)" />

      {/* 框内 Token Bar 标签 */}
      <g className="token-header">
        <rect x="25" y="22" width="80" height="18" rx="4" fill={T.header} stroke={T.headerStroke} strokeWidth="1" />
        <circle cx="38" cy="31" r="3" fill={T.dot} />
        <text
          x="48"
          y="35"
          fontSize="9"
          fontWeight="bold"
          fill={T.text}
          textAnchor="start"
          letterSpacing="0.5"
        >
          Token Bar
        </text>
      </g>

      {/* 下方小摆件 */}
      <g transform="translate(0, 30)">
        <rect x="15" y="20" width="28" height="28" rx="4" fill="#dc2626" />
        <rect x="19" y="30" width="20" height="14" fill="#1e293b" />
        <circle cx="25" cy="25" r="2" fill="#38bdf8" />
        <rect x="52" y="30" width="10" height="10" rx="1" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
        <rect x="61" y="32" width="3" height="6" rx="1" fill="#94a3b8" />
        <path
          d="M 54,26 Q 56,22 55,19 M 58,26 Q 60,22 59,19"
          stroke="#cbd5e1"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="85" y="28" width="10" height="12" fill="#ef4444" opacity="0.8" />
        <rect x="98" y="28" width="10" height="12" fill="#3b82f6" opacity="0.8" />
        <rect x="111" y="28" width="10" height="12" fill="#eab308" opacity="0.8" />
      </g>

      <rect x="25" y="88" width="80" height="6" rx="2" fill={T.support} opacity="0.55" />
    </g>
  );
}
