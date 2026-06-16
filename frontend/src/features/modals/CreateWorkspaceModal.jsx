import { Modal } from "../../components/common/Modal";

export function CreateWorkspaceModal({
  error,
  form,
  mode = "create",
  open,
  onChange,
  onClose,
  onSubmit,
}) {
  const isEdit = mode === "edit";
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>{isEdit ? "编辑工作空间" : "新增工作空间"}</h3>
          <p>
            {isEdit
              ? "修改当前工作空间的名称与核心目标。"
              : "先定义名称、SuperAgent 名称与核心目标，系统会据此初始化空间上下文。"}
          </p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="new-ws-name">
          名称
        </label>
        <input
          id="new-ws-name"
          className="form-input"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="例如：2026 Q2 增长专题作战"
        />

        {!isEdit && (
          <>
            <label className="form-label" htmlFor="new-ws-super-agent">
              给你的 SuperAgent 取个名字
            </label>
            <input
              id="new-ws-super-agent"
              className="form-input"
              value={form.super_agent_nick_name}
              onChange={(event) => onChange("super_agent_nick_name", event.target.value)}
              placeholder="默认：项目经理"
            />
          </>
        )}

        <label className="form-label" htmlFor="new-ws-goal">
          核心目标
        </label>
        <textarea
          id="new-ws-goal"
          className="form-input"
          rows="4"
          value={form.goal}
          onChange={(event) => onChange("goal", event.target.value)}
          placeholder="简要描述当前工作空间要解决的问题、目标和验收标准..."
        />

        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          {isEdit ? "保存" : "确认创建"}
        </button>
      </div>
    </Modal>
  );
}
