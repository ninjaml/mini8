"""Middleware for providing subagents to an agent via a `task` tool."""

from collections.abc import Awaitable, Callable, Sequence
from typing import Any, NotRequired, TypedDict, cast

from langchain.agents import create_agent
from langchain.agents.middleware import InterruptOnConfig
from langchain.agents.middleware.types import AgentMiddleware, ModelRequest, ModelResponse
from langchain.tools import BaseTool, ToolRuntime
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.runnables import Runnable
from langchain_core.tools import StructuredTool
from langgraph.types import Command


class SubAgent(TypedDict):
    """Specification for an agent.

    When specifying custom agents, the `default_middleware` from `SubAgentMiddleware`
    will be applied first, followed by any `middleware` specified in this spec.
    To use only custom middleware without the defaults, pass `default_middleware=[]`
    to `SubAgentMiddleware`.
    """

    name: str
    """The name of the agent."""

    description: str
    """The description of the agent."""

    system_prompt: str
    """The system prompt to use for the agent."""

    tools: Sequence[BaseTool | Callable | dict[str, Any]]
    """The tools to use for the agent."""

    model: NotRequired[str | BaseChatModel]
    """The model for the agent. Defaults to `default_model`."""

    middleware: NotRequired[list[AgentMiddleware]]
    """Additional middleware to append after `default_middleware`."""

class CompiledSubAgent(TypedDict):
    """A pre-compiled agent spec."""

    name: str
    """The name of the agent."""

    description: str
    """The description of the agent."""

    runnable: Runnable
    """The Runnable to use for the agent."""


DEFAULT_SUBAGENT_PROMPT = "In order to complete the objective that the user asks of you, you have access to a number of standard tools."

# 向子代理传递状态时，需要排除的状态字段
_EXCLUDED_STATE_KEYS = ("messages", "todos")

TASK_TOOL_DESCRIPTION = """Launch an ephemeral subagent to handle complex, multi-step independent tasks with isolated context windows.

Available agent types and the tools they have access to:
{available_agents}

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

## Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to create content, perform analysis, or just do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
<example>
User: "I want to conduct research on the accomplishments of Lebron James, Michael Jordan, and Kobe Bryant, and then compare them."
Assistant: *Uses the task tool in parallel to conduct isolated research on each of the three players*
Assistant: *Synthesizes the results of the three isolated research tasks and responds to the User*
<commentary>
Research is a complex, multi-step task in it of itself.
The research of each individual player is not dependent on the research of the other players.
The assistant uses the task tool to break down the complex objective into three isolated tasks.
Each research task only needs to worry about context and tokens about one player, then returns synthesized information about each player as the Tool Result.
This means each research task can dive deep and spend tokens and context deeply researching each player, but the final result is synthesized information, and saves us tokens in the long run when comparing the players to each other.
</commentary>
</example>

<example>
User: "Analyze a single large code repository for security vulnerabilities and generate a report."
Assistant: *Launches a single `task` subagent for the repository analysis*
Assistant: *Receives report and integrates results into final summary*
<commentary>
Subagent is used to isolate a large, context-heavy task, even though there is only one. This prevents the main thread from being overloaded with details.
If the user then asks followup questions, we have a concise report to reference instead of the entire history of analysis and tool calls, which is good and saves us time and money.
</commentary>
</example>

<example>
User: "Schedule two meetings for me and prepare agendas for each."
Assistant: *Calls the task tool in parallel to launch two `task` subagents (one per meeting) to prepare agendas*
Assistant: *Returns final schedules and agendas*
<commentary>
Tasks are simple individually, but subagents help silo agenda preparation.
Each subagent only needs to worry about the agenda for one meeting.
</commentary>
</example>

<example>
User: "I want to order a pizza from Dominos, order a burger from McDonald's, and order a salad from Subway."
Assistant: *Calls tools directly in parallel to order a pizza from Dominos, a burger from McDonald's, and a salad from Subway*
<commentary>
The assistant did not use the task tool because the objective is super simple and clear and only requires a few trivial tool calls.
It is better to just complete the task directly and NOT use the `task`tool.
</commentary>
</example>

### Example usage with custom agents:

<example_agent_descriptions>
"content-reviewer": use this agent after you are done creating significant content or documents
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
"research-analyst": use this agent to conduct thorough research on complex topics
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {{
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {{
    if (n % i === 0) return false
  }}
  return true
}}
</code>
<commentary>
Since significant content was created and the task was completed, now use the content-reviewer agent to review the work
</commentary>
assistant: Now let me use the content-reviewer agent to review the code
assistant: Uses the Task tool to launch with the content-reviewer agent
</example>

<example>
user: "Can you help me research the environmental impact of different renewable energy sources and create a comprehensive report?"
<commentary>
This is a complex research task that would benefit from using the research-analyst agent to conduct thorough analysis
</commentary>
assistant: I'll help you research the environmental impact of renewable energy sources. Let me use the research-analyst agent to conduct comprehensive research on this topic.
assistant: Uses the Task tool to launch with the research-analyst agent, providing detailed instructions about what research to conduct and what format the report should take
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch with the greeting-responder agent"
</example>"""  # noqa: E501

