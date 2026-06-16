# Workflow：链接健康

本 workflow 只负责发现链接问题和给出处理建议，不主动修改文档。

链接健康分为两类问题：悬空链接和错误链接。两类问题的检查方法不同，必须分开执行。

## 开始前确认

如果用户没有说清楚，先确认两件事：

1. 问题类型：只查悬空链接、只查错误链接、两者都查。
2. 检查范围：全局、指定 tag、指定目录、指定文档。

指定 tag 只限制“被检查的源文档”；链接目标可以在整个 vault 中，否则会把跨 tag 链接误判为悬空。

## 可用动作

### 确定源文档范围

- 全局：`GET {vault.rest_base_url}/vault/`，必要时递归 `GET {vault.rest_base_url}/vault/{pathToDirectory}/`。
- 指定目录：`GET {vault.rest_base_url}/vault/{pathToDirectory}/`。
- 指定文档：使用用户给出的 vault 相对路径。
- 指定 tag：

```http
POST {vault.rest_base_url}/search/
Content-Type: application/vnd.olrapi.jsonlogic+json
```

```json
{
  "in": [
    "目标tag",
    {"var": "tags"}
  ]
}
```

### 结构化读取文档

```http
GET {vault.rest_base_url}/vault/{filename}
Accept: application/vnd.olrapi.note+json
```

### 建立全局目标索引

- 先调用 `GET {vault.rest_base_url}/vault/` 获取 vault 根目录文件列表。
- 对返回结果中的目录，继续调用 `GET {vault.rest_base_url}/vault/{pathToDirectory}/` 递归列出子目录。
- 只保留 `.md` 文件，得到全 vault Markdown 文件列表。
- 为每个 Markdown 文件建立多种可匹配 key。
- key 包括：vault 相对路径、去掉 `.md` 的 vault 相对路径、文件名、去掉 `.md` 的文件名。
- 同名文档不直接判定为错误，标记为“目标不明确”。

示例：

```text
真实文件：projects/Obsidian API.md

索引 key：
projects/Obsidian API.md -> projects/Obsidian API.md
projects/Obsidian API    -> projects/Obsidian API.md
Obsidian API.md          -> projects/Obsidian API.md
Obsidian API             -> projects/Obsidian API.md
```

如果多个文件生成同一个 key，例如 `API -> notes/API.md` 和 `API -> projects/API.md`，该 key 保留全部候选，不强行选择。

链接健康检查开始后，应先建立一次全局目标索引。悬空链接和错误链接都复用这个索引，不要在每个源文档里重复扫描全 vault。

### 解析链接

Obsidian 的 `[[wikilink]]` 不只是普通文件名，还可以带显示名、标题定位、block 定位和嵌入标记。

常见形式：

- `[[target]]`
- `[[target|alias]]`
- `[[target#heading]]`
- `[[target#^block-id]]`
- `![[target]]`

含义：

- `target` 是真正用来定位文档的部分。
- `alias` 是页面上显示的文字，不参与目标文档查找。
- `heading` 是目标文档内部的标题位置，先找到文档后才检查。
- `block-id` 是目标文档内部的块位置，先找到文档后才检查。
- `![[target]]` 是嵌入链接，目标解析方式和普通 wikilink 一样，只是链接类型不同。

本 workflow 检查链接健康时，先只判断目标文档是否存在。因此解析规则是：

- `[[target|alias]]` 只取 `target`，`alias` 只作为上下文信息。
- `[[target#heading]]` 先取 `target` 找文档；`heading` 只用于后续结构检查。
- `[[target#^block-id]]` 先取 `target` 找文档；`block-id` 只用于后续结构检查。
- `![[target]]` 与普通 wikilink 一样解析目标，只是链接类型标记为 embed。

解析结果必须保留：源文档、原始链接、目标文档定位文本、链接类型、上下文片段。

### 查找候选目标

优先使用：

```http
GET {vault.omnisearch_url}/search?q={query}
```

未配置 Omnisearch 时降级使用：

```http
POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}
```

降级搜索只能作为候选提示，不等价于搜索引擎召回。

