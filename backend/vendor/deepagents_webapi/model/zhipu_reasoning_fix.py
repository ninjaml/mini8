"""智谱 GLM-5 思考模式支持。

GLM-5 默认开启 thinking，返回 reasoning_content 字段。
回放历史时每条 assistant 消息都必须带 reasoning_content。

和 Kimi 的处理方式一致：
1. 响应中的 reasoning_content 存入 AIMessage.additional_kwargs
2. 请求时从 AIMessage.additional_kwargs 取出注入到 payload
"""

from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk


class ChatZhipuWithReasoning(ChatOpenAI):
    """增强的 ChatOpenAI，支持智谱 GLM-5 的 thinking 模式。"""

    def __init__(self, **kwargs):
        # streaming 时返回 usage 信息，让 usage_metadata 有值
        kwargs.setdefault("stream_usage", True)
        super().__init__(**kwargs)

    def _convert_chunk_to_generation_chunk(
        self,
        chunk: dict,
        default_chunk_class: type,
        base_generation_info: dict | None,
    ) -> ChatGenerationChunk | None:
        """捕获响应中的 reasoning_content 并存入 additional_kwargs。"""
        result = super()._convert_chunk_to_generation_chunk(
            chunk, default_chunk_class, base_generation_info
        )
        if result is None:
            return None

        choices = (
            chunk.get("choices", [])
            or chunk.get("chunk", {}).get("choices", [])
        )
        if choices:
            delta = choices[0].get("delta", {})
            if delta and isinstance(delta, dict):
                reasoning_content = delta.get("reasoning_content")
                if reasoning_content and isinstance(result.message, AIMessageChunk):
                    result.message.additional_kwargs["reasoning_content"] = reasoning_content

        return result

    def _get_request_payload(
        self,
        input_: Any,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict:
        """在请求 payload 中为所有 assistant 消息注入 reasoning_content。"""
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)

        messages = payload.get("messages", [])
        if not isinstance(messages, list):
            return payload

        # 从 input_ 的 AIMessage 中收集 reasoning_content
        reasoning_map = {}
        if isinstance(input_, list):
            for i, msg in enumerate(input_):
                if isinstance(msg, AIMessage) and hasattr(msg, 'additional_kwargs'):
                    rc = msg.additional_kwargs.get("reasoning_content")
                    reasoning_map[i] = rc if rc is not None else ""

        # 给每个 assistant 消息注入 reasoning_content
        for i, payload_msg in enumerate(messages):
            if isinstance(payload_msg, dict) and payload_msg.get('role') == 'assistant':
                if i in reasoning_map:
                    payload_msg['reasoning_content'] = reasoning_map[i]
                else:
                    payload_msg['reasoning_content'] = payload_msg.get('reasoning_content', '')

        return payload
