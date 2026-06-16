"""DeepSeek-specific summarization middleware for handling long conversations."""

from typing import Any, List, Optional, Dict
from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage, SystemMessage, RemoveMessage, ToolMessage
from langchain_core.language_models import BaseChatModel
from typing_extensions import override
from langgraph.runtime import Runtime


class DeepSeekSummarizationMiddleware(AgentMiddleware):
    """对话摘要中间件，支持多种 LLM 模型。
    
    监控对话的 token 数量，当超过阈值时自动生成摘要，
    用摘要替换旧的历史消息，只保留最新的几条消息。
    
    Args:
        model: LLM 模型实例（支持 DeepSeek、Kimi、Claude、GPT、MiniMax、智谱、通义千问 等）
        trigger_tokens: 触发 summarization 的 token 阈值 (默认: 100000)
        keep_messages: 保留的最新消息数量 (默认: 5)
        max_summary_tokens: 摘要的最大长度 (默认: 2000)
        summary_prompt: 自定义摘要提示词模板
    """
    
    def __init__(
        self,
        model: BaseChatModel,
        *,
        trigger_tokens: int = 100000, # DeepSeek 最大 token 数为 128000
        keep_messages: int = 5,
        max_summary_tokens: int = 2000,
        summary_prompt: Optional[str] = None
    ):
        self.model = model
        self.summary_model = self._create_summary_model(model)
        self.trigger_tokens = trigger_tokens
        self.keep_messages = keep_messages
        self.max_summary_tokens = max_summary_tokens
        
        # DeepSeek 优化的摘要提示词
        self.summary_prompt = summary_prompt or """请从以下对话历史中提取最重要的信息，生成一个简洁的摘要。

要求：
1. 用中文生成摘要
2. 包含用户的主要目标和需求
3. 包含已完成的关键步骤和结果
4. 包含重要的决策、发现和代码片段
5. 包含当前状态和下一步计划
6. 保持简洁，不超过 {max_summary_tokens} 个字符

对话历史：
{messages}

摘要："""

    @override
    async def abefore_model(self, state: AgentState[Any], runtime: Runtime) -> dict[str, Any] | None:
        """在模型调用前检查是否需要 summarization.
        
        Args:
            state: Agent 状态，包含 messages 等
            runtime: 运行时环境
            
        Returns:
            如果需要 summarization，返回更新后的状态
            否则返回 None
        """
        messages = list(state.get("messages", []))
        if not messages:
            return None
        
        # 计算当前 tokens
        total_tokens = self._count_tokens(messages)
        # 酌情打印当前 token 数量
        print(f"[mini8] Token reached: {total_tokens}/{self.trigger_tokens}")

        # 如果 tokens 超过阈值，触发 summarization
        if total_tokens >= self.trigger_tokens:
            print(f"[mini8] Token limit reached: {total_tokens}/{self.trigger_tokens}, triggering summarization")
            # 先插入一条提示消息，通过 stream 通知前端
            state["messages"].append(AIMessage(content="📝 对话历史较长，正在压缩上下文..."))
            return await self._summarize_conversation(messages)
        
        return None
    
    @staticmethod
    def _create_summary_model(model: BaseChatModel) -> BaseChatModel:
        """判断主模型类型，为 Kimi 创建轻量总结模型，其他模型直接复用。"""
        from deepagents_webapi.model.kimi_reasoning_fix import ChatKimiWithReasoning
        if isinstance(model, ChatKimiWithReasoning):
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model_name="moonshot-v1-auto",
                api_key=model.openai_api_key,
                base_url="https://api.moonshot.cn/v1",
            )
        return model

    def _count_tokens(self, messages: List[BaseMessage]) -> int:
        """从 API 响应的 usage_metadata 获取真实 token 数，所有 OpenAI 兼容模型通用。
        
        优先从最后一条 AIMessage 的 usage_metadata.input_tokens 取值（API 返回的真实值），
        取不到时 fallback 到字符数近似估算。
        
        Args:
            messages: 消息列表
            
        Returns:
            当前上下文的 token 数量
        """
        # 优先从最后一条 AIMessage 的 usage_metadata 取真实值
        for msg in reversed(messages):
            if isinstance(msg, AIMessage):
                usage = getattr(msg, "usage_metadata", None)
                if usage:
                    input_tokens = usage.get("input_tokens", 0)
                    if input_tokens > 0:
                        print(f"[mini8] Token count from API usage_metadata: {input_tokens}")
                        return input_tokens
                    else:
                        print(f"[mini8] usage_metadata found but input_tokens=0: {usage}")
                else:
                    print(f"[mini8] Last AIMessage has no usage_metadata")
                break  # 只看最后一条 AIMessage

        # Fallback：字符数近似估算
        print(f"[mini8] Using fallback character-based token estimation")
        try:
            from langchain_core.messages.utils import count_tokens_approximately
            # 过滤掉多模态消息中的 base64 图片/视频数据，避免虚假膨胀
            cleaned = self._strip_media_for_counting(messages)
            return count_tokens_approximately(
                cleaned, 
                chars_per_token=3.5,
                extra_tokens_per_message=6.0
            )
        except ImportError:
            total_chars = 0
            for msg in messages:
                if hasattr(msg, 'content'):
                    content = msg.content
                    if isinstance(content, str):
                        total_chars += len(content)
                    elif isinstance(content, list):
                        # 多模态消息：只计算文本部分
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                total_chars += len(part.get("text", ""))
            return int(total_chars / 2.0)
    
    @staticmethod
    def _strip_media_for_counting(messages: List[BaseMessage]) -> List[BaseMessage]:
        """复制消息列表，将多模态 content 中的媒体数据替换为短占位符。
        
        仅用于 fallback token 估算，不修改原始消息。
        各类型估算值参考各模型 API 文档典型消耗：
        - 图片: ~1500 tokens
        - 视频: ~5000 tokens（按帧数，粗估）
        - 音频: ~3000 tokens（按时长，粗估）
        """
        import copy
        # 媒体类型 → 占位符估算 token 数
        _MEDIA_ESTIMATES = {
            "image_url": 1500,
            "video_url": 5000,
            "audio_url": 3000,
            "input_audio": 3000,
        }
        cleaned = []
        for msg in messages:
            if isinstance(msg.content, list):
                new_parts = []
                for part in msg.content:
                    if isinstance(part, dict) and part.get("type") in _MEDIA_ESTIMATES:
                        est = _MEDIA_ESTIMATES[part["type"]]
                        new_parts.append({"type": "text", "text": f"[media ~{est} tokens]"})
                    else:
                        new_parts.append(part)
                new_msg = copy.copy(msg)
                new_msg.content = new_parts
                cleaned.append(new_msg)
            else:
                cleaned.append(msg)
        return cleaned
    async def _summarize_conversation(self, messages: List[BaseMessage]) -> Optional[Dict[str, Any]]:
        """执行 summarization.
        
        Args:
            messages: 完整的消息列表
            
        Returns:
            包含更新后 messages 的状态字典
        """
        # 确保所有消息都有ID
        self._ensure_message_ids(messages)
        
        # 找到安全的切割点，避免在ToolMessage中间切割
        cutoff_index = self._find_safe_cutoff(messages, self.keep_messages)
        
        if cutoff_index <= 0:
            print(f"[mini8] No safe cutoff found or no messages to summarize")
            return None
            
        messages_to_summarize = messages[:cutoff_index]
        preserved_messages = messages[cutoff_index:]
        
        print(f"[mini8] Summarizing {len(messages_to_summarize)} messages, keeping {len(preserved_messages)} recent messages")
        
        # 生成摘要
        summary = await self._generate_summary(messages_to_summarize)
        
        # 构建新的消息列表 - 使用HumanMessage而不是SystemMessage
        summary_message = HumanMessage(
            content=f"【对话历史摘要】以下是对之前 {len(messages_to_summarize)} 条消息的摘要：\n\n{summary}"
        )
        
        print(f"[mini8] Summary generated, length: {len(summary)} characters")
        
        return {
            "messages": [
                RemoveMessage(id="__remove_all__"),
                summary_message,
                *preserved_messages
            ]
        }
    
    async def _generate_summary(self, messages: List[BaseMessage]) -> str:
        """使用 DeepSeek 生成摘要.
        
        Args:
            messages: 需要摘要的消息列表
            
        Returns:
            生成的摘要文本
        """
        # 格式化消息用于提示词
        formatted_messages = self._format_messages_for_summary(messages)
        
        # 构建提示词
        prompt = self.summary_prompt.format(
            max_summary_tokens=self.max_summary_tokens,
            messages=formatted_messages
        )
        
        try:
            # 使用总结专用模型（Kimi 时为 moonshot-v1-auto，其他模型直接复用主模型）
            model_name = getattr(self.summary_model, 'model_name', 'unknown')
            print(f"[mini8] Generating summary with {model_name}...")
            response = await self.summary_model.ainvoke([
                HumanMessage(content=prompt)
            ])
            
            summary = response.text.strip()
            print(f"[mini8] Summary generation successful")
            return summary
            
        except Exception as e:
            # 降级方案：生成简单摘要
            print(f"[mini8] Error generating summary: {e}")
            return self._fallback_summary(messages)
    
    def _format_messages_for_summary(self, messages: List[BaseMessage]) -> str:
        """将消息格式化为文本用于摘要生成.
        
        Args:
            messages: 消息列表
            
        Returns:
            格式化后的文本
        """
        formatted = []
        for i, msg in enumerate(messages, 1):
            if isinstance(msg, HumanMessage):
                role = "用户"
            elif isinstance(msg, AIMessage):
                role = "助手"
            elif isinstance(msg, SystemMessage):
                role = "系统"
            else:
                role = "未知"
            
            content = msg.content
            
            # 多模态消息：提取文本部分，跳过图片/视频/音频
            if isinstance(content, list):
                text_parts = []
                media_count = 0
                for part in content:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            text_parts.append(part.get("text", ""))
                        elif part.get("type") in ("image_url", "video_url", "audio_url", "input_audio"):
                            media_count += 1
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = " ".join(text_parts)
                if media_count:
                    content += f" [附件: {media_count}个媒体文件]"
            
            # 简化长内容
            if content and len(content) > 500:
                content = content[:500] + "...[内容过长已截断]"
            
            formatted.append(f"【{role} - 消息 {i}】\n{content}")
        
        return "\n\n" + "=" * 50 + "\n\n".join(formatted) + "\n" + "=" * 50
    
    def _fallback_summary(self, messages: List[BaseMessage]) -> str:
        """降级摘要方案，当模型调用失败时使用.
        
        Args:
            messages: 消息列表
            
        Returns:
            简单的统计摘要
        """
        human_count = sum(1 for m in messages if isinstance(m, HumanMessage))
        ai_count = sum(1 for m in messages if isinstance(m, AIMessage))
        system_count = sum(1 for m in messages if isinstance(m, SystemMessage))
        
        # 提取最后几条消息的关键信息
        recent_content = []
        for msg in messages[-5:]:  # 最后5条消息
            if isinstance(msg, HumanMessage):
                role = "用户"
            elif isinstance(msg, AIMessage):
                role = "助手"
            elif isinstance(msg, SystemMessage):
                role = "系统"
            else:
                role = "未知"
            
            content_preview = msg.content[:100] + "..." if msg.content and len(msg.content) > 100 else (msg.content or "")
            recent_content.append(f"{role}: {content_preview}")
        
        return f"""自动生成的对话摘要（由于技术问题，无法生成详细摘要）：
        
统计信息：
- 总消息数：{len(messages)} 条
- 用户消息：{human_count} 条
- 助手消息：{ai_count} 条  
- 系统消息：{system_count} 条

最近对话内容：
{chr(10).join(recent_content)}

注：建议查看完整对话历史以获取详细信息。"""
    
    def _ensure_message_ids(self, messages: List[BaseMessage]) -> None:
        """确保所有消息都有唯一ID.
        
        Args:
            messages: 消息列表
        """
        import uuid
        for msg in messages:
            if msg.id is None:
                msg.id = str(uuid.uuid4())
    
    def _find_safe_cutoff(self, messages: List[BaseMessage], messages_to_keep: int) -> int:
        """找到安全的切割点，避免在ToolMessage中间切割.
        
        Args:
            messages: 消息列表
            messages_to_keep: 要保留的消息数量
            
        Returns:
            安全的切割点索引
        """
        if len(messages) <= messages_to_keep:
            return 0
        
        target_cutoff = len(messages) - messages_to_keep
        return self._find_safe_cutoff_point(messages, target_cutoff)
    
    def _find_safe_cutoff_point(self, messages: List[BaseMessage], cutoff_index: int) -> int:
        """找到安全的切割点，确保不会在ToolMessage中间切割.
        
        如果cutoff_index处的消息是ToolMessage，则向前推进直到找到非ToolMessage。
        
        Args:
            messages: 消息列表
            cutoff_index: 目标切割点
            
        Returns:
            调整后的安全切割点
        """
        while cutoff_index < len(messages) and isinstance(messages[cutoff_index], ToolMessage):
            cutoff_index += 1
        return cutoff_index

    @property
    def name(self) -> str:
        """Middleware 名称."""
        return "DeepSeekSummarizationMiddleware"