# 协作者模式下的 task 工具说明。这里改的不是工具实现，而是父级模型对 child 的
# 心智模型：child 不再是一次性工人，而是带稳定记忆、适合顺序委派的长期协作者。
COLLABORATOR_TASK_TOOL_DESCRIPTION = """Launch long-lived collaborators to handle delegated work with stable memory.

Available agent types and the tools they have access to:
{available_agents}

When using the Task tool, you must specify a subagent_type parameter to select which collaborator to use.

## Usage notes:
1. These child agents are long-lived collaborators rather than ephemeral workers
2. Each child keeps its own working context across multiple task invocations in this session
3. Prefer sequential delegation and inspect each result before assigning the next step
4. Do not dispatch multiple concurrent tasks to the same child
5. If a child is already busy, the task tool returns an explicit busy / rejected result; adjust your plan, retry later, or delegate to a different child
6. The collaborator returns a normal task result message back to you; summarize the outcome to the user in your own words
7. Tell the collaborator clearly what changed since the last assignment and what outcome you expect this round
"""  # noqa: E501

TASK_SYSTEM_PROMPT = """## `task` (subagent spawner)

You have access to a `task` tool to launch short-lived subagents that handle isolated tasks. These agents are ephemeral — they live only for the duration of the task and return a single result.

When to use the task tool:
- When a task is complex and multi-step, and can be fully delegated in isolation
- When a task is independent of other tasks and can run in parallel
- When a task requires focused reasoning or heavy token/context usage that would bloat the orchestrator thread
- When sandboxing improves reliability (e.g. code execution, structured searches, data formatting)
- When you only care about the output of the subagent, and not the intermediate steps (ex. performing a lot of research and then returned a synthesized report, performing a series of computations or lookups to achieve a concise, relevant answer.)

Subagent lifecycle:
1. **Spawn** → Provide clear role, instructions, and expected output
2. **Run** → The subagent completes the task autonomously
3. **Return** → The subagent provides a single structured result
4. **Reconcile** → Incorporate or synthesize the result into the main thread

When NOT to use the task tool:
- If you need to see the intermediate reasoning or steps after the subagent has completed (the task tool hides them)
- If the task is trivial (a few tool calls or simple lookup)
- If delegating does not reduce token usage, complexity, or context switching
- If splitting would add latency without benefit

## Important Task Tool Usage Notes to Remember
- Whenever possible, parallelize the work that you do. This is true for both tool_calls, and for tasks. Whenever you have independent steps to complete - make tool_calls, or kick off tasks (subagents) in parallel to accomplish them faster. This saves time for the user, which is incredibly important.
- Remember to use the `task` tool to silo independent tasks within a multi-part objective.
- You should use the `task` tool whenever you have a complex task that will take multiple steps, and is independent from other tasks that the agent needs to complete. These agents are highly competent and efficient."""  # noqa: E501

# 协作者模式下追加给父级 Agent 的系统提示。它负责把“不要对同一 child 并发派活、
# busy_rejected 是调度信号而不是系统故障”这层协议写进主图推理口径。
COLLABORATOR_TASK_SYSTEM_PROMPT = """## `task` (collaborator delegator)

You have access to a `task` tool that delegates work to long-lived collaborator agents.

Collaborator mode rules:
- Collaborators retain their own working context across multiple task invocations in this session
- Prefer sequential collaboration: assign one task, inspect the result, then decide the next step
- Do not send multiple concurrent tasks to the same child
- If the same child is already working, the task tool returns a busy / rejected result instead of waiting
- When you receive a busy / rejected result, treat it as a scheduling signal rather than a system failure; adjust your plan, retry later, or use another child

Be conservative about concurrency. Orderly collaboration is preferred over aggressive fan-out in this mode."""  # noqa: E501


