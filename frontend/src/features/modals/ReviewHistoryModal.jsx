import { Modal } from "../../components/common/Modal";

export function ReviewHistoryModal({
  error,
  note,
  onChangeNote,
  onClose,
  onPass,
  onReject,
  open,
  title,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>审批成果</h3>
          <p>{title ? `当前成果：${title}` : "确认通过或驳回当前成果。"}</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <label className="form-label" htmlFor="review-note">
          审批说明
        </label>
        <textarea
          id="review-note"
          className="form-input"
          rows="4"
          value={note}
          onChange={(event) => onChangeNote(event.target.value)}
          placeholder="填写审批意见。"
        />
        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn compact danger-btn" type="button" onClick={onReject}>
          确认驳回
        </button>
        <button className="primary-btn" type="button" onClick={onPass}>
          确认通过
        </button>
      </div>
    </Modal>
  );
}
