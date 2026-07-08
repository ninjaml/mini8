# API 参考：Obsidian Control

本文档是 Obsidian 系列 skill 的唯一 API 参考。`obsidian-write`、`obsidian-query`、`obsidian-organize`、`obsidian-edit` 都以本文档为准。

内容覆盖 Obsidian Local REST API 和 Omnisearch HTTP Server。

## 1. 目标 vault 上下文

Local REST API 和 Omnisearch 都按 vault 单独配置。每次调用前必须先确认目标 vault。

访问边界：

- 这组 skill 默认在运行 Obsidian 的同一台机器上执行。
- `rest_base_url` 和 `omnisearch_url` 必须配置为 `localhost` 地址。
- 不要把它们配置成 `127.0.0.1`、`[::1]`、局域网 IP、公网 IP 或域名；如果执行环境不是 Obsidian 所在机器，先停止并说明无法直接访问本机插件服务。

连接配置从：

```text
obsidian-control/references/vaults.json
```

读取。如果文件不存在，先根据：

```text
obsidian-control/references/vaults.example.json
```

创建模板，让用户补配置。

占位符：

| 占位符 | 说明 |
|---|---|
| `{vault.rest_base_url}` | 当前目标 vault 的 Local REST API 地址 |
| `{vault.api_key}` | 当前目标 vault 的 Local REST API API Key |
| `{vault.omnisearch_url}` | 当前目标 vault 的 Omnisearch HTTP Server 地址，可选 |
| `{filename}` | vault 相对文件路径 |
| `{pathToDirectory}` | vault 相对目录路径 |
| `{query}` | 搜索文本 |
| `{contextLength}` | 命中上下文长度，默认 `100` |

常见 Local REST API 地址：

```text
http://localhost:27123
https://localhost:27124
```

认证：

```http
Authorization: Bearer {vault.api_key}
```

除 `GET {vault.rest_base_url}/` 外，Local REST API 请求默认需要认证。

所有路径参数均使用 vault 相对路径，不使用本机绝对路径。

## 2. URL 编码规则

调用 API 时要区分“给人看的 vault 相对路径”和“真正发送的 HTTP URL”。

需要 URL encode 的位置：

| 位置 | 是否需要 encode | 说明 |
|---|---|---|
| `{filename}` | 是 | 文件路径中的中文、空格、`#`、`?` 等字符必须 encode，但保留路径分隔符 `/` |
| `{pathToDirectory}` | 是 | 目录路径同上，保留 `/` |
| `{query}` | 是 | 搜索文本作为 query string 参数时必须 encode |
| `Target` header | 是 | heading、block、frontmatter 字段包含中文或特殊字符时需要 encode |
| JSON / Markdown 请求体 | 否 | 请求体内容不要 URL encode |

示例：

```text
vault 相对路径：知识管理/我的 笔记.md
HTTP path：/vault/%E7%9F%A5%E8%AF%86%E7%AE%A1%E7%90%86/%E6%88%91%E7%9A%84%20%E7%AC%94%E8%AE%B0.md
```

Python 示例：

```python
from urllib.parse import quote

encoded_filename = quote(filename, safe="/")
encoded_query = quote(query, safe="")
```

## 3. System

### `GET {vault.rest_base_url}/`

用途：检查服务状态和认证状态。

认证：不需要。

返回值示例：

```json
{
  "ok": "OK",
  "service": "Obsidian Local REST API",
  "authenticated": true,
  "versions": {
    "self": "x.y.z",
    "obsidian": "x.y.z"
  }
}
```

### `GET {vault.rest_base_url}/openapi.yaml`

用途：读取 Local REST API 的 OpenAPI 描述。

### `GET {vault.rest_base_url}/obsidian-local-rest-api.crt`

用途：读取 HTTPS 模式使用的证书。

## 4. Vault Directories

### `GET {vault.rest_base_url}/vault/`

用途：列出 vault 根目录。

返回值示例：

```json
{
  "files": [
    "note.md",
    "folder/"
  ]
}
```

### `GET {vault.rest_base_url}/vault/{pathToDirectory}/`

