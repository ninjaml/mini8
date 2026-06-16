"""MiniMax 模型支持。

MiniMax-M2.5 支持「Interleaved Thinking」(交错思维) 模式。
- thinking 内容直接混在 content 中返回（OpenAI 兼容模式）
- 不支持多模态（vision）能力

本模块提供专用的 ChatMinimax 类，用于在代码中通过 isinstance 判断模型类型。
"""

from langchain_openai import ChatOpenAI


class ChatMinimax(ChatOpenAI):
    """MiniMax 模型类，继承自 ChatOpenAI。
    
    MiniMax 提供 OpenAI 兼容的 API 接口，特点：
    - thinking 内容直接混在 content 中返回（使用 <thinkthinking> 标签包裹）
    - 不支持多模态能力（图片识别）
    - 支持交错思维链（Interleaved Thinking），可以一边思考一边调用工具
    
    此专用类用于在代码中通过 isinstance 判断模型类型。
    """

    def __init__(self, **kwargs):
        # streaming 时返回 usage 信息
        kwargs.setdefault("stream_usage", True)
        super().__init__(**kwargs)
