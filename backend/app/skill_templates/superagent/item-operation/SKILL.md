---
name: mini8-superagent-item-operation
description: 当 SuperAgent 需要在当前工作空间中查看、创建、修改、绑定、审核或删除事项与成果历史时使用。
---

# SuperAgent 事项与成果操作

只处理当前工作空间中的事项及成果历史。

## 地址与端口
http://localhost:2048

## 允许动作

### 事项

- `GET /api/workspaces/{workspace_id}/items`：查看事项列表
- `POST /api/workspaces/{workspace_id}/items`：创建事项
- `GET /api/items/{item_id}`：查看事项详情
- `PATCH /api/items/{item_id}`：修改事项
- `POST /api/items/{item_id}/bind-agent`：绑定 workAgent
- `DELETE /api/items/{item_id}`：删除事项

### 成果历史

- `GET /api/items/{item_id}/histories`：查看成果历史
- `POST /api/items/{item_id}/histories`：提交文本成果
- `POST /api/items/{item_id}/histories/upload`：上传文件成果
- `GET /api/histories/{history_id}/download`：下载成果压缩包
- `GET /api/histories/{history_id}/files/{file_name:path}`：读取成果文件
- `POST /api/histories/{history_id}/review`：审核成果
- `DELETE /api/histories/{history_id}`：删除成果

## 顶部速查

这一节统一只看 5 项：触发条件、接口路由、必填参数、返回关键字段、硬性约束。

### 查看事项列表
- 触发条件：用户想看当前工作空间有哪些事项，或为修改、绑定成员、查看成果先定位事项。
- 接口路由：`GET /api/workspaces/{workspace_id}/items`
- 必填参数：路径 `workspace_id`
- 返回关键字段：`id`、`work_space_id`、`name`、`current_status`、`agent_id`
- 硬性约束：`workspace_id` 默认来自当前绑定工作空间上下文；`workspace_id` 必须存在。

### 创建事项
- 触发条件：当前工作空间、事项名称和核心要求已明确，且用户确认创建。
- 接口路由：`POST /api/workspaces/{workspace_id}/items`
- 必填参数：路径 `workspace_id`；请求体 `work_space_id`、`name`
- 返回关键字段：`id`、`work_space_id`、`name`、`current_status`、`agent_id`
- 硬性约束：`name` 去空格后不能为空；同一工作空间下事项名称不能重复；路径 `workspace_id` 决定最终归属。

### 查看事项详情
- 触发条件：用户想看某个事项的完整信息。
- 接口路由：`GET /api/items/{item_id}`
- 必填参数：路径 `item_id`
- 返回关键字段：`id`、`work_space_id`、`name`、`description`、`work_requirement`、`delivery_requirement`、`need_superagent_review`、`need_superone_review`、`allow_auto_complete`、`current_status`、`agent_id`
- 硬性约束：`item_id` 必须存在。

### 修改事项
- 触发条件：目标事项已定位，且用户明确要修改名称、说明或审核配置。
- 接口路由：`PATCH /api/items/{item_id}`
- 必填参数：路径 `item_id`；请求体按需传可修改字段
- 返回关键字段：`id`、`work_space_id`、`name`、`current_status`、`agent_id`
- 硬性约束：`item_id` 必须存在；若修改 `name`，去空格后不能为空且同空间内不能重名；布尔配置会被后端规范化。

### 绑定 workAgent
- 触发条件：目标事项和目标成员都已定位，且用户明确要建立或更新绑定。
- 接口路由：`POST /api/items/{item_id}/bind-agent`
- 必填参数：路径 `item_id`；请求体 `agent_id` 可为空
- 返回关键字段：`id`、`work_space_id`、`name`、`current_status`、`agent_id`
- 硬性约束：`item_id` 必须存在；若传 `agent_id`，它必须属于该事项所在工作空间；传 `null` 可用于解绑。

