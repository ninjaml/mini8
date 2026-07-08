import { Modal } from "../../components/common/Modal";

export function CreateKnowledgeModal({
  error,
  form,
  open,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>新增知识库</h3>
          <p>接入一个 Obsidian 知识库，填写真实 Vault 名、Local REST 端口和 API Key。Omnisearch 端口可选。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="new-knowledge-name">
          Obsidian Vault 名称
        </label>
        <input
          id="new-knowledge-name"
          className="form-input"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="例如：我的知识库"
        />

        <label className="form-label" htmlFor="new-knowledge-port">
          Local REST 端口
        </label>
        <input
          id="new-knowledge-port"
          className="form-input"
          inputMode="numeric"
          value={form.port}
          onChange={(event) => onChange("port", event.target.value)}
          placeholder="例如：27123"
        />

        <label className="form-label" htmlFor="new-knowledge-omnisearch-port">
          Omnisearch 端口（可选）
        </label>
        <input
          id="new-knowledge-omnisearch-port"
          className="form-input"
          inputMode="numeric"
          value={form.omnisearch_port}
          onChange={(event) => onChange("omnisearch_port", event.target.value)}
          placeholder="例如：51361"
        />

        <label className="form-label" htmlFor="new-knowledge-api-key">
          API Key
        </label>
        <input
          id="new-knowledge-api-key"
          className="form-input"
          value={form.api_key}
          onChange={(event) => onChange("api_key", event.target.value)}
          placeholder="填写 Obsidian Local REST API Key"
        />

        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          确认创建
        </button>
      </div>
    </Modal>
  );
}
