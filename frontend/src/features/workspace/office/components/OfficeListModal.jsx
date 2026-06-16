import { Modal } from "../../../../components/common/Modal";

export function OfficeListModal({ open, title, items = [], emptyText, onSelect, onCreate, onClose, renderItem }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>{title}</h3>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body" style={{ minWidth: 280, maxHeight: 360, overflow: "auto" }}>
        {items.length === 0 ? (
          <p className="text-secondary">{emptyText}</p>
        ) : (
          <ul className="office-list-modal__items" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="office-list-modal__item"
                  onClick={() => onSelect(item.id)}
                >
                  {renderItem ? renderItem(item) : item.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {onCreate && (
        <div className="modal-footer">
          <button type="button" className="primary-btn" onClick={onCreate}>
            + 新建
          </button>
        </div>
      )}
    </Modal>
  );
}
