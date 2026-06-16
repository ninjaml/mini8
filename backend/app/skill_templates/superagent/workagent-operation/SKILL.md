---
name: CamphorEOS-superagent-workagent-operation
description: 当 SuperAgent 需要在当前工作空间内管理 workAgent 成员时使用。这个 skill 只负责成员记录的增删改查，不负责 workAgent 本地执行控制。
---

# SuperAgent workAgent 成员操作

只处理当前工作空间中的 workAgent 成员管理。

## 地址与端口
http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}/agents`：查看成员列表
- `POST /api/workspaces/{workspace_id}/agents`：创建成员
- `PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`：修改成员
- `DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`：删除成员

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 查看成员列表
- 触发条件：用户想看当前工作空间有哪些成员，或要为修改、删除、事项绑定先定位目标成员。
- 接口路由：`GET /api/workspaces/{workspace_id}/agents`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；`workspace_id` 必须存在。

### 创建成员
- 触发条件：当前工作空间、成员名称、成员类型已明确，且用户确认创建。
- 接口路由：`POST /api/workspaces/{workspace_id}/agents`
- 必填参数：路径 `workspace_id`；请求体 `work_space_id`、`name`
- 可选参数：`type`（默认 `"mini8"`）、`agent_json`（默认 `"{}"`）、`user_id`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；请求体中的 `work_space_id` 必须与路径中的 `workspace_id` 保持一致（后端以路径参数为准）；若未传 `type`，后端使用默认值 `"mini8"`；若未传 `agent_json`，后端写入字符串 `"{}"`。

### 修改成员
- 触发条件：目标成员已定位，且用户明确要修改名称、类型或配置。
- 接口路由：`PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`
- 必填参数：路径 `workspace_id`、`agent_id`；请求体按需传 `name`、`type`、`agent_json`
- 返回关键字段：`id`、`user_id`、`work_space_id`、`name`、`type`、`agent_json`、`work_item_ids`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；`agent_id` 必须属于该工作空间；只有 `name`、`type`、`agent_json` 会被更新。

### 删除成员
- 触发条件：用户明确要删除某个成员记录，且目标已定位、删除影响已说明。
- 接口路由：`DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`
- 必填参数：路径 `workspace_id`、`agent_id`
- 返回关键字段：`status`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；`agent_id` 必须属于该工作空间；成功返回 `{ "status": "deleted" }`。

## 技术参数获取总规则

### `workspace_id`

对 SuperAgent 来说，`workspace_id` 默认来自当前绑定工作空间上下文。

### `agent_id`

1. 调用 `GET /api/workspaces/{workspace_id}/agents`
2. 根据成员名称定位目标成员
3. 如果匹配出多个候选，必须先确认
4. 只有目标成员明确后，才能得到 `agent_id`

### `user_id`

涉及 `user_id` 的 API 调用，必须从 CamphorEOS Runtime Context 中的 `current_user_id` 获取当前用户的真实 ID，禁止编造或使用示例中的占位符。

## 动作一：查看成员列表

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/agents`

#### 请求参数

路径参数：

- `workspace_id`：当前工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间

#### 返回数据样例

```json
[
  {
    "id": 3,
    "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
    "work_space_id": 2,
    "name": "Athena 数据专员",
    "type": "athena",
    "agent_json": "{}",
    "work_item_ids": [4, 7]
  }
]
```

### 输出要求

1. 列出现有成员
2. 说明当前是否缺成员
3. 根据用户意图提示下一步是创建、修改还是绑定事项

## 动作二：创建成员

### API信息

#### 地址

`POST /api/workspaces/{workspace_id}/agents`

#### 请求参数

```json
{
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 2,
  "name": "Athena 数据专员",
  "type": "athena",
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
  "id": 3,
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 2,
  "name": "Athena 数据专员",
  "type": "athena",
  "agent_json": "{}",
  "work_item_ids": []
}
```

### 输出要求

1. 告知创建成功
2. 复述成员信息
3. 询问是否要立刻绑定到事项

## 动作三：修改成员

### API信息

#### 地址

`PATCH /api/workspaces/{workspace_id}/agents/{agent_id}`

#### 请求参数

```json
{
  "name": "OpenClaw 研发专员",
  "type": "openclaw",
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
  "id": 3,
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 2,
  "name": "OpenClaw 研发专员",
  "type": "openclaw",
  "agent_json": "{}",
  "work_item_ids": []
}
```

### 输出要求

1. 应说明修改结果
2. 如有需要，提醒是否影响事项绑定

## 动作四：删除成员

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

1. 告知删除完成
2. 提示是否需要检查该成员关联事项

## 输出要求

返回时按以下结构组织：

1. 当前成员状态
2. 业务信息澄清结果
3. 技术定位结果
4. 执行动作
5. 结果
6. 下一步建议
