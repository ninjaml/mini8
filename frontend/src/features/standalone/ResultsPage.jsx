import { useEffect, useMemo, useState } from "react";

function statusClass(status) {
  if (status === "待审批") return "review";
  if (status === "已提交") return "active";
  if (status === "审核不通过") return "pending";
  return "pending";
}

export function ResultsPage({ onBack, onOpenResultDetail, workspace }) {
  const items = workspace?.items || [];
  const groupedItems = useMemo(
    () => items.filter((item) => item.submissions?.length),
    [items],
  );
  const [itemPage, setItemPage] = useState(1);
  const [resultPage, setResultPage] = useState(1);

  const itemPageSize = 1;
  const resultPageSize = 1;
  const totalItemPages = Math.max(1, Math.ceil(groupedItems.length / itemPageSize));
  const safeItemPage = Math.min(itemPage, totalItemPages);
  const currentItem = groupedItems[(safeItemPage - 1) * itemPageSize] || null;
  const currentSubmissions = currentItem?.submissions || [];
  const totalResultPages = Math.max(1, Math.ceil(currentSubmissions.length / resultPageSize));
  const safeResultPage = Math.min(resultPage, totalResultPages);
  const pagedSubmissions = currentSubmissions.slice(
    (safeResultPage - 1) * resultPageSize,
    safeResultPage * resultPageSize,
  );

  useEffect(() => {
    setItemPage(1);
    setResultPage(1);
  }, [groupedItems.length, workspace?.id]);

  useEffect(() => {
    setResultPage(1);
  }, [safeItemPage, currentItem?.id]);

  return (
    <section className="view-container">
      <div className="page-head">
        <div>
          <h2>{workspace?.name} · 项目成果库</h2>
          <p>当前项目的云端成果查看、下载与管理页面。</p>
        </div>
        <div className="page-actions">
          <button className="secondary-btn" type="button" onClick={onBack}>
            ← 返回项目首页
          </button>
        </div>
      </div>
      {groupedItems.length > 1 ? (
        <div className="results-item-switch-bar surface-card">
          <button
            className="secondary-btn compact"
            type="button"
            onClick={() => setItemPage((page) => Math.max(1, page - 1))}
            disabled={safeItemPage === 1}
          >
            上一个任务
          </button>
          <div className="results-item-switch-meta">
            <strong>{currentItem?.title}</strong>
            <span>
              任务 {safeItemPage} / {totalItemPages}
            </span>
          </div>
          <button
            className="secondary-btn compact"
            type="button"
            onClick={() => setItemPage((page) => Math.min(totalItemPages, page + 1))}
            disabled={safeItemPage === totalItemPages}
          >
            下一个任务
          </button>
        </div>
      ) : null}
      <div className="results-groups">
        {groupedItems.length ? (
          <div className="results-group surface-card">
            <div className="results-group-head">
              <h3>{currentItem?.title}</h3>
              <span className="item-badge count">{currentSubmissions.length}</span>
            </div>
            <div className="results-group-list">
              {pagedSubmissions.map((entry) => (
                <div key={entry.id} className="result-row-card">
                  <div className="result-row-main">
                    <div className="result-row-top">
                      <strong>{entry.title}</strong>
                      <span className={`status-tag ${statusClass(entry.status)}`}>{entry.status}</span>
                    </div>
                    <p>{entry.summary}</p>
                    <div className="history-meta">
                      <span>{entry.submittedByName}</span>
                      <span>{entry.time}</span>
                      <span>{entry.fileCount ? `${entry.fileCount} 个文件` : "无附件"}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      className="secondary-btn compact"
                      type="button"
                      onClick={() => onOpenResultDetail(entry.id)}
                    >
                      查看
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="results-pagination-shell">
              <div className="page-bottom-pagination results-pagination">
                <button
                  className="secondary-btn compact"
                  type="button"
                  onClick={() => setResultPage((page) => Math.max(1, page - 1))}
                  disabled={safeResultPage === 1}
                >
                  上一条成果
                </button>
                <span>
                  第 {safeResultPage} / {totalResultPages} 页
                </span>
                <button
                  className="secondary-btn compact"
                  type="button"
                  onClick={() => setResultPage((page) => Math.min(totalResultPages, page + 1))}
                  disabled={safeResultPage === totalResultPages}
                >
                  下一条成果
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="view-empty">当前工作空间还没有真实成果数据。</div>
        )}
      </div>
    </section>
  );
}
