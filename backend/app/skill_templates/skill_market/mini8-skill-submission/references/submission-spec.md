# mini8 Skill 投稿提取规范

## API 地址

默认接口基地址固定为：

```text
https://ep2048.cn/market
```

该地址要求服务器已将 `/market/api` 反向代理到后端实际的 `/api` 路由。

本规范中出现的相对路径都默认拼接在这个地址之后，例如：

```text
POST /api/skills
= POST https://ep2048.cn/market/api/skills

POST /api/skills/{skill_id}/archive
= POST https://ep2048.cn/market/api/skills/{skill_id}/archive
```

## 访问前认证

所有 POST 写接口需要认证。

### 认证头格式

```
Authorization: Bearer dev:{primary_key}
```

### 获取 primary_key

`primary_key` 直接从 CamphorEOS Runtime Context 中的 `primary_key` 字段获取：

```text
- primary_key: 2e980b8207ae4e7383f34d2cb505b0bd
```

### 规则
- 如果 Runtime Context 中没有 `primary_key` 或值为 `unknown`，停止投稿流程，提示用户先登录 CamphorEOS
- 如果调用写接口返回 401/403，提示用户联系运营人员确认是否已在 Skill Market 的 `admins` 表白名单中
- 提取 `primary_key` 后，构造 `Authorization: Bearer dev:{primary_key}`，后续所有写接口统一使用
- 不需要持久化 token，单次投稿会话内复用即可

## 1. 范围

这份规范定义 mini8 skill 投稿时的审包、字段确认、分类确认、草稿创建、压缩包上传与已有 tag 绑定规则。不定义发布、禁用、删除、管理员登录，也不允许在这里使用草稿编辑接口或创建新 tag。

### 1.1 需要形成结论的投稿字段
- `slug`
- `chinese_name`
- `summary`
- `version`
- `use_for`
- `not_for`
- `skill_installation`
- `dependency_installation`

### 1.2 不属于提取范围的后端字段
- `status`：创建后由后端写成 `editing`
- `file_path`：上传 zip 并解压后由后端写入

## 2. 首轮广扫范围

首轮就按“广扫”执行，不要只读 `SKILL.md` 或 README。

### 2.1 首轮必看文件
- `SKILL.md`
- `skill.md`
- `README*`
- `docs/**/*.md`
- `package.json`
- `pyproject.toml`
- `requirements*.txt`
- `setup.py`
- `setup.cfg`
- `Cargo.toml`
- `go.mod`
- `pom.xml`
- `build.gradle*`
- `composer.json`
- `Gemfile`
- `*.csproj`
- `Makefile`
- `Dockerfile`

### 2.2 首轮也要看的目录和入口
- `examples/**`
- `example/**`
- `demo/**`
- `sample/**`
- `scripts/**`
- `bin/**`
- `src/**` 中被文档引用的主要入口文件
- 根目录或首层常见入口：`main.*`、`index.*`、`app.*`、`server.*`、`run.*`、`cli.*`

### 2.3 首轮目标
- 判断这个包到底是什么
- 判断它适合什么场景、不适合什么场景
- 判断如何安装 skill 本体
- 判断是否存在额外依赖安装步骤
- 判断名称、版本、展示信息是否一致
- 形成用途、边界、安装等字段候选，为后续 tag 匹配提供依据
- 必要时先把 zip 读成 `path -> content` 的 JSON 对象，再交给 agent/LLM 综合判断

### 2.4 本地 zip 读取示例
单独示例文件见 [read-zip-example.py](read-zip-example.py)。

这个示例只负责：
- 打开本地 zip
- 逐层遍历其中的所有文件
- 按内容判断是否是文本文件
- 是文本文件就读取内容
- 跳过超大文本文件
- 支持常见 BOM，并按 `UTF-8`、`UTF-8-SIG`、`UTF-16`、`GB18030`、`GBK` 等编码尝试解码
- 输出 JSON 对象，key 是 zip 内路径，value 是文件内容

这个示例不负责：
- 直接抽取 `summary`
- 直接抽取 `use_for`
- 直接抽取 `not_for`
- 直接生成最终投稿字段
- 保证读取 zip 中的所有文件

## 3. 证据规则

### 3.1 输出时必须带证据
每个字段都必须输出：
- 候选值
- 证据
- 置信度
- 当前状态

证据至少要能落到 zip 内的具体文件路径；有明确段落或标题时，一并说明。

### 3.2 允许使用的证据
- 明确文档：`SKILL.md`、README、docs
- 元数据：manifest、依赖文件、版本文件
- 示例：`examples/`、`demo/`、`scripts/`
- 源码：入口文件、核心调用链、暴露出的命令或接口
- 本地 zip 读取示例输出的 `path -> content` JSON 对象，见 [read-zip-example.py](read-zip-example.py)

