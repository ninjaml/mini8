function statusClass(status) {
  if (status === "待审批") return "review";
  if (status === "已提交") return "active";
  if (status === "审核不通过") return "pending";
  return "pending";
}

export function ItemPage({
  currentPage,
  item,
  onApproveHistory,
  onChangePage,
  onDeleteHistory,
  onDeleteItem,
  onDownloadItemSkill,
  onOpenBasics,
  onOpenResultDetail,
  onOpenSubmitResult,
  onRefresh,
  onSetAgent,
  onUnsetAgent,
}) {
  const submissions = item?.submissions || [];
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(submissions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedSubmissions = submissions.slice(startIndex, startIndex + pageSize);
  const todoCount = submissions.reduce((sum, entry) => sum + (entry.todoCount || 0), 0);

  if (!item) {
    return (
      <section id="view-ws-items" className="view-container">
        <div className="view-empty">
          <strong>还没有任务被分配</strong>
          <div style={{ marginTop: 12, color: "var(--tx-muted)" }}>
            先从工作成员视图新增一名成员，或者直接新增第一项任务。
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="view-ws-items" className="view-container">
      <div className="page-head agents-head">
        <div>
          <h2>{item.title}</h2>
          <p>
            围绕当前任务查看任务卡片与成果提交记录；
            {item.ownerId
              ? `当前已绑定工作成员：${item.ownerName || ""}。`
              : "当前未绑定工作成员，因此不会显示对话框体。"}
          </p>
        </div>
        <div className="page-actions">
          {todoCount > 0 ? <span className="status-tag review">待办 {todoCount}</span> : null}
          <button className="secondary-btn" type="button" onClick={onDownloadItemSkill}>
            让智能体处理任务
          </button>
          <button className="secondary-btn" type="button" onClick={onOpenBasics}>
            任务卡片
          </button>
          {!item.ownerId ? (
            <button className="secondary-btn" type="button" onClick={onSetAgent}>
              设定工作成员
            </button>
          ) : (
            <button className="secondary-btn danger-btn" type="button" onClick={onUnsetAgent}>
              解绑工作成员
            </button>
          )}
          <button className="secondary-btn compact danger-btn" type="button" onClick={onDeleteItem}>
            删除任务
          </button>
        </div>
      </div>

      <div className="item-workbench">
        <div className="surface-card item-history-card">
          <div className="card-top">
            <div>
              <h3>工作成果</h3>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="secondary-btn compact" type="button" onClick={onRefresh}>
                刷新
              </button>
              <button className="primary-btn compact" type="button" onClick={onOpenSubmitResult}>
                手动提交成果
              </button>
            </div>
          </div>

          <div className="history-list">
            {pagedSubmissions.length ? (
              pagedSubmissions.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div className="work-item-top">
                    <div>
                      <h3>{entry.title}</h3>
                      <p>{entry.summary}</p>
                    </div>
                    <span className={`status-tag ${statusClass(entry.status)}`}>{entry.status}</span>
                  </div>
                  <div className="history-meta">
                    <span>提交人：{entry.submittedByName}</span>
                    <span>提交时间：{entry.time}</span>
                    <span>文件：{entry.fileCount ? `${entry.fileCount} 个文件` : "无附件"}</span>
                  </div>
                  <div className="card-actions">
                    <button className="secondary-btn compact" type="button" onClick={() => onOpenResultDetail(entry.id)}>
                      查看成果
                    </button>
                    {entry.todoCount > 0 ? (
                      <button className="primary-btn compact" type="button" onClick={() => onApproveHistory(entry.id)}>
                        审批
                      </button>
                    ) : null}
                    <button className="secondary-btn compact danger-btn" type="button" onClick={() => onDeleteHistory(entry.id)}>
                      删除成果
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-inline">当前还没有成果提交记录。</div>
            )}
          </div>
        </div>

        {submissions.length ? (
          <div className="history-pagination page-bottom-pagination">
            <button
              className="secondary-btn compact"
              type="button"
              onClick={() => onChangePage(-1)}
              disabled={safePage === 1}
            >
              上一页
            </button>
            <span>
              第 {safePage} / {totalPages} 页
            </span>
            <button
              className="secondary-btn compact"
              type="button"
              onClick={() => onChangePage(1)}
              disabled={safePage === totalPages}
            >
              下一页
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
