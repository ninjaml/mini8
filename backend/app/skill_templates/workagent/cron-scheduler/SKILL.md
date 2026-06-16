---
name: CamphorEOS-workagent-cron-scheduler
description: 当 WorkAgent 需要管理自己的定时任务（创建、查询、修改、删除、手动触发、查看执行历史）时使用。
---

# WorkAgent 定时任务调度器

管理 WorkAgent 的 cron job，包括任务生命周期管理与执行历史回溯。

## 地址与端口

http://localhost:2048

## 动作清单

以下场景分别对应下方 9 个动作详情：

- 用户想查看当前 WorkAgent 有哪些定时任务 → 动作一：列出任务（L45 - L90）
- 用户想为当前 WorkAgent 新增一个定时任务 → 动作二：创建任务（L91 - L147）
- 用户想查看某个任务的完整配置或最近状态 → 动作三：获取任务详情（L148 - L191）
- 用户想修改任务（名称、调度周期、prompt、启用状态、工作目录）→ 动作四：修改任务（L192 - L247）
- 用户想删除一个定时任务 → 动作五：删除任务（L248 - L274）
- 用户想立即执行一次任务，不等定时触发 → 动作六：手动触发（L275 - L309）
- 用户想暂停或恢复某个任务的自动触发 → 动作七：启用/禁用切换（L310 - L358）
- 用户想查看所有任务的最近执行摘要 → 动作八：历史概览（L359 - L402）
- 用户想查看某个任务的具体执行记录 → 动作九：历史详情（L403 - L477）

## 技术参数获取总规则

### `agent_id`

对 WorkAgent 来说，`agent_id` 默认来自当前绑定上下文。创建或查询 cron 任务时，`target_id`（即 `agent_id`）直接使用该值。

### `job_id`

通过 `GET /api/runtime/cron/jobs` 列出任务后获取。操作前必须先确认 `job_id` 存在。

### `schedule`

cron 表达式，5 字段格式（分 时 日 月 周），示例：
- `0 9 * * *`：每天上午 9 点
- `*/5 * * * *`：每 5 分钟
- `0 9 * * 1`：每周一上午 9 点

## 动作一：列出任务

### API信息

#### 地址

`GET /api/runtime/cron/jobs?agent_name=workagent-{agent_id}`

#### 请求参数

查询参数：

- `agent_name`：可选，如 `workagent-2`

#### 返回数据样例

```json
[
  {
    "id": 1,
    "kind": "workagent",
    "target_id": 2,
    "agent_name": "workagent-2",
    "name": "每日数据分析",
    "schedule": "0 9 * * *",
    "prompt": "执行每日数据分析任务",
    "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
    "working_dir": "/path/to/workagent/2",
    "enabled": true,
    "created_at": "2025-05-27T10:00:00+00:00",
    "updated_at": "2025-05-27T10:00:00+00:00",
    "last_run_at": "2025-05-28T09:00:00+00:00",
    "last_status": "success",
    "last_error": null,
    "last_duration_ms": 12345,
    "run_count": 5
  }
]
```

### 输出要求

1. 列出当前 WorkAgent 的所有任务，标注启用/禁用状态
2. 高亮最近执行状态异常（`error` 或 `skipped`）的任务
3. 说明下一步可进行的操作（编辑、触发、查看历史）

## 动作二：创建任务

### API信息

#### 地址

`POST /api/runtime/cron/jobs`

#### 请求参数

```json
{
  "kind": "workagent",
  "target_id": 2,
  "name": "每日数据分析",
  "schedule": "0 9 * * *",
  "prompt": "执行每日数据分析任务",
  "working_dir": null
}
```

真实约束：

- `kind` 固定为 `"workagent"`
- `target_id` 必须使用当前 `agent_id`（WorkAgent 的平台唯一标识）
- `schedule` 必须是有效 cron 表达式

#### 返回数据样例