### 3.3 禁止的做法
- 没有证据就直接写候选值
- 用“常见套路”替代包内证据
- 把源码猜测包装成高置信结论
- 在出现冲突时悄悄选一个来源继续走
- 在代码示例里直接提取 `summary`、`use_for`、`not_for` 等字段

## 4. 字段提取标准

## 4.1 `slug`
优先寻找：
- `SKILL.md` frontmatter `name`
- zip 根目录名
- manifest 中的包名
- README 或文档里的稳定英文标识

标准：
- 使用小写字母、数字、短横线
- 不含空格、下划线、中文
- 应是稳定的机器标识

处理规则：
- 多个候选值不一致时，标记为冲突
- 需要规范化时，要明确展示原值和规范化后的候选值，并让用户确认

## 4.2 `chinese_name`
优先寻找：
- 主标题中的中文名
- frontmatter 或展示文案里的中文名
- README 首屏中并列出现的中文名称

标准：
- 面向展示
- 简短、可读
- 和 skill 实际用途一致

处理规则：
- 没有可靠中文名时，可以给出空值候选，但仍需用户确认

## 4.3 `summary`
优先寻找：
- `description`
- README 首段
- 概述章节
- 示例和入口文件能稳定支持的用途描述

标准：
- 压缩成一句话
- 说明“这个 skill 是做什么的”
- 不写实现细节，不写泛泛口号

处理规则：
- 只能从代码侧弱推时，置信度不得高于低
- 如果文档描述和实际入口行为不一致，标记为冲突

## 4.4 `version`
优先寻找：
- frontmatter 或文档中的版本号
- manifest 版本字段
- changelog 或版本说明

标准：
- 必须是稳定版本表达
- 推荐形如 `v1.0`

处理规则：
- 不要自动默认 `v1.0`
- 没找到时，转为用户确认问题

## 4.5 `use_for`
优先寻找：
- 明确的适用场景章节
- README 中的使用场景
- 示例、脚本、命令暴露出的稳定使用方式

标准：
- 说清适合用于什么任务
- 关注场景，不写实现细节
- 应有明确边界

处理规则：
- 只能从代码结构泛推时，置信度不得高于低
- 如果不同来源描述的适用场景不一致，标记为冲突

## 4.6 `not_for`
优先寻找：
- 明确的边界说明
- README 中的限制、注意事项、禁用场景
- 示例中未覆盖且文档明确排除的场景

标准：
- 说清不适合什么
- 帮用户避免误用
- 不要编造“通用型免责声明”

处理规则：
- 没有边界证据时，不要硬写；优先转为用户确认问题
- 如果正反边界互相打架，标记为冲突

## 4.7 `skill_installation`
优先寻找：
- skill 包复制、解压、放置路径说明
- README 中的安装步骤
- scripts 或 docs 中的接入步骤

标准：
- 只描述 skill 本体如何安装或放置
- 不要混入依赖安装

处理规则：
- 如果包显然要求用户把目录放到某个位置，但文档没写清，视为材料不足

## 4.8 `dependency_installation`
优先寻找：
- manifest 依赖
- README 中的依赖安装步骤
- 脚本中的环境准备说明
- 运行入口对外部工具或库的要求

标准：
- 只描述运行前要准备的依赖
- 不重复 skill 本体安装步骤

处理规则：
- 这是最常见的可空字段之一，但空值判定必须走高标准
- 仅仅“没看到依赖文件”不等于可以写空

## 5. 置信度规则

### 高
满足以下任一条件：
- 一个明确、直接、看起来就是作者主声明的来源，且没有冲突
- 两个以上独立来源互相支持，且没有冲突

### 中
满足以下条件：
- 有一个相对清晰的来源
- 还有结构、示例或入口行为做侧面支持
- 但表达不够直接

### 低
满足以下条件：
- 主要依赖代码、目录、示例做推断
- 文档表达弱或缺失
- 候选值可能成立，但不够稳

### 冲突
只要不同来源对同一字段给出互相矛盾的结论，就标记为冲突；一旦冲突，不再自动推荐最终值。

### 材料不足
当某个字段只能靠猜测、或者 zip 整体缺乏最基本的说明材料时，标记为材料不足。

## 6. “明确为空”的高标准

字段可以为空，但“为空”也必须有证据。

只有满足以下条件时，才允许把字段判定为明确为空：
- 首轮广扫完成
- 没有找到支持该字段有值的证据
- 同时还能找到反向证据，说明该字段不需要填写或确实不适用
- 最终仍需用户确认

### 可参考的空值示例
- `dependency_installation`：README 明确写“无额外依赖”，且 manifest、脚本、入口行为也没有暴露额外依赖要求
- `chinese_name`：包内只有英文展示名，且用户也确认不需要中文名