### 查看成果历史
- 触发条件：用户想查看某个事项已有的成果记录。
- 接口路由：`GET /api/items/{item_id}/histories`
- 必填参数：路径 `item_id`
- 返回关键字段：`id`、`work_item_id`、`title`、`status`、`submitted_by_name`、`file_count`、`files`、`preview_text`
- 硬性约束：`item_id` 必须存在；`files` 是对象数组，元素含 `name`、`size`。

### 提交文本成果
- 触发条件：目标事项、成果标题、摘要、状态已明确，且用户确认提交。
- 接口路由：`POST /api/items/{item_id}/histories`
- 必填参数：路径 `item_id`；请求体 `work_space_id`、`work_item_id`、`status`，且 `summary` 不能为空
- 返回关键字段：`id`、`work_space_id`、`work_item_id`、`title`、`summary`、`status`、`file_count`、`files`、`preview_text`
- 硬性约束：`item_id` 必须存在；后端以路径 `item_id` 作为最终归属；`summary` 去空格后不能为空。

### 上传文件成果
- 触发条件：目标事项、成果标题、摘要、待上传文件已明确。
- 接口路由：`POST /api/items/{item_id}/histories/upload`
- 必填参数：路径 `item_id`；表单 `title`；`summary` 去空格后不能为空；`files` 可选
- 返回关键字段：`id`、`work_space_id`、`work_item_id`、`title`、`summary`、`status`、`file_count`、`files`、`preview_text`
- 硬性约束：`item_id` 必须存在；`title` 为表单必填；`status` 由后端根据审核配置自动推导；`files` 是对象数组，元素含 `name`、`size`。

### 下载成果压缩包
- 触发条件：用户要下载某次成果的全部文件。
- 接口路由：`GET /api/histories/{history_id}/download`
- 必填参数：路径 `history_id`
- 返回关键字段：文件流响应
- 硬性约束：`history_id` 必须存在；成功返回 zip 文件流。

### 读取成果文件
- 触发条件：用户已经明确某次成果中的具体文件。
- 接口路由：`GET /api/histories/{history_id}/files/{file_name:path}`
- 必填参数：路径 `history_id`、`file_name`
- 返回关键字段：文件流响应
- 硬性约束：`history_id` 必须存在；`file_name` 必须是该成果目录中的实际文件。

### 审核成果
- 触发条件：目标成果已定位，审核结论已明确，且用户确认执行审核。
- 接口路由：`POST /api/histories/{history_id}/review`
- 必填参数：路径 `history_id`；请求体 `status`
- 返回关键字段：`id`、`work_item_id`、`title`、`status`、`superagent_review_status`、`superagent_review_note`、`superone_review_status`、`superone_review_note`
- 硬性约束：`history_id` 必须存在；请求体里必须显式传入 `status`；可只更新部分审核字段。

### 删除成果
- 触发条件：用户明确要删除某条成果记录。
- 接口路由：`DELETE /api/histories/{history_id}`
- 必填参数：路径 `history_id`
- 返回关键字段：无，成功为 `HTTP 204 No Content`
- 硬性约束：`history_id` 必须存在；会同时清理对应成果目录并做空目录回收。

## 技术参数统一规则

### `workspace_id`

对 SuperAgent 来说，`workspace_id` 默认来自当前绑定工作空间上下文。

### `item_id`

获取方式：

1. 调用 `GET /api/workspaces/{workspace_id}/items`
2. 根据事项名称、状态或候选信息定位目标事项
3. 如果出现多个候选，先确认

### `agent_id`

获取方式：

1. 调用 `GET /api/workspaces/{workspace_id}/agents`
2. 根据成员名称定位目标成员
3. 如果出现多个候选，先确认

### `history_id`

获取方式：

1. 先确定 `item_id`
2. 调用 `GET /api/items/{item_id}/histories`
3. 根据成果标题、提交时间或候选信息定位目标成果
4. 如果出现多个候选，先确认

