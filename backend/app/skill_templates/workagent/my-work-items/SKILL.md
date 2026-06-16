---
name: mini8-workagent-my-work-items
description: 当 WorkAgent 需要查询自己在当前平台工作空间中绑定了哪些事项时使用。
---

# WorkAgent 绑定事项查询

查询当前 WorkAgent 在 mini8 平台中绑定的所有工作事项。

## 地址与端口

http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}/agents/{agent_id}`：查看当前 agent 的详细信息，包含绑定的 `work_item_ids`

## 顶部速查

### 查询绑定事项列表
- 触发条件：开始执行工作前、用户询问当前任务时、或需要确认自己负责哪些事项时
- 接口路由：`GET /api/workspaces/{workspace_id}/agents/{agent_id}`
- 必填参数：路径 `workspace_id`（来自运行时上下文 `bound_platform_workspace_id`）、`agent_id`（来自运行时上下文 `agent_id`）
- 返回关键字段：`id`、`name`、`type`、`work_item_ids`
- 硬性约束：`workspace_id` 和 `agent_id` 必须存在且匹配

## 技术参数统一规则

### `workspace_id`

直接使用运行时上下文中的 `bound_platform_workspace_id`。

### `agent_id`

直接使用运行时上下文中的 `agent_id`。

## 动作一：查询绑定事项列表

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/agents/{agent_id}`

#### 请求参数

路径参数：

- `workspace_id`：当前绑定工作空间 id，来自运行时上下文 `bound_platform_workspace_id`
- `agent_id`：当前 agent 的平台 id，来自运行时上下文 `agent_id`

真实约束：

- `workspace_id` 和 `agent_id` 必须存在
- 该接口返回当前 agent 的完整信息，其中 `work_item_ids` 字段即为绑定的事项 ID 列表

#### 返回数据样例

```json
{
  "id": 3,
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 2,
  "name": "Athena 数据专员",
  "type": "athena",
  "agent_json": "{}",
  "work_item_ids": [4, 7, 12]
}
```

### 输出要求

1. 列出当前绑定的所有事项 ID
2. 如果 `work_item_ids` 为空，明确告知当前没有绑定任何事项
3. 提示用户可以通过 `item-execution` skill 查看具体事项详情并执行工作

## 重要约束

- **禁止**在未确认绑定关系的情况下操作事项。执行任何事项前，必须先通过本 skill 查询 `work_item_ids`，确认目标事项在列表中。
- 绑定关系可能随时变化，每次开始新任务前建议重新查询。