### 不算明确为空的情况
- 只是“没看到”
- 只读了少数文件
- 代码没直接 import 某个依赖
- 没有文档就自作主张写空

## 7. 冲突处理规则

遇到冲突时：
1. 列出冲突字段
2. 列出每个候选值及其证据
3. 停止自动推进
4. 让用户裁决，或要求用户先修正 zip 内容

不要这样做：
- 自己挑一个最像的值继续
- 声称“主文档优先，所以忽略别的来源”
- 先创建草稿，想着后面再修

## 8. 材料不足时的中止规则

出现以下任一情况，应直接中止投稿流程，并要求用户先补包：
- 没有 `SKILL.md` / `skill.md` / `README*` / 等价主说明文档
- 无法从文档、元数据、示例里稳定判断这个 skill 的核心用途
- `use_for` / `not_for` / 安装说明只能靠硬猜
- 安装或依赖要求看起来存在，但包内没有写清
- 名称、版本、用途信息大量缺失

恢复投稿前，至少应补到：
- 一个主说明文档
- 能说明用途与边界
- 能说明安装与依赖要求（如适用）
- 名称和版本信息不自相矛盾

## 9. 逐项确认格式

必须按字段逐项确认，不要整包一次性让用户确认。tag 也必须在提交前确认，不要先绑定再回头解释。

建议顺序：
1. `slug`
2. `chinese_name`
3. `summary`
4. `version`
5. `use_for`
6. `not_for`
7. `skill_installation`
8. `dependency_installation`
9. 候选 tag

字段确认输出至少包括：

```text
字段：<field>
候选值：<value 或 空>
证据：
- <file path + 依据>
- <file path + 依据>
置信度：高 / 中 / 低
状态：待确认 / 明确为空 / 冲突 / 材料不足
```

候选 tag 确认至少包括：

```text
分类候选：
- tag_id: <id>
  name: <name>
  原因:
  - <file path + 依据>
  置信度: 高 / 中 / 低
  状态: 待确认 / 冲突 / 材料不足
```

规则：
- 高置信也要确认
- 低置信必须讨论
- 冲突时不继续下一个 API 步骤
- 材料不足时不继续投稿
- 未确认的 tag 不允许绑定

## 10. 最终提交步骤

分类阶段允许调用：

```text
GET /api/tags
GET /api/tags/{tag_id}
```

只有八个投稿字段和候选 tag 都形成结论后，才允许调用：

```text
POST /api/skills
POST /api/skills/{skill_id}/archive
POST /api/skills/{skill_id}/tags/{tag_id}
```

### 10.1 查询可用 tag

用途：在读取 zip 并形成字段提取结论后，查询当前可绑定的分类候选，只允许使用已有 tag，不创建新 tag。

查询参数：
- `query`：可选，按 tag 的 `name` 和 `description` 模糊查询。

请求：
```json
{
  "method": "GET",
  "url": "https://ep2048.cn/market/api/tags",
  "query": {
    "query": "测试"
  }
}
```

也可以按 id 复查单个 tag：
```json
{
  "method": "GET",
  "url": "https://ep2048.cn/market/api/tags/{tag_id}"
}
```

返回值示例：
```json
[
  {
    "id": 3,
    "name": "testing",
    "description": "与测试相关的标签"
  }
]
```

规则：
- 先读取 zip 并形成用途、边界、安装等字段候选，再查询可用 tag
- 基于字段候选和包内证据给用户候选 tag
- 只能绑定已有 tag
- 这个 skill 不负责创建新 tag

### 10.2 `POST /api/skills`

用途：创建 skill 草稿记录。

请求：
```json
{
  "method": "POST",
  "url": "https://ep2048.cn/market/api/skills",
  "headers": {
    "Authorization": "Bearer dev:{primary_key}"
  },
  "content_type": "application/json",
  "body": {
    "slug": "example-skill",
    "chinese_name": "示例技能",
    "summary": "用于演示投稿流程的 skill。",
    "version": "v1.0",
    "use_for": "提交前审包与字段确认",
    "not_for": "发布、禁用、删除、标签绑定",
    "skill_installation": "将技能目录放入目标 skills 目录。",
    "dependency_installation": "无额外依赖"
  }
}
```

允许提交字段：
```json
[
  "slug",
  "chinese_name",
  "summary",
  "version",
  "use_for",
  "not_for",
  "skill_installation",
  "dependency_installation"
]
```

不要提交：
```json
[
  "id",
  "status",
  "file_path",
  "tags"
]
```

说明：
- 这些字段在当前后端实现里都是可选，但本 skill 不允许把“后端可选”当成“流程可跳过”
- 只有八个投稿字段都形成结论后才能调用这个接口
- 后端会强制把 `status` 写成 `editing`

