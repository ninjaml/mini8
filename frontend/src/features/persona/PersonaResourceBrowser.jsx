import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { api } from "../../lib/api";

function inferPersonaDir(persona) {
  if (!persona) return "";
  if (persona.persona_dir) return persona.persona_dir;
  const promptPath = String(persona.prompt_path || "").trim();
  if (!promptPath) return "";
  const normalized = promptPath.replace(/[\\/]+$/, "");
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (slashIndex <= 0) return "";
  return normalized.slice(0, slashIndex);
}

function TabBrowser({ items, selectedKey, onSelect, titleKey, contentKey, emptyText }) {
  const selectedItem = items.find((item) => item[titleKey] === selectedKey) || items[0] || null;

  return (
    <div className="agent-team-config__browser">
      <div className="agent-team-config__browser-list">
        {items.length === 0 ? (
          <div className="agent-team-config__empty">{emptyText}</div>
        ) : (
          items.map((item) => (
            <button
              key={item[titleKey]}
              type="button"
              className={`sidebar-menu-item plain-btn ${selectedItem?.[titleKey] === item[titleKey] ? "active" : ""}`}
              onClick={() => onSelect(item[titleKey])}
            >
              <span>{item[titleKey]}</span>
            </button>
          ))
        )}
      </div>

      <div className="agent-team-config__browser-detail">
        <div className="agent-team-config__browser-title">{selectedItem?.[titleKey] || "未选择"}</div>
        <pre className="agent-team-config__browser-content">{selectedItem?.[contentKey] || "无内容"}</pre>
      </div>
    </div>
  );
}

export function PersonaResourceBrowser({ persona, embedded = false }) {
  const [activeTab, setActiveTab] = useState("summary");
  const [selectedPromptKey, setSelectedPromptKey] = useState("prompt");
  const [selectedReadmeKey, setSelectedReadmeKey] = useState("readme");
  const [selectedSkillName, setSelectedSkillName] = useState("");
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });

  useEffect(() => {
    setActiveTab("summary");
    setSelectedPromptKey("prompt");
    setSelectedReadmeKey("readme");
    setSelectedSkillName("");
  }, [persona?.name]);

  const readmeItems = useMemo(() => {
    if (!persona) return [];
    return [{ key: "readme", label: "readme.md", content: persona.readme || "当前没有可展示的说明内容。" }];
  }, [persona]);

  const promptItems = useMemo(() => {
    if (!persona) return [];
    return [{ key: "prompt", label: "prompt.md", content: persona.prompt || "当前没有可展示的 prompt 内容。" }];
  }, [persona]);

  const skillItems = useMemo(() => persona?.skills || [], [persona]);

  const selectedSkill = useMemo(() => {
    return skillItems.find((item) => item.name === selectedSkillName) || skillItems[0] || null;
  }, [skillItems, selectedSkillName]);
  const personaLocalDir = useMemo(() => inferPersonaDir(persona), [persona]);

  const handleOpenLocalPath = async () => {
    if (!personaLocalDir) {
      setAlertModal({ open: true, message: "本地路径未设置" });
      return;
    }
    try {
      await api.openLocalPath(personaLocalDir);
    } catch (error) {
      setAlertModal({ open: true, message: error.message || "打开本地目录失败" });
    }
  };

  if (!persona) {
    return <div className="agent-team-config__empty">未选择专家人格。</div>;
  }

  const content = (
    <>
      <div className="agent-team-config-tabs" role="tablist" aria-label="Persona 资源标签">
        {[
          { id: "summary", label: "说明详情" },
          { id: "prompt", label: "提示词" },
          { id: "skills", label: "技能" },
        ].map((tab) => (
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

      <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
        <div className="agent-team-config__panel-head">
          <div>
            <div className="card-title">
              {activeTab === "summary" ? "说明详情" : activeTab === "prompt" ? "提示词" : "技能"}
            </div>
            <div className="agent-team-config__panel-desc">
              {activeTab === "summary"
                ? "查看 persona 的说明内容。"
                : activeTab === "prompt"
                ? "查看 persona 的提示词资源。"
                : "查看 persona 的技能目录与内容。"}
            </div>
            <div className="agent-team-config__workdir-row" style={{ marginTop: 12 }}>
              <div className="agent-team-config__workdir-value agent-team-config__readonly">
                {personaLocalDir || "未设置"}
              </div>
              <button className="plain-btn agent-team-config__inline-btn" type="button" onClick={handleOpenLocalPath}>
                <FolderOpen size={14} />
                打开本地目录
              </button>
            </div>
          </div>
        </div>

        {activeTab === "summary" ? (
          <TabBrowser
            items={readmeItems}
            selectedKey={selectedReadmeKey}
            onSelect={setSelectedReadmeKey}
            titleKey="label"
            contentKey="content"
            emptyText="当前没有可展示内容。"
          />
        ) : null}

        {activeTab === "prompt" ? (
          <TabBrowser
            items={promptItems}
            selectedKey={selectedPromptKey}
            onSelect={setSelectedPromptKey}
            titleKey="label"
            contentKey="content"
            emptyText="当前没有可展示内容。"
          />
        ) : null}

        {activeTab === "skills" ? (
          <div className="agent-team-config__browser">
            <div className="agent-team-config__browser-list">
              {skillItems.length === 0 ? (
                <div className="agent-team-config__empty">当前没有可用技能。</div>
              ) : (
                skillItems.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`sidebar-menu-item plain-btn ${selectedSkill?.name === item.name ? "active" : ""}`}
                    onClick={() => setSelectedSkillName(item.name)}
                  >
                    <span>{item.name}</span>
                  </button>
                ))
              )}
            </div>
            <div className="agent-team-config__browser-detail">
              <div className="agent-team-config__browser-title">{selectedSkill?.name || "未选择"}</div>
              <pre className="agent-team-config__browser-content">
                {selectedSkill?.content || "当前没有可展示技能。"}
              </pre>
            </div>
          </div>
        ) : null}
      </section>

      <Modal open={alertModal.open} onClose={() => setAlertModal({ open: false, message: "" })}>
        <div style={{ padding: "24px", minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#111827" }}>提示</h3>
          <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
            {alertModal.message}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="primary-btn compact"
              onClick={() => setAlertModal({ open: false, message: "" })}
              style={{ minWidth: 80 }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>
    </>
  );

  if (embedded) {
    return content;
  }

  return <div className="agent-team-config__panel agent-team-config__panel--wide">{content}</div>;
}
