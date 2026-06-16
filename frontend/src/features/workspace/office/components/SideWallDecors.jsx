export function SideWallDecors() {
  return (
    <g id="side-wall-decors">
      {/* 左侧音响 */}
      <rect x="12" y="115" width="26" height="20" rx="2" fill="#334155" />
      <circle cx="20" cy="125" r="4" fill="#1e293b" />
      <circle cx="30" cy="125" r="4" fill="#1e293b" />

      {/* 左侧温控器 */}
      <g transform="translate(25, 335) rotate(-90)">
        <rect x="-11" y="-15" width="22" height="30" rx="2" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        <rect x="-8" y="-11" width="16" height="11" fill="#bae6fd" />
        <text x="0" y="10" fontSize="8" fontWeight="bold" fill="#64748b" textAnchor="middle">
          24°C
        </text>
      </g>

      {/* 右侧音响 */}
      <rect x="1112" y="115" width="26" height="20" rx="2" fill="#334155" />
      <circle cx="1120" cy="125" r="4" fill="#1e293b" />
      <circle cx="1130" cy="125" r="4" fill="#1e293b" />

      {/* 右侧控制按钮 */}
      <g transform="translate(1125, 335) rotate(-90)">
        <rect x="-11" y="-11" width="22" height="22" rx="11" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
        <polygon points="-4,2 2,-3 5,3" fill="#38bdf8" />
      </g>
    </g>
  );
}
