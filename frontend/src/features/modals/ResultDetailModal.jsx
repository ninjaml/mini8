import { useEffect, useState } from "react";
import { Modal } from "../../components/common/Modal";

export function ResultDetailModal({
  downloadUrlBuilder,
  entry,
  fileUrlBuilder,
  open,
  previewUrlBuilder,
  onClose,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [entry?.id, open]);

  if (!entry) return null;

  const files = entry.files || [];
  const selectedFile = files[selectedIndex] || null;
  const previewable =
    selectedFile &&
    /\.(png|jpg|jpeg|gif|webp|svg|mp4|txt|md|json|py|js|ts|tsx|jsx|html|css)$/i.test(
      selectedFile.name,
    );

  return (
    <Modal className="large-modal" open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>成果详情</h3>
          <p>{entry.title}</p>
        </div>
        <div className="modal-header-actions">
          <button
            className="secondary-btn compact"
            type="button"
            onClick={() => window.open(downloadUrlBuilder(entry.id), "_blank")}
          >
            打包下载
          </button>
          {selectedFile ? (
            <button
              className="secondary-btn compact"
              type="button"
              onClick={() => window.open(fileUrlBuilder(entry.id, selectedFile.name), "_blank")}
            >
              下载当前文件
            </button>
          ) : null}
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <div className="result-detail-layout">
          <div className="result-detail-file-list">
            <div className="result-detail-section-title">文件列表</div>
            {files.length ? (
              files.map((file, index) => (
                <button
                  key={`${file.name}-${index}`}
                  className={`knowledge-tree-item knowledge-tree-item-file ${
                    selectedIndex === index ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className="knowledge-tree-main">📄 {file.name}</span>
                  <span className="knowledge-tree-kind">
                    {/\.(png|jpg|jpeg|gif|webp|svg|mp4|txt|md|json|py|js|ts|tsx|jsx|html|css)$/i.test(
                      file.name,
                    )
                      ? "可预览"
                      : "仅下载"}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-inline">当前成果没有附件，只有文本内容。</div>
            )}

            {(entry.superagentReviewStatus || entry.superoneReviewStatus) && (
              <>
                <div className="result-detail-section-title" style={{ marginTop: 24 }}>
                  审批历史
                </div>
                <div className="result-review-history">
                  {entry.superagentReviewStatus && (
                    <div className="review-history-item">
                      <div className="review-history-header">
                        <strong>SuperAgent 审批</strong>
                        <span
                          className={`status-tag ${
                            entry.superagentReviewStatus === "passed"
                              ? "active"
                              : entry.superagentReviewStatus === "rejected"
                                ? "pending"
                                : "review"
                          }`}
                        >
                          {entry.superagentReviewStatus === "passed"
                            ? "已通过"
                            : entry.superagentReviewStatus === "rejected"
                              ? "未通过"
                              : "待审批"}
                        </span>
                      </div>
                      {entry.superagentReviewNote && (
                        <div className="review-history-note">{entry.superagentReviewNote}</div>
                      )}
                    </div>
                  )}

                  {entry.superoneReviewStatus && (
                    <div className="review-history-item">
                      <div className="review-history-header">
                        <strong>人工审批</strong>
                        <span
                          className={`status-tag ${
                            entry.superoneReviewStatus === "passed"
                              ? "active"
                              : entry.superoneReviewStatus === "rejected"
                                ? "pending"
                                : "review"
                          }`}
                        >
                          {entry.superoneReviewStatus === "passed"
                            ? "已通过"
                            : entry.superoneReviewStatus === "rejected"
                              ? "未通过"
                              : "待审批"}
                        </span>
                      </div>
                      {entry.superoneReviewNote && (
                        <div className="review-history-note">{entry.superoneReviewNote}</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="result-detail-preview">
            <div className="result-detail-section-title">预览内容</div>
            {selectedFile ? (
              previewable ? (
                <div className="result-preview-shell">
                  {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(selectedFile.name) ? (
                    <img
                      alt={selectedFile.name}
                      className="result-preview-image"
                      src={previewUrlBuilder(entry.id, selectedFile.name)}
                    />
                  ) : /\.(mp4)$/i.test(selectedFile.name) ? (
                    <video
                      className="result-preview-video"
                      controls
                      src={previewUrlBuilder(entry.id, selectedFile.name)}
                    />
                  ) : (
                    <iframe
                      className="result-preview-frame"
                      src={previewUrlBuilder(entry.id, selectedFile.name)}
                      title={selectedFile.name}
                    />
                  )}
                </div>
              ) : (
                <div className="empty-inline">这个文件类型暂不支持直接预览，请下载后查看。</div>
              )
            ) : (
              <pre className="knowledge-preview-pre">
                {entry.previewText || entry.summary || "当前没有可预览内容。"}
              </pre>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
