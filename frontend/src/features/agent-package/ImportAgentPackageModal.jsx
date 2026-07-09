import { useEffect, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { importAgentPackageFile } from "./agentPackageApi";

export function ImportAgentPackageModal({
  open,
  onClose,
  onImported,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("请先选择一个团队模板 ZIP 文件。");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const result = await importAgentPackageFile(selectedFile);
      await onImported?.(result);
      onClose?.();
    } catch (nextError) {
      setError(nextError.message || "导入团队模板失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose}>
      <div className="modal-header">
        <div>
          <h3>导入 Agent</h3>
          <p>选择一个 ZIP 文件，导入为新的全局 Agent；如果其中包含子Agent，也会一并导入。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose} disabled={submitting}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="agent-package-file">
          Agent ZIP
        </label>
        <input
          id="agent-package-file"
          className="form-input"
          type="file"
          accept=".zip,application/zip"
          disabled={submitting}
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] || null);
            setError("");
          }}
        />
        {selectedFile ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#64748b" }}>
            已选择：{selectedFile.name}
          </div>
        ) : null}
        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose} disabled={submitting}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "导入中..." : "确认导入"}
        </button>
      </div>
    </Modal>
  );
}