DEFAULT_SELF_SUBAGENT_NAME = "general-purpose"
DEFAULT_SELF_SUBAGENT_DESCRIPTION = "General-purpose agent for researching complex questions, searching for files and content, and executing multi-step tasks. This agent has access to all tools as the main agent."  # noqa: E501
DEFAULT_SELF_SUBAGENT_PROMPT = DEFAULT_SUBAGENT_PROMPT


def _collect_visible_text_fragments(content: Any) -> list[str]:
    # 这个中间件不只负责发起 task，也负责把 child 的结果收口成父级可消费的
    # `ToolMessage`。旧实现更接近“取最后一条非 human 消息的 `.text`”，在默认
    # 自调用子代理的窄路径里通常够用；但预编译子 agent / 结构化 content
    # 进入后，最终答案不一定稳定落在 `.text` 字段里。
    #
    # 这里递归提取“用户真正能看到的文本”，同时跳过 `reasoning / thinking`
    # 这类内部块，供后面的结果压缩逻辑使用。
    if content is None:
        return []
    if isinstance(content, str):
        return [content] if content.strip() else []
    if isinstance(content, (int, float, bool)):
        return [str(content)]
    if isinstance(content, dict):
        block_type = content.get("type")
        if isinstance(block_type, str) and block_type in {"reasoning", "thinking"}:
            return []
        if "reasoning" in content and "text" not in content and "content" not in content:
            return []
        ordered_values: list[Any] = []
        preferred_keys = (
            "title",
            "name",
            "summary",
            "content",
            "text",
            "message",
            "description",
            "url",
        )
        seen_keys: set[str] = set()
        for key in preferred_keys:
            if key in content:
                ordered_values.append(content[key])
                seen_keys.add(key)
        for key, value in content.items():
            if key in seen_keys:
                continue
            ordered_values.append(value)
        fragments: list[str] = []
        for value in ordered_values:
            fragments.extend(_collect_visible_text_fragments(value))
        return fragments
    if isinstance(content, (list, tuple)):
        fragments: list[str] = []
        for item in content:
            fragments.extend(_collect_visible_text_fragments(item))
        return fragments
    text = str(content)
    return [text] if text.strip() else []


def _extract_visible_text_from_content(content: Any) -> str:
    fragments = _collect_visible_text_fragments(content)
    return "\n".join(fragments)


def _extract_last_non_human_visible_text(messages: list[Any]) -> str:
    # `task` 工具最终只需要回给父级一段可见文本，不能把 `HumanMessage` 或内部推理
    # 当最终答案。这里相当于把子 agent 的消息历史压成一条最终结果。
    #
    # 以前更依赖“最后一条消息的 `.text`”，现在子 agent 返回形状更宽，所以要回退到
    # `content` 级别的可见文本提取。
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            continue
        message_text = getattr(message, "text", None)
        if isinstance(message_text, str) and message_text.strip():
            return message_text
        content_text = _extract_visible_text_from_content(
            getattr(message, "content", None)
        )
        if content_text:
            return content_text
    value_error_msg = "Subagent result must include at least one non-human text message"
    raise ValueError(value_error_msg)


