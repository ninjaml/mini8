---
name: CamphorEOS-moss-workspace-operation
description: 当 MOSS 需要读取某个工作空间的详情与总览状态时使用。这个 skill 只负责空间级读取，不直接处理成员、事项、成果历史或知识库的增删改。
---

# MOSS 工作空间内总览操作

只处理“先进入一个工作空间并读懂它当前状态”这件事。

## 地址与端口
http://localhost:2048

## 允许动作

- `GET /api/workspaces/{workspace_id}`：读取工作空间详情
- `GET /api/workspaces/{workspace_id}/dashboard`：读取工作空间总览 dashboard

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 读取工作空间详情
- 触发条件：用户想进入某个工作空间看基本信息，或为后续操作确认目标空间。
- 接口路由：`GET /api/workspaces/{workspace_id}`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`name`、`goal`、`super_agent_nick_name`、`created_at`
- 硬性约束：MOSS 不默认持有 `workspace_id`，先用 `GET /api/workspaces` 定位目标空间；`workspace_id` 必须存在。

### 读取工作空间总览
- 触发条件：用户想快速了解当前工作空间整体状态，或需要判断下一步重点。
- 接口路由：`GET /api/workspaces/{workspace_id}/dashboard`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`project_manager`、`agent_count`、`item_count`、`todo_count`、`knowledge_count`、`result_count`
- 硬性约束：MOSS 不默认持有 `workspace_id`，先定位目标空间；返回的是聚合总览，不是原始记录。

## 技术参数获取总规则

### `workspace_id`

对 MOSS 来说，`workspace_id` 默认不来自固定上下文。

获取方式统一为：

1. 先调用 `GET /api/workspaces`
2. 根据空间名称、描述或候选信息定位目标空间
3. 如有多个候选，先确认
4. 目标空间明确后，才能得到 `workspace_id`

## 动作一：读取工作空间详情

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}`

#### 请求参数

路径参数：

- `workspace_id`：目标工作空间 id

真实约束：

- `workspace_id` 必须是已存在的工作空间

#### 返回数据样例

```json
{
  "id": 1,
  "name": "新媒体运营项目",
  "goal": "提升内容增长效率并在 Q3 实现粉丝增长 200%",
  "super_agent_nick_name": "项目经理"
}
```

### 输出要求

1. 概括空间名称、核心目标、创建时间
2. 判断当前空间是否已经进入活跃协作状态
3. 说明下一步应该查看 dashboard 还是进入成员、事项、知识库管理

## 动作二：读取工作空间 dashboard

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/dashboard`

#### 请求参数

路径参数：

- `workspace_id`：目标工作空间 id

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

1. 输出项目经理 / SuperAgent 状态
2. 输出当前 workAgent 数量与运行情况
3. 输出事项、成果、待办、知识库情况
4. 根据 dashboard 判断最值得推进的下一步

## 禁止动作

- 不创建工作空间
- 不删除工作空间
- 不直接处理成员增删改
- 不直接处理事项增删改
- 不直接处理知识库管理
- 不调用 auth / runtime / resource_key 接口
