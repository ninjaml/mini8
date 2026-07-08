import { OfficeHoverLabel } from "./OfficeHoverLabel";

const K = {
  outer: "#ffffff",
  inner: "#f8fafc",
  stroke: "#cbd5e1",
  title: "#e2e8f0",
  shelf: "#e2e8f0",
  card: "#ffffff",
  cardStroke: "#cbd5e1",
  text: "#0f172a",
  mutedText: "#64748b",
  success: "#22c55e",
  info: "#38bdf8",
  warning: "#f59e0b",
};

export function KnowledgeArea({ knowledge = [], onClick }) {
  return (
    <g
      transform="translate(34, 110)"
      className="office-interactive office-hover-anchor"
      onClick={onClick}
    >
      <style>{`
        .knowledge-header rect {
          transition: fill 0.2s ease, stroke 0.2s ease;
        }
        .office-interactive:hover .knowledge-header rect {
          fill: #1e293b;
          stroke: #1e293b;
        }
        .knowledge-header text {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .knowledge-header text {
          fill: #f8fafc;
        }
        .knowledge-header circle {
          transition: fill 0.2s ease;
        }
        .office-interactive:hover .knowledge-header circle {
          fill: #86efac;
        }
        .knowledge-cabinet-handle {
          transition: fill 0.2s ease, opacity 0.2s ease;
        }
        .office-interactive:hover .knowledge-cabinet-handle {
          fill: #94a3b8;
          opacity: 1;
        }
      `}</style>

      <g transform="translate(10, 45)" filter="url(#dropShadow)" className="knowledge-cabinet">
        {/* cabinet crown */}
        <rect x="8" y="-8" width="144" height="12" rx="4" fill="#dfe8ef" />
        <rect x="18" y="-14" width="124" height="10" rx="4" fill="#f8fafc" stroke="#d6e1eb" strokeWidth="1" />

        {/* 柜体外壳 */}
        <rect
          x="0"
          y="0"
          width="160"
          height="240"
          rx="8"
          fill={K.outer}
          stroke={K.stroke}
          strokeWidth="1.8"
        />
        <rect x="6" y="6" width="148" height="228" rx="5" fill={K.inner} />
        <rect x="12" y="12" width="136" height="214" rx="8" fill="#edf3f7" stroke="#d7e1ea" strokeWidth="1" />

        {/* cabinet plaque */}
        <g className="knowledge-header">
          <rect x="25" y="162" width="110" height="20" rx="6" fill={K.title} stroke={K.cardStroke} strokeWidth="1" />
          <circle cx="64" cy="172" r="3" fill={K.success} />
          <text
            x="73"
            y="176"
            fontSize="8.5"
            fontWeight="bold"
            fill={K.text}
            textAnchor="start"
            letterSpacing="0.5"
          >
            知识库
          </text>
        </g>

        {/* 隔板 1 */}
        <rect x="18" y="42" width="124" height="3" rx="1" fill={K.shelf} />
        <rect x="24" y="22" width="14" height="18" rx="2" fill={K.info} opacity="0.5" />
        <rect x="42" y="26" width="10" height="14" rx="1" fill={K.mutedText} opacity="0.6" />
        <rect x="56" y="24" width="12" height="16" rx="1" fill={K.warning} opacity="0.5" />
        <rect x="100" y="24" width="40" height="14" rx="3" fill={K.card} stroke={K.cardStroke} strokeWidth="1" />
        <rect x="108" y="28" width="24" height="2" rx="1" fill={K.mutedText} opacity="0.8" />

        {/* 隔板 2 */}
        <rect x="18" y="96" width="124" height="3" rx="1" fill={K.shelf} />
        <rect x="22" y="50" width="30" height="44" rx="4" fill={K.card} stroke={K.cardStroke} strokeWidth="1" />
        <rect x="28" y="58" width="18" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <rect x="28" y="64" width="14" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <rect x="28" y="70" width="20" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <circle cx="29" cy="85" r="2.5" fill={K.success} />

        <rect x="58" y="54" width="10" height="40" rx="2" fill={K.info} opacity="0.45" />
        <rect x="72" y="60" width="9" height="34" rx="1" fill={K.mutedText} opacity="0.55" />
        <rect x="85" y="56" width="13" height="38" rx="2" fill={K.warning} opacity="0.45" />
        <rect x="108" y="50" width="30" height="44" rx="4" fill={K.card} stroke={K.cardStroke} strokeWidth="1" />
        <rect x="114" y="58" width="18" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <rect x="114" y="64" width="14" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <rect x="114" y="70" width="18" height="2" rx="1" fill={K.mutedText} opacity="0.7" />
        <circle cx="115" cy="85" r="2.5" fill={K.info} />

        {/* 隔板 3 */}
        <rect x="18" y="150" width="124" height="3" rx="1" fill={K.shelf} />
        <rect x="22" y="104" width="20" height="44" rx="3" fill={K.card} stroke={K.cardStroke} strokeWidth="1" />
        <text x="32" y="132" fontSize="10" fontWeight="bold" fill={K.text} textAnchor="middle">
          文
        </text>
        <rect x="50" y="108" width="16" height="40" rx="2" fill={K.success} opacity="0.4" />
        <rect x="70" y="114" width="12" height="34" rx="1" fill={K.info} opacity="0.4" />
        <rect x="86" y="110" width="14" height="38" rx="1" fill={K.mutedText} opacity="0.5" />
        <rect x="102" y="104" width="36" height="44" rx="3" fill={K.card} stroke={K.cardStroke} strokeWidth="1" />
        <text x="121" y="132" fontSize="10" fontWeight="bold" fill={K.text} textAnchor="middle">
          理
        </text>

        {/* glass doors on top */}
        <g opacity="0.8">
          <rect x="16" y="18" width="62" height="136" rx="6" fill="#f8fbfe" opacity="0.09" />
          <rect x="82" y="18" width="62" height="136" rx="6" fill="#f8fbfe" opacity="0.09" />
          <rect x="18" y="20" width="58" height="132" rx="5" fill="#ffffff" opacity="0.035" />
          <rect x="84" y="20" width="58" height="132" rx="5" fill="#ffffff" opacity="0.035" />
          <line x1="80" y1="18" x2="80" y2="154" stroke="#d4dee8" strokeWidth="1" opacity="0.85" />
          <rect x="77" y="92" width="6" height="28" rx="3" fill="#f8fafc" opacity="0.45" />
          <rect x="74" y="94" width="3" height="20" rx="1.5" fill="#b6c5d3" opacity="0.65" className="knowledge-cabinet-handle" />
          <rect x="83" y="94" width="3" height="20" rx="1.5" fill="#b6c5d3" opacity="0.65" className="knowledge-cabinet-handle" />
          <line x1="24" y1="34" x2="70" y2="34" stroke="#ffffff" strokeWidth="4" opacity="0.06" />
          <line x1="90" y1="48" x2="136" y2="48" stroke="#ffffff" strokeWidth="4" opacity="0.05" />
          <line x1="28" y1="86" x2="72" y2="86" stroke="#dfe7ef" strokeWidth="2" opacity="0.16" />
          <line x1="92" y1="104" x2="138" y2="104" stroke="#dfe7ef" strokeWidth="2" opacity="0.14" />
          <line x1="24" y1="42" x2="70" y2="42" stroke="#ffffff" strokeWidth="1.2" opacity="0.28" />
          <line x1="90" y1="58" x2="136" y2="58" stroke="#ffffff" strokeWidth="1.2" opacity="0.2" />
        </g>

        {/* cabinet drawer */}
        <rect x="16" y="188" width="128" height="30" rx="7" fill="#dbe4ec" stroke="#c9d5e1" strokeWidth="1" />
        <rect x="20" y="192" width="120" height="22" rx="5" fill="#d5dee7" opacity="0.75" />
        <rect x="56" y="200" width="48" height="6" rx="3" fill="#8ea0b3" opacity="0.95" className="knowledge-cabinet-handle" />
      </g>
    </g>
  );
}
