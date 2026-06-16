import { useState, useCallback } from "react";
import { openclawGateway } from "./openclawGateway";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";

export function ManagementTab({ data }) {
  const { agents, skills, tools, loading, error, toggleSkill, loadAll } = data;
  const [toggling, setToggling] = useState(new Set());
  const [config, setConfig] = useState({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", model: "", systemPrompt: "" });
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState(null);

  const handleToggle = async (skill) => {
    if (toggling.has(skill.name)) return;
    setToggling((prev) => new Set(prev).add(skill.name));
    try {
      await toggleSkill(skill.name, !skill.enabled);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  // 加载 Config
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const result = await openclawGateway.rpc("config.get");
      setConfig(result.config || result || {});
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // 更新 Config
  const updateConfig = useCallback(async (key, value) => {
    try {
      await openclawGateway.rpc("config.patch", { [key]: value });
      setConfig((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      setConfigError(err.message);
    }
  }, []);

  // 创建 Agent
  const createAgent = useCallback(async () => {
    if (!newAgent.name.trim()) return;
    try {
      await openclawGateway.rpc("agents.create", {
        name: newAgent.name.trim(),
        model: newAgent.model.trim() || undefined,
        systemPrompt: newAgent.systemPrompt.trim() || undefined,
      });
      setShowAddAgent(false);
      setNewAgent({ name: "", model: "", systemPrompt: "" });
      loadAll(); // 刷新列表
    } catch (err) {
      setConfigError(err.message);
    }
  }, [newAgent, loadAll]);

  // 删除 Agent
  const deleteAgent = useCallback(async (agentId) => {
    try {
      await openclawGateway.rpc("agents.delete", { id: agentId });
      setConfirmDeleteAgent(null);
      loadAll();
    } catch (err) {
      setConfigError(err.message);
    }
  }, [loadAll]);

  return (
    <div className="openclaw-tab-content openclaw-management">
      {/* Agents 管理 */}
      <div className="openclaw-management-section">
        <div className="openclaw-section-header">
          <h4>Agents</h4>
          <button type="button" className="openclaw-add-btn" onClick={() => setShowAddAgent(true)}>+ 新建</button>
        </div>
        {agents.length === 0 ? (
          <p className="openclaw-empty">暂无 Agent</p>
        ) : (
          <div className="openclaw-agent-list">
            {agents.map((agent) => (
              <div key={agent.id || agent.name} className="openclaw-agent-item">
                <div className="openclaw-agent-info">
                  <span className="openclaw-item-name">{agent.id}</span>
                  <span className="openclaw-item-meta">{agent.model?.primary || agent.model || ""}</span>
                </div>
                <button type="button" className="openclaw-action-btn danger" onClick={() => setConfirmDeleteAgent(agent)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills 管理 */}
      <div className="openclaw-management-section">
        <h4>Skills</h4>
        {skills.length === 0 ? (
          <p className="openclaw-empty">暂无 Skill</p>
        ) : (
          <div className="openclaw-skill-list">
            {skills.map((skill) => (
              <div key={skill.name} className="openclaw-skill-item">
                <div className="openclaw-skill-info">
                  <span className="openclaw-skill-name">{skill.name}</span>
                  <span className="openclaw-skill-desc">{skill.description || ""}</span>
                </div>
                <button
                  type="button"
                  className={`openclaw-toggle-btn ${skill.enabled ? "on" : "off"}`}
                  onClick={() => handleToggle(skill)}
                  disabled={toggling.has(skill.name)}
                >
                  {skill.enabled ? "已启用" : "已禁用"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tools 管理 */}
      <div className="openclaw-management-section">
        <h4>Tools</h4>
        {tools.length === 0 ? (
          <p className="openclaw-empty">暂无 Tool</p>
        ) : (
          <div className="openclaw-tool-list">
            {tools.map((tool) => (
              <div key={tool.name} className="openclaw-tool-item">
                <div className="openclaw-tool-info">
                  <span className="openclaw-tool-name">{tool.name}</span>
                  <span className="openclaw-tool-desc">{tool.description || ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config 管理 */}
      <div className="openclaw-management-section">
        <div className="openclaw-section-header">
          <h4>Config</h4>
          <button type="button" className="openclaw-action-btn" onClick={loadConfig} disabled={configLoading}>
            {configLoading ? "加载中..." : "加载"}
          </button>
        </div>
        {Object.keys(config).length === 0 ? (
          <p className="openclaw-empty">点击"加载"获取配置</p>
        ) : (
          <div className="openclaw-config-list">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="openclaw-config-item">
                <label className="openclaw-config-key">{key}</label>
                <div className="openclaw-config-row">
                  <input
                    className="openclaw-config-input"
                    value={typeof value === "object" ? JSON.stringify(value) : String(value)}
                    onChange={(e) => {
                      setConfig((prev) => ({ ...prev, [key]: e.target.value }));
                    }}
                  />
                  <button
                    type="button"
                    className="openclaw-action-btn"
                    onClick={() => {
                      const raw = config[key];
                      let parsed = raw;
                      // 尝试恢复原始类型（number/boolean/object/array）
                      if (typeof raw === "string") {
                        try { parsed = JSON.parse(raw); } catch { /* 保持字符串 */ }
                      }
                      updateConfig(key, parsed);
                    }}
                  >
                    保存
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {configError && <div className="openclaw-error-msg">{configError}</div>}
      </div>

      {/* 新建 Agent 弹窗 — 复用 Modal 组件 */}
      <Modal open={showAddAgent} onClose={() => setShowAddAgent(false)} title="新建 Agent">
        <div className="openclaw-form">
          <label>名称</label>
          <input value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))} placeholder="Agent 名称" />
          <label>模型</label>
          <input value={newAgent.model} onChange={(e) => setNewAgent((p) => ({ ...p, model: e.target.value }))} placeholder="例如: gpt-4o" />
          <label>系统提示词</label>
          <textarea value={newAgent.systemPrompt} onChange={(e) => setNewAgent((p) => ({ ...p, systemPrompt: e.target.value }))} placeholder="系统提示词..." rows={3} />
          <div className="openclaw-form-actions">
            <button type="button" onClick={() => setShowAddAgent(false)}>取消</button>
            <button type="button" onClick={createAgent} disabled={!newAgent.name.trim()}>创建</button>
          </div>
        </div>
      </Modal>

      {/* 删除 Agent 确认 */}
      <ConfirmDialog
        isOpen={!!confirmDeleteAgent}
        title="删除 Agent"
        message={`确认删除 Agent「${confirmDeleteAgent?.name || confirmDeleteAgent?.id}」吗？`}
        onConfirm={() => {
          if (confirmDeleteAgent) {
            deleteAgent(confirmDeleteAgent.id || confirmDeleteAgent.name);
          }
        }}
        onCancel={() => setConfirmDeleteAgent(null)}
      />

      {error && <div className="openclaw-error-msg">{error}</div>}
    </div>
  );
}
