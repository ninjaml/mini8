import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Layers3, Sparkles } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Tooltip } from "../../components/common/Tooltip";

const COLLABORATOR_MODE_TIP = "协作者：子agent拥有独立的记忆，可以记得你之前委派的任务，但是子agent无法并发执行任务。";
const EXECUTOR_MODE_TIP = "执行器：子Agent可以并发执行任务，但是没有记忆，执行完毕之后，下一次他不知道之前做过什么。";

export function WorkspaceAgentPersonaModal({
  open,
  agent,
  personas = [],
  onClose,
  onSavePersona,
  currentSubagentMode = null,
  onSaveSubagentMode,
}) {
  const SESSION_SETTING_TABS = [
    { id: "persona", label: "专家人格" },
    { id: "mode", label: "团队模式" },
  ];
  const currentPersonaName = agent?.persona_name || "";
  const [activeTab, setActiveTab] = useState("persona");
  const [selectedPersonaName, setSelectedPersonaName] = useState("");
  const [selectedSubagentMode, setSelectedSubagentMode] = useState(currentSubagentMode);
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveTab("persona");
    setSelectedPersonaName(agent?.persona_name || "");
    setSelectedSubagentMode(currentSubagentMode ?? null);
    setSavingPersona(false);
    setSavingMode(false);
    setError("");
  }, [agent?.id, agent?.persona_name, currentSubagentMode, open]);

  const selectedPersona = useMemo(
    () => personas.find((persona) => persona.name === selectedPersonaName) || null,
    [personas, selectedPersonaName],
  );

  if (!open || !agent) return null;

  const handleSavePersona = async () => {
    try {
      setSavingPersona(true);
      setError("");
      await onSavePersona?.(selectedPersonaName || null);
    } catch (err) {
      setError(err.message || "保存失败");
      return;
    } finally {
      setSavingPersona(false);
    }
    onClose?.();
  };

  const handleSaveMode = async () => {
    try {
      setSavingMode(true);
      setError("");
      await onSaveSubagentMode?.(selectedSubagentMode);
    } catch (err) {
      setError(err.message || "保存失败");
      return;
    } finally {
      setSavingMode(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="modal-large">
      <div className="modal-header workspace-agent-persona-modal__header">
        <div>
          <h3>会话设置</h3>
          <p>{agent.name} 在当前 workspace 会话里的专家人格和团队工作模式都可以在这里调整。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="modal-body workspace-agent-persona-modal">
        <div className="workspace-agent-persona-modal__tabs" role="tablist" aria-label="会话设置标签">
          {SESSION_SETTING_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`agent-team-config-tabs__tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "persona" ? (
        <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
          <div className="agent-team-config__panel-head">
            <div>
              <div className="card-title">专家人格</div>
              <div className="agent-team-config__panel-desc">
                专家人格来自 persona 目录，会在运行时以内存叠加到这个 Agent 的主会话。
              </div>
            </div>
          </div>

          <div className="agent-team-config__expert-layout">
            <div className="agent-team-config__expert-list">
              <button
                type="button"
                className={`workspace-agent-persona-modal__item ${!selectedPersonaName ? "is-selected" : ""}`}
                onClick={() => setSelectedPersonaName("")}
              >
                <span className="menu-icon">
                  <Sparkles size={14} />
                </span>
                <span>无专家人格</span>
                {!currentPersonaName ? <span className="agent-team-config__persona-state">当前</span> : null}
              </button>
              {personas.map((persona) => (
                <button
                  key={persona.name}
                  type="button"
                  className={`workspace-agent-persona-modal__item ${selectedPersonaName === persona.name ? "is-selected" : ""}`}
                  onClick={() => setSelectedPersonaName(persona.name)}
                >
                  <span className="menu-icon">
                    <Sparkles size={14} />
                  </span>
                  <span>{persona.name}</span>
                  {currentPersonaName === persona.name ? (
                    <span className="agent-team-config__persona-state">当前</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="dash-card agent-team-config__expert-preview">
              <div className="agent-team-config__expert-title">
                <Layers3 size={16} strokeWidth={2.1} />
                {selectedPersona?.name || "无专家人格"}
              </div>
              <div className="agent-team-config__expert-readme">
                {selectedPersona?.readme || "当前不叠加专家人格。这个 Agent 只加载 base 提示词与 base 技能。"}
              </div>
            </div>
          </div>

          <div className="agent-team-config__actions">
            <span />
            <button className="primary-btn compact" type="button" onClick={handleSavePersona} disabled={savingPersona}>
              {savingPersona ? "保存中..." : "保存专家配置"}
            </button>
          </div>
        </section>
        ) : null}

        {activeTab === "mode" ? (
        <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
          <div className="agent-team-config__panel-head">
            <div>
              <div className="card-title">团队工作模式</div>
              <div className="agent-team-config__panel-desc">
                这里切换的是当前 workspace 会话里的子Agent协作方式，不会改动其他会话。
              </div>
            </div>
          </div>

          <div className="workspace-agent-persona-modal__mode-row">
            <div className="agent-team-detail__team-mode-head">
              <span className="agent-team-detail__mode-label">当前会话模式</span>
              <Tooltip text="这个模式只作用于当前 workspace 会话；不同会话可以有不同的团队工作模式。" direction="up">
                <span className="agent-team-detail__mode-help" aria-label="当前会话模式说明">
                  <CircleHelp size={14} strokeWidth={2.2} />
                </span>
              </Tooltip>
            </div>
            <div className="agent-team-detail__mode-shell workspace-agent-persona-modal__mode-shell">
              <div className="agent-team-detail__mode-segmented" role="group" aria-label="当前会话模式">
                <Tooltip text={COLLABORATOR_MODE_TIP} direction="up">
                  <button
                    type="button"
                    className={`agent-team-detail__mode-option ${selectedSubagentMode === "collaborator" ? "is-active" : ""}`}
                    onClick={() => setSelectedSubagentMode("collaborator")}
                    disabled={savingMode}
                  >
                    协作者
                  </button>
                </Tooltip>
                <Tooltip text={EXECUTOR_MODE_TIP} direction="up">
                  <button
                    type="button"
                    className={`agent-team-detail__mode-option ${selectedSubagentMode === "executor" ? "is-active" : ""}`}
                    onClick={() => setSelectedSubagentMode("executor")}
                    disabled={savingMode}
                  >
                    执行器
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="agent-team-config__actions">
            <span />
            <button className="primary-btn compact" type="button" onClick={handleSaveMode} disabled={savingMode}>
              {savingMode ? "保存中..." : "保存团队模式"}
            </button>
          </div>
        </section>
        ) : null}
      </div>

      {error ? <div className="modal-inline-error" style={{ margin: "0 30px 12px" }}>{error}</div> : null}
    </Modal>
  );
}
