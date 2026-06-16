from sqlalchemy import BigInteger, Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class WorkHistory(Base):
    """
    工作历史记录模型，对应数据库表 `work_history`。

    记录某个工作项的执行历史，包括历史记录标题、摘要、提交人信息、
    执行状态、起止时间、各级审核状态及备注，以及关联的文件目录路径。
    """

    __tablename__ = "work_history"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    work_space_id = Column(Integer, nullable=True)              # 所属工作空间 ID
    work_item_id = Column(Integer, nullable=True)               # 关联的工作项 ID
    title = Column(VARCHAR(255), nullable=True)                 # 历史记录标题
    summary = Column(Text, nullable=True)                       # 历史记录摘要/内容
    submitted_by_user_id = Column(String, nullable=True)       # 提交人用户 ID
    submitted_by_name = Column(VARCHAR(255), nullable=True)     # 提交人姓名
    status = Column(VARCHAR(50), nullable=True)                 # 执行状态
    started_at = Column(BigInteger, nullable=True)              # 开始时间（时间戳）
    ended_at = Column(BigInteger, nullable=True)                # 结束时间（时间戳）
    created_at = Column(BigInteger, nullable=True)              # 记录创建时间（时间戳）
    superagent_review_status = Column(VARCHAR(50), nullable=True)   # 超级智能体审核状态
    superagent_review_note = Column(Text, nullable=True)            # 超级智能体审核备注
    superone_review_status = Column(VARCHAR(50), nullable=True)     # 人工审核状态
    superone_review_note = Column(Text, nullable=True)              # 人工审核备注
    file_dir_path = Column(VARCHAR(255), nullable=True)             # 关联文件目录路径
