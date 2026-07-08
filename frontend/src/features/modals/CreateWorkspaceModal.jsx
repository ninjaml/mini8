import { Modal } from "../../components/common/Modal";

export function CreateWorkspaceModal({
  error,
  form,
  mode = "create",
  open,
  onChange,
  onClose,
  onPickWorkingDir,
  onSubmit,
  pickingWorkingDir = false,
}) {
  const isEdit = mode === "edit";
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>{isEdit ? "编辑工作空间" : "新增工作空间"}</h3>
          <p>
            {isEdit
              ? "修改当前工作空间的名称、核心目标与共享工作目录。"
              : "先定义名称、核心目标与共享工作目录，系统只创建工作空间本体。"}
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
        <label className="form-label" htmlFor="new-ws-working-dir">
          工作目录
        </label>
        <div className="workspace-working-dir-row">
          <input
            id="new-ws-working-dir"
            className="form-input workspace-working-dir-row__input"
            value={form.working_dir}
            onChange={(event) => onChange("working_dir", event.target.value)}
            placeholder="例如：E:/Camphor/workspaces/q2-growth"
          />
          <button
            className="plain-btn workspace-working-dir-row__button"
            type="button"
            onClick={onPickWorkingDir}
            disabled={pickingWorkingDir}
          >
            {pickingWorkingDir ? "选择中..." : "选择目录"}
          </button>
        </div>

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
