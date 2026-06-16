import { officePalette } from "../officePalette";

export function TopWallDecors({ onClick }) {
  return (
    <g id="top-wall-decors">
      {/* 左上角装饰面板 */}
      <rect x="20" y="35" width="25" height="12" rx="1" fill="#94a3b8" opacity="0.4" />
      <line x1="23" y1="41" x2="42" y2="41" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 1" />

      {/* 右上角装饰面板 */}
      <rect x="1105" y="35" width="25" height="12" rx="1" fill="#94a3b8" opacity="0.4" />
      <line x1="1108" y1="41" x2="1127" y2="41" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 1" />

      {/* Agent Mesh 看板 */}
      <g transform="translate(140, 16)" className="office-interactive" onClick={onClick}>
        <rect x="0" y="0" width="90" height="55" rx="4" fill="#1e3a2f" stroke={officePalette.displays.bezel} strokeWidth="2" />
        <circle cx="25" cy="28" r="8" fill={officePalette.displays.info} opacity="0.7" />
        <circle cx="65" cy="19" r="5" fill={officePalette.displays.success} opacity="0.7" />
        <circle cx="60" cy="39" r="6" fill={officePalette.displays.warning} opacity="0.7" />
        <line x1="33" y1="28" x2="60" y2="19" stroke={officePalette.displays.bezel} strokeWidth="1" opacity="0.5" />
        <line x1="33" y1="28" x2="54" y2="39" stroke={officePalette.displays.bezel} strokeWidth="1" opacity="0.5" />
        <text x="45" y="11" fontSize="7" fill={officePalette.displays.label} textAnchor="middle" fontWeight="bold">
          AGENT MESH
        </text>
      </g>

      {/* Token Performance 看板 */}
      <g transform="translate(930, 16)" className="office-interactive" onClick={onClick}>
        <rect x="0" y="0" width="95" height="55" rx="4" fill="#244d3d" stroke={officePalette.displays.bezel} strokeWidth="2" />
        <line x1="5" y1="28" x2="90" y2="28" stroke={officePalette.displays.grid} strokeWidth="0.5" strokeDasharray="2 2" />
        <line x1="5" y1="40" x2="90" y2="40" stroke={officePalette.displays.grid} strokeWidth="0.5" strokeDasharray="2 2" />
        <path
          d="M 8,45 L 22,42 L 35,22 L 48,35 L 62,15 L 75,38 L 88,25"
          fill="none"
          stroke={officePalette.displays.success}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="47" y="11" fontSize="7" fill={officePalette.displays.label} textAnchor="middle" fontWeight="bold">
          TOKEN PERFORMANCE
        </text>
        <rect x="58" y="43" width="32" height="9" rx="1" fill={officePalette.displays.success} opacity="0.16" />
        <text x="74" y="50" fontSize="6" fontFamily="Courier, monospace" fill={officePalette.displays.success} fontWeight="bold" textAnchor="middle">
          4.2k t/s
        </text>
      </g>
    </g>
  );
}
