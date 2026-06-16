"""完整的DeepSeek思考模式支持修复。"""

from typing import Any, Dict, List

from langchain_deepseek import ChatDeepSeek
from langchain_core.messages import AIMessage


class ChatDeepSeekWithFullReasoning(ChatDeepSeek):
    """增强的ChatDeepSeek，完整支持思考模式。"""

    def __init__(self, **kwargs):
        # streaming 时返回 usage 信息，让 usage_metadata 有值
        kwargs.setdefault("stream_usage", True)
        super().__init__(**kwargs)
    
    def _get_request_payload(
        self,
        input_: Any,
        *,
        stop: List[str] | None = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """获取请求负载并正确处理reasoning_content字段。
        
        这个方法：
        1. 调用父类获取基本负载
        2. 不在这里添加reasoning=True（应通过model_kwargs传递）
        3. 自动为所有包含它的助手消息包含reasoning_content
          （根据DeepSeek API文档，reasoning_content应该在工具调用迭代期间发送，
           并且助手消息在发送回API时应保持其reasoning_content字段）
        
        注意：reasoning=True应通过config.py中的model_kwargs传递，
        这将由父类处理。
        """
        # print(f"DEBUG [_get_request_payload]: 开始 _get_request_payload")
        # 调用父类获取基本负载（包含如reasoning=True的model_kwargs）
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        # print(f"DEBUG [_get_request_payload]: 父类payload获取完成")
        
        # 检查输入是否是消息列表
        if isinstance(input_, list) and len(input_) > 0:
            # print(f"DEBUG [_get_request_payload]: 输入是消息列表，长度: {len(input_)}")
        
            # 根据DeepSeek API文档：
            # - 在工具调用迭代中：必须包含来自上一个助手消息的reasoning_content
            # - 在新的对话轮次中：不应包含reasoning_content
            
            # 收集所有AIMessage及其reasoning_content
            reasoning_messages = []
            # print(f"DEBUG [_get_request_payload]: 开始收集助手消息的reasoning_content")
            for i, msg in enumerate(input_):
                if isinstance(msg, AIMessage) and hasattr(msg, 'additional_kwargs'):
                    reasoning_content = msg.additional_kwargs.get("reasoning_content")
                    # 将None转换为空字符串 - API期望该字段存在
                    if reasoning_content is None:
                        reasoning_content = ""
                    # print(f"DEBUG [_get_request_payload]: 助手消息索引 {i} 有 reasoning_content: {reasoning_content}")
                    # 始终包含，即使是空字符串
                    reasoning_messages.append((i, msg, reasoning_content))
            
            # print(f"DEBUG [_get_request_payload]: 找到 {len(reasoning_messages)} 个助手消息需要处理")
            
            # 为所有包含它的助手消息包含reasoning_content
            # 根据错误信息，API期望reasoning_content字段存在
            # 即使在新对话轮次中（尽管它可能忽略内容）
            if reasoning_messages:
                # print(f"DEBUG [_get_request_payload]: 有reasoning_messages需要处理")
                # 负载应该有一个'messages'字段
                if 'messages' in payload and isinstance(payload['messages'], list):
                    # print(f"DEBUG [_get_request_payload]: payload有messages列表，长度: {len(payload['messages'])}")
                    # 为每个reasoning消息，在负载中找到对应位置
                    for msg_index, aimsg, reasoning_content in reasoning_messages:
                        # 尝试在负载中找到相同索引的助手消息
                        if msg_index < len(payload['messages']):
                            # print(f"DEBUG [_get_request_payload]: 使用索引匹配，索引: {msg_index}")
                            payload_msg = payload['messages'][msg_index]
                            if isinstance(payload_msg, dict) and payload_msg.get('role') == 'assistant':
                                # 将reasoning_content添加到助手消息
                                payload_msg['reasoning_content'] = reasoning_content
                        else:
                            # print(f"DEBUG [_get_request_payload]: 索引 {msg_index} 超出范围，使用内容匹配回退")
                            # 回退：通过内容匹配搜索助手消息
                            for payload_msg in payload['messages']:
                                if isinstance(payload_msg, dict) and payload_msg.get('role') == 'assistant':
                                    # 简单的启发式方法：如果内容匹配或者我们没有更好的方法
                                    # 我们将reasoning_content添加到第一个匹配的助手消息
                                    if 'content' in payload_msg and aimsg.content and payload_msg['content'] == aimsg.content:
                                        payload_msg['reasoning_content'] = reasoning_content
                                        break
                else:
                    # print(f"DEBUG [_get_request_payload]: payload没有messages列表，进入回退逻辑")

                    # 如果负载没有预期格式的'messages'字段，
                    # 我们需要以不同方式处理
                    
                    # 如果是最后一个助手消息，尝试直接将reasoning_content添加到负载
                    last_assistant_msg = None
                    for msg in reversed(input_):
                        if isinstance(msg, AIMessage):
                            last_assistant_msg = msg
                            break
                    
                    if last_assistant_msg and hasattr(last_assistant_msg, 'additional_kwargs'):
                        reasoning_content = last_assistant_msg.additional_kwargs.get("reasoning_content")
                        if reasoning_content is not None:
                            # 作为回退方案，添加为顶级字段
                            payload['reasoning_content'] = reasoning_content
            # else:
            #     print(f"DEBUG [_get_request_payload]: 没有reasoning_messages，跳过处理")
        # else:
        #     print(f"DEBUG [_get_request_payload]: 输入不是消息列表或为空，跳过处理")
        
        # print(f"DEBUG [_get_request_payload]: 返回payload")
        return payload