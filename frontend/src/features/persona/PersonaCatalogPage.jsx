import { useMemo, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { PersonaResourceBrowser } from "./PersonaResourceBrowser";

function formatSummary(text) {
  const raw = String(text || "").trim();
  if (!raw) return "当前专家人格还没有补充说明。";
  return raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || raw;
}

function PersonaCard({ persona, active, onClick }) {
  return (
    <button
      type="button"
      className={`dash-card plain-btn agent-team-card ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <div className="agent-team-card__top">
        <div className="agent-team-card__identity">
          <div className="agent-team-card__avatar persona-card__avatar">
            <Bot size={20} strokeWidth={2.1} />
          </div>
          <div className="agent-team-card__identity-text">
            <div className="agent-team-card__name">{persona.name}</div>
            <div className="agent-team-card__subtitle">专家人格</div>
          </div>
        </div>
        <div className="agent-team-card__skill-pill">提示词 + 技能</div>
      </div>

      <div className="agent-team-card__meta-grid">
        <div className="agent-team-card__meta">
          <div className="agent-team-card__meta-label">说明</div>
          <div className="agent-team-card__meta-value persona-card__summary">{formatSummary(persona.readme)}</div>
        </div>
      </div>

      <div className="agent-team-card__footer">
        <div className="agent-team-card__workspace-count">
          <Sparkles size={14} strokeWidth={2.1} />
          {persona.prompt ? "已加载" : "未就绪"}
        </div>
        <div className="agent-team-card__cta">查看详情</div>
      </div>
    </button>
  );
}

export function PersonaCatalogPage({ personas = [] }) {
  const [selectedPersonaName, setSelectedPersonaName] = useState(personas[0]?.name || "");
  const [detailOpen, setDetailOpen] = useState(false);

  const selectedPersona = useMemo(() => {
    if (!personas.length) return null;
    return personas.find((persona) => persona.name === selectedPersonaName) || personas[0];
  }, [personas, selectedPersonaName]);

  return (
    <section id="view-persona-catalog" className="view-container">
      <div className="page-head agent-team-page-head">
        <div className="agent-team-page-head__main">
          <h2>业务专家</h2>
          <p>浏览当前系统可用的专家人格目录</p>
        </div>
      </div>

      {!personas.length ? (
        <div className="view-empty">当前还没有可用的专家人格。</div>
      ) : (
        <div className="agent-team-grid">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.name}
              persona={persona}
              active={selectedPersona?.name === persona.name}
              onClick={() => {
                setSelectedPersonaName(persona.name);
                setDetailOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <Modal open={detailOpen && !!selectedPersona} onClose={() => setDetailOpen(false)} className="modal-wide">
        <div className="modal-header">
          <div>
            <h3>{selectedPersona?.name || "专家人格"}</h3>
            <p>人格说明，提示词和技能</p>
          </div>
          <button className="close-btn" type="button" onClick={() => setDetailOpen(false)}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <PersonaResourceBrowser persona={selectedPersona} />
        </div>
      </Modal>
    </section>
  );
}
