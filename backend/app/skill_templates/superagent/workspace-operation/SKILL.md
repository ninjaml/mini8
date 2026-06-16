---
name: CamphorEOS-superagent-workspace-operation
description: 当 SuperAgent 需要读取当前工作空间详情与 dashboard 时使用。这个 skill 只处理当前空间的状态理解和推进判断，不处理全局工作空间管理。
---

# SuperAgent 工作空间内总览操作

只处理当前工作空间状态读取。

## 地址与端口
http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}`：读取当前工作空间详情
- `GET /api/workspaces/{workspace_id}/dashboard`：读取当前工作空间总览 dashboard

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 读取当前工作空间详情
- 触发条件：用户想查看当前空间基本信息，或为后续事项、知识库、成员操作确认上下文。
- 接口路由：`GET /api/workspaces/{workspace_id}`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`name`、`goal`、`super_agent_nick_name`、`created_at`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；`workspace_id` 必须存在。

### 读取当前工作空间总览
- 触发条件：用户想快速了解当前空间整体状态，或需要判断下一步推进重点。
- 接口路由：`GET /api/workspaces/{workspace_id}/dashboard`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`project_manager`、`agent_count`、`item_count`、`todo_count`、`knowledge_count`、`result_count`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；返回的是聚合总览，不是原始记录。

## 技术参数获取总规则

### `workspace_id`

对 SuperAgent 来说，`workspace_id` 默认来自当前绑定工作空间上下文。

一般不需要再查询工作空间列表，也不应再把 `workspace_id` 当成需要与用户反复确认的参数。

## 动作一：读取当前工作空间详情

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}`

#### 请求参数

路径参数：

- `workspace_id`：当前工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间

#### 返回数据样例

```json
{
  "id": 2,
  "name": "新媒体运营项目",
  "goal": "提升内容增长效率并在 Q3 实现粉丝增长 200%",
  "super_agent_nick_name": "项目经理"
}
```

### 输出要求

1. 概括当前空间目标
2. 说明当前空间配置状态
3. 如果用户后续动作明显，提示进入对应 skill

## 动作二：读取当前工作空间 dashboard

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/dashboard`

#### 请求参数

路径参数：

- `workspace_id`：当前工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间
- 返回的是聚合后的 dashboard 摘要，不是原始表记录

#### 返回数据样例

```json
{
  "project_manager": {
    "name": "项目经理",
    "status": "在线"
  },
  "agent_count": 3,
  "item_count": 12,
  "todo_count": 4,
  "knowledge_count": 6,
  "result_count": 18
}
```

### 输出要求

1. 输出当前空间运行状态摘要
2. 输出当前成员、事项、成果、知识库状态
3. 给出最值得推进的下一步

## 禁止动作

- 不创建工作空间
- 不删除工作空间
- 不调用 auth / runtime / resource_key 接口
