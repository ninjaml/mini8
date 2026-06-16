import { officePalette } from "../officePalette";

export function RoomShell() {
  return (
    <g>
      {/* 上墙 + 下墙 + 地板 */}
      <rect x="0" y="0" width="1150" height="90" fill={officePalette.room.wall} />
      <rect x="0" y="740" width="1150" height="65" fill={officePalette.room.wall} />
      <rect x="0" y="90" width="1150" height="650" fill="url(#floorGradient)" />

      {/* 踢脚线 */}
      <rect x="0" y="90" width="1150" height="6" fill={officePalette.room.baseboard} />
      <rect x="0" y="734" width="1150" height="6" fill={officePalette.room.baseboard} />

      {/* 后墙窗户 */}
      <g transform="translate(265, 12)">
        <rect x="0" y="0" width="100" height="48" rx="8" fill="url(#windowSky)" stroke="#ffffff" strokeWidth="4" />
        <line x1="50" y1="0" x2="50" y2="48" stroke="#ffffff" strokeWidth="4" />
        <line x1="0" y1="24" x2="100" y2="24" stroke="#ffffff" strokeWidth="4" />
        <rect x="0" y="48" width="100" height="8" rx="1" fill={officePalette.room.windowTrim} />
      </g>
      <g transform="translate(785, 12)">
        <rect x="0" y="0" width="100" height="48" rx="8" fill="url(#windowSky)" stroke="#ffffff" strokeWidth="4" />
        <line x1="50" y1="0" x2="50" y2="48" stroke="#ffffff" strokeWidth="4" />
        <line x1="0" y1="24" x2="100" y2="24" stroke="#ffffff" strokeWidth="4" />
        <rect x="0" y="48" width="100" height="8" rx="1" fill={officePalette.room.windowTrim} />
      </g>

    </g>
  );
}