用途：列出指定目录。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pathToDirectory` | string | 是 | vault 相对目录路径 |

返回值：目录文件列表。目录通常以 `/` 结尾。

## 5. Vault Files

### `GET {vault.rest_base_url}/vault/{filename}`

用途：读取指定文档。可读取整篇 Markdown，也可读取结构化 note 或 document map。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `filename` | string | 是 | vault 相对文件路径 |

默认返回：Markdown 文本。

结构化读取：

```http
GET {vault.rest_base_url}/vault/{filename}
Authorization: Bearer {vault.api_key}
Accept: application/vnd.olrapi.note+json
```

返回值示例：

```json
{
  "content": "Markdown 正文",
  "frontmatter": {},
  "path": "projects/demo.md",
  "stat": {
    "ctime": 0,
    "mtime": 0,
    "size": 0
  },
  "tags": []
}
```

读取可 patch 目标：

```http
GET {vault.rest_base_url}/vault/{filename}
Authorization: Bearer {vault.api_key}
Accept: application/vnd.olrapi.document-map+json
```

返回值示例：

```json
{
  "headings": ["Heading 1", "Heading 1::Subheading"],
  "blocks": ["^blockref1"],
  "frontmatterFields": ["title", "tags", "status"]
}
```

注意：document map 中的 block 可能带 `^`，但 PATCH 的 `Target-Type: block` 使用 block id 本身，不写前导 `^`。

### `PUT {vault.rest_base_url}/vault/{filename}`

用途：创建或覆盖整篇文档。

请求头：

```http
Authorization: Bearer {vault.api_key}
Content-Type: text/markdown
```

请求体：完整 Markdown 文档。

返回值：

- 不指定 target 时，成功通常返回 `204 No Content`。
- 指定 target 时，成功通常返回 `200 OK`，响应体是更新后的完整文件内容。

安全规则：

- `obsidian-write` 可用它创建新文档。
- `obsidian-edit` 只有在目标文档已存在、且用户明确要求覆盖整篇文档时才可使用。

### `POST {vault.rest_base_url}/vault/{filename}`

用途：向文档末尾追加 Markdown 内容。

请求头：

```http
Authorization: Bearer {vault.api_key}
Content-Type: text/markdown
```

请求体：要追加的 Markdown 内容。

返回值：

- 不指定 target 时，成功通常返回 `204 No Content`。
- 指定 target 时，成功通常返回 `200 OK`，响应体是更新后的完整文件内容。

注意：Local REST API 可能在目标不存在时创建文件。`obsidian-edit` 使用前必须先 `GET` 确认目标文件存在。

### `PATCH {vault.rest_base_url}/vault/{filename}`

用途：局部修改指定文档。可用于 heading、block、frontmatter。

请求头参数：

| Header | 必填 | 可选值 | 说明 |
|---|---|---|---|
| `Operation` | 是 | `append`、`prepend`、`replace` | 对目标执行追加、前置插入或替换 |
| `Target-Type` | 是 | `heading`、`block`、`frontmatter` | 目标类型 |
| `Target` | 是 | string | 目标名称。非 ASCII 字符需要 URL encode |
| `Target-Delimiter` | 否 | string | heading 层级分隔符，默认 `::` |
| `Trim-Target-Whitespace` | 否 | `true`、`false` | 是否 trim 目标空白 |
| `Create-Target-If-Missing` | 否 | `true`、`false` | 目标不存在时是否创建，默认 `false` |
| `Apply-If-Content-Preexists` | 否 | `true`、`false` | 目标中已存在 patch 内容时是否仍然应用，默认 `false` |

请求体：

```http
Content-Type: text/markdown
```

或：

```http
Content-Type: application/json
```

heading 示例：

```http
PATCH {vault.rest_base_url}/vault/{filename}
Authorization: Bearer {vault.api_key}
Operation: append
Target-Type: heading
Target: 相关资料
Content-Type: text/markdown
```

block 示例：

```http
PATCH {vault.rest_base_url}/vault/{filename}
Authorization: Bearer {vault.api_key}
Operation: replace
Target-Type: block
Target: block-id
Content-Type: text/markdown
```

frontmatter 示例：

```http
PATCH {vault.rest_base_url}/vault/{filename}
Authorization: Bearer {vault.api_key}
Operation: replace
Target-Type: frontmatter
Target: status
Content-Type: application/json
```

返回值：成功通常为 `200 OK`。

常见错误：

- `400`：参数错误或 patch 失败。
- `404`：目标文件或目标 section 不存在。
- `405`：目标是目录。

### `DELETE {vault.rest_base_url}/vault/{filename}`

用途：删除指定文件。

使用规则：危险操作。只有用户明确要求删除时才能使用。

返回值：成功通常为 `204 No Content`。

## 6. Search

### `POST {vault.rest_base_url}/search/`

用途：高级查询。支持 Dataview DQL 和 JsonLogic。

Dataview DQL：

```http
POST {vault.rest_base_url}/search/
Authorization: Bearer {vault.api_key}
Content-Type: application/vnd.olrapi.dataview.dql+txt
```

请求体示例：

```text
TABLE file.name FROM #project
```

JsonLogic：

```http
POST {vault.rest_base_url}/search/
Authorization: Bearer {vault.api_key}
Content-Type: application/vnd.olrapi.jsonlogic+json
```

请求体示例：

```json
{
  "in": [
    "obsidian",
    {"var": "tags"}
  ]
}
```

返回值示例：

```json
[
  {
    "filename": "projects/demo.md",
    "result": true
  }
]
```

### `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}`

用途：简单文本搜索。

Query 参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `query` | string | 是 | 无 | 搜索文本 |
| `contextLength` | number | 否 | `100` | 命中上下文长度 |

返回值示例：

```json
[
  {
    "filename": "projects/demo.md",
    "matches": [
      {
        "context": "命中上下文",
        "match": {
          "start": 10,
          "end": 14
        }
      }
    ],
    "score": 0.82
  }
]
```

## 7. Tags

### `GET {vault.rest_base_url}/tags/`

用途：获取全库 tag 和计数。

返回值示例：

```json
{
  "tags": [
    {
      "name": "obsidian",
      "count": 12
    }
  ]
}
```

返回的 tag 不包含 `#` 前缀。层级 tag 会贡献父级计数。

