import { officePalette } from "../officePalette";

export function RestArea({ actions, currentUserName }) {
  const loungeLabel = "茶室";

  return (
    <g transform="translate(925, 495)" className="office-hover-anchor">
      <style>{`
        .tea-label rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-hover-anchor:hover .tea-label rect {
          fill: #1e293b;
          stroke: #1e293b;
        }
        .tea-label text {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .tea-label text {
          fill: #f8fafc;
        }
        .tea-label circle {
          transition: fill 0.2s ease;
        }
        .office-hover-anchor:hover .tea-label circle {
          fill: #86efac;
        }
      `}</style>

      <circle cx="80" cy="105" r="70" fill={officePalette.lounge.rugOuter} stroke={officePalette.lounge.rugBorder} strokeWidth="1" strokeDasharray="4 2" />
      <circle cx="80" cy="105" r="64" fill={officePalette.lounge.rugInner} opacity="0.78" />

      {/* 三个蒲团（上、左、右） */}
      <Cushion x={80} y={55} />
      <Cushion x={28} y={105} />
      <Cushion x={131} y={105} />

      <circle cx="80" cy="105" r="32" fill={officePalette.lounge.teaOuter} filter="url(#dropShadow)" />
      <circle cx="80" cy="105" r="32" fill={officePalette.lounge.teaInner} />
      <text x="80" y="111" fontSize="18" fontWeight="bold" fill="#ffffff" textAnchor="middle">
        禅
      </text>
      <circle cx="62" cy="105" r="3" fill="#f0fdfa" stroke="#0d9488" strokeWidth="0.5" />
      <circle cx="98" cy="105" r="3" fill="#f0fdfa" stroke="#0d9488" strokeWidth="0.5" />

      {/* MOSS */}
      <g
        transform="translate(132, 107) scale(-1,1)"
        className="office-interactive"
        onClick={() => actions?.onOpenMossChatInNewTab?.()}
      >
        <path d="M -10,-12 C -10,12 8,12 8,-12 Z" fill="#0f766e" />
        <rect x="-4" y="-15" width="6" height="4" fill="#fed7aa" />
        <circle cx="-1" cy="-21" r="7.5" fill="#fed7aa" />
        <path d="M -7,-26 Q -2,-32 5,-26 Q 8,-20 6,-17 C 4,-20 -1,-21 -4,-18 Z" fill="#8b5e3c" />
        <path d="M -7,-5 Q 7,-2 17,0" stroke="#fed7aa" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="18" cy="-1" r="3.5" fill="#ffffff" stroke="#0284c7" strokeWidth="0.8" />
        <circle cx="18" cy="-1" r="1.5" fill="#b45309" />
      </g>
      <text x="132" y="137" fontSize="10" fontWeight="bold" fill="#475569" textAnchor="middle">
        550W
      </text>

      {/* 用户 */}
      <g transform="translate(28, 107)">
        <path d="M -10,-12 C -10,12 8,12 8,-12 Z" fill="#0284c7" />
        <rect x="-4" y="-15" width="6" height="4" fill="#fed7aa" />
        <circle cx="-1" cy="-21" r="7.5" fill="#fed7aa" />
        <path d="M -7,-26 Q -2,-32 5,-26 Q 8,-20 6,-17 C 4,-20 -1,-21 -4,-18 Z" fill="#1e293b" />
        <path d="M -6,-6 Q 8,0 16,-1" stroke="#fed7aa" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="18" cy="-1" r="3.5" fill="#ffffff" stroke="#0284c7" strokeWidth="0.8" />
        <circle cx="18" cy="-1" r="1.5" fill="#b45309" />
        <text x="0" y="30" fontSize="10" fontWeight="bold" fill="#475569" textAnchor="middle">
          YOU
        </text>
      </g>

      {/* 茶室标签 */}
      <g transform="translate(54, 145)" className="tea-label" filter="url(#dropShadow)">
        <rect x="0" y="0" width="52" height="18" rx="4" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
        <circle cx="12" cy="9" r="3" fill="#22c55e" />
        <text
          x="21"
          y="13"
          fontSize="9"
          fontWeight="bold"
          fill="#0f172a"
          textAnchor="start"
          letterSpacing="0.5"
        >
          {loungeLabel}
        </text>
      </g>
    </g>
  );
}

function Cushion({ x, y }) {
  return (
    <g filter="url(#dropShadow)">
      <circle cx={x} cy={y} r="10" fill="#59687a" stroke="#2f3f50" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="6" fill="#738395" opacity="0.5" />
    </g>
  );
}
