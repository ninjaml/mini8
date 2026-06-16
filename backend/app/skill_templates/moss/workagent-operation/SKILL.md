---
name: mini8-moss-workagent-operation
description: 当 MOSS 需要在某个工作空间内管理 workAgent 成员时使用。这个 skill 只负责成员记录的创建、读取、修改、删除，不负责本地运行时执行控制。
---

# MOSS workAgent 成员操作

只处理工作空间中的 workAgent 成员记录管理。

## 地址与端口
http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}/agents`：查看 workAgent 列表
- `POST /api/workspaces/{workspace_id}/agents`：创建 workAgent
- `PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`：修改 workAgent
- `DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`：删除 workAgent

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 查看 workAgent 列表
- 触发条件：用户想看当前工作空间有哪些成员，或要为修改、删除、事项绑定先定位目标成员。
- 接口路由：`GET /api/workspaces/{workspace_id}/agents`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：MOSS 不默认持有 `workspace_id`，先定位目标工作空间；`workspace_id` 必须存在。

### 创建 workAgent
- 触发条件：目标工作空间、成员名称、成员类型已明确，且用户确认创建。
- 接口路由：`POST /api/workspaces/{workspace_id}/agents`
- 必填参数：路径 `workspace_id`；请求体 `work_space_id`、`name`
- 可选参数：`type`（默认 `"mini8"`）、`agent_json`（默认 `"{}"`）、`user_id`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：MOSS 不默认持有 `workspace_id`；请求体中的 `work_space_id` 必须与路径中的 `workspace_id` 保持一致（后端以路径参数为准）；若未传 `type`，后端使用默认值 `"mini8"`；若未传 `agent_json`，后端写入字符串 `"{}"`。

### 修改 workAgent
- 触发条件：目标成员已定位，且用户明确要修改名称、类型或配置。
- 接口路由：`PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`
- 必填参数：路径 `workspace_id`、`agent_id`；请求体按需传 `name`、`type`、`agent_json`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：`workspace_id` 必须存在；`agent_id` 必须属于该工作空间；只有 `name`、`type`、`agent_json` 会被更新。

### 删除 workAgent
- 触发条件：用户明确要删除某个成员记录，且目标已定位、删除影响已说明。
- 接口路由：`DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`
- 必填参数：路径 `workspace_id`、`agent_id`
- 返回关键字段：`status`
- 硬性约束：`workspace_id` 必须存在；`agent_id` 必须属于该工作空间；成功返回 `{ "status": "deleted" }`。

## 技术参数获取总规则

### `workspace_id`

对 MOSS 来说，`workspace_id` 默认不来自固定上下文。

获取方式统一为：

1. 先调用 `GET /api/workspaces`
2. 根据空间名称、描述或候选信息定位目标空间
3. 如有多个候选，先确认
4. 目标空间明确后，才能得到 `workspace_id`

### `agent_id`

1. 在目标工作空间明确后，调用 `GET /api/workspaces/{workspace_id}/agents`
2. 根据成员名称定位目标成员
3. 如有多个候选，先确认
4. 目标成员明确后，才能得到 `agent_id`

### `user_id`

涉及 `user_id` 的 API 调用，必须从 mini8 Runtime Context 中的 `current_user_id` 获取当前用户的真实 ID，禁止编造或使用示例中的占位符。

## 动作一：查看 workAgent 列表

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/agents`

#### 请求参数

路径参数：

- `workspace_id`：目标工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间

#### 返回数据样例

```json
[
  {
    "id": 2,
    "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
    "work_space_id": 1,
    "name": "OpenClaw 研发专员",
    "type": "openclaw",
    "agent_json": "{}",
    "work_item_ids": [3, 5]
  }
]
```

### 输出要求

1. 列出当前成员名称、类型、基本状态
2. 如果用户是为了后续事项绑定而来，提示下一步进入事项 skill
3. 如果当前没有成员，也应明确告知

## 动作二：创建 workAgent

### API信息

#### 地址

`POST /api/workspaces/{workspace_id}/agents`

#### 请求参数

```json
{
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 1,
  "name": "OpenClaw 研发专员",
  "type": "openclaw",
  "agent_json": "{}"
}
```

真实约束：

- `work_space_id` 必填
- `name` 必填
- `type` 必填

#### 返回数据样例

```json
{
  "id": 2,
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 1,
  "name": "OpenClaw 研发专员",
  "type": "openclaw",
  "agent_json": "{}",
  "work_item_ids": []
}
```

### 输出要求

1. 告知成员创建成功
2. 说明该成员所在空间
3. 引导下一步是否需要把该成员绑定到事项

## 动作三：修改 workAgent

### API信息

#### 地址

`PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`

#### 请求参数

```json
{
  "name": "Athena 数据专员",
  "type": "athena",
  "agent_json": "{}"
}
```

真实约束：

- `workspace_id` 必须是已存在的工作空间
- `agent_id` 必须属于该工作空间
- 至少传入一个要修改的字段

#### 返回数据样例

```json
{
  "id": 2,
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 1,
  "name": "Athena 数据专员",
  "type": "athena",
  "agent_json": "{}",
  "work_item_ids": []
}
```

### 输出要求

1. 明确告知修改完成
2. 复述修改后的关键字段
3. 如果该成员已绑定事项，提醒用户变更可能影响后续协作

## 动作四：删除 workAgent

### API信息

#### 地址

`DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`

#### 请求参数

路径参数：

- `workspace_id`
- `agent_id`

真实约束：

- `workspace_id` 必须是已存在的工作空间
- `agent_id` 必须属于该工作空间

#### 返回数据样例

```json
{
  "status": "deleted"
}
```

### 输出要求

1. 明确告知删除完成
2. 说明删除的是哪个成员
3. 提示该成员的绑定关系和本地数据已一并清理，无需手动处理

## 禁止动作

- 不承诺 workAgent 已接入本地执行能力
- 不编造 workAgent runtime API
- 不代替事项绑定逻辑
- 不调用 auth / runtime / resource_key 接口
