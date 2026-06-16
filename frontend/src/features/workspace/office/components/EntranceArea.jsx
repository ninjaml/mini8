import { officePalette } from "../officePalette";

export function EntranceArea() {
  return (
    <g>
      {/* 左下绿植 */}
      <g transform="translate(260, 465)">
        <OfficePlant />
      </g>

      {/* 右下绿植 */}
      <g transform="translate(820, 360)">
        <OfficePlant />
      </g>
    </g>
  );
}

function OfficePlant() {
  return (
    <>
      <ellipse cx="20" cy="114" rx="23" ry="7" fill="#0f172a" opacity="0.08" />
      <path d="M 19,93 Q 8,54 20,34 Q 30,54 19,93 Z" fill="#22c55e" />
      <path d="M 9,96 Q -1,71 5,48 Q 17,72 18,96 Z" fill="#16a34a" />
      <path d="M 29,96 Q 39,71 33,48 Q 21,72 20,96 Z" fill="#15803d" />
      <path d="M 19,88 Q 14,62 19,42" fill="none" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <path d="M 15,90 Q 10,72 9,55" fill="none" stroke="#22c55e" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" />
      <path d="M 23,90 Q 28,72 29,55" fill="none" stroke="#22c55e" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" />
      <path d="M 8,90 L 32,90 L 28,112 L 12,112 Z" fill={officePalette.room.frame} />
      <path d="M 10,90 L 30,90" stroke="#cbd5e1" strokeWidth="1" opacity="0.7" />
      <path d="M 12,112 L 28,112" stroke="#64748b" strokeWidth="1" opacity="0.5" />
    </>
  );
}
