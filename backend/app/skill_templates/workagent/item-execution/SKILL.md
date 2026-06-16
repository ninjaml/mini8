---
name: CamphorEOS-workagent-item-execution
description: 当 WorkAgent 需要读取绑定事项的要求、在本地 working_dir 中执行工作、或提交成果时使用。
---

# WorkAgent 事项执行

只处理已绑定的事项。操作前必须先通过 `my-work-items` skill 查询当前绑定列表，确认目标事项在列表中。

## 地址与端口

http://localhost:2048

## 允许动作

### 事项详情

- `GET /api/items/{item_id}`：查看事项详情（含 work_requirement、delivery_requirement）

### 成果历史

- `GET /api/items/{item_id}/histories`：查看成果历史
- `POST /api/items/{item_id}/histories`：提交文本成果
- `POST /api/items/{item_id}/histories/upload`：上传文件成果

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 查看事项详情
- 触发条件：开始执行前必须先读取事项要求，或执行中需要确认交付标准。
- 接口路由：`GET /api/items/{item_id}`
- 必填参数：路径 `item_id`
- 返回关键字段：`id`、`name`、`description`、`work_requirement`、`delivery_requirement`、`need_superagent_review`、`current_status`
- 硬性约束：`item_id` 必须在当前绑定列表中（通过 `my-work-items` skill 查询确认）。

### 查看成果历史
- 触发条件：提交新成果前查看已有成果，或用户询问进展时。
- 接口路由：`GET /api/items/{item_id}/histories`
- 必填参数：路径 `item_id`
- 返回关键字段：`id`、`title`、`status`、`submitted_by_name`、`file_count`、`files`
- 硬性约束：`item_id` 必须在当前绑定列表中（通过 `my-work-items` skill 查询确认）。

### 提交文本成果
- 触发条件：本地工作已完成，产出满足 `delivery_requirement`，且用户确认提交。
- 接口路由：`POST /api/items/{item_id}/histories`
- 必填参数：路径 `item_id`；请求体 `work_space_id`、`work_item_id`、`status`、`summary`
- 返回关键字段：`id`、`status`、`title`、`summary`
- 硬性约束：
  - `item_id` 必须在当前绑定列表中（通过 `my-work-items` skill 查询确认）
  - `summary` 去空格后不能为空
  - **`status` 必须显式传入**，由 WorkAgent 根据事项配置决定：
    - 若 `need_superagent_review == true` → 传 `"reviewing"`
    - 若 `need_superagent_review == false` → 传 `"completed"`

### 上传文件成果
- 触发条件：本地工作产出包含文件，且用户确认提交。
- 接口路由：`POST /api/items/{item_id}/histories/upload`
- 必填参数：路径 `item_id`；表单 `title`、`summary`；`files` 可选
- 返回关键字段：`id`、`status`、`title`、`summary`、`file_count`、`files`
- 硬性约束：
  - `item_id` 必须在当前绑定列表中（通过 `my-work-items` skill 查询确认）
  - `title` 和 `summary` 为表单必填
  - **`status` 不需要传入**，后端根据 `need_superagent_review` 自动推导

## 本地工作区规则

### `local_runtime_working_dir`

这是 deepagents 的本地运行目录，路径在运行时上下文中提供。所有本地文件操作（创建、读取、修改、删除）都必须在此目录内进行。

**注意**：
- `local_runtime_working_dir` 只是运行时目录，不是 CamphorEOS 平台工作空间
- 不能从本地目录结构推断平台业务状态
- 本地文件是执行过程中的临时产出，最终成果需通过 API 提交

### 执行流程建议

1. **读取要求**：调用 `GET /api/items/{item_id}` 获取 `work_requirement` 和 `delivery_requirement`
2. **规划执行**：根据要求规划工作步骤和产出物
3. **本地执行**：在 `local_runtime_working_dir` 中创建/编辑文件
4. **自查**：对照 `delivery_requirement` 检查产出是否满足标准
5. **提交成果**：通过 `POST /api/items/{item_id}/histories` 或 upload 提交

## 技术参数统一规则

### `item_id`

通过 `my-work-items` skill 查询当前绑定列表获取。
禁止操作未绑定的事项。

### `workspace_id`

提交成果时，`work_space_id` 应使用 `bound_platform_workspace_id`（来自运行时上下文）。

### 成果状态推导

- 事项 `need_superagent_review == true` → 提交状态为 `"reviewing"`（进入 SuperAgent 审核流程）
- 事项 `need_superagent_review == false` → 提交状态为 `"completed"`（直接完成）

WorkAgent 不负责审核，只负责按配置正确提交状态。
