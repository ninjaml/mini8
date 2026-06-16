export function SanitationArea({ sanitationAgent }) {
  return (
    <g transform="translate(960, 400)" className="office-hover-anchor">
      <defs>
        <linearGradient id="sanitationSweepOuter" x1="28" y1="22" x2="74" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="sanitationSweepInner" x1="30" y1="22" x2="70" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <style>{`
        .sanitation-hover-label {
          opacity: 0;
          transition: opacity 0.18s ease;
        }
        .office-hover-anchor:hover .sanitation-hover-label {
          opacity: 1;
        }
      `}</style>
      <path
        d="M 28,20 L 74,8 A 74,74 0 0 1 74,34 Z"
        fill="url(#sanitationSweepOuter)"
      />
      <path
        d="M 30,20 L 70,11 A 56,56 0 0 1 70,31 Z"
        fill="url(#sanitationSweepInner)"
      />
      <ellipse cx="22" cy="26" rx="22" ry="7" fill="#0f172a" opacity="0.06" />
      <ellipse cx="22" cy="18" rx="21" ry="15" fill="#334155" stroke="#52657a" strokeWidth="1.1" />
      <ellipse cx="22" cy="16" rx="16" ry="11" fill="#1f2b3a" />
      <ellipse cx="22" cy="12" rx="10" ry="4" fill="#dbeafe" opacity="0.16" />
      <path
        d="M 12,16 Q 22,9 32,16"
        stroke="#38bdf8"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <circle cx="10" cy="18" r="2.4" fill="#22c55e" />
      <circle cx="31" cy="18" r="1.4" fill="#0ea5e9" opacity="0.75" />
      <ellipse cx="22" cy="10" rx="4.5" ry="2" fill="#cbd5e1" opacity="0.28" />
      <g className="sanitation-hover-label" filter="url(#dropShadow)">
        <rect x="-28" y="34" width="100" height="18" rx="4" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
        <circle cx="-18" cy="43" r="3" fill="#22c55e" />
        <text x="25" y="47" fontSize="9" fontWeight="600" fill="#475569" textAnchor="middle">
          {sanitationAgent?.name || "Sanitation is working"}
        </text>
      </g>
    </g>
  );
}
