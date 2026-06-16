---
name: mini8-superagent-knowledge-operation
description: 当 SuperAgent 需要在当前绑定工作空间中管理或读取知识库时使用，包括查看列表、创建、修改名称、解除绑定、浏览目录树和读取文件内容。
---

# SuperAgent 知识库操作

只处理当前绑定工作空间中的 mini8 知识库。

## 服务地址

`http://localhost:2048`

## 当前真实 API

所有路径都需要加 `/api` 前缀。

| 动作 | 方法与路径 | 说明 |
|---|---|---|
| 查看知识库列表 | `GET /api/workspaces/{workspace_id}/knowledge` | 返回当前工作空间已绑定的知识库 |
| 创建知识库 | `POST /api/workspaces/{workspace_id}/knowledge` | 创建 Obsidian 知识库绑定 |
| 修改知识库名称 | `PATCH /api/knowledge/{knowledge_id}` | 只修改知识库显示名称 |
| 解除知识库绑定 | `DELETE /api/workspaces/{workspace_id}/knowledge/{knowledge_id}` | 删除当前工作空间下的知识库绑定 |
| 浏览目录树 | `GET /api/knowledge/{knowledge_id}/tree?path={path}` | 读取 Obsidian vault 目录；`path` 可省略 |
| 读取文件 | `GET /api/knowledge/{knowledge_id}/file?path={path}` | 读取 Obsidian vault 内的文本文件；`path` 必填 |

当前 mini8 知识库 API 没有搜索 endpoint。创建知识库时必须保存 `omnisearch_port`，但搜索动作不通过本 skill 的 `/api/knowledge/...` 路由完成。

## 工作空间边界

SuperAgent 的 `workspace_id` 默认来自运行时上下文中的 `bound_platform_workspace_id`。

硬性约束：

- 只能管理当前绑定工作空间下的知识库。
- 不要让用户手动处理 `workspace_id`，除非运行时上下文缺失或冲突。
- 调用删除接口前，必须确认 `knowledge_id` 属于当前 `workspace_id`。

## 参数定位规则

### `workspace_id`

从当前运行时上下文读取 `bound_platform_workspace_id`。

### `knowledge_id`

1. 调用 `GET /api/workspaces/{workspace_id}/knowledge`。
2. 根据知识库名称或用户描述定位目标知识库。
3. 如果存在多个候选，先让用户确认。
4. 目标明确后，才能使用对应 `knowledge_id`。

## 数据结构

### 创建知识库请求体

```json
{
  "name": "项目知识库",
  "port": 27123,
  "api_key": "your-local-rest-api-key",
  "omnisearch_port": 51361
}
```

字段说明：

- `name`: 必填，1 到 255 字符；后端会 trim，不能为空。
- `port`: 必填，Obsidian Local REST API 端口，范围 `1-65535`。
- `api_key`: 必填，Obsidian Local REST API Key。
- `omnisearch_port`: 必填，Obsidian Omnisearch 插件端口，范围 `1-65535`。
- 不要传 `user_id`。当前创建接口不接受 `user_id`，传入会被后端拒绝。

创建成功后，后端会把配置写入 `knowledge_json`：

```json
{
  "port": 27123,
  "api_key": "your-local-rest-api-key",
  "vault_name": "项目知识库",
  "omnisearch_port": 51361
}
```

### 知识库返回对象

```json
{
  "id": 6,
  "work_space_id": 2,
  "name": "项目知识库",
  "type": "obsidian",
  "knowledge_json": "{\"port\":27123,\"api_key\":\"***\",\"vault_name\":\"项目知识库\",\"omnisearch_port\":51361}"
}
```

### 目录树返回对象

```json
{
  "knowledge_id": 6,
  "title": "项目知识库",
  "current_path": "报告",
  "entries": [
    {
      "name": "周报",
      "path": "报告/周报",
      "is_dir": true,
      "type": "directory"
    },
    {
      "name": "概览.md",
      "path": "报告/概览.md",
      "is_dir": false,
      "type": "file"
    }
  ]
}
```

### 文件返回对象

```json
{
  "knowledge_id": 6,
  "title": "项目知识库",
  "path": "报告/概览.md",
  "name": "概览.md",
  "content": "# 概览\n\n这里是文件正文。"
}
```

## 操作约束

### 查看知识库列表

- 路由：`GET /api/workspaces/{workspace_id}/knowledge`
- `workspace_id` 必须存在，否则返回 `404 Workspace not found`。
- 输出时列出知识库名称、类型、Local REST 端口、是否配置 Omnisearch 端口。

### 创建知识库

- 路由：`POST /api/workspaces/{workspace_id}/knowledge`
- 只能在当前绑定工作空间创建。
- 请求体不要包含 `user_id`。
- 同一工作空间内知识库名称不能重复。
- 同一工作空间内 Local REST `port` 不能重复。
- 后端会先探测 Obsidian Local REST API 是否可访问；不可访问会返回错误。
- `type` 由后端固定为 `obsidian`，不要在请求体里传。

### 修改知识库名称

- 路由：`PATCH /api/knowledge/{knowledge_id}`
- 请求体只传 `name`：

```json
{
  "name": "新的知识库名称"
}
```

- 不能修改 `port`、`api_key`、`omnisearch_port`。当前后端没有这些字段的更新接口。
- 同一工作空间内名称不能重复。

### 解除知识库绑定

- 路由：`DELETE /api/workspaces/{workspace_id}/knowledge/{knowledge_id}`
- 成功返回 `204 No Content`。
- `knowledge_id` 必须属于当前绑定工作空间。

### 浏览目录树

- 路由：`GET /api/knowledge/{knowledge_id}/tree`
- 查询参数：`path` 可选；省略或空字符串表示根目录。
- 输出时概括目录结构，不要原样倾倒全部 JSON。

### 读取文件

- 路由：`GET /api/knowledge/{knowledge_id}/file?path={path}`
- `path` 必填，不能为空。
- 只读取文本内容；如果用户要编辑 Obsidian 文件，应改用 `obsidian-edit` 或相关 Obsidian skill。

## 禁止动作

- 不处理事项管理。
- 不处理全局工作空间管理。
- 不调用 `auth`、`runtime`、`resource_key` 接口。
- 不凭空编造搜索接口；当前知识库 API 没有 `/search` 路由。
- 不越过当前绑定工作空间操作其他工作空间的知识库。
- 不直接暴露完整 `api_key`，除非用户明确要求核对配置且上下文安全。

## 输出要求

返回时按需要组织，不要机械输出所有字段。优先说明：

1. 当前知识库状态。
2. 已定位的当前工作空间和知识库。
3. 实际调用的 API。
4. 操作结果。
5. 下一步可以继续浏览目录、读取文件、修改名称或解除绑定。