### `user_id`

涉及 `user_id` 的 API 调用，必须从 mini8 Runtime Context 中的 `current_user_id` 获取当前用户的真实 ID，禁止编造或使用示例中的占位符。

## 动作一：查看事项列表

### API信息

#### 地址

`GET /api/workspaces/{workspace_id}/items`

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
    "work_space_id": 2,
    "name": "增长看板采集脚本",
    "description": "完善数据抓取脚本并同步到周报素材看板",
    "work_requirement": "输出可运行脚本与异常说明",
    "delivery_requirement": "提交脚本文件和结果说明",
    "need_superagent_review": true,
    "need_superone_review": false,
    "allow_auto_complete": false,
    "current_status": "reviewing",
    "agent_id": 5
  }
]
```

### 输出要求

应当概括：

1. 事项名称
2. 当前状态
3. 是否已绑定 workAgent
4. 是否有待审核成果

## 动作二：创建事项

### API信息

#### 地址

`POST /api/workspaces/{workspace_id}/items`

#### 请求参数

```json
{
  "user_id": "2e980b8207ae4e7383f34d2cb505b0bd",
  "work_space_id": 2,
  "name": "增长看板采集脚本",
  "description": "完善数据抓取脚本并同步到周报素材看板",
  "work_requirement": "输出可运行脚本与异常说明",
  "delivery_requirement": "提交脚本文件和结果说明",
  "need_superagent_review": true,
  "need_superone_review": false,
  "allow_auto_complete": false
}
```

真实约束：

- 路径中的 `workspace_id` 决定事项所属空间
- 请求体中的 `work_space_id` schema 上存在，但实际以路径中的 `workspace_id` 为准
- `name` 必填
- 同一工作空间中事项名称不能重复

#### 返回数据样例

```json
{
  "id": 3,
  "work_space_id": 2,
  "name": "增长看板采集脚本",
  "description": "完善数据抓取脚本并同步到周报素材看板",
  "work_requirement": "输出可运行脚本与异常说明",
  "delivery_requirement": "提交脚本文件和结果说明",
  "need_superagent_review": true,
  "need_superone_review": false,
  "allow_auto_complete": false,
  "current_status": null,
  "agent_id": null
}
```

### 输出要求

1. 明确告知事项创建成功
2. 概括事项目标与审核方式
3. 提示下一步是否要绑定 workAgent

## 动作三：查看事项详情

### API信息

#### 地址

`GET /api/items/{item_id}`

#### 请求参数

路径参数：

- `item_id`：目标事项 id

真实约束：

- `item_id` 必须是已存在的事项

#### 返回数据样例

```json
{
  "id": 3,
  "work_space_id": 2,
  "name": "增长看板采集脚本",
  "description": "完善数据抓取脚本并同步到周报素材看板",
  "work_requirement": "输出可运行脚本与异常说明",
  "delivery_requirement": "提交脚本文件和结果说明",
  "need_superagent_review": true,
  "need_superone_review": false,
  "allow_auto_complete": false,
  "current_status": "reviewing",
  "agent_id": 5
}
```

### 输出要求

应当概括：

1. 事项名称
2. 描述
3. 工作要求
4. 交付要求
5. 当前状态
6. 绑定成员情况

## 动作四：修改事项

### API信息

#### 地址

`PATCH /api/items/{item_id}`

#### 请求参数

```json
{
  "name": "增长看板脚本优化",
  "description": "补充异常处理与采集说明",
  "work_requirement": "输出可运行脚本、异常处理策略和部署说明",
  "delivery_requirement": "提交脚本文件和说明文档",
  "need_superagent_review": true,
  "need_superone_review": false,
  "allow_auto_complete": false
}
```

真实约束：

- `item_id` 必须是已存在的事项
- 传入的 `name` 不能为空字符串
- 如果修改 `name`，同一工作空间中仍不能重复
- 请求体中只传需要修改的字段

#### 返回数据样例

```json
{
  "id": 3,
  "work_space_id": 2,
  "name": "增长看板脚本优化",
  "description": "补充异常处理与采集说明",
  "work_requirement": "输出可运行脚本、异常处理策略和部署说明",
  "delivery_requirement": "提交脚本文件和说明文档",
  "need_superagent_review": true,
  "need_superone_review": false,
  "allow_auto_complete": false,
  "current_status": "reviewing",
  "agent_id": 5
}
```

### 输出要求

1. 说明修改成功
2. 明确列出已修改字段
3. 如审核或交付方式变化，单独提醒

## 动作五：绑定 workAgent

### API信息

#### 地址

`POST /api/items/{item_id}/bind-agent`

#### 请求参数

```json
{
  "agent_id": 5
}
```

解除绑定时：

```json
{
  "agent_id": null
}
```

真实约束：

- `item_id` 必须是已存在的事项
- `agent_id` 可以为 `null`，表示解除绑定
- 如果提供 `agent_id`，该成员必须存在且属于同一工作空间

#### 返回数据样例

```json
{
  "id": 3,
  "work_space_id": 2,
  "name": "增长看板采集脚本",
  "current_status": "reviewing",
  "agent_id": 5
}
```

### 输出要求

1. 明确说明绑定或解绑是否成功
2. 说明当前事项负责人是谁
3. 提示是否继续查看事项详情或成果历史

## 动作六：查看成果历史

### API信息

#### 地址

`GET /api/items/{item_id}/histories`

#### 请求参数

路径参数：

- `item_id`：目标事项 id

真实约束：

- `item_id` 必须是已存在的事项

#### 返回数据样例

```json
[
  {
    "id": 8,
    "work_item_id": 3,
    "title": "增长看板初版脚本",
    "summary": "自动化采集链路已跑通，待补充异常处理说明。",
    "submitted_by_name": "OpenClaw 研发专员",
    "status": "reviewing",
    "file_count": 2,
    "files": [
      {
        "name": "growth-script-v1.js",
        "size": 8192
      },
      {
        "name": "README.md",
        "size": 1024
      }
    ],
    "preview_text": "自动化采集链路已跑通..."
  }
]
```

### 输出要求

应当概括：

1. 成果标题
2. 当前状态
3. 提交人
4. 文件数量
5. 是否存在待审核成果

## 动作七：提交文本成果

### API信息

#### 地址

`POST /api/items/{item_id}/histories`

#### 请求参数

```json
{
  "work_space_id": 2,
  "work_item_id": 3,
  "status": "reviewing",
  "title": "增长看板初版说明",
  "summary": "已说明当前采集逻辑、异常点和下一步优化方向。",
  "submitted_by_name": "OpenClaw 研发专员"
}
```

真实约束：

- 路径中的 `item_id` 决定成果所属事项
- `work_space_id`、`work_item_id` schema 上存在，但应与事项实际归属一致
- `summary` 必填且不能为空
- `status` 必填，当前系统常见值包括 `reviewing`、`completed`、`rejected`

#### 返回数据样例

```json
{
  "id": 8,
  "work_space_id": 2,
  "work_item_id": 3,
  "title": "增长看板初版说明",
  "summary": "已说明当前采集逻辑、异常点和下一步优化方向。",
  "submitted_by_name": "OpenClaw 研发专员",
  "status": "reviewing",
  "file_count": 0,
  "files": [],
  "preview_text": "已说明当前采集逻辑、异常点和下一步优化方向。"
}
```

### 输出要求

1. 说明成果已提交
2. 说明当前状态
3. 如果进入审核，提示下一步需要谁处理

## 动作八：上传文件成果

### API信息

#### 地址

`POST /api/items/{item_id}/histories/upload`

#### 请求参数

表单字段：

- `title`：成果标题
- `summary`：成果摘要
- `files`：文件列表，可选

真实约束：

- `title` 为表单必填
- `summary` 必填且不能为空
- `files` 可为空
- 接口会根据事项审核配置自动推导成果状态

#### 返回数据样例

```json
{
  "id": 9,
  "work_space_id": 2,
  "work_item_id": 3,
  "title": "增长看板脚本附件包",
  "summary": "补充上传脚本、配置和运行说明文件。",
  "submitted_by_name": "OpenClaw 研发专员",
  "status": "reviewing",
  "file_count": 3,
  "files": [
    {
      "name": "growth-script-v1.js",
      "size": 8192
    },
    {
      "name": "config.json",
      "size": 2048
    },
    {
      "name": "README.md",
      "size": 1024
    }
  ],
  "preview_text": "补充上传脚本、配置和运行说明文件。"
}
```

### 输出要求

1. 说明上传成功
2. 说明生成的成果状态
3. 列出已接收文件数量

## 动作九：下载成果压缩包

### API信息

#### 地址

`GET /api/histories/{history_id}/download`

#### 请求参数

路径参数：

- `history_id`：目标成果记录 id

真实约束：

- `history_id` 必须是已存在的成果记录
- 接口返回压缩包流

#### 返回数据样例

```text
二进制 zip 文件流
```

### 输出要求

1. 告知用户已开始下载或已提供下载结果
2. 说明这是该成果记录的完整压缩包

## 动作十：读取成果文件

### API信息

#### 地址

`GET /api/histories/{history_id}/files/{file_name:path}`

#### 请求参数

路径参数：

- `history_id`：目标成果记录 id
- `file_name`：成果中的目标文件名或相对路径

真实约束：

- `history_id` 必须是已存在的成果记录
- `file_name` 必须是该成果目录中实际存在的文件

#### 返回数据样例

```text
目标文件的二进制或文本流
```

### 输出要求

1. 告知用户已读取哪个文件
2. 如有必要，概括文件内容或提示可继续下载完整压缩包

## 动作十一：审核成果

### API信息

#### 地址

`POST /api/histories/{history_id}/review`

#### 请求参数

```json
{
  "status": "completed",
  "superagent_review_status": "passed",
  "superagent_review_note": "脚本与说明齐全，可以进入成果库。"
}
```

真实约束：

- `history_id` 必须是已存在的成果记录
- `status` 必填
- 可以只更新审核字段中的一部分，但请求体里仍必须显式传入 `status`
- 后端只会在未显式传入某些审核字段时，基于当前审核字段计算最终记录状态

#### 返回数据样例

```json
{
  "id": 8,
  "work_item_id": 3,
  "title": "增长看板初版脚本",
  "status": "completed",
  "superagent_review_status": "passed",
  "superagent_review_note": "脚本与说明齐全，可以进入成果库。"
}
```

### 输出要求

1. 明确说明审核已完成
2. 说明当前成果状态
3. 如被驳回，概括驳回原因

## 动作十二：删除成果

### API信息

#### 地址

`DELETE /api/histories/{history_id}`

#### 请求参数

路径参数：

- `history_id`：目标成果记录 id

真实约束：

- `history_id` 必须是已存在的成果记录
- 删除时会同步清理对应成果文件目录
- 成功后返回 `204 No Content`

#### 返回数据样例

```text
HTTP 204 No Content
```

### 输出要求

1. 说明成果已删除
2. 如有必要，提示当前事项还剩余多少成果记录

## 动作十三：删除事项

### API信息

#### 地址

`DELETE /api/items/{item_id}`

#### 请求参数

路径参数：

- `item_id`：目标事项 id

真实约束：

- `item_id` 必须是已存在的事项
- 删除时会同步清理事项历史、成员绑定、资源键和事项文件
- 成功后返回 `204 No Content`

#### 返回数据样例

```text
HTTP 204 No Content
```

### 输出要求

1. 说明事项已删除
2. 如有必要，提示当前空间剩余事项情况