## 1. 悬空链接

悬空链接是结构问题：链接指向的文档无法在 vault 中解析。

流程：

1. 建立全局目标索引。
   调用 `GET {vault.rest_base_url}/vault/` 获取根目录，再对目录递归调用 `GET {vault.rest_base_url}/vault/{pathToDirectory}/`，只保留 `.md` 文件，并为每个文件建立可匹配 key。
2. 按用户选择的检查范围找到要检查的源文档。
   全局或目录使用 `GET {vault.rest_base_url}/vault/`、`GET {vault.rest_base_url}/vault/{pathToDirectory}/`；指定 tag 使用 `POST {vault.rest_base_url}/search/`，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`；指定文档直接使用用户给出的路径。
3. 对每篇源文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取正文和元数据。
4. 在源文档正文中解析 `[[wikilink]]` 和 `![[embed]]`，记录原始链接和上下文。
5. 对每条链接提取 target，并去掉 alias、heading、block-id，只保留文档定位部分。
6. 用 target 到全局目标索引中查候选文档。
7. 如果没有匹配目标，记录为悬空链接。
8. 如果匹配到多个同名目标，记录为目标不明确。
9. 对悬空链接，用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 查找可能候选；没有 Omnisearch 时，用 Local REST API `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` 降级查找。
10. 输出问题清单和处理建议，等待用户后续明确修复指令。

判断标准：

- `[[target]]` 找不到对应标题或路径：悬空链接。
- `[[target|alias]]` 按 target 解析，不按 alias 解析。
- `[[target#heading]]` 先判断 target 文档是否存在；heading 是否存在属于进一步结构检查。
- 同名文档有多个候选：目标不明确，不直接判定为错误。

输出要求：

- 源文档。
- 原始链接。
- 链接上下文。
- 问题类型：悬空链接 / 目标不明确。
- 可能候选目标。
- 建议：替换、创建目标文档、保留待人工确认。

## 2. 错误链接

错误链接是语义问题：链接目标存在，但当前链接很可能指错了文档。

流程：

1. 建立全局目标索引。
   调用 `GET {vault.rest_base_url}/vault/` 获取根目录，再对目录递归调用 `GET {vault.rest_base_url}/vault/{pathToDirectory}/`，只保留 `.md` 文件，并为每个文件建立可匹配 key。
2. 按用户选择的检查范围找到要检查的源文档。
   全局或目录使用 `GET {vault.rest_base_url}/vault/`、`GET {vault.rest_base_url}/vault/{pathToDirectory}/`；指定 tag 使用 `POST {vault.rest_base_url}/search/`，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`；指定文档直接使用用户给出的路径。
3. 对每篇源文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取正文和元数据。
4. 在源文档正文中解析 `[[wikilink]]` 和 `![[embed]]`，记录原始链接和上下文。
5. 对每条链接提取 target，去掉 alias、heading、block-id 后，到全局目标索引中查找候选目标。
6. 对已解析目标，再调用 `GET {vault.rest_base_url}/vault/{filename}` 读取目标文档。
7. 对比源文档链接上下文、链接文本、目标文档主题和 tag。
8. 如明显不匹配，用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 查找更可能的目标候选；没有 Omnisearch 时，用 Local REST API `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` 降级查找。
9. 输出疑似错误链接，不自动修改。

判断标准：

- 链接上下文表达的主题与目标文档主题明显不一致。
- 链接别名或周围句子指向另一个概念。
- 源文档与目标文档 tag / 标题 / 内容主题长期不相关。
- 存在更高相关度候选目标。

低置信度问题只标记为人工复核，不给出强修正建议。

输出要求：

- 源文档。
- 原始链接和上下文。
- 当前目标文档。
- 当前目标摘要。
- 为什么疑似错误。
- 替代候选目标。
- 置信度：高 / 中 / 低。
- 建议：替换、删除、保留、人工复核。

## 禁止行为

- 不因为目标跨 tag 就判定为悬空。
- 不把目标不明确当作错误链接。
- 不自动删除链接。
- 不在没有用户明确修复指令时调用 `PATCH` 或 `PUT`。
