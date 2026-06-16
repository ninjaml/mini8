import { Modal } from "../../components/common/Modal";

function Field({ label, value, copyable }) {
  const safe = value || "暂无";
  return (
    <section className="market-detail-section">
      <div className="market-detail-section-header">
        <h3>{label}</h3>
        {copyable && value && (
          <button
            className="market-detail-copy-btn"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
              } catch {}
            }}
          >
            复制
          </button>
        )}
      </div>
      <div className="market-detail-section-body">{safe}</div>
    </section>
  );
}

export default function DetailModal({ item, entity, onClose, onDownload }) {
  if (!item) return null;

  const tagText =
    (item.tags || []).map((t) => t.name).join("、") || "未分类";
  const isSkill = entity === "skills";
  const title = isSkill
    ? item.slug || `Skill #${item.id}`
    : item.name || `Prompt #${item.id}`;

  return (
    <Modal open={!!item} onClose={onClose}>
      <div className="market-modal-header">
        <h2>{title}</h2>
        <button className="market-modal-close" type="button" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="market-detail-content">
        <Field
          label={isSkill ? "中文名" : "名称"}
          value={isSkill ? item.chinese_name : item.name}
        />
        <Field label="版本" value={item.version} />
        <Field label="分类" value={tagText} />
        <Field label="摘要" value={item.summary} />
        <Field label="适用场景" value={item.use_for} />
        <Field label="不适用场景" value={item.not_for} />
        {isSkill && (
          <>
            <Field label="安装说明" value={item.skill_installation} copyable />
            <Field
              label="依赖安装说明"
              value={item.dependency_installation}
              copyable
            />
            {item.file_path && (
              <div className="market-detail-actions">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => onDownload(item.id, item.slug)}
                >
                  下载 Skill
                </button>
              </div>
            )}
          </>
        )}
        {!isSkill && <Field label="提示词内容" value={item.content} copyable />}
      </div>
    </Modal>
  );
}
