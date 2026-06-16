# 03-config — 知识库管理与配置

## 概述

当用户意图涉及**知识库本身**的管理（创建、更新、删除）或**结构配置**（文件夹、抽取约束）时，使用本文档。

### 权限矩阵（收到 403 时参考）

| 操作 | 系统管理员 | collection write | collection read |
|------|-----------|-----------------|----------------|
| 创建/软删除/恢复/永久删除知识库 | ✅ | ❌ | ❌ |
| 更新知识库信息 | ✅ | ✅ | ❌ |
| 文件夹管理（增删改） | ✅ | ✅ | ❌ |
| 查看文件夹树 | ✅ | ✅ | ✅ |
| 抽取约束配置（增删改） | ✅ | ✅ | ❌ |
| 查看抽取约束/类型摘要 | ✅ | ✅ | ✅ |

> **Agent 不需要预先判断自己的身份。** 直接按用户意图调用 API，后端会自动校验权限。如果返回 403，参考上表向用户说明需要何种权限。

---

## 知识库管理

### 查看知识库列表

```
GET /api/collections
```

- 系统管理员：返回全部（含已软删除），带 `granted_groups`
- 普通用户：只返回有读取权限的未删除知识库

### 创建知识库

```
POST /api/collections
```

```json
{
  "name": "知识库名称",
  "description": "描述"
}
```

**权限要求：仅系统管理员**

> 如返回 403，说明当前用户不是系统管理员，无权创建知识库。

### 更新知识库信息

**权限要求：系统管理员 或 collection write**

```
PATCH /api/collections/{collection_id}
```

```json
{
  "name": "新名称",
  "description": "新描述"
}
```

### 软删除知识库

```
DELETE /api/collections/{collection_id}
```

标记删除，数据保留，可恢复。

> 如返回 403，说明当前用户不是系统管理员，无权删除知识库。

> 如返回 403，说明当前用户不是系统管理员，无权恢复知识库。

### 恢复知识库

```
POST /api/collections/{collection_id}/restore
```

### 永久删除知识库

```
DELETE /api/collections/{collection_id}/permanent
```

**不可逆**，同时清理 R2R 侧的集合数据和文档。

> 如返回 403，说明当前用户不是系统管理员，无权永久删除知识库。

---

## 目录结构管理

### 查看目录树

```
GET /api/collections/{collection_id}/folders
```

返回树形结构，每个节点含 `document_count`。

### 创建文件夹

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/folders
```

```json
{
  "name": "文件夹名称",
  "parent_id": null,
  "sort_order": 0
}
```

### 重命名/移动文件夹

**权限要求：系统管理员 或 collection write**

```
PATCH /api/collections/{collection_id}/folders/{folder_id}
```

```json
{
  "name": "新名称",
  "parent_id": 5
}
```

### 删除文件夹

**权限要求：系统管理员 或 collection write**

```
DELETE /api/collections/{collection_id}/folders/{folder_id}
```

**限制：** 有子文件夹或文档时无法删除，需先清空。

---

## 抽取约束配置

### 查看当前配置

```
GET /api/collections/{collection_id}/graph/extraction-config
```

无配置返回 null。

### 设置约束

**权限要求：系统管理员 或 collection write**

```
PUT /api/collections/{collection_id}/graph/extraction-config
```

```json
{
  "entity_types": ["ORGANIZATION", "PERSON"],
  "relation_types": ["WORKS_FOR"]
}
```

### 删除约束

**权限要求：系统管理员 或 collection write**

```
DELETE /api/collections/{collection_id}/graph/extraction-config
```

---

## 类型摘要

查看图谱中已有的类型，作为配置约束前的参考：

```
GET /api/collections/{collection_id}/graph/type-summary
```

返回 `entity_types` 和 `relation_types` 列表。