## 8. Open

### `POST {vault.rest_base_url}/open/{filename}`

用途：在 Obsidian 界面中打开指定文档。

Query 参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `newLeaf` | boolean | 否 | 是否在新 leaf 打开 |

注意：官方文档说明该接口可能在文件不存在时创建文档。不要把它当成安全只读操作。

## 9. Commands

### `GET {vault.rest_base_url}/commands/`

用途：获取可执行的 Obsidian 命令列表。

### `POST {vault.rest_base_url}/commands/{commandId}/`

用途：执行指定 Obsidian 命令。

使用规则：命令副作用不稳定，除非用户明确要求，否则不要用它代替正式 API。

## 10. Omnisearch

### `GET {vault.omnisearch_url}/search?q={query}`

用途：通过 Omnisearch HTTP Server 搜索当前 vault。适合 BM25 排序、模糊搜索和相似内容召回。

来源依据：Omnisearch 官方 Public API / URL Scheme 文档给出的 HTTP Server API 是 `GET http://localhost:51361/search?q=your%20query`。

使用条件：

- 当前 vault 在 `obsidian-control/references/vaults.json` 中配置了 `omnisearch_url`。
- Omnisearch 设置中已开启 HTTP Server。
- HTTP Server 仅允许本机 `localhost` 访问。
- Obsidian 关闭后，Omnisearch HTTP Server 也不可用。

常见地址：

```text
http://localhost:51361
```

参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `q` | string | 是 | Omnisearch 查询语句 |

返回值示例：

```json
[
  {
    "score": 1.23,
    "vault": "vault-name",
    "path": "projects/demo.md",
    "basename": "demo",
    "foundWords": ["demo"],
    "matches": [
      {
        "match": "demo",
        "offset": 10
      }
    ],
    "excerpt": "相关片段"
  }
]
```

未配置 Omnisearch 时，相关 skill 可以降级使用 `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}`，但必须说明召回质量下降。

## 11. 暂不使用的 API

以下 Local REST API 当前不属于这组 skill 的主要工作方法，暂不展开详细说明：

- `/active/`
- `/periodic/{period}/`
- `/periodic/{period}/{year}/{month}/{day}/`

如果以后要支持“当前打开文件”或“周期笔记”编辑，再单独补充参数、返回值和安全规则。

## 12. 重要边界

- Local REST API 没有原生知识图谱查询接口；图谱查询需要读取文档并解析 wikilink。
- Local REST API 没有“读取某文档所有外链”的专用接口；需要读取正文后解析 `[[wikilink]]` 和 `![[embed]]`。
- `obsidian-edit` 不创建新文档；新建知识文档属于 `obsidian-write`。
- `DELETE`、整篇 `PUT`、`/active/` 写操作都必须有用户明确意图。
