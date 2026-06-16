# 05-retrieval — 知识检索

## 概述

当用户意图是**找信息、查资料、回答问题**时，使用本文档。覆盖：精确文档查找、语义搜索、RAG、图谱查询。

---

## 前置：确定知识库

大部分检索需要 `collection_id`。

```
GET /api/collections
```

如果用户提到具体知识库名称，在此列表中匹配；如果只有一个可直接使用；如果有多个，让用户选择。

---

## 精确查找文档

适合：用户提到文件名、类型、创建者、时间范围。

```
GET /api/collections/{collection_id}/documents
```

参数见 `02-documents.md`（同个 API）。

**用户只说了名字不知道手机号？**
见 `02-documents.md` → 查找与筛选文档（使用 `document-creators` 按 `display_name` 匹配）。

---

## 语义搜索

适合：概念性问题、定义、流程、方法（不带具体文件名）。

```
POST /api/retrieval/search
```

```json
{
  "query": "用户问题原文",
  "collection_ids": [1, 2],
  "limit": 10,
  "use_hybrid_search": true,
  "use_graph_search": true,
  "graph_limits": {
    "entity": 10,
    "relationship": 10,
    "community": 5
  }
}
```

**返回结构：**
外层 `{ "results": { ... } }`，`results` 是 R2R 透传字典，**不要硬编码字段名**。

Agent 拿到后：
1. 遍历 `results` 的 key，找到含文本内容的数组（可能在 `chunks`、`chunk_search_results` 等字段）
2. 查找实体/关系/社区信息补充上下文
3. 自己提炼要点回答用户

---

## 图谱查询

### 按名称搜索实体

```
GET /api/collections/{collection_id}/graph/search-entities?q={实体名称}
```

### 查看实体详情

```
GET /api/collections/{collection_id}/graph/entities/{entity_id}
```

### 实体/关系/社区列表（分页）

```
GET /api/collections/{collection_id}/graph/entities?offset=0&limit=20
GET /api/collections/{collection_id}/graph/relationships?offset=0&limit=20
GET /api/collections/{collection_id}/graph/communities?offset=0&limit=20
```

> **列表 vs 详情：** 列表接口隐藏详情字段（实体的 `description`、关系的 `description`、社区的 `summary`/`findings`）。需要完整信息时调用单条详情接口。

---

## 浏览目录结构

```
GET /api/collections/{collection_id}/folders
```

返回完整树形结构，含各节点 `document_count`。

---

## 检索决策树

```
用户提问
    │
    ├── 提到具体文件名/类型/创建者/时间？
    │   └── 精确查找文档 → GET /api/collections/{id}/documents
    │
    ├── 问概念/定义/流程/方法？
    │   ├── 用户说"自己看看" → POST /api/retrieval/search（Agent 自行总结）
    │   └── 用户说"直接告诉我" → POST /api/retrieval/rag（R2R 生成回答）
    │
    ├── 问实体/关系/谁和谁关联？
    │   └── 图谱查询 → GET .../api/graph/search-entities 或 /api/entities
    │
    └── 想浏览目录？
        └── GET /api/collections/{id}/folders
```

---

## 注意事项

1. **搜索优先用混合模式**：`use_hybrid_search=true` + `use_graph_search=true` 效果最好
2. **分页**：实体/关系/社区默认每页20条，大数据量时翻页
3. **知识库必须先确认**：未指定时先用 `GET /api/collections` 列出让用户选择