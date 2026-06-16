function parentPathOf(path) {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function Breadcrumb({ currentPath, onNavigate }) {
  if (!currentPath) {
    return (
      <div className="knowledge-breadcrumb">
        <span className="knowledge-breadcrumb-root">
          根目录
        </span>
      </div>
    );
  }

  const parts = currentPath.split("/").filter(Boolean);
  return (
    <div className="knowledge-breadcrumb">
      <button
        className="knowledge-breadcrumb-root"
        type="button"
        onClick={() => onNavigate("")}
      >
        根目录
      </button>
      {parts.map((part, index) => {
        const pathUpToHere = parts.slice(0, index + 1).join("/");
        const isLast = index === parts.length - 1;
        return (
          <span key={pathUpToHere} className="knowledge-breadcrumb-segment">
            <span className="knowledge-breadcrumb-separator">/</span>
            {isLast ? (
              <span className="knowledge-breadcrumb-current">{part}</span>
            ) : (
              <button
                type="button"
                className="knowledge-breadcrumb-link"
                onClick={() => onNavigate(pathUpToHere)}
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function KnowledgePage({
  browserState,
  knowledge,
  onOpenEntry,
  onOpenFolder,
  onOpenLocalObsidian,
  onDownloadKnowledgeSkill,
  onUnbindKnowledge,
}) {
  const entries = browserState?.entries || [];
  const currentPath = browserState?.currentPath || "";
  const selectedFile = browserState?.selectedFile || null;

  return (
    <section id="view-ws-kb" className="view-container">
      <div className="page-head">
        <div>
          <h2>{knowledge?.title || "知识库"}</h2>
          <p>{knowledge?.summary || "查看知识库目录、文件内容和绑定信息。"}</p>
        </div>
        <div className="page-actions">
          <button className="secondary-btn compact" type="button" onClick={onDownloadKnowledgeSkill}>
            让 Agent 使用知识库
          </button>
          <button className="secondary-btn compact danger-btn" type="button" onClick={onUnbindKnowledge}>
            解除绑定
          </button>
        </div>
      </div>

      <div className="knowledge-browser">
        <div className="surface-card knowledge-tree-panel">
          <div className="knowledge-tree-head">
            <h3>文件列表</h3>
            <div className="knowledge-tree-nav">
              <Breadcrumb currentPath={currentPath} onNavigate={onOpenFolder} />
              {currentPath ? (
                <button
                  className="knowledge-back-link"
                  type="button"
                  onClick={() => onOpenFolder(parentPathOf(currentPath))}
                >
                  ← 返回上一级
                </button>
              ) : null}
            </div>
          </div>

          <div className="knowledge-tree-list">
            {entries.length ? (
              entries.map((entry) => (
                <button
                  key={entry.path}
                  className={`knowledge-tree-item knowledge-tree-item-${entry.is_dir ? "dir" : "file"} ${
                    !entry.is_dir && selectedFile?.path === entry.path ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => (entry.is_dir ? onOpenFolder(entry.path) : onOpenEntry(entry.path))}
                >
                  <span className="knowledge-tree-main">{entry.is_dir ? "📁" : "📄"} {entry.name}</span>
                  <span className="knowledge-tree-kind">{entry.is_dir ? "文件夹 ›" : "文件"}</span>
                </button>
              ))
            ) : (
              <div className="empty-inline">当前目录还没有文件。</div>
            )}
          </div>
        </div>

        <div className="surface-card knowledge-preview-panel">
          {browserState?.loading ? (
            <div className="empty-inline">正在从本地 Obsidian 读取目录或文件内容...</div>
          ) : browserState?.error ? (
            <div className="empty-inline">{browserState.error}</div>
          ) : selectedFile ? (
            <>
              <div className="knowledge-preview-head">
                <div>
                  <strong>{selectedFile.name}</strong>
                  <div className="knowledge-preview-subtitle">{selectedFile.path}</div>
                </div>
              </div>
              <div className="knowledge-preview-body">
                <pre className="knowledge-preview-pre">{selectedFile.content || "当前文件没有可展示内容。"}</pre>
              </div>
            </>
          ) : (
            <div className="empty-inline">请选择左侧文件查看内容。</div>
          )}
        </div>

        <div className="knowledge-side-info">
          <button className="secondary-btn compact" type="button" onClick={onOpenLocalObsidian}>
            从本地打开 Obsidian
          </button>
          <div className="surface-card side-meta-card">
            <span>已绑定工作空间</span>
            <strong>{browserState?.workspaceName || "-"}</strong>
          </div>
          <div className="surface-card side-meta-card">
            <span>当前路径</span>
            <strong>{currentPath ? `/${currentPath}` : "/"}</strong>
          </div>
          <div className="surface-card side-meta-card">
            <span>当前目录统计</span>
            <strong>
              {entries.filter((entry) => entry.is_dir).length} 个目录 · {entries.filter((entry) => !entry.is_dir).length} 个文件 · 共 {entries.length} 项
            </strong>
          </div>
          <div className="surface-card side-meta-card">
            <span>接入方式</span>
            <strong>Obsidian Local REST API · 端口 {knowledge?.port || "-"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
