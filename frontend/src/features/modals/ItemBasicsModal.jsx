import { Modal } from "../../components/common/Modal";

export function ItemBasicsModal({ error, form, onChange, onClose, onSubmit, open }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>任务卡片</h3>
          <p>编辑当前任务的任务说明、交付标准和审核规则。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="item-basics-name">
          任务名称
        </label>
        <input
          id="item-basics-name"
          className="form-input"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
        />

        <label className="form-label" htmlFor="item-basics-description">
          任务说明
        </label>
        <textarea
          id="item-basics-description"
          className="form-input"
          rows="4"
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
        />

        <label className="form-label" htmlFor="item-basics-work">
          工作要求
        </label>
        <textarea
          id="item-basics-work"
          className="form-input"
          rows="4"
          value={form.work_requirement}
          onChange={(event) => onChange("work_requirement", event.target.value)}
        />

        <label className="form-label" htmlFor="item-basics-delivery">
          交付标准
        </label>
        <textarea
          id="item-basics-delivery"
          className="form-input"
          rows="4"
          value={form.delivery_requirement}
          onChange={(event) => onChange("delivery_requirement", event.target.value)}
        />

        <label className="modal-check">
          <input
            checked={form.need_superagent_review}
            onChange={(event) => onChange("need_superagent_review", event.target.checked)}
            type="checkbox"
          />
          <span>需要 SuperAgent 审核</span>
        </label>

        <label className="modal-check">
          <input
            checked={form.need_superone_review}
            onChange={(event) => onChange("need_superone_review", event.target.checked)}
            type="checkbox"
          />
          <span>需要用户审核</span>
        </label>

        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          保存修改
        </button>
      </div>
    </Modal>
  );
}
