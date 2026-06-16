import './ConfirmDialog.css';

export function ConfirmDialog({ isOpen, title, message, messagePreview, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h3>{title}</h3>
        </div>
        <div className="confirm-dialog-body">
          <p>{message}</p>
          {messagePreview && (
            <div className="confirm-dialog-preview">
              <div className="preview-label">消息内容：</div>
              <div className="preview-content">{messagePreview}</div>
            </div>
          )}
        </div>
        <div className="confirm-dialog-footer">
          <button className="confirm-dialog-btn cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-dialog-btn confirm-btn" onClick={onConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
