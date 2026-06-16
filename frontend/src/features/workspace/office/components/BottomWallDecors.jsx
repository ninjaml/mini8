export function BottomWallDecors() {
  return (
    <g id="bottom-wall-decors">
      {/* 消防设备 */}
      <g transform="translate(234, 380) rotate(0)" filter="url(#dropShadow)">
        <rect x="-12" y="-14" width="24" height="28" rx="2" fill="#ef4444" />
        <rect x="-8" y="-10" width="16" height="11" fill="#ffffff" opacity="0.9" />
        <circle cx="0" cy="-4" r="3" fill="#ef4444" />
        <text x="0" y="9" fontSize="7" fontWeight="bold" fill="#ffffff" textAnchor="middle">
          消防
        </text>
      </g>
    </g>
  );
}
