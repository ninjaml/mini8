import { Modal } from "../../components/common/Modal";

export function CreateItemModal({
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
          <h3>新增任务</h3>
          <p>定义任务名称、任务说明与交付标准。workAgent 可以后续再绑定。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="new-item-name">
          任务名
        </label>
        <input
          id="new-item-name"
          className="form-input"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="例如：竞品内容策略拆解"
        />

        <label className="form-label" htmlFor="new-item-description">
          任务说明
        </label>
        <textarea
          id="new-item-description"
          className="form-input"
          rows="4"
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="说明该任务要完成什么、背景是什么。"
        />

        <label className="form-label" htmlFor="new-item-work-requirement">
          工作要求
        </label>
        <textarea
          id="new-item-work-requirement"
          className="form-input"
          rows="4"
          value={form.work_requirement}
          onChange={(event) => onChange("work_requirement", event.target.value)}
          placeholder="说明这项工作需要做什么、参考哪些知识或数据。"
        />

        <label className="form-label" htmlFor="new-item-delivery-requirement">
          交付标准
        </label>
        <textarea
          id="new-item-delivery-requirement"
          className="form-input"
          rows="4"
          value={form.delivery_requirement}
          onChange={(event) => onChange("delivery_requirement", event.target.value)}
          placeholder="直接填写文字标准，不限制 JSON。"
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
          确认创建
        </button>
      </div>
    </Modal>
  );
}
