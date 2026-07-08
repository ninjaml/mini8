---
name: CamphorEOS-moss-workspace-operation
description: 当当前人格需要管理其所服务的单个工作空间及其子资源时使用，包括详情、更新，以及工作空间绑定的知识库管理。
---

# 当前工作空间操作

只处理当前所服务的 CamphorEOS 工作空间及其子资源。

## 地址与端口

http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}`：读取工作空间详情
- `PATCH /api/workspaces/{workspace_id}`：更新工作空间名称、目标与工作目录
- `GET /api/workspaces/{workspace_id}/knowledge`：查看工作空间绑定的知识库
- `POST /api/workspaces/{workspace_id}/knowledge`：创建知识库绑定
- `PATCH /api/knowledge/{knowledge_id}`：修改知识库名称
- `DELETE /api/workspaces/{workspace_id}/knowledge/{knowledge_id}`：解除知识库绑定
- `GET /api/knowledge/{knowledge_id}/tree?path={path}`：浏览知识库目录树
- `GET /api/knowledge/{knowledge_id}/file?path={path}`：读取知识库文件

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 读取工作空间详情
- 触发条件：用户想进入某个工作空间看基本信息，或为后续操作确认目标空间。
- 接口路由：`GET /api/workspaces/{workspace_id}`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`name`、`goal`、`working_dir`、`created_at`
- 硬性约束：`workspace_id` 必须存在。

### 更新工作空间
- 触发条件：用户要修改工作空间名称、目标描述或共享目录。
- 接口路由：`PATCH /api/workspaces/{workspace_id}`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`name`、`goal`、`working_dir`
- 硬性约束：`workspace_id` 必须存在；名称不能重复；`working_dir` 必须是绝对路径。

### 查看知识库列表
- 触发条件：用户要查看某个工作空间当前绑定了哪些知识库。
- 接口路由：`GET /api/workspaces/{workspace_id}/knowledge`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`name`、`type`、`knowledge_json`
- 硬性约束：`workspace_id` 必须存在。

### 创建知识库绑定
- 触发条件：用户要把一个本地知识库绑定到工作空间。
- 接口路由：`POST /api/workspaces/{workspace_id}/knowledge`
- 必填参数：路径 `workspace_id`，请求体 `name`、`port`、`api_key`
- 可选参数：`omnisearch_port`
- 返回关键字段：`id`、`work_space_id`、`name`、`type`、`knowledge_json`
- 硬性约束：`workspace_id` 必须存在；同一工作空间内名称不能重复；Local REST `port` 不能重复；`type` 由后端固定为 `obsidian`。

### 修改知识库名称
- 触发条件：用户要修改已绑定知识库的显示名称。
- 接口路由：`PATCH /api/knowledge/{knowledge_id}`
- 必填参数：路径 `knowledge_id`
- 返回关键字段：`id`、`name`
- 硬性约束：只允许修改名称；不能修改端口、key 或其他配置。

### 解除知识库绑定
- 触发条件：用户明确要解除某个工作空间下的知识库绑定。
- 接口路由：`DELETE /api/workspaces/{workspace_id}/knowledge/{knowledge_id}`
- 必填参数：路径 `workspace_id`、`knowledge_id`
- 返回关键字段：无，成功为 `HTTP 204 No Content`
- 硬性约束：`knowledge_id` 必须属于该 `workspace_id`。

### 浏览目录树
- 触发条件：用户要查看知识库目录结构。
- 接口路由：`GET /api/knowledge/{knowledge_id}/tree?path={path}`
- 必填参数：路径 `knowledge_id`
- 返回关键字段：`knowledge_id`、`title`、`current_path`、`entries`
- 硬性约束：`path` 可选；省略表示根目录。

### 读取文件
- 触发条件：用户要读取知识库中的某个文本文件。
- 接口路由：`GET /api/knowledge/{knowledge_id}/file?path={path}`
- 必填参数：路径 `knowledge_id`、查询参数 `path`
- 返回关键字段：`knowledge_id`、`title`、`path`、`name`、`content`
- 硬性约束：`path` 必填；只读取文本内容。

## 总体工作原则

### 1. 不要把 API 当作目标

用户的目标是完成工作，不是调用某个接口。

### 2. 创建类动作先澄清，再执行

如果是创建或更新工作空间、知识库，MOSS 必须先帮助用户把关键信息厘清。

### 3. 删除类动作先定位对象，再确认风险

如果是删除工作空间或解除知识库绑定，MOSS 必须先定位对象，说明删除影响，再执行。

### 4. 技术参数优先通过查询解决

例如 `workspace_id` 和 `knowledge_id` 不是用户真正关心的信息。MOSS 应优先通过列表查询、名称匹配和候选确认获得，而不是直接要求用户提供 id。

### 5. `user_id` 必须从 Runtime Context 获取

涉及 `user_id` 的 API 调用，必须从 CamphorEOS Runtime Context 中的 `current_user_id` 获取当前用户的真实 ID，禁止编造或使用示例中的占位符。

## 输出要求

按以下结构返回：

1. 当前平台状态
2. 执行动作
3. 结果
4. 下一步建议