```json
{
  "id": 1,
  "kind": "workagent",
  "target_id": 2,
  "agent_name": "workagent-2",
  "name": "每日数据分析",
  "schedule": "0 9 * * *",
  "prompt": "执行每日数据分析任务",
  "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
  "working_dir": "/path/to/workagent/2",
  "enabled": true,
  "created_at": "2025-05-27T10:00:00+00:00",
  "updated_at": "2025-05-27T10:00:00+00:00",
  "last_run_at": null,
  "last_status": null,
  "last_error": null,
  "last_duration_ms": null,
  "run_count": 0
}
```

### 输出要求

1. 确认任务已创建并自动注册到调度器
2. 说明下次预计触发时间
3. 提示用户可以立即手动触发测试

## 动作三：获取任务详情

### API信息

#### 地址

`GET /api/runtime/cron/jobs/{job_id}`

#### 请求参数

路径参数：

- `job_id`：任务 id

#### 返回数据样例

```json
{
  "id": 1,
  "kind": "workagent",
  "target_id": 2,
  "agent_name": "workagent-2",
  "name": "每日数据分析",
  "schedule": "0 9 * * *",
  "prompt": "执行每日数据分析任务",
  "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
  "working_dir": "/path/to/workagent/2",
  "enabled": true,
  "created_at": "2025-05-27T10:00:00+00:00",
  "updated_at": "2025-05-27T10:00:00+00:00",
  "last_run_at": "2025-05-28T09:00:00+00:00",
  "last_status": "success",
  "last_error": null,
  "last_duration_ms": 12345,
  "run_count": 5
}
```

### 输出要求

1. 概括任务基本信息（名称、调度周期、启用状态）
2. 展示最近执行状态（时间、结果、耗时、累计次数）
3. 如有 `last_error`，高亮显示并提供排查建议

## 动作四：修改任务

### API信息

#### 地址

`PATCH /api/runtime/cron/jobs/{job_id}`

#### 请求参数

```json
{
  "name": "每日数据分析（已更新）",
  "schedule": "0 10 * * *",
  "prompt": "执行每日数据分析任务（更新版）",
  "enabled": true,
  "working_dir": null
}
```

真实约束：

- `kind` 和 `target_id`（即 `agent_id`）不可变更
- 修改 `schedule` 会自动重新调度
- 修改 `enabled` 会自动注册/卸载调度器

#### 返回数据样例

```json
{
  "id": 1,
  "kind": "workagent",
  "target_id": 2,
  "agent_name": "workagent-2",
  "name": "每日数据分析（已更新）",
  "schedule": "0 10 * * *",
  "prompt": "执行每日数据分析任务（更新版）",
  "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
  "working_dir": "/path/to/workagent/2",
  "enabled": true,
  "created_at": "2025-05-27T10:00:00+00:00",
  "updated_at": "2025-05-28T11:00:00+00:00",
  "last_run_at": "2025-05-28T09:00:00+00:00",
  "last_status": "success",
  "last_error": null,
  "last_duration_ms": 12345,
  "run_count": 5
}
```

### 输出要求

1. 确认修改已生效
2. 说明调度器状态是否同步调整
3. 提示下次预计触发时间（如 schedule 有变更）

## 动作五：删除任务

### API信息

#### 地址

`DELETE /api/runtime/cron/jobs/{job_id}`

#### 请求参数

路径参数：

- `job_id`：任务 id

#### 返回数据样例

```json
{
  "message": "Cron job deleted"
}
```

### 输出要求

1. 确认任务已删除并从调度器卸载
2. 提醒删除不可恢复，相关执行历史仍保留在 `session_events` 中

## 动作六：手动触发

### API信息

#### 地址

`POST /api/runtime/cron/jobs/{job_id}/run`

#### 请求参数

路径参数：

- `job_id`：任务 id

真实约束：

- 立即返回 `202 Accepted`，实际执行在后台异步进行
- 不受 `enabled=false` 限制
- 若任务正在运行，本次触发被跳过（`skipped`）

#### 返回数据样例

```json
{
  "message": "Job triggered",
  "job_id": 1
}
```

### 输出要求

1. 确认任务已触发，正在后台执行
2. 建议等待几秒后查询详情确认执行结果
3. 提醒若任务正在运行则本次被跳过