返回值示例：
```json
{
  "id": 123,
  "slug": "example-skill",
  "chinese_name": "示例技能",
  "summary": "用于演示投稿流程的 skill。",
  "version": "v1.0",
  "file_path": null,
  "status": "editing",
  "use_for": "提交前审包与字段确认",
  "not_for": "发布、禁用、删除、标签绑定",
  "skill_installation": "将技能目录放入目标 skills 目录。",
  "dependency_installation": "无额外依赖",
  "tags": []
}
```

本流程里要特别关注：
```json
{
  "id": "后续上传 zip 要用",
  "slug": "应与已确认值一致",
  "status": "应为 editing",
  "file_path": "此时通常还是空"
}
```

### 10.3 `POST /api/skills/{skill_id}/archive`

用途：给已创建的草稿上传 zip 压缩包。

请求：
```json
{
  "method": "POST",
  "url": "https://ep2048.cn/market/api/skills/{skill_id}/archive",
  "headers": {
    "Authorization": "Bearer dev:{primary_key}"
  },
  "content_type": "multipart/form-data",
  "path": {
    "skill_id": 123
  },
  "form": {
    "file": "E:/packages/example-skill.zip"
  }
}
```

限制：
```json
{
  "file_extension": ".zip",
  "skill_must_exist": true,
  "status_must_allow_upload": true,
  "slug_must_exist": true
}
```

说明：
- 后端会解压 zip
- 后端只保留解压后的目录，不长期保存原始 zip
- 如果 zip 根目录只有一层嵌套目录，后端会自动拍平一层
- 上传成功后，`file_path` 会被后端写入
- 上传成功后，`status` 会保持或重置为 `editing`

返回值示例：
```json
{
  "id": 123,
  "slug": "example-skill",
  "chinese_name": "示例技能",
  "summary": "用于演示投稿流程的 skill。",
  "version": "v1.0",
  "file_path": "/server/path/to/example-skill",
  "status": "editing",
  "use_for": "提交前审包与字段确认",
  "not_for": "发布、禁用、删除、标签绑定",
  "skill_installation": "将技能目录放入目标 skills 目录。",
  "dependency_installation": "无额外依赖",
  "tags": []
}
```

本流程里要特别关注：
```json
{
  "id": "应与草稿记录一致",
  "slug": "应与已确认值一致",
  "file_path": "此时应已有值",
  "status": "应为 editing"
}
```

### 10.4 `POST /api/skills/{skill_id}/tags/{tag_id}`

用途：把已确认的已有 tag 绑定到已创建的 skill。

请求：
```json
{
  "method": "POST",
  "url": "https://ep2048.cn/market/api/skills/{skill_id}/tags/{tag_id}",
  "headers": {
    "Authorization": "Bearer dev:{primary_key}"
  },
  "path": {
    "skill_id": 123,
    "tag_id": 3
  }
}
```

规则：
- 只能绑定用户已确认的 tag
- 可以重复调用多次，绑定多个 tag
- 不创建新 tag

返回值示例：
```json
{
  "id": 123,
  "slug": "example-skill",
  "chinese_name": "示例技能",
  "summary": "用于演示投稿流程的 skill。",
  "version": "v1.0",
  "file_path": "/server/path/to/example-skill",
  "status": "editing",
  "use_for": "提交前审包与字段确认",
  "not_for": "发布、禁用、删除、标签绑定",
  "skill_installation": "将技能目录放入目标 skills 目录。",
  "dependency_installation": "无额外依赖",
  "tags": [
    {
      "id": 3,
      "name": "testing",
      "description": "与测试相关的标签"
    }
  ]
}
```

完成草稿创建、zip 上传和 tag 绑定后，必须提示用户前往以下地址查看上传结果：

```text
https://ep2048.cn/market/#/admin
```

### 10.5 常见错误

```json
{
  "GET /api/tags": [],
  "GET /api/tags/{tag_id}": {
    "404": [
      "tag 不存在"
    ]
  },
  "POST /api/skills": [
    "当前后端对字段校验较弱，因此更要依赖本 skill 的前置确认流程"
  ],
  "POST /api/skills/{skill_id}/archive": {
    "400": [
      "不是 zip",
      "缺少 slug",
      "当前状态不允许上传",
      "zip 无法解压"
    ],
    "404": [
      "skill 不存在"
    ]
  },
  "POST /api/skills/{skill_id}/tags/{tag_id}": {
    "404": [
      "skill 或 tag 不存在"
    ]
  }
}
```

### 10.6 提交后发现要改字段
停止。如果用户要改，交给别的流程处理，不要在这里补做编辑。
