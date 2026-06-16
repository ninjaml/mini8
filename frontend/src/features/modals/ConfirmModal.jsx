import { Modal } from "../../components/common/Modal";

export function ConfirmModal({
  confirmLabel = "确认",
  confirmTone = "danger",
  error = "",
  message,
  onClose,
  onConfirm,
  open,
  title,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>{title}</h3>
          <p>{message}</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn compact" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className={confirmTone === "primary" ? "primary-btn compact" : "secondary-btn compact danger-btn"}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
