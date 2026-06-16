"""桌面 GUI 自动化中间件，使用 PyAutoGUI 和多模态模型。

提供单一的 'auto_gui' 工具，支持多种桌面自动化操作。
使用截图 + 多模态模型进行感知，PyAutoGUI 执行操作。
"""

from __future__ import annotations

import base64
import io
import time
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage

try:
    import pyautogui
    from PIL import Image

    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

try:
    import pyperclip

    PYPERCLIP_AVAILABLE = True
except ImportError:
    PYPERCLIP_AVAILABLE = False


class AutoGuiMiddleware(AgentMiddleware[AgentState, Any]):
    """桌面 GUI 自动化中间件。

    提供单一的 'auto_gui' 工具，支持以下操作：
    - start/stop/status: 自动化会话生命周期
    - screenshot: 捕获桌面截图
    - analyze: 使用多模态模型分析截图并建议操作
    - click: 点击指定坐标
    - type: 使用键盘输入文本（支持中英文）
    - press: 按下键盘按键（Enter、Tab、Escape 等）
    - hotkey: 按下键盘组合键（Ctrl+C、Alt+Tab 等）
    - scroll: 滚动鼠标滚轮
    - move: 移动鼠标到指定坐标
    - drag: 从一个位置拖拽到另一个位置
    - wait: 等待指定秒数

    核心设计：
    - 单一工具，多种操作（类似 browser.py）
    - 基于截图的感知，配合多模态模型
    - 使用 PyAutoGUI 进行鼠标/键盘自动化
    - 安全性：执行自动化前需要先调用 start 操作
    """

    def __init__(
        self,
        *,
        model: Any = None,
    ) -> None:
        """初始化 AutoGuiMiddleware。

        参数:
            model: 用于截图分析的多模态模型（如支持视觉的 ChatOpenAI）。
                如果为 None，analyze 操作将返回错误。
        """
        super().__init__()
        self._model = model
        self._tool_name = "auto_gui"

        self._started = False
        self._last_screenshot: Image.Image | None = None
        self._last_screenshot_base64: str | None = None

        description = (
            "Control desktop GUI for automation. Single tool, use 'action' parameter to specify operation.\n"
            "\nActions:\n"
            "  start              - Start automation session (required before other actions)\n"
            "  stop               - Stop automation session\n"
            "  status             - Check automation status\n"
            "  screenshot         - Capture desktop screenshot (returns base64 image)\n"
            "  analyze            - Analyze screenshot with vision model, get suggested actions\n"
            "  click              - Click at position (params: x, y)\n"
            "  double_click       - Double click at position (params: x, y)\n"
            "  right_click        - Right click at position (params: x, y)\n"
            "  type               - Type text with keyboard (params: text), supports Chinese\n"
            "  press              - Press keyboard key (params: key: Enter|Tab|Escape|Backspace etc.)\n"
            "  hotkey             - Press keyboard combination (params: keys: ctrl+c, alt+tab etc.)\n"
            "  scroll             - Scroll mouse wheel (params: direction: up|down, clicks)\n"
            "  move               - Move mouse to position (params: x, y)\n"
            "  drag               - Drag from (x1,y1) to (x2,y2) (params: x1, y1, x2, y2)\n"
            "  wait               - Wait for seconds (params: seconds)\n"
            "\nWorkflow: start -> screenshot -> analyze -> click/type -> screenshot -> ...\n"
            "Always screenshot before actions to understand current state.\n"
            "Use analyze to get AI suggestions for complex tasks.\n"
            "Coordinates: (0,0) is top-left corner of screen."
        )

        @tool(self._tool_name, description=description)
        def auto_gui_tool(
            action: str,
            runtime: ToolRuntime[None, AgentState],
            x: int = 0,
            y: int = 0,
            x1: int = 0,
            y1: int = 0,
            x2: int = 0,
            y2: int = 0,
            text: str = "",
            key: str = "",
            keys: str = "",
            direction: str = "down",
            clicks: int = 3,
            seconds: float = 1.0,
            task: str = "",
        ) -> ToolMessage | str:
            """Desktop GUI automation tool.

            Args:
                action: The action to perform.
                runtime: The tool runtime context.
                x, y: Coordinates for click/move actions.
                x1, y1, x2, y2: Coordinates for drag action.
                text: Text to type (supports Chinese).
                key: Key to press (Enter, Tab, Escape, etc.).
                keys: Keyboard combination for hotkey (ctrl+c, alt+tab, etc.).
                direction: Scroll direction (up/down).
                clicks: Number of scroll clicks.
                seconds: Seconds to wait.
                task: Task description for analyze action.
            """
            return self._handle_action(
                action=action,
                tool_call_id=runtime.tool_call_id,
                x=x,
                y=y,
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                text=text,
                key=key,
                keys=keys,
                direction=direction,
                clicks=clicks,
                seconds=seconds,
                task=task,
            )

        self._auto_gui_tool = auto_gui_tool
        self.tools = [self._auto_gui_tool]

    def _require_started(self) -> None:
        """检查自动化会话是否已启动。"""
        if not self._started:
            raise RuntimeError("自动化未启动。请先执行 action='start'。")

    def _require_pyautogui(self) -> None:
        """检查 PyAutoGUI 是否可用。"""
        if not PYAUTOGUI_AVAILABLE:
            raise ImportError(
                "需要安装 pyautogui 和 Pillow。请执行: pip install pyautogui Pillow"
            )

    def _handle_action(
        self,
        *,
        action: str,
        tool_call_id: str | None,
        x: int,
        y: int,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        text: str,
        key: str,
        keys: str,
        direction: str,
        clicks: int,
        seconds: float,
        task: str,
    ) -> ToolMessage | str:
        """将操作分发到对应的处理方法。"""
        try:
            action = action.strip().lower()

            if action == "start":
                result = self._action_start()
            elif action == "stop":
                result = self._action_stop()
            elif action == "status":
                result = self._action_status()
            elif action == "screenshot":
                return self._action_screenshot(tool_call_id)
            elif action == "analyze":
                result = self._action_analyze(task)
            elif action == "click":
                result = self._action_click(x, y)
            elif action == "double_click":
                result = self._action_double_click(x, y)
            elif action == "right_click":
                result = self._action_right_click(x, y)
            elif action == "type":
                result = self._action_type(text)
            elif action == "press":
                result = self._action_press(key)
            elif action == "hotkey":
                result = self._action_hotkey(keys)
            elif action == "scroll":
                result = self._action_scroll(direction, clicks)
            elif action == "move":
                result = self._action_move(x, y)
            elif action == "drag":
                result = self._action_drag(x1, y1, x2, y2)
            elif action == "wait":
                result = self._action_wait(seconds)
            else:
                result = f"错误: 未知操作 '{action}'"

        except ImportError as e:
            result = f"错误: {e}"
        except Exception as e:
            result = f"错误: {e}"

        if tool_call_id is not None:
            return ToolMessage(
                content=result,
                tool_call_id=tool_call_id,
                status="error" if result.startswith("错误") else "success",
            )
        return result

    def _action_start(self) -> str:
        """启动自动化会话。"""
        self._require_pyautogui()

        if self._started:
            return "自动化会话已在运行中。"

        screen_width, screen_height = pyautogui.size()
        self._started = True
        return (
            f"自动化会话已启动。\n"
            f"屏幕分辨率: {screen_width}x{screen_height}\n"
            f"鼠标位置: {pyautogui.position()}\n"
            f"提示: 使用 'screenshot' 查看当前状态，使用 'analyze' 获取 AI 建议。"
        )

    def _action_stop(self) -> str:
        """停止自动化会话。"""
        self._started = False
        self._last_screenshot = None
        self._last_screenshot_base64 = None
        return "自动化会话已停止。"

    def _action_status(self) -> str:
        """检查自动化状态。"""
        if not self._started:
            return "自动化会话未运行。"

        self._require_pyautogui()
        screen_width, screen_height = pyautogui.size()
        mouse_x, mouse_y = pyautogui.position()
        return (
            f"自动化会话正在运行。\n"
            f"屏幕: {screen_width}x{screen_height}\n"
            f"鼠标: ({mouse_x}, {mouse_y})"
        )

    def _action_screenshot(self, tool_call_id: str | None) -> ToolMessage:
        """捕获桌面截图。"""
        self._require_started()
        self._require_pyautogui()

        screenshot = pyautogui.screenshot()
        self._last_screenshot = screenshot

        buffered = io.BytesIO()
        screenshot.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        self._last_screenshot_base64 = img_base64

        screen_width, screen_height = pyautogui.size()
        content = (
            f"截图已捕获。\n"
            f"屏幕: {screen_width}x{screen_height}\n"
            f"使用 'analyze' 操作获取下一步的 AI 建议。"
        )

        if tool_call_id is not None:
            return ToolMessage(
                content=content,
                tool_call_id=tool_call_id,
                status="success",
                additional_kwargs={"image": img_base64},
            )
        return content

    def _action_analyze(self, task: str) -> str:
        """使用多模态模型分析截图并建议操作。"""
        self._require_started()

        if self._model is None:
            return "错误: 未配置多模态模型。请使用支持视觉的模型初始化 AutoGuiMiddleware。"

        if self._last_screenshot is None:
            return "错误: 没有可用的截图。请先执行 'screenshot' 操作。"

        try:
            from langchain_core.messages import HumanMessage

            prompt = (
                f"Analyze this desktop screenshot and suggest the next action to accomplish the task.\n"
                f"Task: {task if task else 'Describe what you see and suggest possible actions.'}\n\n"
                f"Respond in this format:\n"
                f"DESCRIPTION: [brief description of what's on screen]\n"
                f"SUGGESTED_ACTION: [one of: click, double_click, right_click, type, press, hotkey, scroll, drag, wait]\n"
                f"PARAMETERS: [relevant parameters like x, y, text, key, etc.]\n"
                f"REASONING: [why this action is suggested]"
            )

            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{self._last_screenshot_base64}"
                        },
                    },
                ]
            )

            response = self._model.invoke([message])
            return f"分析结果:\n{response.content}"

        except Exception as e:
            return f"错误: 分析截图失败: {e}"

    def _action_click(self, x: int, y: int) -> str:
        """点击指定位置。"""
        self._require_started()
        self._require_pyautogui()

        if x <= 0 and y <= 0:
            return "错误: 请提供有效的 'x, y' 坐标。"

        pyautogui.click(x, y)
        return f"已点击 ({x}, {y})"

    def _action_double_click(self, x: int, y: int) -> str:
        """双击指定位置。"""
        self._require_started()
        self._require_pyautogui()

        if x == 0 and y == 0:
            pyautogui.doubleClick()
            return "已在当前鼠标位置双击。"

        pyautogui.doubleClick(x, y)
        return f"已双击 ({x}, {y})"

    def _action_right_click(self, x: int, y: int) -> str:
        """右键点击指定位置。"""
        self._require_started()
        self._require_pyautogui()

        if x == 0 and y == 0:
            pyautogui.rightClick()
            return "已在当前鼠标位置右键点击。"

        pyautogui.rightClick(x, y)
        return f"已右键点击 ({x}, {y})"

    def _action_type(self, text: str) -> str:
        """使用键盘输入文本（支持中英文）。"""
        self._require_started()
        self._require_pyautogui()

        if not text:
            return "错误: 'type' 操作需要 'text' 参数。"

        has_chinese = any("\u4e00" <= char <= "\u9fff" for char in text)

        if has_chinese:
            if not PYPERCLIP_AVAILABLE:
                return "错误: 输入中文需要安装 pyperclip。请执行: pip install pyperclip"

            pyperclip.copy(text)
            pyautogui.hotkey("ctrl", "v")
            return f"已输入（通过剪贴板）: {text}"
        else:
            pyautogui.typewrite(text, interval=0.05)
            return f"已输入: {text}"

    def _action_press(self, key: str) -> str:
        """按下键盘按键。"""
        self._require_started()
        self._require_pyautogui()

        if not key:
            return "错误: 'press' 操作需要 'key' 参数。"

        pyautogui.press(key.lower())
        return f"已按下按键: {key}"

    def _action_hotkey(self, keys: str) -> str:
        """按下键盘组合键。"""
        self._require_started()
        self._require_pyautogui()

        if not keys:
            return "错误: 'hotkey' 操作需要 'keys' 参数。"

        key_list = [k.strip().lower() for k in keys.split("+")]
        pyautogui.hotkey(*key_list)
        return f"已按下组合键: {keys}"

    def _action_scroll(self, direction: str, clicks: int) -> str:
        """滚动鼠标滚轮。"""
        self._require_started()
        self._require_pyautogui()

        direction = direction.lower()
        if direction == "up":
            pyautogui.scroll(clicks)
        elif direction == "down":
            pyautogui.scroll(-clicks)
        else:
            return f"错误: 无效的方向 '{direction}'。请使用 'up' 或 'down'。"

        return f"已向 {direction} 滚动 {clicks} 次。"

    def _action_move(self, x: int, y: int) -> str:
        """移动鼠标到指定位置。"""
        self._require_started()
        self._require_pyautogui()

        pyautogui.moveTo(x, y, duration=0.3)
        return f"鼠标已移动到 ({x}, {y})"

    def _action_drag(self, x1: int, y1: int, x2: int, y2: int) -> str:
        """从一个位置拖拽到另一个位置。"""
        self._require_started()
        self._require_pyautogui()

        pyautogui.moveTo(x1, y1, duration=0.2)
        pyautogui.drag(x2 - x1, y2 - y1, duration=0.5)
        return f"已从 ({x1}, {y1}) 拖拽到 ({x2}, {y2})"

    def _action_wait(self, seconds: float) -> str:
        """等待指定秒数。"""
        self._require_started()

        if seconds <= 0:
            return "错误: 等待时间必须大于 0。"

        time.sleep(seconds)
        return f"已等待 {seconds} 秒。"


__all__ = ["AutoGuiMiddleware"]
