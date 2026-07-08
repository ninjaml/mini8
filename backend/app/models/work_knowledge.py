"""Workspace 知识库挂载模型。

这张表描述的是某个 workspace 当前挂载了哪些知识库入口，
不是抽象的“知识内容正文表”。

从当前调用链可以确认：
- 记录按 `work_space_id` 归属到具体 workspace
- 当前主实现围绕 `type="obsidian"` 的本地知识库挂载
- `knowledge_json` 保存的是连接/挂载配置，而不是文件正文本身
- 目录浏览、文件读取、skill 导出都会先解析 `knowledge_json`
"""

from sqlalchemy import Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class WorkKnowledge(Base):
    """工作空间知识库挂载主记录。"""

    __tablename__ = "work_knowledge"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)  # 归属用户标识；当前创建接口通常不主动写入。
    work_space_id = Column(Integer, nullable=False)  # 所属 workspace ID。
    name = Column(VARCHAR(255), nullable=False)  # 该挂载项在 workspace 内展示的名称。
    type = Column(VARCHAR(255), nullable=False)  # 知识库类型；当前创建接口固定写入 `obsidian`。
    knowledge_json = Column(Text, nullable=False)  # 知识库挂载配置 JSON；当前主存 port、api_key、vault_name、omnisearch_port，导出/兼容时也可能出现 omnisearch_url。