## 动作七：启用/禁用切换

### API信息

#### 地址

`POST /api/runtime/cron/jobs/{job_id}/toggle`

#### 请求参数

路径参数：

- `job_id`：任务 id

真实约束：

- 自动翻转 `enabled` 状态
- 禁用自动卸载调度器，启用自动重新注册

#### 返回数据样例

```json
{
  "id": 1,
  "kind": "workagent",
  "target_id": 2,
  "agent_name": "workagent-2",
  "name": "每日数据分析",
  "schedule": "0 9 * * *",
  "prompt": "执行每日数据分析任务",
  "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
  "working_dir": "/path/to/workagent/2",
  "enabled": false,
  "created_at": "2025-05-27T10:00:00+00:00",
  "updated_at": "2025-05-28T11:00:00+00:00",
  "last_run_at": "2025-05-28T09:00:00+00:00",
  "last_status": "success",
  "last_error": null,
  "last_duration_ms": 12345,
  "run_count": 5
}
```

### 输出要求

1. 明确告知当前启用状态（已启用 / 已禁用）
2. 说明调度器是否已同步注册/卸载
3. 禁用时提醒手动触发仍可执行

## 动作八：历史概览

### API信息

#### 地址

`GET /api/runtime/cron/history?kind=workagent&target_id={agent_id}`

#### 请求参数

查询参数：

- `kind`：固定 `"workagent"`
- `target_id`：当前 `agent_id`（WorkAgent 的平台唯一标识）

#### 返回数据样例

```json
{
  "jobs": [
    {
      "job_id": 1,
      "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
      "name": "每日数据分析",
      "schedule": "0 9 * * *",
      "enabled": true,
      "last_run_at": "2025-05-28T09:00:00+00:00",
      "last_status": "success",
      "last_duration_ms": 12345,
      "run_count": 5,
      "last_result_summary": "今日总结...",
      "last_result_created_at": "2025-05-28T09:00:00+00:00"
    }
  ],
  "default_job_id": 1
}
```

### 输出要求

1. 列出当前 WorkAgent 的所有任务及其最近执行摘要
2. 高亮状态异常的任务
3. 提供进入单任务历史详情的入口指引

## 动作九：历史详情

### API信息

#### 地址

`GET /api/runtime/cron/history/jobs/{job_id}?group_limit=20&before_cursor={可选}`

#### 请求参数

路径参数：

- `job_id`：任务 id

查询参数：

- `group_limit`：默认 20，最大 100
- `before_cursor`：分页游标，首次不传

真实约束：

- `group_limit` 超过 100 会被截断
- `next_cursor` 非空时表示还有更多记录

#### 返回数据样例

```json
{
  "job_id": 1,
  "thread_id": "cron-workagent-2-daily-analysis-xxxxx",
  "latest_group": {
    "group_id": "uuid",
    "started_at": "2025-05-28T09:00:00+00:00",
    "status": "success",
    "duration_ms": 12345,
    "summary": "今日总结...",
    "final_answer": "完整回答内容...",
    "events": [
      {
        "type": "assistant",
        "content": "今日数据分析结果...",
        "metadata": {},
        "created_at": "2025-05-28T09:00:00+00:00"
      }
    ]
  },
  "groups": [
    {
      "group_id": "uuid",
      "started_at": "2025-05-28T09:00:00+00:00",
      "status": "success",
      "duration_ms": 12345,
      "summary": "今日总结...",
      "final_answer": "完整回答内容...",
      "events": [
        {
          "type": "assistant",
          "content": "今日数据分析结果...",
          "metadata": {},
          "created_at": "2025-05-28T09:00:00+00:00"
        }
      ]
    }
  ],
  "next_cursor": 42
}
```

### 输出要求

1. 展示每次执行的时间、状态、耗时和结果摘要
2. 对 `error` 状态的执行组，提取 `final_answer` 或 `events` 中的错误信息
3. 如有 `next_cursor`，说明可以继续翻页查看更多历史