def _get_subagents(
    *,
    default_model: str | BaseChatModel,
    default_tools: Sequence[BaseTool | Callable | dict[str, Any]],
    default_middleware: list[AgentMiddleware] | None,
    default_interrupt_on: dict[str, bool | InterruptOnConfig] | None,
    subagents: list[SubAgent | CompiledSubAgent] | None,
) -> tuple[dict[str, Any], list[str], set[str]]:
    """Create subagent instances from specifications.

    Args:
        default_model: Default model for subagents that don't specify one.
        default_tools: Default tools for subagents that don't specify tools.
        default_middleware: Middleware to apply to all subagents. If `None`,
            no default middleware is applied.
        default_interrupt_on: 父级 Agent 的 interrupt_on 配置。task 启动的
            子Agent不会继承这层 HumanInTheLoop 边界。
        subagents: List of agent specifications or pre-compiled agents. `None`
            means use the default self-subagent.

    Returns:
        Tuple of (agent_dict, description_list) where agent_dict maps agent names
        to runnable instances and description_list contains formatted descriptions.
    """
    # `None` 时退化为空列表，表示这层没有额外默认中间件。
    default_subagent_middleware = default_middleware or []

    agents: dict[str, Any] = {}
    subagent_descriptions = []
    compiled_agent_names: set[str] = set()

    # `None` 表示启用默认“自调用子代理”。
    # 这是父 Agent 在未显式配置团队时的正常行为。
    if subagents is None:
        self_subagent_middleware = [*default_subagent_middleware]
        # `task` 工具发起的子代理只能在父级审批边界内运行；如果把父级的
        # `HumanInTheLoopMiddleware` 再下沉到 child，child 在内部触发中断后
        # 无法通过 `task -> subagent.invoke()` 这条链被恢复，最终会让
        # 父级拿不到稳定的文本结果。
        agents[DEFAULT_SELF_SUBAGENT_NAME] = create_agent(
            default_model,
            system_prompt=DEFAULT_SELF_SUBAGENT_PROMPT,
            tools=default_tools,
            middleware=self_subagent_middleware,
        )
        subagent_descriptions.append(
            f"- {DEFAULT_SELF_SUBAGENT_NAME}: {DEFAULT_SELF_SUBAGENT_DESCRIPTION}"
        )
        return agents, subagent_descriptions, compiled_agent_names

    # 逐个处理显式配置的子代理定义。
    for agent_ in subagents:
        subagent_descriptions.append(f"- {agent_['name']}: {agent_['description']}")
        if "runnable" in agent_:
            custom_agent = cast("CompiledSubAgent", agent_)
            agents[custom_agent["name"]] = custom_agent["runnable"]
            compiled_agent_names.add(custom_agent["name"])
            continue
        _tools = agent_.get("tools", list(default_tools))

        subagent_model = agent_.get("model", default_model)

        _middleware = [*default_subagent_middleware, *agent_["middleware"]] if "middleware" in agent_ else [*default_subagent_middleware]

        agents[agent_["name"]] = create_agent(
            subagent_model,
            system_prompt=agent_["system_prompt"],
            tools=_tools,
            middleware=_middleware,
        )
    return agents, subagent_descriptions, compiled_agent_names


