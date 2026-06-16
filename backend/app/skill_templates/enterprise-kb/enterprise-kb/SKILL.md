---
name: enterprise-kb
description: 当 Agent 需要操作企业知识库系统时使用，包括文档上传与抽取、知识库配置管理、权限授权、语义搜索与 RAG、知识图谱构建与质量修复。
---

# enterprise-kb — 企业知识库系统

## 地址与端口

从 `api-base/config.json` 读取 `api_root`，默认 `http://127.0.0.1:8000`。

首次使用时若 `config.json` 不存在，询问用户 API 地址并按 `api-base/config.json.example` 模板生成配置。

## 允许动作

- `GET /api/collections`：查看知识库列表
- `POST /api/collections`：创建知识库
- `PATCH /api/collections/{id}`：更新知识库信息
- `DELETE /api/collections/{id}`：软删除知识库
- `POST /api/collections/{id}/restore`：恢复知识库
- `DELETE /api/collections/{id}/permanent`：永久删除知识库
- `POST /api/collections/{id}/documents`：上传文档
- `GET /api/collections/{id}/documents`：查找文档
- `GET /api/documents/{id}`：查看文档详情
- `GET /api/documents/{id}/r2r-status`：查看文档处理状态
- `GET /api/documents/{id}/download`：下载文档
- `GET /api/documents/{id}/chunks`：查看文档分块
- `PATCH /api/documents/{id}/move`：移动文档
- `DELETE /api/documents/{id}`：删除文档
- `POST /api/documents/{id}/extract`：单文档抽取
- `POST /api/collections/{id}/graph/extract-all`：批量抽取
- `POST /api/collections/{id}/graph/pull`：同步到图谱
- `POST /api/collections/{id}/graph/communities/build`：构建社区
- `POST /api/collections/{id}/graph/reset`：重置图谱
- `POST /api/retrieval/search`：语义搜索
- `POST /api/retrieval/rag`：RAG 生成回答
- `GET /api/collections/{id}/graph/dangling-relationships`：检测悬空关系
- `GET /api/collections/{id}/graph/orphan-entities`：检测孤立实体
- `GET /api/collections/{id}/graph/similar-entities`：检测重复实体
- `POST /api/collections/{id}/graph/batch-delete`：批量清理
- `POST /api/collections/{id}/graph/merge-entities`：合并实体
- `POST /api/groups/{id}/collections`：授权群组访问
- `DELETE /api/groups/{id}/collections/{id}`：撤销群组授权
- `POST /api/groups/{id}/collections/{id}/writers`：授予写入权限
- `DELETE /api/groups/{id}/collections/{id}/writers/{user_id}`：撤销写入权限
- `GET /api/me/collection-permissions`：查看当前用户权限

## 总体工作原则

1. **不要把 API 当作目标**——用户的目标是完成知识库相关的任务，不是调用某个接口
2. **知识库必须先确认**——大部分操作需要 `collection_id`，未指定时先用 `GET /api/collections` 列出让用户选择
3. **权限自动处理**——直接调用 API，后端返回 403 时参考各子文档的权限矩阵说明
4. **创建/删除类动作先确认**——创建知识库、删除文档、重置图谱等操作前先确认用户意图
5. **子文档按需加载**——根据用户意图加载对应子文档获取详细 API 信息

## 决策树

用户意图 → 加载对应子文档：

| 用户意图 | 子文档 |
|---------|--------|
| 上传/移动/删除/查找/抽取 **文档** | `02-documents.md` |
| 创建/更新/删除 **知识库**、管理 **文件夹**、配置 **抽取约束** | `03-config.md` |
| **授权/撤销** 群组访问、管理 **写入权限** | `04-permissions.md` |
| **搜索/查文档/回答问题**（语义搜索、图谱查询、RAG） | `05-retrieval.md` |
| **图谱构建**（Pull、Communities）、**诊断修复**（悬空/孤立/重复） | `06-health-check.md` |

## 认证

所有 API 调用都需要身份认证。请求必须携带以下 Header 之一：

**方式一（推荐）：Bearer Token**
```
Authorization: Bearer dev:<primaryKey>
```

**方式二：开发 Header（需要 DEV_AUTH_ENABLED=true）**
```
X-User-Id: <primaryKey>
```

**primaryKey** 是用户通过 `/auth/login` 登录后返回的 `user.id`，不是手机号。不要编造 primaryKey。

**权限模型：**
- 普通操作（浏览、上传、搜索等）：系统自动校验 collection read/write 权限
- 系统管理员操作（创建/删除知识库、授权群组等）：需要 `role=system_admin`，后端通过 primaryKey 自动确认
- `X-Super-Admin-Secret` 仅用于 bootstrap，不在本 skill 范围内

## API 根地址

所有 API 路径是相对路径（如 `/api/collections`），执行请求前必须拼接根地址。

### Step 1：检查配置文件

读取 `api-base/config.json`：

**如果存在：**
```json
{"api_root": "http://127.0.0.1:8000"}
```
直接使用其中的 `api_root`。

**如果不存在：**
1. 询问用户："您的知识库 API 地址是什么？（示例：http://127.0.0.1:8000）"
2. 读取 `api-base/config.json.example` 作为模板
3. 将模板中的 `api_root` 替换为用户给出的地址
4. 在 `api-base/` 目录生成 `config.json`
5. 后续所有请求使用新生成的配置

### Step 2：拼接规则

```
完整 URL = config.api_root + API路径
```

例：
- `GET /api/collections` → `GET http://127.0.0.1:8000/api/collections`
- `POST /api/collections/5/graph/pull` → `POST http://127.0.0.1:8000/api/collections/5/graph/pull`

## 通用约束

1. **知识库必须先确认**：大部分操作需要 `collection_id`。如果用户没指定，先用 `GET /api/collections` 列出并让用户选择。
2. **权限自动处理**：API 自动返回 403/401，不需要你预先判断。
3. **错误码**：404=资源不存在，403=无权限，401=未认证，502=R2R 引擎异常。

---

## 典型场景：从零构建知识库

展示如何跨子文档协作完成完整流程：

```
用户："帮我创建一个产品文档库，把 /data/docs 下的文件传上去，做完知识抽取"

Agent 执行：

Step 1 — 创建知识库（加载 03-config.md）
  → POST /api/collections
    {"name": "产品文档库", "description": "产品相关资料"}
  → 得到 collection_id = 5

Step 2 — 上传文件（加载 02-documents.md）
  → POST /api/collections/5/documents  (file=doc1.pdf)
  → POST /api/collections/5/documents  (file=doc2.docx)

Step 3 — 批量抽取（加载 02-documents.md）
  → POST /api/collections/5/graph/extract-all {"force": false}

Step 4 — 等待完成（加载 02-documents.md）
  → 等待 30 秒后抽查 2-3 个文档的 r2r-status
  → 大部分 completed → 视为完成

Step 5 — 同步到图谱（加载 06-health-check.md）
  → POST /api/collections/5/graph/pull

Step 6 — 提交社区构建（加载 06-health-check.md）
  → POST /api/collections/5/graph/communities/build
  → 告知用户："社区摘要已提交到后台队列"

Step 7 — 告知用户完成
  → "知识库已创建完成！文档已抽取并同步到图谱，社区构建中。"
```