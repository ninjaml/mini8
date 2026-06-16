import { Modal } from "../../components/common/Modal";

export function EditKnowledgeModal({
  error,
  name,
  open,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>编辑知识库</h3>
          <p>这里只修改系统中的 Vault 名称，不修改 Obsidian 本地仓库本身。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label">Obsidian Vault 名称</label>
        <input
          className="form-input"
          value={name}
          onChange={(event) => onChange(event.target.value)}
        />
        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          保存
        </button>
      </div>
    </Modal>
  );
}