def _create_task_tool(
    *,
    default_model: str | BaseChatModel,
    default_tools: Sequence[BaseTool | Callable | dict[str, Any]],
    default_middleware: list[AgentMiddleware] | None,
    default_interrupt_on: dict[str, bool | InterruptOnConfig] | None,
    subagents: list[SubAgent | CompiledSubAgent] | None,
    subagent_mode: str | None = None,
    task_description: str | None = None,
) -> BaseTool:
    """Create a task tool for invoking subagents.

    Args:
        default_model: Default model for subagents.
        default_tools: Default tools for subagents.
        default_middleware: Middleware to apply to all subagents.
        default_interrupt_on: 父级 Agent 的 interrupt_on 配置。保留在签名中，
            但 task 启动的子Agent不会继承这层 HumanInTheLoop 边界。
        subagents: 子代理定义列表。`None` 表示启用默认 self-subagent；
            显式传入空列表表示“当前运行时禁用 task / subagent 注入”。
        task_description: Custom description for the task tool. If `None`,
            uses default template. Supports `{available_agents}` placeholder.

    Returns:
        A StructuredTool that can invoke subagents by type.
    """
    subagent_graphs, subagent_descriptions, compiled_agent_names = _get_subagents(
        default_model=default_model,
        default_tools=default_tools,
        default_middleware=default_middleware,
        default_interrupt_on=default_interrupt_on,
        subagents=subagents,
    )
    subagent_description_str = "\n".join(subagent_descriptions)

    def _return_command_with_state_update(result: dict, tool_call_id: str, *, preserve_state: bool) -> Command:
        messages = result.get("messages")
        if not isinstance(messages, list) or not messages:
            value_error_msg = "Subagent result must include at least one message"
            raise ValueError(value_error_msg)
        final_text = _extract_last_non_human_visible_text(messages)
        # 双模式实现里，协作者 child 的 busy_rejected 不走抛异常，而是作为
        # “显式失败的工具结果”回灌给父 graph。这里把 child runnable 约定的
        # `_tool_status/_tool_reason` 翻译成标准 ToolMessage 字段。
        tool_status = result.get("_tool_status", "success")
        tool_reason = result.get("_tool_reason")
        state_update = (
            {k: v for k, v in result.items() if k not in _EXCLUDED_STATE_KEYS}
            if preserve_state
            else {}
        )
        return Command(
            update={
                **state_update,
                "messages": [
                    ToolMessage(
                        final_text,
                        tool_call_id=tool_call_id,
                        status=tool_status,
                        artifact={"reason": tool_reason} if tool_reason else None,
                    )
                ],
            }
        )

    def _validate_and_prepare_state(subagent_type: str, description: str, runtime: ToolRuntime) -> tuple[Runnable, dict, bool]:
        """Prepare state for invocation."""
        subagent = subagent_graphs[subagent_type]
        if subagent_type in compiled_agent_names:
            subagent_state = {}
            preserve_state = False
        else:
            # 复制一份 state，避免直接改写父级当前运行状态。
            subagent_state = {k: v for k, v in runtime.state.items() if k not in _EXCLUDED_STATE_KEYS}
            preserve_state = True
        subagent_state["messages"] = [HumanMessage(content=description)]
        return subagent, subagent_state, preserve_state

    def _build_subagent_invoke_config(
        subagent_type: str,
        description: str,
        runtime: ToolRuntime,
    ) -> dict[str, Any]:
        # 无论是预编译子 agent，还是默认自调用子代理，只要是 `task` 调起的子执行，
        # 都应该显式带上“本次子调用身份”，避免后续流式事件只能靠命名空间路径猜归属。
        return {
            "configurable": {
                "subagent_invocation_id": runtime.tool_call_id,
                "subagent_type": subagent_type,
            },
            "metadata": {
                "subagent_invocation_id": runtime.tool_call_id,
                "subagent_type": subagent_type,
                "description": description,
            }
        }

    # 优先使用自定义说明；没有就回退到默认模板。
    if task_description is None:
        # task 工具的候选说明要跟随 session mode 切换：
        # - executor / null：保留原来“可并发、短命工人”的口径
        # - collaborator：强调长期上下文、顺序委派和 busy_rejected
        task_template = (
            COLLABORATOR_TASK_TOOL_DESCRIPTION
            if subagent_mode == "collaborator"
            else TASK_TOOL_DESCRIPTION
        )
        task_description = task_template.format(available_agents=subagent_description_str)
    elif "{available_agents}" in task_description:
        # 自定义说明里如果带占位符，就把候选子代理描述填进去。
        task_description = task_description.format(available_agents=subagent_description_str)

    def task(
        description: str,
        subagent_type: str,
        runtime: ToolRuntime,
    ) -> str | Command:
        if subagent_type not in subagent_graphs:
            allowed_types = ", ".join([f"`{k}`" for k in subagent_graphs])
            return f"We cannot invoke subagent {subagent_type} because it does not exist, the only allowed types are {allowed_types}"
        if not runtime.tool_call_id:
            value_error_msg = "Tool call ID is required for subagent invocation"
            raise ValueError(value_error_msg)
        subagent, subagent_state, preserve_state = _validate_and_prepare_state(subagent_type, description, runtime)
        invoke_config = _build_subagent_invoke_config(subagent_type, description, runtime)
        result = subagent.invoke(subagent_state, config=invoke_config)
        return _return_command_with_state_update(result, runtime.tool_call_id, preserve_state=preserve_state)

    async def atask(
        description: str,
        subagent_type: str,
        runtime: ToolRuntime,
    ) -> str | Command:
        if subagent_type not in subagent_graphs:
            allowed_types = ", ".join([f"`{k}`" for k in subagent_graphs])
            return f"We cannot invoke subagent {subagent_type} because it does not exist, the only allowed types are {allowed_types}"
        if not runtime.tool_call_id:
            value_error_msg = "Tool call ID is required for subagent invocation"
            raise ValueError(value_error_msg)
        subagent, subagent_state, preserve_state = _validate_and_prepare_state(subagent_type, description, runtime)
        invoke_config = _build_subagent_invoke_config(subagent_type, description, runtime)
        result = await subagent.ainvoke(subagent_state, config=invoke_config)
        return _return_command_with_state_update(result, runtime.tool_call_id, preserve_state=preserve_state)

    return StructuredTool.from_function(
        name="task",
        func=task,
        coroutine=atask,
        description=task_description,
    )


