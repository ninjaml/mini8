---
name: cron-scheduler
description: 普通业务 Agent 的定时任务管理与执行历史查看能力。
---

# Cron Scheduler

这个 skill 只负责普通业务 Agent 的 cron 任务。

它处理的是：

- 当前 `agent_session` 下的 cron 任务创建、查询、修改、删除
- 任务立即执行
- 任务启停
- 任务历史与执行结果查看

它不处理：

- workspace 群聊消息
- workspace 成员管理
- persona 选择
- 全局平台配置

## 地址与端口

`http://localhost:2048`

## 参数真相

### `agent_session_id`

对普通业务 Agent 来说，`agent_session_id` 来自当前运行时上下文。

你不需要自己编造，也不要拿别的 session id 代替。

### `job_id`

先通过：

`GET /api/runtime/cron/history?kind=agent_session&agent_session_id={agent_session_id}`

从 `jobs[].job_id` 中读取。

确认目标存在后，才能继续操作。

### `schedule`

使用 5 段 cron 表达式：

- `0 9 * * *`：每天 9:00
- `*/5 * * * *`：每 5 分钟
- `0 9 * * 1`：每周一 9:00

## 动作一：查看当前任务列表

### 接口

`GET /api/runtime/cron/history?kind=agent_session&agent_session_id={agent_session_id}`

如果是在工作空间任务页里看当前 workspace 的任务列表，优先使用：

`GET /api/runtime/cron/jobs?workspace_id={workspace_id}`

### 输出要求

1. 列出全部任务及启用状态
2. 优先指出最近异常的任务（`error` / `skipped`）
3. 说明接下来可继续查看详情、修改、启停或立即运行
4. `job_id` 以 `jobs[].job_id` 为准，不是 `id`

## 动作二：创建任务

### 接口

`POST /api/runtime/cron/jobs`

### 请求体示例

```json
{
  "kind": "agent_session",
  "agent_session_id": 2,
  "name": "Daily analysis",
  "schedule": "0 9 * * *",
  "prompt": "Run daily analysis",
  "working_dir": null
}
```

### 约束

- `kind` 固定为 `agent_session`
- `agent_session_id` 必须是当前稳定会话 id
- `schedule` 必须合法

## 动作三：查看任务详情

### 接口

`GET /api/runtime/cron/jobs/{job_id}`

### 输出要求

1. 概括名称、计划、启用状态、工作目录
2. 说明最近一次执行状态、耗时、累计运行次数
3. 若存在 `last_error`，必须明确指出

## 动作四：修改任务

### 接口

`PATCH /api/runtime/cron/jobs/{job_id}`

### 约束

- 至少提供一项有效变更
- 若提供 `schedule`，必须合法
- 修改 `enabled` 或 `schedule` 会立即影响调度注册

### 输出要求

1. 精确说明改了什么
2. 若改了 `schedule`，说明调度已重排
3. 若改了 `enabled`，说明当前已启用还是已停用

## 动作五：删除任务

### 接口

`DELETE /api/runtime/cron/jobs/{job_id}`

### 输出要求

1. 明确确认删除成功
2. 说明调度触发也已移除

## 动作六：立即执行任务

### 接口

`POST /api/runtime/cron/jobs/{job_id}/run`

### 约束

- 返回 `202 Accepted`
- 实际执行是异步的

### 输出要求

1. 说明任务已触发
2. 提醒稍后查看详情或历史结果

## 动作七：启停任务

### 接口

`POST /api/runtime/cron/jobs/{job_id}/toggle`

### 输出要求

1. 明确说明新的启用状态
2. 说明调度注册已随之更新

## 动作八：查看历史概览

### 接口

`GET /api/runtime/cron/history?kind=agent_session&agent_session_id={agent_session_id}`

### 输出要求

1. 列出全部任务最近执行摘要
2. 优先展示失败或跳过的任务
3. 当用户说“最新那个”时，优先使用 `default_job_id`

## 动作九：查看历史详情

### 接口

`GET /api/runtime/cron/history/jobs/{job_id}?group_limit=20&before_cursor={optional}`

### 输出要求

1. 汇报每次执行的开始时间、状态、耗时和摘要
2. 若状态为 `error`，从 `final_answer` 或 `events` 中提取错误信号
3. 若存在 `next_cursor`，明确告诉用户还有更多历史可翻

## 边界提醒

cron 历史属于独立执行链，不等于 workspace 群聊历史。

因此：

- 不要把 cron 历史当作 workspace message
- 不要把 cron 结果说成普通会话里刚刚发生的对话
- 需要区分“定时任务执行记录”和“当前会话实时协作上下文”
