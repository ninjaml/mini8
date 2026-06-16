import { useCallback, useState } from "react";
import { api } from "../../lib/api";

export function useEnterpriseKB() {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [folderTree, setFolderTree] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("root");
  const [documents, setDocuments] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [ragResult, setRagResult] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [activeTab, setActiveTab] = useState("browse");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [kbConnected, setKbConnected] = useState(null);

  const loadCollections = useCallback(async (primaryKey) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getEnterpriseCollections(primaryKey);
      const list = Array.isArray(data) ? data : [];
      setKbConnected(true);
      setCollections(list);
      if (list.length > 0) {
        setSelectedCollection(list[0]);
        return list[0];
      }
      return null;
    } catch (e) {
      setKbConnected(false);
      setError(e.message || "加载集合失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolders = useCallback(async (primaryKey, collectionId) => {
    if (!collectionId) return;
    setError("");
    try {
      const data = await api.getEnterpriseFolders(primaryKey, collectionId);
      setFolderTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "加载文件夹失败");
    }
  }, []);

  const loadDocuments = useCallback(async (primaryKey, collectionId, folderId, keyword = null, mimeType = null) => {
    if (!collectionId) return;
    setLoading(true);
    setError("");
    try {
      const params = {};
      const hasSearch = keyword || mimeType;
      if (!hasSearch) {
        if (folderId === "root") {
          params.rootOnly = true;
        } else if (folderId != null) {
          params.folderId = folderId;
        }
      }
      if (keyword) params.keyword = keyword;
      if (mimeType) params.mimeType = mimeType;
      const data = await api.getEnterpriseDocuments(primaryKey, collectionId, params);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "加载文档失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectCollection = useCallback(async (collection, primaryKey) => {
    setSelectedCollection(collection);
    setSelectedFolderId("root");
    setPreviewDocument(null);
    if (collection && primaryKey) {
      await Promise.all([
        loadFolders(primaryKey, collection.id),
        loadDocuments(primaryKey, collection.id, "root"),
      ]);
    }
  }, [loadFolders, loadDocuments]);

  const selectFolder = useCallback((folderId, primaryKey, collectionId) => {
    setSelectedFolderId(folderId);
    setPreviewDocument(null);
    if (collectionId && primaryKey) {
      loadDocuments(primaryKey, collectionId, folderId);
    }
  }, [loadDocuments]);

  const toggleFolder = useCallback((folderId) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const doSearch = useCallback(async (primaryKey, searchPayload) => {
    setLoading(true);
    setError("");
    setSearchResults(null);
    setRagResult(null);
    try {
      const result = await api.enterpriseSearch({
        ...searchPayload,
        primary_key: primaryKey,
      });
      setSearchResults(result);
    } catch (e) {
      setError(e.message || "检索失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const doRag = useCallback(async (primaryKey, ragPayload) => {
    setLoading(true);
    setError("");
    setSearchResults(null);
    setRagResult(null);
    try {
      const result = await api.enterpriseRag({
        ...ragPayload,
        primary_key: primaryKey,
      });
      setRagResult(result);
    } catch (e) {
      setError(e.message || "Agent 请求失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadFiles = useCallback(async (primaryKey, collectionId, folderId, files) => {
    setLoading(true);
    setError("");
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        if (folderId && folderId !== "root") {
          formData.append("folder_id", String(folderId));
        }
        await api.uploadEnterpriseDocument(primaryKey, collectionId, formData);
      }
      if (collectionId && primaryKey) {
        await loadDocuments(primaryKey, collectionId, selectedFolderId);
      }
    } catch (e) {
      setError(e.message || "上传失败");
    } finally {
      setLoading(false);
    }
  }, [loadDocuments, selectedFolderId]);

  return {
    collections,
    selectedCollection,
    folderTree,
    selectedFolderId,
    documents,
    searchResults,
    ragResult,
    previewDocument,
    activeTab,
    loading,
    error,
    expandedFolders,
    kbConnected,
    setActiveTab,
    loadCollections,
    selectCollection,
    loadFolders,
    loadDocuments,
    doSearch,
    doRag,
    toggleFolder,
    selectFolder,
    setPreviewDocument,
    setSelectedFolderId,
    uploadFiles,
  };
}