class SubAgentMiddleware(AgentMiddleware):
    """Middleware for providing subagents to an agent via a `task` tool.

    This  middleware adds a `task` tool to the agent that can be used to invoke subagents.
    Subagents are useful for handling complex tasks that require multiple steps, or tasks
    that require a lot of context to resolve.

    A chief benefit of subagents is that they can handle multi-step tasks, and then return
    a clean, concise response to the main agent.

    Subagents are also great for different domains of expertise that require a narrower
    subset of tools and focus.

    Args:
        default_model: The model to use for subagents.
            Can be a LanguageModelLike or a dict for init_chat_model.
        default_tools: The tools to use for subagents that do not specify their own.
        default_middleware: Default middleware to apply to all subagents. If `None` (default),
            no default middleware is applied. Pass a list to specify custom middleware.
        default_interrupt_on: 父级 Agent 的 interrupt_on 配置；task 工具发起的
            子Agent不会继承这层 HumanInTheLoop 边界。
        subagents: A list of additional subagents to provide to the agent.
            `None` enables the default self-subagent, while `[]` disables task
            injection entirely.
        system_prompt: Full system prompt override. When provided, completely replaces
            the agent's system prompt.
        task_description: Custom description for the task tool. If `None`, uses the
            default description template.

    Example:
        ```python
        from langchain.agents.middleware.subagents import SubAgentMiddleware
        from langchain.agents import create_agent

        # Basic usage with defaults (injects the default self-subagent)
        agent = create_agent(
            "openai:gpt-4o",
            middleware=[
                SubAgentMiddleware(
                    default_model="openai:gpt-4o",
                )
            ],
        )

        # Disable task injection explicitly
        agent = create_agent(
            "openai:gpt-4o",
            middleware=[
                SubAgentMiddleware(
                    default_model="openai:gpt-4o",
                    default_middleware=[TodoListMiddleware()],
                    subagents=[],
                )
            ],
        )
        ```
    """

    def __init__(
        self,
        *,
        default_model: str | BaseChatModel,
        default_tools: Sequence[BaseTool | Callable | dict[str, Any]] | None = None,
        default_middleware: list[AgentMiddleware] | None = None,
        default_interrupt_on: dict[str, bool | InterruptOnConfig] | None = None,
        subagents: list[SubAgent | CompiledSubAgent] | None = None,
        subagent_mode: str | None = None,
        system_prompt: str | None = TASK_SYSTEM_PROMPT,
        task_description: str | None = None,
    ) -> None:
        """Initialize the SubAgentMiddleware."""
        super().__init__()
        # `[]` 是内部使用的“禁用 subagent”信号，主要给子 agent 运行时使用，
        # 避免子代理再次递归生成自己的 `subagent`。
        disable_task_tool = subagents == []
        # 这里是真正切换父级“委派协议”的入口：协作者模式下改用另一套
        # system prompt；null / executor 保持原有 task 口径。
        resolved_system_prompt = (
            COLLABORATOR_TASK_SYSTEM_PROMPT
            if subagent_mode == "collaborator"
            else system_prompt
        )
        self.system_prompt = None if disable_task_tool else resolved_system_prompt
        if disable_task_tool:
            self.tools = []
            return
        task_tool = _create_task_tool(
            default_model=default_model,
            default_tools=default_tools or [],
            default_middleware=default_middleware,
            default_interrupt_on=default_interrupt_on,
            subagents=subagents,
            subagent_mode=subagent_mode,
            task_description=task_description,
        )
        self.tools = [task_tool]

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Update the system prompt to include instructions on using subagents."""
        if self.system_prompt is not None:
            system_prompt = request.system_prompt + "\n\n" + self.system_prompt if request.system_prompt else self.system_prompt
            return handler(request.override(system_prompt=system_prompt))
        return handler(request)

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        """(async) Update the system prompt to include instructions on using subagents."""
        if self.system_prompt is not None:
            system_prompt = request.system_prompt + "\n\n" + self.system_prompt if request.system_prompt else self.system_prompt
            return await handler(request.override(system_prompt=system_prompt))
        return await handler(request)
