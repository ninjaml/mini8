import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/api";
import { Modal } from "../../components/common/Modal";

export function AgentWorkingDirModal({ open, onClose, workingDirKind, agentRefId }) {
  const [dir, setDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !workingDirKind) {
      setDir("");
      setError("");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    api.getAgentWorkingDir({ kind: workingDirKind, refId: agentRefId })
      .then((r) => setDir(r.dir || ""))
      .catch(() => setDir(""))
      .finally(() => setIsLoading(false));
    setError("");
  }, [open, workingDirKind, agentRefId]);

  async function handlePickDir() {
    try {
      setPicking(true);
      setError("");
      const result = await api.pickWorkspaceWorkingDir();
      if (!result?.path) return;
      setDir(result.path);
    } catch (e) {
      setError(e.message || "选择目录失败");
    } finally {
      setPicking(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.updateAgentWorkingDir({
        kind: workingDirKind,
        refId: agentRefId,
        dir: dir.trim() || null,
      });
      onClose();
    } catch (e) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const titleMap = { moss: "MOSS", agent: "Agent" };

  return (
    <Modal open={open} onClose={onClose} className="modal-narrow">
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {titleMap[workingDirKind] || "Agent"} 工作目录
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              padding: 0,
              color: "#6b7280",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
            type="button"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
          留空则使用系统默认目录
        </p>

        {isLoading ? (
          <div style={{ padding: "16px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            正在加载...
          </div>
        ) : (
          <div className="workspace-working-dir-row">
            <input
              type="text"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="例如: D:\\Mini8\\moss"
              className="form-input workspace-working-dir-row__input"
              style={{
                marginBottom: 0,
                borderRadius: 4,
                padding: "8px 12px",
                fontSize: 13,
                backgroundColor: "#ffffff",
              }}
            />
            <button
              className="plain-btn workspace-working-dir-row__button"
              type="button"
              onClick={handlePickDir}
              disabled={picking || saving}
              style={{ minWidth: 112 }}
            >
              {picking ? "选择中..." : "选择目录"}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              margin: "8px 0 12px",
              padding: "8px 10px",
              borderRadius: 4,
              background: "rgba(186, 72, 72, 0.12)",
              border: "1px solid rgba(234, 102, 102, 0.25)",
              color: "#991b1b",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button
            onClick={onClose}
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              backgroundColor: "#ffffff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isLoading || picking}
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "none",
              borderRadius: 4,
              backgroundColor: saving || isLoading || picking ? "#e5e7eb" : "#10b981",
              color: saving || isLoading || picking ? "#9ca3af" : "#ffffff",
              cursor: saving || isLoading || picking ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
