---
name: CamphorEOS-moss-global-operation
description: 当 MOSS 需要在平台全局层面管理 CamphorEOS 时使用，包括查看工作空间、创建工作空间、删除工作空间。
---

# MOSS 全局工作空间操作

只处理平台级工作空间管理。

## 地址与端口
http://localhost:2048

## 允许动作

- `GET /api/workspaces`：查看工作空间列表
- `POST /api/workspaces`：创建工作空间
- `DELETE /api/workspaces/{workspace_id}`：删除工作空间

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 查看工作空间列表
- 触发条件：用户要看平台当前有哪些工作空间，或后续动作前需要先定位工作空间。
- 接口路由：`GET /api/workspaces`
- 必填参数：无
- 返回关键字段：`id`、`name`、`goal`、`super_agent_nick_name`、`created_at`
- 硬性约束：无请求体；返回当前全部工作空间列表。

### 创建工作空间
- 触发条件：用户要新建工作空间，且名称与目标已经明确。
- 接口路由：`POST /api/workspaces`
- 必填参数：请求体 `name`
- 返回关键字段：`id`、`name`、`goal`、`super_agent_nick_name`
- 硬性约束：`name` 必填；工作空间名称不能重复；`goal`、`super_agent_nick_name` 可选。

### 删除工作空间
- 触发条件：用户明确要删除某个工作空间，且目标已定位、删除影响已说明。
- 接口路由：`DELETE /api/workspaces/{workspace_id}`
- 必填参数：路径 `workspace_id`
- 返回关键字段：无，成功为 `HTTP 204 No Content`
- 硬性约束：`workspace_id` 必须存在；会同时清理该空间关联的事项、成果目录、运行时目录与会话。

## 总体工作原则

### 1. 不要把 API 当作目标

用户的目标是完成工作，不是调用某个接口。

### 2. 创建类动作先澄清，再执行

如果是创建工作空间，MOSS 必须先帮助用户把关键信息厘清。

### 3. 删除类动作先定位对象，再确认风险

如果是删除工作空间，MOSS 必须先定位对象，说明删除影响，再执行。

### 4. 技术参数优先通过查询解决

例如 `workspace_id` 不是用户真正关心的信息。MOSS 应优先通过列表查询、名称匹配和候选确认获得，而不是直接要求用户提供 id。

### 5. `user_id` 必须从 Runtime Context 获取

涉及 `user_id` 的 API 调用，必须从 CamphorEOS Runtime Context 中的 `current_user_id` 获取当前用户的真实 ID，禁止编造或使用示例中的占位符。

## 动作一：查看工作空间列表

### API信息

#### 地址

`GET /api/workspaces`

#### 请求参数

无。

真实约束：

- 无请求体
- 返回当前全部工作空间列表

#### 返回数据样例

```json
[
  {
    "id": 1,
    "name": "新媒体运营项目",
    "goal": "提升内容增长效率并在 Q3 实现粉丝增长 200%",
    "super_agent_nick_name": "项目经理"
  }
]
```

### 输出要求

1. 概括当前有多少个工作空间
2. 列出关键字段，例如名称、目标、创建时间
3. 如果用户的后续意图明显，直接给下一步建议

## 动作二：创建工作空间

### API信息

#### 地址

`POST /api/workspaces`

#### 请求参数

```json
{
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "name": "新媒体运营项目",
  "goal": "提升内容增长效率并在 Q3 实现粉丝增长 200%",
  "super_agent_nick_name": "项目经理"
}
```

真实约束：

- `name` 必填
- `goal` API 层可空，但业务上应填写
- `super_agent_nick_name` 可空，默认 `项目经理`
- 名称不能重复

#### 返回数据样例

```json
{
  "id": 3,
  "name": "新媒体运营项目",
  "goal": "提升内容增长效率并在 Q3 实现粉丝增长 200%",
  "super_agent_nick_name": "项目经理"
}
```

### 输出要求

1. 明确告诉用户已创建成功
2. 说明创建出的工作空间名称与核心目标
3. 如有默认 `SuperAgent` 名称，也明确告知
4. 给出下一步建议，例如查看总览、创建事项、配置知识库

## 动作三：删除工作空间

### API信息

#### 地址

`DELETE /api/workspaces/{workspace_id}`

#### 请求参数

路径参数：

- `workspace_id`：目标工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间
- 删除时会同时清理：
  - 工作空间业务数据
  - 该空间下的事项与成果目录
  - 对应 `SuperAgent` 运行时目录
  - 对应 runtime session

#### 返回数据样例

```text
HTTP 204 No Content
```

### 输出要求

1. 明确告知删除已完成
2. 说明已删除的工作空间名称
3. 如有合适的后续动作，列出剩余工作空间或建议下一步操作

## 输出要求

按以下结构返回：

1. 当前平台状态
2. 执行动作
3. 结果
4. 下一步建议
