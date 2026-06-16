import { Modal } from "../../components/common/Modal";

export function CreateAgentModal({
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
          <h3>新增 workAgent</h3>
          <p>为当前工作空间添加一个 workAgent。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="new-agent-name">
          智能体名称
        </label>
        <input
          id="new-agent-name"
          className="form-input"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="例如：内容分析师"
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
