---
name: mini8-skill-submission
description: Use when a user wants to submit a mini8 skill zip and fields such as summary, use_for, or not_for must be inferred from the package before any API call - analyzes the zip, produces evidence-backed candidates with confidence, stops on conflicts or weak materials, gets per-field user confirmation, then creates the draft and uploads the archive.
---

# mini8 Skill 投稿

## Overview
这是投稿前审包流程，不是草稿 CRUD 封装。
先解析 zip，生成字段候选值、证据和置信度，并结合可用分类列表产出候选 tag，与用户逐项确认；只有字段和分类都有结论后，才允许创建 skill、上传 zip，并绑定已存在的 tag。

## When to Use
使用场景：
- 用户要提交本地 mini8 skill zip
- `slug`、`summary`、`use_for`、`not_for`、安装说明等需要从包内内容推断
- 需要在投稿前把字段与证据逐项核对清楚

## 投稿字段
必须形成结论的字段：
- `slug`
- `chinese_name`
- `summary`
- `version`
- `use_for`
- `not_for`
- `skill_installation`
- `dependency_installation`

这里不处理：
- `status`：后端创建时写成 `editing`
- `file_path`：上传并解压后由后端写入

## API Base URL
默认接口基地址是 `https://ep2048.cn/market`。
本 skill 中出现的相对路径都以这个地址为前缀，例如：
- `POST /api/skills` = `POST https://ep2048.cn/market/api/skills`
- `POST /api/skills/{skill_id}/archive` = `POST https://ep2048.cn/market/api/skills/{skill_id}/archive`

## 认证

所有 POST 写接口需要认证，请求头必须包含：

```
Authorization: Bearer dev:{primary_key}
```

`primary_key` 直接从 CamphorEOS Runtime Context 中的 `primary_key` 字段获取，无需额外登录。

规则：
- 如果 Runtime Context 中没有 `primary_key` 或值为 `unknown`，停止投稿流程，提示用户先登录 CamphorEOS。
- `primary_key` 等同于当前登录用户的 `user_id`，由平台在启动 Agent 时自动注入。

## API Summary
只允许使用五个投稿相关 API：
- `GET /api/tags`（无需认证）
- `GET /api/tags/{tag_id}`（无需认证）
- `POST /api/skills`（需要认证：Header `Authorization: Bearer dev:{primary_key}`）
- `POST /api/skills/{skill_id}/archive`（需要认证）
- `POST /api/skills/{skill_id}/tags/{tag_id}`（需要认证）

五个接口的请求参数、JSON 示例、返回值和错误说明，都统一见 [references/submission-spec.md](references/submission-spec.md)。
本地 zip 的读取示例单独见 [references/read-zip-example.py](references/read-zip-example.py)。该示例只负责把 zip 内文本文件读取成 `path -> content` 的 JSON 对象，字段推断仍由 agent/LLM 完成。

## Quick Reference
| 阶段 | 允许动作 | 必须停止 |
| --- | --- | --- |
| 审包 | 广扫文档、元数据、示例和主要源码 | 材料不足或证据冲突 |
| 提取 | 为每个字段产出候选值、证据、置信度 | 任何字段只剩猜测 |
| 分类 | 基于提取结论查询可用 tags，并产出候选 tag | tag 只剩猜测或用户未确认 |
| 确认 | 逐项与用户确认，允许“明确为空” | 任一字段或分类未形成结论 |
| 提交 | 创建 skill → 上传 zip → 绑定已确认 tag | 不得先创建后补填 |

## Workflow
1. 先按 [references/submission-spec.md](references/submission-spec.md) 广扫 zip。
2. 对每个字段产出：候选值、证据、置信度、状态。
3. 基于字段提取结论查询可用 tag，再产出候选 tag。
4. 按字段逐项与用户确认；高置信也要确认。tag 也必须确认。
5. 只有八个投稿字段和分类结论都确定后，才调用：
   - `POST /api/skills`
   - `POST /api/skills/{skill_id}/archive`
   - `POST /api/skills/{skill_id}/tags/{tag_id}`
6. 提交后明确说明：
   - 新建 skill 初始状态是 `editing`
   - 上传后后端会解压 zip，并写入 `file_path`
   - 绑定后的 tag 会体现在返回的 `tags` 字段里
   - 用户可以前往 `https://ep2048.cn/market/#/admin` 查看自己上传的结果
7. 如果提交后还想改字段，停止，交给别的流程处理。

## Example
```text
字段：summary
候选值：用于分析并发布 mini8 skill 投稿流程的辅助 skill。
证据：
- SKILL.md 标题与概述
- README 第一段
- examples/submit-demo.py 的调用方式
置信度：高
状态：仍需用户确认
```

“明确为空”也要给证据，不能只写“没找到”。

## Common Mistakes
- 把它当成 API 包装器，而不是审包流程
- 只给结果，不给证据和置信度
- 把“没找到”误写成“明确为空”
- 在字段未确认完时调用 API
