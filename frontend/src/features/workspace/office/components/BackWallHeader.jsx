import { officePalette } from "../officePalette";

function measureNameWidth(text) {
  let width = 0;
  for (const ch of String(text || "")) {
    width += ch.charCodeAt(0) > 127 ? 22 : 13;
  }
  return Math.max(180, width + 48);
}

export function BackWallHeader({ name, goal, onClick }) {
  const signWidth = measureNameWidth(name);
  return (
    <g transform="translate(575, 15)" className="office-interactive" onClick={onClick}>
      <g filter="url(#dropShadow)">
        <rect
          x={-signWidth / 2}
          y={-4}
          width={signWidth}
          height="38"
          rx="10"
          fill="#1e3a2f"
          stroke={officePalette.displays.bezel}
          strokeWidth="1.5"
          opacity="0.95"
        />
      </g>
      <text x="0" y="24" fontSize="22" fontWeight="700" fill="#f8fafc" textAnchor="middle">
        {name || "工作空间"}
      </text>
      <g transform="translate(-115, 32)">
        <line x1="115" y1="2" x2="30" y2="16" stroke={officePalette.chalkboard.line} strokeWidth="2.5" />
        <line x1="115" y1="2" x2="200" y2="16" stroke={officePalette.chalkboard.line} strokeWidth="2.5" />
        <circle cx="115" cy="0" r="3.5" fill={officePalette.chalkboard.pin} />
        <g filter="url(#dropShadow)">
          <rect x="0" y="16" width="230" height="52" rx="10" fill="#244d3d" stroke={officePalette.displays.bezel} strokeWidth="1.5" />
        </g>
        <text x="115" y="47" fontSize="12" fill="#f8fafc" textAnchor="middle">
          {goal || "待补充工作总目标"}
        </text>
      </g>
    </g>
  );
}
