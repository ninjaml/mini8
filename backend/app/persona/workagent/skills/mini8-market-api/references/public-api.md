# mini8 公共市场 API

这份参考只覆盖公开读取接口，用于检索、判断、推荐和下载市场资源。

## Base URL


```text
https://ep2048.cn/market/api
```

下文用 `{API_BASE}` 表示 API 根地址。

## 健康检查

```http
GET {API_BASE}/health
```

返回：

```json
{"status":"ok"}
```

## 查询分类

```http
GET {API_BASE}/tags
GET {API_BASE}/tags?query=媒体
GET {API_BASE}/tags/{tag_id}
```

字段：
- `id`：分类 id，后续作为 `tag_id`
- `name`：分类名称
- `description`：分类说明

## 查询 Skill 列表

```http
GET {API_BASE}/skills
```

查询参数：
- `status`：状态过滤。市场推荐必须使用 `enable`
- `tag_id`：分类 id。传入后只返回绑定该分类的 skill
- `query`：模糊查询关键词
- `query_field`：可选字段定向查询

Skill 支持的 `query_field`：
- `slug`
- `chinese_name`
- `summary`

如果省略 `query_field`，后端会进行多字段模糊查询，范围包含：
- `slug`
- `chinese_name`
- `summary`
- `version`
- `use_for`
- `not_for`
- `skill_installation`
- `dependency_installation`
- 关联分类 `name`
- 关联分类 `description`

示例：

```http
GET {API_BASE}/skills?status=enable
GET {API_BASE}/skills?status=enable&query=上传
GET {API_BASE}/skills?status=enable&query=上传&query_field=summary
GET {API_BASE}/skills?status=enable&tag_id=3
GET {API_BASE}/skills?status=enable&tag_id=3&query=上传&query_field=summary
```

重要规则：
- `tag_id` 和 `query` 同时存在时，后端返回交集：分类匹配 AND 字段模糊匹配。
- 对用户推荐 skill 时，始终加 `status=enable`。

返回字段重点：
- `id`
- `slug`
- `chinese_name`
- `summary`
- `version`
- `status`
- `use_for`
- `not_for`
- `skill_installation`
- `dependency_installation`
- `tags`

不要使用：
- `file_path`：这是服务器内部目录，不是下载地址。

## 查询 Skill 详情

```http
GET {API_BASE}/skills/{skill_id}
```

用途：
- 判断候选 skill 是否真的适合用户需求
- 检查安装方法、依赖、不适用场景

常见错误：
- `404 Skill not found`

## 下载 Skill

```http
GET {API_BASE}/skills/{skill_id}/download
```

说明：
- 返回体是 `application/zip`
- `Content-Disposition` 带文件名
- 服务端会按 skill 的真实目录临时打包

常见错误：
- `400`：skill 没有可下载目录，或目录不存在
- `404`：skill 不存在

## 查询 Prompt 列表

```http
GET {API_BASE}/prompts
```

查询参数：
- `tag_id`：分类 id。传入后只返回绑定该分类的 prompt
- `query`：模糊查询关键词
- `query_field`：可选字段定向查询

Prompt 支持的 `query_field`：
- `name`
- `summary`
- `content`

如果省略 `query_field`，后端会进行多字段模糊查询，范围包含：
- `name`
- `summary`
- `content`
- `version`
- `use_for`
- `not_for`
- 关联分类 `name`
- 关联分类 `description`

示例：

```http
GET {API_BASE}/prompts?query=总结
GET {API_BASE}/prompts?query=总结&query_field=summary
GET {API_BASE}/prompts?tag_id=3
GET {API_BASE}/prompts?tag_id=3&query=总结&query_field=content
```

重要规则：
- `tag_id` 和 `query` 同时存在时，后端返回交集：分类匹配 AND 字段模糊匹配。

返回字段重点：
- `id`
- `name`
- `summary`
- `content`
- `version`
- `use_for`
- `not_for`
- `tags`

## 查询 Prompt 详情

```http
GET {API_BASE}/prompts/{prompt_id}
```

常见错误：
- `404 Prompt not found`
