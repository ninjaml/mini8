import { Modal } from "../../components/common/Modal";

export function SubmitResultModal({
  error,
  form,
  open,
  onChange,
  onClose,
  onFileChange,
  onSubmit,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>手动提交成果</h3>
          <p>文本内容必填，文件可选填。提交后会进入当前任务的成果记录。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label">成果标题</label>
        <input
          className="form-input"
          value={form.title}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="例如：竞品选题趋势图谱 v1"
        />

        <label className="form-label">成果说明 / 文本内容</label>
        <textarea
          className="form-input"
          rows="5"
          value={form.summary}
          onChange={(event) => onChange("summary", event.target.value)}
          placeholder="这里填写成果说明、结构摘要或纯文本内容。"
        />

        <label className="form-label">上传文件（可选）</label>
        <input className="form-input" type="file" multiple onChange={onFileChange} />
        {form.files.length ? (
          <div className="react-console-note">已选择 {form.files.length} 个文件</div>
        ) : null}
        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          确认提交
        </button>
      </div>
    </Modal>
  );
}
