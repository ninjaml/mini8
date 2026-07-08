# 02-documents — 文档日常维护与抽取

## 概述

当用户意图涉及**具体文档**的操作时，使用本文档。覆盖：上传、查找、查看、移动、删除、知识抽取。

### 权限说明（收到 403 时参考）

本文档的操作分为两类：

| 操作类型 | 具体 API | 所需权限 |
|---------|---------|---------|
| **写入操作** | 上传、移动、删除、单文档抽取、批量抽取 | collection **write** |
| **读取操作** | 查找文档、查看详情/状态/分块、下载、查询抽取结果 | collection **read** |

> **Agent 不需要预先判断自己的身份。** 直接按用户意图调用 API，后端会自动校验权限。如果返回 403，说明当前用户没有该知识库的对应权限。

---

## 前置：确定知识库

大部分文档操作需要 `collection_id`。

```
GET /api/collections
```

- 系统管理员：返回全部知识库（含已软删除）
- 普通用户：只返回有读取权限的未删除知识库

如果用户提到具体知识库名称，在此列表中匹配；如果只有一个可直接使用；如果有多个，让用户选择。

---

## 上传文档

**前置确认：**
1. 文件路径
2. 目标知识库（collection_id）
3. 目标文件夹（folder_id，可选，不传=根目录）
4. 文档标题（可选，默认取文件名）

**需要创建文件夹？** 见 `03-config.md` → 目录结构管理。

**API：**
```
POST /api/collections/{collection_id}/documents
```

**请求格式：** `multipart/form-data`

| 字段 | 说明 |
|------|------|
| file | 文件（必填） |
| title | 标题（默认文件名） |
| folder_id | 文件夹ID（可选） |

**支持格式：** txt, md, html, xml, json, csv, pdf, doc, docx, xls, xlsx, ppt, pptx, epub, eml

**特殊行为：**
- R2R 中同名文档自动覆盖
- 本地有相同 `r2r_document_id` 时更新记录（返回 `replaced: true`）

---

## 查找与筛选文档

```
GET /api/collections/{collection_id}/documents
```

**参数（全部可选）：**

| 参数 | 说明 |
|------|------|
| folder_id | 限定文件夹 |
| root_only | true=只看根目录 |
| keyword | 文件名/标题模糊搜索 |
| mime_type | pdf / word / xls / ppt / text / other |
| created_by | 创建者手机号 |
| date_from / date_to | ISO 8601 日期范围 |

**用户只说了名字不知道手机号？**
用 `GET /api/collections/{collection_id}/document-creators` 获取创建者列表（`[{user_id, display_name}]`），按 `display_name` 匹配。

---

## 查看文档

### 文档详情
```
GET /api/documents/{document_id}
```

### 处理状态
```
GET /api/documents/{document_id}/r2r-status
```

返回 `extraction_status`（pending / processing / completed / failed）。

### 下载原始文件
```
GET /api/documents/{document_id}/download
```

### 查看分块内容
```
GET /api/documents/{document_id}/chunks?offset=0&limit=100
```

---

## 移动文档

```
PATCH /api/documents/{document_id}/move
```

```json
{"folder_id": 3}
```

传 `null` 移到根目录。

---

## 删除文档（软删除）

```
DELETE /api/documents/{document_id}
```

同时清理 R2R 侧的文档、chunks、抽取结果。

---

## 知识抽取

### 单文档抽取

```
POST /api/documents/{document_id}/extract
```

```json
{
  "entity_types": ["ORGANIZATION", "PERSON"],
  "relation_types": ["WORKS_FOR"]
}
```

- 不传=不限制类型
- **异步任务**，立即返回 "extraction_started"

### 批量抽取全部文档

```
POST /api/collections/{collection_id}/graph/extract-all
```

```json
{
  "force": false,
  "entity_types": null,
  "relation_types": null
}
```

| 参数 | 说明 |
|------|------|
| force | false=只抽 pending/failed；true=全部重抽 |

**返回：** `{"message": "已触发 N 个文档抽取，跳过 M 个"}`

### 查询抽取结果

```
GET /api/documents/{document_id}/entities?offset=0&limit=100
GET /api/documents/{document_id}/relationships?offset=0&limit=100
```

---

## 抽取后同步到图谱

文档抽取产出在**文档层面**，必须通过 Pull 同步到集合图谱才能全局检索。详见 `06-health-check.md` → 图谱构建。