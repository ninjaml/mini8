---
name: obsidian-edit
description: 按用户明确指令调用 Obsidian Local REST API 编辑已有文档。
---

# Obsidian 编辑

## 目标

本 skill 是纯 API 编辑执行器。

它只负责根据用户明确指令修改 Obsidian vault 中的已有文档，不负责判断知识质量、不负责整理、不负责主动建立关系。

它负责：

1. 确认目标 vault。
2. 确认目标文档。
3. 确认编辑动作。
4. 修改前读取原文。
5. 优先使用局部 `PATCH`。
6. 修改后回读校验。

## 1. 确认目标 vault

编辑前先读取统一配置 `../obsidian-control/references/vaults.json`。

- 用户指定 vault：使用指定 vault。
- 用户未指定 vault：使用 `defaultVault`。
- 找不到配置、目标不明确、`rest_base_url` 或 `api_key` 缺失：先澄清，不继续。
- `../obsidian-control/references/vaults.json` 不存在：根据 `../obsidian-control/references/vaults.example.json` 创建模板，让用户补配置。
- 默认只编辑一个 vault；跨 vault 编辑必须由用户明确要求。

配置文件：

| 文件 | 作用 |
|---|---|
| `../obsidian-control/references/api.md` | 统一 API 地址、参数、返回值 |
| `../obsidian-control/references/vaults.example.json` | 统一 vault 配置模板 |
| `../obsidian-control/references/vaults.json` | 本地真实 vault 配置 |

## 2. 确认编辑意图

用户必须明确说明要修改什么。

可执行的编辑动作：

| 用户意图 | 优先 API |
|---|---|
| 追加到文档末尾 | `POST {vault.rest_base_url}/vault/{filename}` |
| 写入指定 heading 下 | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 替换指定 heading 内容 | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 替换指定 block | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 修改 frontmatter 字段 | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 在已有文档中创建新 heading 或 frontmatter 字段 | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 覆盖整篇文档 | `PUT {vault.rest_base_url}/vault/{filename}` |

如果用户没有明确目标文档、目标位置或编辑动作，先澄清，不猜。

## 3. 执行流程

1. 确认目标 vault 和目标文档路径。
2. 调用 `GET {vault.rest_base_url}/vault/{filename}` 读取原文。
3. 如果目标文档不存在，停止并告诉用户；不要用 edit skill 创建新文档。
4. 如果需要确认 heading、block 或 frontmatter 字段，调用 `GET {vault.rest_base_url}/vault/{filename}` 并使用 `Accept: application/vnd.olrapi.document-map+json`。
5. 根据用户意图选择 API。
6. 优先用 `PATCH` 做局部修改。
7. 只有用户明确要求覆盖整篇文档时，才使用 `PUT`。
8. 修改后再次调用 `GET {vault.rest_base_url}/vault/{filename}` 回读。
9. 对比用户要求，确认目标内容已写入。
10. 输出执行结果和校验结果。

## 4. 安全规则

- 不主动创建知识文档；新建知识文档属于 `obsidian-write`。
- 目标文档不存在时停止，不用 `POST` 或 `PUT` 创建文件。
- 不主动整理 tag、链接或重复知识；盘点属于 `obsidian-organize`。
- 不主动查询知识答案；查询属于 `obsidian-query`。
- 不在用户没有明确要求时覆盖整篇文档。
- 不在未读取原文时修改文档。
- 不在修改后跳过回读校验。
- `PATCH` 找不到目标时，不要自动改用整篇 `PUT`。
- 只有用户明确要求创建缺失的 heading 或 frontmatter 字段时，才允许使用 `Create-Target-If-Missing: true`。
- 不允许为缺失 block 创建目标；block id 必须来自已有文档。
- 目标不明确时先澄清。

## 5. 输出

编辑完成后输出：

- 操作的 vault。
- 目标文档。
- 使用的 API。
- 编辑动作。
- 修改位置。
- 回读校验结果。

如果失败，输出：

- 失败的 API。
- HTTP 状态或错误信息。
- 可能原因。
- 是否需要用户补充目标文档、heading、block id 或 frontmatter 字段。

详细 API 说明以 `../obsidian-control/references/api.md` 为准。
