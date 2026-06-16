function measureLabelWidth(text) {
  let width = 0;
  for (const ch of String(text || "")) {
    width += ch.charCodeAt(0) > 127 ? 12 : 7;
  }
  return Math.max(76, width + 24);
}

export function OfficeHoverLabel({ x = 0, y = 0, text }) {
  const labelWidth = measureLabelWidth(text);
  return (
    <g
      className="office-hover-label"
      transform={`translate(${x}, ${y})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <rect x={-labelWidth / 2} y="-24" width={labelWidth} height="24" rx="6" fill="#0f172a" opacity="0.9" />
      <text
        x="0"
        y="-8"
        fontSize="12"
        fontWeight="700"
        fill="#f8fafc"
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}
