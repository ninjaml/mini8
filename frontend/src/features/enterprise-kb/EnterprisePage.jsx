import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Link2, FileText, GitBranch, Search, Shield, Settings, RefreshCw, Folder, FolderOpen, Download, BookOpen, Puzzle, Network, Globe, Bot, ChevronUp, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { api } from "../../lib/api";
import { Tooltip } from "../../components/common/Tooltip";
import { Modal } from "../../components/common/Modal";

const KB_SERVICE_KEY = "r2r_base_url";
const KB_LOGIN_KEY = "r2r_login_url";
const KB_SERVICE_DESCRIPTION = "R2R 团队知识图谱引擎连接地址";
const KB_LOGIN_DESCRIPTION = "R2R 团队知识图谱登录地址";

function KbConfigModal({
  open,
  serviceUrl,
  loginUrl,
  saving,
  error,
  onClose,
  onSave,
  onServiceUrlChange,
  onLoginUrlChange,
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ padding: 28 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>
          配置团队知识图谱连接
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          分别填写知识库业务地址和登录地址，保存后即可用于接口调用和后台跳转。
        </p>
        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#374151" }}>
          服务地址
        </label>
        <input
          className="form-input"
          type="text"
          placeholder="例如：http://localhost:8000"
          value={serviceUrl}
          onChange={(e) => onServiceUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave()}
          style={{ marginBottom: 16 }}
        />
        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#374151" }}>
          登录地址
        </label>
        <input
          className="form-input"
          type="text"
          placeholder="例如：http://localhost:8000"
          value={loginUrl}
          onChange={(e) => onLoginUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave()}
          style={{ marginBottom: error ? 8 : 16 }}
        />
        {error && (
          <div className="modal-inline-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button className="secondary-btn" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-btn" onClick={onSave} disabled={saving} type="button">
            {saving ? "保存中…" : "保存并连接"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CollectionSelector({ collections, selectedCollection, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!collections.length) {
    return <span style={{ color: "var(--tx-muted)" }}>暂无可用知识库</span>;
  }

  const current = selectedCollection || collections[0];
  return (
    <div className="enterprise-collection-select-custom" ref={ref}>
      <button
        className="enterprise-collection-select-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.name || `知识库 #${current.id}`}</span>
        <span className="enterprise-collection-select-arrow">{open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}</span>
      </button>
      {open && (
        <div className="enterprise-collection-select-dropdown">
          {collections.map((c) => (
            <div
              key={c.id}
              className={`enterprise-collection-select-option ${String(current.id) === String(c.id) ? "active" : ""}`}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              {c.name || `知识库 #${c.id}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FolderTreeRow({ node, level, selectedFolderId, expandedFolders, onToggle, onSelect }) {
  const isExpanded = expandedFolders.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`enterprise-folder-row ${selectedFolderId === String(node.id) ? "selected" : ""}`}
        style={{ paddingLeft: 28 + (level + 1) * 20 }}
        onClick={() => onSelect(String(node.id))}
      >
        <span
          className="enterprise-folder-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />) : <span>&nbsp;&nbsp;</span>}
        </span>
        <span className="enterprise-folder-icon"><Folder size={16} strokeWidth={1.5} /></span>
        <span className="enterprise-folder-name">{node.name}</span>
        {node.document_count > 0 && (
          <span className="enterprise-folder-badge">{node.document_count}</span>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeRow
              key={child.id}
              node={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnterpriseFolderTree({ folderTree, selectedFolderId, expandedFolders, onToggle, onSelect }) {
  return (
    <div className="enterprise-folder-tree">
      <div
        className={`enterprise-folder-row ${selectedFolderId === "root" ? "selected" : ""}`}
        style={{ paddingLeft: 28 }}
        onClick={() => onSelect("root")}
      >
        <span className="enterprise-folder-toggle">&nbsp;&nbsp;</span>
        <span className="enterprise-folder-icon"><FolderOpen size={16} strokeWidth={1.5} /></span>
        <span className="enterprise-folder-name">根目录</span>
      </div>
      {folderTree.map((node) => (
        <FolderTreeRow
          key={node.id}
          node={node}
          level={0}
          selectedFolderId={selectedFolderId}
          expandedFolders={expandedFolders}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DocumentList({ documents, onPreview, onDownload, primaryKey }) {
  if (!documents.length) {
    return <div className="enterprise-empty">当前文件夹下暂无文档</div>;
  }
  return (
    <div className="enterprise-doc-list">
      {documents.map((doc) => (
        <div key={doc.id} className="enterprise-doc-row">
          <span className="enterprise-doc-icon"><FileText size={16} strokeWidth={1.5} /></span>
          <Tooltip text="点击预览">
            <span className="enterprise-doc-name" onClick={() => onPreview(doc)}>
              {doc.file_name || doc.title || `文档 #${doc.id}`}
            </span>
          </Tooltip>
          <span className="enterprise-doc-meta">
            {doc.mime_type ? doc.mime_type.split("/").pop()?.toUpperCase() : ""}
          </span>
          <Tooltip text="下载">
            <button
              className="enterprise-doc-download"
              onClick={() => onDownload(doc.id, doc.file_name)}
            >
              <Download size={14} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

function DocumentPreviewModal({ document: doc, primaryKey, onClose }) {
  if (!doc) return null;

  const [isLoading, setIsLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const downloadUrl = api.getEnterpriseDocumentDownloadUrl(primaryKey, doc.id);
  const mimeType = doc.mime_type || "";

  useEffect(() => {
    setIsLoading(true);
    setPreviewUrl(null);
    setPreviewError("");

    // 图片直接用原 URL，其他类型先 fetch 检查状态
    if (mimeType.startsWith("image/")) {
      setPreviewUrl(downloadUrl);
      return;
    }

    let revoked = false;
    fetch(downloadUrl)
      .then(async (res) => {
        if (!res.ok) {
          let msg = `加载失败 (${res.status})`;
          try {
            const data = await res.json();
            if (data.detail) msg = data.detail;
          } catch {
            const text = await res.text();
            if (text) msg = text.slice(0, 200);
          }
          throw new Error(msg);
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        if (revoked) return;
        setPreviewError(err.message || "文件加载失败");
        setIsLoading(false);
      });

    return () => {
      revoked = true;
    };
  }, [doc?.id, downloadUrl, mimeType]);

  const loadingOverlay = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #1e1e2e)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid rgba(255,255,255,0.1)",
          borderTopColor: "var(--tx-accent, #6366f1)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <span style={{ marginLeft: 12, color: "var(--tx-muted)", fontSize: 14 }}>加载中…</span>
    </div>
  );

  const errorOverlay = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #1e1e2e)",
        zIndex: 10,
        gap: 16,
        padding: 24,
      }}
    >
      <p style={{ color: "#ef4444", fontSize: 15, margin: 0, textAlign: "center" }}>
        {previewError}
      </p>
      <a href={downloadUrl} download className="btn btn-primary" style={{ textDecoration: "none" }}>
        点击下载文件
      </a>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "80vw",
          height: "80vh",
          background: "var(--bg-primary, #1e1e2e)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="form-modal-header">
          <h2><FileText size={20} strokeWidth={1.5} style={{ verticalAlign: "-3px", marginRight: 6 }} /> {doc.file_name || doc.title || "文档预览"}</h2>
          <button className="form-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="form-modal-body" style={{ flex: 1, overflow: "hidden", padding: 0, position: "relative" }}>
          {isLoading && loadingOverlay}
          {previewError && errorOverlay}
          {mimeType.startsWith("image/") ? (
            <img
              src={previewUrl}
              alt={doc.file_name}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setPreviewError("图片加载失败");
              }}
              style={{ maxWidth: "100%", maxHeight: "100%", display: "block", margin: "0 auto" }}
            />
          ) : mimeType === "application/pdf" ? (
            previewUrl && (
              <iframe
                src={previewUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="PDF Preview"
              />
            )
          ) : mimeType.startsWith("text/") || mimeType === "application/json" ? (
            previewUrl && (
              <iframe
                src={previewUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Text Preview"
              />
            )
          ) : (
            <div className="enterprise-preview-unsupported">
              <p>此文件类型不支持在线预览</p>
              <a href={downloadUrl} download>点击下载</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrowseTab({ enterpriseKB, primaryKey, setAlertModal }) {
  const {
    collections, selectedCollection, folderTree, selectedFolderId,
    documents, previewDocument, expandedFolders,
    selectCollection, toggleFolder, selectFolder, setPreviewDocument,
    setSelectedFolderId, loadDocuments,
    loading, error,
  } = enterpriseKB;

  const [docKeyword, setDocKeyword] = useState("");
  const [docMimeType, setDocMimeType] = useState("");
  const isSearchMode = selectedFolderId === null;

  function handleDocSearch() {
    if (!selectedCollection || !primaryKey) return;
    loadDocuments(primaryKey, selectedCollection.id, null, docKeyword.trim() || null, docMimeType || null);
  }

  function handleDocReset() {
    setDocKeyword("");
    setDocMimeType("");
    if (!selectedCollection || !primaryKey) return;
    loadDocuments(primaryKey, selectedCollection.id, null);
  }

  function enterAllDocs() {
    setDocKeyword("");
    setDocMimeType("");
    setSelectedFolderId(null);
    if (!selectedCollection || !primaryKey) return;
    loadDocuments(primaryKey, selectedCollection.id, null);
  }

  function selectFolderWithReset(folderId) {
    setDocKeyword("");
    setDocMimeType("");
    selectFolder(folderId, primaryKey, selectedCollection?.id);
  }

  async function handleDownload(documentId, fileName) {
    if (!primaryKey) return;
    try {
      const blob = await api.downloadEnterpriseDocument(primaryKey, documentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "download.bin";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setAlertModal({ open: true, message: e.message || "下载失败" });
    }
  }

  return (
    <div className="enterprise-browse">
      <div className="enterprise-toolbar">
        <div className="enterprise-collection-select-wrap">
          <span className="enterprise-collection-select-label">你的知识库：</span>
          <CollectionSelector
            collections={collections}
            selectedCollection={selectedCollection}
            onChange={(c) => {
              setDocKeyword("");
              setDocMimeType("");
              selectCollection(c, primaryKey);
            }}
          />
        </div>
      </div>
      {error && <div className="enterprise-error">{error}</div>}
      <div className="enterprise-browse-layout">
        <div className="enterprise-browse-left">
          <button
            className={`enterprise-all-docs-btn ${isSearchMode ? "selected" : ""}`}
            onClick={enterAllDocs}
          >
            <span><FolderOpen size={16} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 全部文档</span>
            {documents.length > 0 && <span className="enterprise-folder-badge">{documents.length}</span>}
          </button>
          <EnterpriseFolderTree
            folderTree={folderTree}
            selectedFolderId={selectedFolderId}
            expandedFolders={expandedFolders}
            onToggle={toggleFolder}
            onSelect={selectFolderWithReset}
          />
        </div>
        <div className="enterprise-browse-center">
          {isSearchMode && (
            <div className="enterprise-doc-search-bar">
              <input
                className="enterprise-doc-search-input"
                type="text"
                placeholder="搜索文件名或标题..."
                value={docKeyword}
                onChange={(e) => setDocKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDocSearch()}
              />
              <select
                className="enterprise-doc-search-type"
                value={docMimeType}
                onChange={(e) => setDocMimeType(e.target.value)}
              >
                <option value="">全部类型</option>
                <option value="pdf">PDF</option>
                <option value="word">Word</option>
                <option value="xls">Excel</option>
                <option value="ppt">PPT</option>
                <option value="text">文本</option>
                <option value="other">其他</option>
              </select>
              <button className="enterprise-doc-search-btn" onClick={handleDocSearch}><Search size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 3 }} /> 搜索</button>
              <button className="enterprise-doc-search-reset" onClick={handleDocReset}><RefreshCw size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 3 }} /> 重置</button>
            </div>
          )}
          {loading ? (
            <div className="enterprise-loading">加载中...</div>
          ) : (
            <DocumentList
              documents={documents}
              onPreview={setPreviewDocument}
              onDownload={handleDownload}
              primaryKey={primaryKey}
            />
          )}
        </div>
      </div>
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          primaryKey={primaryKey}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
}

function ChunkResult({ chunk, index }) {
  const [expanded, setExpanded] = useState(false);
  const text = chunk?.text || chunk?.metadata?.text || "(无文本内容)";
  const score = chunk?.score ?? null;
  const preview = text.length > 100 ? text.slice(0, 100) + "..." : text;

  return (
    <div className="enterprise-chunk-item">
      <div
        className="enterprise-chunk-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: "pointer" }}
      >
        <span className="enterprise-chunk-index">[{index + 1}]</span>
        <span className="enterprise-chunk-preview" title={text}>{preview}</span>
        {score !== null && (
          <span className="enterprise-chunk-score">score: {Number(score).toFixed(3)}</span>
        )}
        <span className="enterprise-chunk-toggle">{expanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}</span>
      </div>
      {expanded && (
        <div className="enterprise-chunk-body">
          <div className="enterprise-chunk-text">{text}</div>
        </div>
      )}
    </div>
  );
}

function GraphEntity({ item, index }) {
  const content = item?.content || {};
  const name = content?.name || "(未命名实体)";
  const description = content?.description || "(无描述)";
  return (
    <div className="enterprise-graph-card entity">
      <div className="enterprise-graph-card-title">{name}</div>
      {content?.category && <div className="enterprise-graph-card-meta">{content.category}</div>}
      <div className="enterprise-graph-card-desc">{description}</div>
    </div>
  );
}

function GraphRelationship({ item, index }) {
  const content = item?.content || {};
  const subject = content?.subject || "?";
  const predicate = content?.predicate || "?";
  const object = content?.object || "?";
  return (
    <div className="enterprise-graph-card relationship">
      <div className="enterprise-graph-card-title">
        {subject} → <em>{predicate}</em> → {object}
      </div>
      {content?.description && <div className="enterprise-graph-card-desc">{content.description}</div>}
    </div>
  );
}

function GraphCommunity({ item, index }) {
  const content = item?.content || {};
  const name = content?.name || "(未命名社区)";
  const summary = content?.summary || "(无摘要)";
  return (
    <div className="enterprise-graph-card community">
      <div className="enterprise-graph-card-title">{name}</div>
      <div className="enterprise-graph-card-desc">{summary}</div>
    </div>
  );
}

function GraphResult({ item, index }) {
  const content = item?.content || {};
  if (content?.subject && content?.predicate && content?.object) {
    return <GraphRelationship item={item} index={index} />;
  }
  if (content?.summary !== undefined) {
    return <GraphCommunity item={item} index={index} />;
  }
  return <GraphEntity item={item} index={index} />;
}

function CollapsibleSourceItem({ index, title, tip, body, score, extra }) {
  const [expanded, setExpanded] = useState(false);
  const preview = title.length > 80 ? title.slice(0, 80) + "..." : title;
  return (
    <div className="enterprise-chunk-item">
      <div
        className="enterprise-chunk-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: "pointer" }}
      >
        <span className="enterprise-chunk-index">[{index + 1}]</span>
        <span className="enterprise-chunk-preview" title={tip || title}>{preview}</span>
        {score !== null && (
          <span className="enterprise-chunk-score">score: {Number(score).toFixed(3)}</span>
        )}
        <span className="enterprise-chunk-toggle">{expanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}</span>
      </div>
      {expanded && (
        <div className="enterprise-chunk-body">
          <div className="enterprise-chunk-text">{body}</div>
          {extra}
        </div>
      )}
    </div>
  );
}

function SearchTab({ enterpriseKB, primaryKey }) {
  const { collections, searchResults, ragResult, loading, doSearch, doRag } = enterpriseKB;
  const [query, setQuery] = useState("");
  const [useHybrid, setUseHybrid] = useState(false);
  const [useGraph, setUseGraph] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [limit, setLimit] = useState(10);
  const [graphEntityLimit, setGraphEntityLimit] = useState(10);
  const [graphRelationshipLimit, setGraphRelationshipLimit] = useState(10);
  const [graphCommunityLimit, setGraphCommunityLimit] = useState(5);
  const [ragSourcesExpanded, setRagSourcesExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function buildPayload() {
    const payload = {
      query: query.trim(),
      collection_ids: selectedCollectionIds.length ? selectedCollectionIds : null,
      limit: Number(limit) || 10,
      use_hybrid_search: useHybrid,
      use_graph_search: useGraph,
    };
    if (useGraph) {
      payload.graph_limits = {
        entity: Number(graphEntityLimit) || 10,
        relationship: Number(graphRelationshipLimit) || 10,
        community: Number(graphCommunityLimit) || 5,
      };
    }
    return payload;
  }

  function handleSearch() {
    if (!query.trim() || !primaryKey) return;
    doSearch(primaryKey, buildPayload());
  }

  function handleRag() {
    if (!query.trim() || !primaryKey) return;
    doRag(primaryKey, buildPayload());
  }

  function toggleCollection(cid) {
    setSelectedCollectionIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  }

  const results = searchResults?.results || searchResults;
  const chunks = results?.chunk_search_results || results?.chunks || [];
  const graphs = results?.graph_search_results || [];

  return (
    <div className="enterprise-search">
      <div className="enterprise-search-bar">
        <input
          className="enterprise-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="输入检索词..."
        />
        <button className="enterprise-rag-btn" onClick={handleRag} disabled={loading}>
          <Bot size={16} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Agent
        </button>
        <button className="enterprise-search-btn" onClick={handleSearch} disabled={loading}>
          {loading ? <RefreshCw size={14} strokeWidth={2} className="spinning" /> : <Search size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 3 }} />} 搜索
        </button>
      </div>
      <div className="enterprise-search-options">
        <label className="enterprise-toggle">
          <input type="checkbox" checked={useHybrid} onChange={(e) => setUseHybrid(e.target.checked)} />
          <span>混合检索</span>
        </label>
        <label className="enterprise-toggle">
          <input type="checkbox" checked={useGraph} onChange={(e) => setUseGraph(e.target.checked)} />
          <span>图谱检索</span>
        </label>
        <button
          className={`enterprise-advanced-toggle ${advancedOpen ? "open" : ""}`}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
          <span>高级</span>
          {advancedOpen ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
        </button>
      </div>

      {advancedOpen && (
        <div className="enterprise-advanced-panel">
          <div className="enterprise-advanced-section">
            <h5 className="enterprise-advanced-section-title">基础设置</h5>
            <div className="enterprise-advanced-row">
              <label className="enterprise-advanced-param">
                <span>结果数</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 10)}
                />
              </label>
            </div>
          </div>

          {useGraph && (
            <div className="enterprise-advanced-section">
              <h5 className="enterprise-advanced-section-title">图谱检索参数</h5>
              <div className="enterprise-advanced-row">
                <label className="enterprise-advanced-param">
                  <span>实体数</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={graphEntityLimit}
                    onChange={(e) => setGraphEntityLimit(Number(e.target.value) || 10)}
                  />
                </label>
                <label className="enterprise-advanced-param">
                  <span>关系数</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={graphRelationshipLimit}
                    onChange={(e) => setGraphRelationshipLimit(Number(e.target.value) || 10)}
                  />
                </label>
                <label className="enterprise-advanced-param">
                  <span>社区数</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={graphCommunityLimit}
                    onChange={(e) => setGraphCommunityLimit(Number(e.target.value) || 5)}
                  />
                </label>
              </div>
            </div>
          )}

          {collections.length > 0 && (
            <div className="enterprise-advanced-section">
              <h5 className="enterprise-advanced-section-title">限定范围</h5>
              <div className="enterprise-advanced-collections">
                {collections.map((c) => (
                  <label key={c.id} className="enterprise-advanced-collection-chip">
                    <input
                      type="checkbox"
                      checked={selectedCollectionIds.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                    />
                    <span>{c.name || `#${c.id}`}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {loading && <div className="enterprise-loading">检索中...</div>}
      {ragResult && (
        <div className="enterprise-rag-result">
          <h4><Bot size={16} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Agent 回答</h4>
          <div className="enterprise-rag-content" style={{ whiteSpace: "pre-wrap" }}>
            {(() => {
              const answer =
                ragResult?.results?.generated_answer ??
                (Array.isArray(ragResult?.results)
                  ? ragResult?.results?.[0]?.generated_answer
                  : null) ??
                ragResult?.generated_answer ??
                "";
              if (answer) return answer;
              const completion = ragResult?.results?.completion ?? ragResult?.completion;
              if (completion) return completion;
              return JSON.stringify(ragResult, null, 2);
            })()}
          </div>
          {(() => {
            const rawResults =
              ragResult?.results?.search_results ??
              ragResult?.results ??
              (Array.isArray(ragResult?.results) ? ragResult?.results?.[0]?.search_results : null) ??
              {};
            const chunks = rawResults?.chunk_search_results ?? rawResults?.chunks ?? [];
            const graphs = rawResults?.graph_search_results ?? [];
            const entities = graphs.filter((g) => g?.result_type === "entity");
            const relationships = graphs.filter((g) => g?.result_type === "relationship");
            const totalCount = chunks.length + entities.length + relationships.length;
            if (!totalCount) return null;
            return (
              <div className="enterprise-rag-sources">
                <button
                  className="enterprise-rag-sources-toggle"
                  onClick={() => setRagSourcesExpanded((v) => !v)}
                  title={ragSourcesExpanded ? "收起引用来源" : "展开引用来源"}
                >
                  <span>{ragSourcesExpanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}</span>
                  <span><BookOpen size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 引用来源 ({totalCount})</span>
                </button>
                {ragSourcesExpanded && (
                  <div className="enterprise-rag-sources-body">
                    {chunks.length > 0 && (
                      <div className="enterprise-rag-source-group">
                        <div className="enterprise-rag-source-group-title"><FileText size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 向量引用 ({chunks.length})</div>
                        {chunks.map((chunk, i) => (
                          <ChunkResult key={chunk.id || `c-${i}`} chunk={chunk} index={i} />
                        ))}
                      </div>
                    )}
                    {entities.length > 0 && (
                      <div className="enterprise-rag-source-group">
                        <div className="enterprise-rag-source-group-title"><Puzzle size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 实体引用 ({entities.length})</div>
                        {entities.map((item, i) => (
                          <CollapsibleSourceItem
                            key={item.id || `e-${i}`}
                            index={i}
                            title={item?.content?.name || "实体"}
                            tip={item?.content?.description || ""}
                            body={item?.content?.description || "(无描述)"}
                            score={item?.score ?? null}
                            extra={
                              item?.content?.category ? (
                                <div className="enterprise-chunk-text" style={{ marginTop: 8, opacity: 0.7 }}>
                                  类别: {item.content.category}
                                </div>
                              ) : null
                            }
                          />
                        ))}
                      </div>
                    )}
                    {relationships.length > 0 && (
                      <div className="enterprise-rag-source-group">
                        <div className="enterprise-rag-source-group-title"><Network size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 关系引用 ({relationships.length})</div>
                        {relationships.map((item, i) => (
                          <CollapsibleSourceItem
                            key={item.id || `r-${i}`}
                            index={i}
                            title={`${item?.content?.subject || "?"} → ${item?.content?.predicate || "?"} → ${item?.content?.object || "?"}`}
                            tip={item?.content?.description || ""}
                            body={item?.content?.description || "(无描述)"}
                            score={item?.score ?? null}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {searchResults && (
        <div className="enterprise-search-results">
          {chunks.length > 0 && (
            <>
              <h4><Search size={16} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 向量检索结果 ({chunks.length}条)</h4>
              {chunks.map((chunk, i) => (
                <ChunkResult key={i} chunk={chunk} index={i} />
              ))}
            </>
          )}
          {graphs.length > 0 && (
            <div className="enterprise-graph-results">
              <h4><Globe size={16} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 图谱检索结果 ({graphs.length}条)</h4>
              <div className="enterprise-graph-list">
                {graphs.map((item, i) => (
                  <GraphResult key={i} item={item} index={i} />
                ))}
              </div>
            </div>
          )}
          {chunks.length === 0 && graphs.length === 0 && (
            <div className="enterprise-empty">未找到相关结果</div>
          )}
        </div>
      )}
    </div>
  );
}

function getKbConfigEntry(configs, key) {
  return configs.find((item) => item.key === key) || null;
}

async function loadKbConfigValues() {
  const existing = await api.getKbConfigs();
  const configs = Array.isArray(existing) ? existing : [];
  return {
    configs,
    serviceUrl: getKbConfigEntry(configs, KB_SERVICE_KEY)?.value?.trim() || "",
    loginUrl: getKbConfigEntry(configs, KB_LOGIN_KEY)?.value?.trim() || "",
  };
}

async function saveKbConfigValues({ serviceUrl, loginUrl }) {
  const { configs } = await loadKbConfigValues();
  const entries = [
    { key: KB_SERVICE_KEY, value: serviceUrl, description: KB_SERVICE_DESCRIPTION },
    { key: KB_LOGIN_KEY, value: loginUrl, description: KB_LOGIN_DESCRIPTION },
  ];

  for (const entry of entries) {
    const existing = getKbConfigEntry(configs, entry.key);
    if (existing) {
      await api.updateKbConfig(existing.id, {
        value: entry.value,
        description: existing.description || entry.description,
      });
      continue;
    }
    await api.createKbConfig(entry);
  }
}

function KbIntroView({ primaryKey, onEnter, onOpenConfig, configVersion }) {
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState(null);

  const features = [
    {
      icon: <FileText size={22} strokeWidth={2} />,
      title: "全格式知识入库",
      desc: "PDF、Word、Excel、PPT、Markdown、CSV、邮件… 全格式自动解析，智能分块，无需人工整理。",
    },
    {
      icon: <GitBranch size={22} strokeWidth={2} />,
      title: "知识图谱自动构建",
      desc: "上传即抽取。实体、关系、社区自动识别，3D 可视化呈现团队知识网络，肉眼可见的知识关联。",
    },
    {
      icon: <Search size={22} strokeWidth={2} />,
      title: "语义检索 + 图谱增强",
      desc: "不是简单的关键词匹配。理解你的问题意图，从文档片段、知识实体、关系网络、社区摘要四个维度同时召回答案。",
    },
    {
      icon: <Shield size={22} strokeWidth={2} />,
      title: "团队级权限管控",
      desc: "知识库级授权、文件夹级管理、读写权限分离，系统管理员 + 群组 admin 双重管控，安全与灵活兼得。",
    },
  ];

  async function checkStatus() {
    setChecking(true);
    try {
      const result = await api.getEnterpriseStatus();
      setStatus(result);
    } catch (e) {
      setStatus({ enabled: false });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!primaryKey) {
      setChecking(false);
      return;
    }
    checkStatus();
  }, [primaryKey, configVersion]);

  return (
    <section className="enterprise-page view-container">
      <div className="enterprise-kb-hero">
        <div className="enterprise-kb-hero-content">
          <div className="enterprise-kb-hero-icon"><Database size={36} strokeWidth={1.5} /></div>
          <h1 className="enterprise-kb-hero-title">
            Mini8 知识图谱
          </h1>
          <p className="enterprise-kb-hero-subtitle">
            你的团队记忆，不再沉睡
          </p>
          <p className="enterprise-kb-hero-desc">
            这是为你的团队打造的 <strong>第二大脑</strong>——
            自动阅读、理解、关联、记住每一份文档，让知识真正流动起来。
          </p>
          <div className="enterprise-kb-api-badge">
            <Link2 size={14} strokeWidth={2} />
            通过 API 深度接入 · 外部系统可调用完整接口，将知识检索能力无缝嵌入任意工作流
          </div>
        </div>
      </div>

      <div className="enterprise-kb-status-bar">
        <div className="enterprise-kb-status-left">
          {checking ? (
            <>
              <span className="enterprise-kb-status-dot" style={{ background: "#9ca3af", boxShadow: "0 0 0 3px rgba(156,163,175,0.15)", animation: "pulse 1.5s ease-in-out infinite" }} />
              <span>正在检查知识库连接…</span>
            </>
          ) : status?.enabled ? (
            <>
              <span className="enterprise-kb-status-dot connected" />
              <span>知识库已连接</span>
            </>
          ) : (
            <>
              <span className="enterprise-kb-status-dot disconnected" />
              <span>知识库未连接</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!checking && status?.enabled && (
            <button
              className="enterprise-kb-config-btn"
              onClick={() => onEnter && onEnter()}
              type="button"
              style={{ background: "#10b981", color: "#fff", borderColor: "#10b981" }}
            >
              进入知识库
            </button>
          )}
          <button
            className="enterprise-kb-config-btn"
            onClick={() => checkStatus()}
            disabled={checking}
            type="button"
            title="刷新连接状态"
            style={{ opacity: checking ? 0.6 : 1, cursor: checking ? "not-allowed" : "pointer" }}
          >
            <RefreshCw size={14} strokeWidth={2} style={{ animation: checking ? "spin 1s linear infinite" : "none" }} />
            刷新
          </button>
          <button
            className="enterprise-kb-config-btn"
            onClick={() => onOpenConfig && onOpenConfig()}
            type="button"
            style={{ background: "#10b981", color: "#fff", borderColor: "#10b981" }}
          >
            <Settings size={14} strokeWidth={2} />
            连接知识库
          </button>
        </div>
      </div>

      <div className="enterprise-kb-features">
        <div className="enterprise-kb-features-grid">
          {features.map((f, i) => (
            <div key={i} className="enterprise-kb-feature-card">
              <div className="enterprise-kb-feature-icon-wrap">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function EnterprisePage({ enterpriseKB, auth }) {
  const primaryKey = auth?.user_id || "";
  const [entered, setEntered] = useState(() => {
    return sessionStorage.getItem("enterpriseKbEntered") === "true";
  });
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });
  const [showConfig, setShowConfig] = useState(false);
  const [configUrl, setConfigUrl] = useState("");
  const [configLoginUrl, setConfigLoginUrl] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configVersion, setConfigVersion] = useState(0);

  const loadConfigIntoForm = useCallback(async () => {
    const values = await loadKbConfigValues();
    setConfigUrl(values.serviceUrl);
    setConfigLoginUrl(values.loginUrl);
    return values;
  }, []);

  const closeConfigModal = useCallback(() => {
    setShowConfig(false);
    setConfigError("");
  }, []);

  const openConfigModal = useCallback(async () => {
    setConfigError("");
    setShowConfig(true);
    try {
      await loadConfigIntoForm();
    } catch (e) {
      setConfigError(e.message || "读取配置失败");
    }
  }, [loadConfigIntoForm]);

  const handleSaveConfig = useCallback(async () => {
    const serviceUrl = configUrl.trim();
    const loginUrl = configLoginUrl.trim();

    if (!serviceUrl) {
      setConfigError("请输入服务地址");
      return;
    }
    if (!loginUrl) {
      setConfigError("请输入登录地址");
      return;
    }

    setSavingConfig(true);
    setConfigError("");
    try {
      await saveKbConfigValues({ serviceUrl, loginUrl });
      setConfigUrl(serviceUrl);
      setConfigLoginUrl(loginUrl);
      setConfigVersion((value) => value + 1);
      setShowConfig(false);
    } catch (e) {
      setConfigError(e.message || "保存配置失败");
    } finally {
      setSavingConfig(false);
    }
  }, [configLoginUrl, configUrl]);

  const handleOpenAdmin = useCallback(() => {
    const loginUrl = configLoginUrl.trim();
    if (!loginUrl) {
      setAlertModal({ open: true, message: "请先配置知识库登录地址" });
      return;
    }
    window.open(loginUrl, "_blank", "noopener,noreferrer");
  }, [configLoginUrl]);

  const handleEnter = useCallback(() => {
    setEntered(true);
    sessionStorage.setItem("enterpriseKbEntered", "true");
    if (primaryKey) {
      enterpriseKB.loadCollections(primaryKey).then((firstCollection) => {
        if (firstCollection) {
          enterpriseKB.selectCollection(firstCollection, primaryKey);
        }
      });
    }
  }, [primaryKey, enterpriseKB]);

  useEffect(() => {
    loadConfigIntoForm().catch(() => {});
  }, [loadConfigIntoForm, configVersion]);

  // 刷新页面后 entered 从 sessionStorage 恢复时，自动加载知识库列表
  useEffect(() => {
    if (entered && primaryKey && enterpriseKB.collections.length === 0 && !enterpriseKB.loading) {
      enterpriseKB.loadCollections(primaryKey).then((firstCollection) => {
        if (firstCollection) {
          enterpriseKB.selectCollection(firstCollection, primaryKey);
        }
      });
    }
  }, [entered, primaryKey]);

  if (!entered) {
    return (
      <>
        <KbIntroView
          primaryKey={primaryKey}
          onEnter={handleEnter}
          onOpenConfig={openConfigModal}
          configVersion={configVersion}
        />
        <KbConfigModal
          open={showConfig}
          serviceUrl={configUrl}
          loginUrl={configLoginUrl}
          saving={savingConfig}
          error={configError}
          onClose={closeConfigModal}
          onSave={handleSaveConfig}
          onServiceUrlChange={setConfigUrl}
          onLoginUrlChange={setConfigLoginUrl}
        />
      </>
    );
  }

  return (
    <section className="enterprise-page view-container">
      <div className="enterprise-tab-bar">
        <button
          className={`enterprise-tab ${enterpriseKB.activeTab === "browse" ? "active" : ""}`}
          onClick={() => enterpriseKB.setActiveTab("browse")}
        >
          浏览
        </button>
        <button
          className={`enterprise-tab ${enterpriseKB.activeTab === "search" ? "active" : ""}`}
          onClick={() => enterpriseKB.setActiveTab("search")}
        >
          检索
        </button>
        <div style={{ flex: 1 }} />
        <Tooltip text="连接知识库地址">
          <button
            className="enterprise-admin-link"
            onClick={() => openConfigModal()}
            type="button"
          >
            <SlidersHorizontal size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 连接知识库
          </button>
        </Tooltip>
        <Tooltip text={configLoginUrl.trim() ? "进入团队后台 进行知识维护" : "请先配置知识库登录地址"}>
          <button
            className="enterprise-admin-link"
            onClick={() => handleOpenAdmin()}
            type="button"
          >
            <Settings size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} /> 知识库维护
          </button>
        </Tooltip>
      </div>
      {enterpriseKB.activeTab === "browse" ? (
        <BrowseTab enterpriseKB={enterpriseKB} primaryKey={primaryKey} setAlertModal={setAlertModal} />
      ) : (
        <SearchTab enterpriseKB={enterpriseKB} primaryKey={primaryKey} />
      )}

      <KbConfigModal
        open={showConfig}
        serviceUrl={configUrl}
        loginUrl={configLoginUrl}
        saving={savingConfig}
        error={configError}
        onClose={closeConfigModal}
        onSave={handleSaveConfig}
        onServiceUrlChange={setConfigUrl}
        onLoginUrlChange={setConfigLoginUrl}
      />

      <Modal open={alertModal.open} onClose={() => setAlertModal({ open: false, message: "" })}>
        <div style={{ padding: "24px", minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#111827" }}>提示</h3>
          <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
            {alertModal.message}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="primary-btn compact"
              onClick={() => setAlertModal({ open: false, message: "" })}
              style={{ minWidth: 80 }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
