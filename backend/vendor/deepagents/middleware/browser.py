"""Browser automation middleware using Playwright and Accessibility Tree.

Provides a single 'browser' tool with multiple actions for web automation.
Uses Accessibility Tree (not screenshots) as the primary perception method,
so it works with pure text LLMs. Screenshot support available for multimodal models.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage


# ── Local browser detection ──

# Priority order: Chrome > Edge > Brave > Chromium > Chrome Canary
# All must be Chromium-based for Playwright compatibility.

def _detect_browser() -> tuple[str | None, str]:
    """Detect a locally installed Chromium-based browser.

    Returns:
        (executable_path or None, browser_name).
        If None, caller should fallback to Playwright default.
    """
    if sys.platform == "win32":
        return _detect_windows()
    elif sys.platform == "darwin":
        return _detect_macos()
    else:
        return _detect_linux()


def _detect_windows() -> tuple[str | None, str]:
    """Detect browser on Windows via registry + known paths."""
    import winreg

    # 1) Known paths, in priority order
    known = [
        ("Chrome", [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]),
        ("Edge", [
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        ]),
        ("Brave", [
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]),
        ("Chromium", [
            os.path.expandvars(r"%ProgramFiles%\Chromium\Application\chrome.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Chromium\Application\chrome.exe"),
        ]),
        ("Chrome Canary", [
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome SxS\Application\chrome.exe"),
        ]),
    ]

    for name, paths in known:
        for p in paths:
            if os.path.isfile(p):
                return (p, name)

    # 2) Fallback: scan registry for other Chromium-based browsers
    reg_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Clients\StartMenuInternet"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Clients\StartMenuInternet"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Clients\StartMenuInternet"),
    ]
    for hive, key_path in reg_keys:
        try:
            key = winreg.OpenKey(hive, key_path)
        except OSError:
            continue
        try:
            i = 0
            while True:
                try:
                    subkey_name = winreg.EnumKey(key, i)
                    i += 1
                except OSError:
                    break
                try:
                    cmd_key = winreg.OpenKey(
                        key, rf"{subkey_name}\shell\open\command"
                    )
                    exe_path = winreg.QueryValueEx(cmd_key, "")[0]
                    winreg.CloseKey(cmd_key)
                except OSError:
                    continue
                # Strip quotes
                exe_path = exe_path.strip('"')
                if not os.path.isfile(exe_path):
                    continue
                # Check if it's Chromium-based by version format (major.minor.build.patch)
                try:
                    output = subprocess.check_output(
                        [exe_path, "--version"],
                        timeout=5, stderr=subprocess.DEVNULL,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    ).decode().strip()
                    if re.search(r"\d+\.\d+\.\d+\.\d+", output):
                        return (exe_path, subkey_name)
                except Exception:
                    # Some browsers don't support --version; check version info
                    try:
                        ver = subprocess.check_output(
                            ["powershell", "-Command",
                             f"(Get-Item '{exe_path}').VersionInfo.ProductVersion"],
                            timeout=5, stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW,
                        ).decode().strip()
                        if re.search(r"\d+\.\d+\.\d+\.\d+", ver):
                            return (exe_path, subkey_name)
                    except Exception:
                        pass
        finally:
            winreg.CloseKey(key)

    return (None, "Playwright Chromium")


def _detect_macos() -> tuple[str | None, str]:
    """Detect browser on macOS via /Applications."""
    candidates = [
        ("Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        ("Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ("Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
        ("Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"),
        ("Chrome Canary", "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"),
    ]
    for name, path in candidates:
        if os.path.isfile(path):
            return (path, name)
    return (None, "Playwright Chromium")


def _detect_linux() -> tuple[str | None, str]:
    """Detect browser on Linux via PATH lookup."""
    candidates = [
        ("Chrome", ["google-chrome", "google-chrome-stable"]),
        ("Edge", ["microsoft-edge", "microsoft-edge-stable"]),
        ("Brave", ["brave-browser", "brave-browser-stable"]),
        ("Chromium", ["chromium-browser", "chromium"]),
    ]
    for name, bins in candidates:
        for b in bins:
            path = shutil.which(b)
            if path:
                return (path, name)
    return (None, "Playwright Chromium")


class BrowserMiddleware(AgentMiddleware[AgentState, Any]):
    """Browser automation middleware for agents.

    Provides a single 'browser' tool that supports multiple actions:
    - start/stop/status: browser lifecycle
    - open: navigate to URL
    - snapshot: get page Accessibility Tree with element refs
    - act: interact with elements (click/type/press/hover/select/fill)
    - screenshot: capture page screenshot
    - tabs/close/focus: tab management
    - console: read browser console logs
    - back/forward/reload: navigation

    Key design:
    - Single tool, multiple actions (like OpenClaw)
    - Accessibility Tree + ref-based element targeting
    - Session-level browser instance (shared across tool calls)
    - Playwright async API bridged to sync via dedicated event loop thread
    """

    def __init__(self, *, headless: bool = False, vision: bool = True) -> None:
        """Initialize BrowserMiddleware.

        Args:
            headless: Whether to run browser in headless mode. Defaults to False
                (visible browser window).
            vision: Whether the model supports multimodal (vision) input.
                If False, screenshot action will return text hint instead of image.
        """
        super().__init__()
        self._headless = headless
        self._vision = vision
        self._tool_name = "browser"

        # Browser state (lazy init on first 'start')
        self._playwright = None
        self._browser = None
        self._page = None
        self._console_logs: list[str] = []

        # Snapshot state: track which mode was used last
        self._last_snapshot_mode: str = "a11y"  # "a11y" or "dom"
        self._dom_elements: list[dict] = []  # cached DOM elements for ref lookup

        # Dedicated event loop for async Playwright
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: threading.Thread | None = None

        screenshot_line = (
            "  screenshot         - Capture page screenshot (returns base64 image)\n"
            if self._vision else ""
        )
        description = (
            "Control a browser for web automation. Single tool, use 'action' parameter to specify operation.\n"
            "\nActions:\n"
            "  start              - Launch browser\n"
            "  stop               - Close browser\n"
            "  status             - Check browser status\n"
            "  open               - Navigate to URL (params: url)\n"
            "  snapshot           - Get page structure as Accessibility Tree with ref IDs\n"
            f"{screenshot_line}"
            "  act                - Interact with element (params: type, ref OR text)\n"
            "                       type: click|type|press|hover|select|fill\n"
            "                       ref: element ref from snapshot (preferred)\n"
            "                       text: for click, can use text to find element by visible text\n"
            "                             for type/fill/press/select, the input value\n"
            "                       If element has no ref, use text param with the visible text to click it.\n"
            "  tabs               - List open tabs\n"
            "  focus              - Switch to tab (params: index)\n"
            "  close_tab          - Close current tab\n"
            "  back / forward / reload - Navigation\n"
            "  console            - Read browser console logs\n"
            "\nWorkflow: start -> open(url) -> snapshot -> act(ref) -> snapshot -> ...\n"
            "Always snapshot before act to get current element refs.\n"
            "Refs change after every page navigation or DOM update.\n"
            "If an element has no ref (shown as plain text), use act with type='click' and text='visible text' (no ref needed)."
        )

        @tool(self._tool_name, description=description)
        def browser_tool(
            action: str,
            runtime: ToolRuntime[None, AgentState],
            url: str = "",
            type: str = "",
            ref: str = "",
            text: str = "",
            index: int = 0,
        ) -> ToolMessage | str:
            """Browser automation tool.

            Args:
                action: The action to perform.
                runtime: The tool runtime context.
                url: URL for 'open' action.
                type: Interaction type for 'act' action.
                ref: Element ref from snapshot for 'act' action.
                text: Text input for type/fill/press/select actions.
                index: Tab index for 'focus' action.
            """
            return self._handle_action(
                action=action,
                tool_call_id=runtime.tool_call_id,
                url=url,
                act_type=type,
                ref=ref,
                text=text,
                index=index,
            )

        self._browser_tool = browser_tool
        self.tools = [self._browser_tool]

    # ── Event loop management ──

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        """Ensure a dedicated event loop thread is running."""
        if self._loop is None or not self._loop_thread or not self._loop_thread.is_alive():
            # Windows 下后台线程必须用 ProactorEventLoop，否则 subprocess_exec 会报 NotImplementedError
            if sys.platform == "win32":
                self._loop = asyncio.ProactorEventLoop()
            else:
                self._loop = asyncio.new_event_loop()
            self._loop_thread = threading.Thread(
                target=self._loop.run_forever, daemon=True
            )
            self._loop_thread.start()
        return self._loop

    def _run_async(self, coro):
        """Run an async coroutine in the dedicated event loop and return result."""
        loop = self._ensure_loop()
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result(timeout=30)

    # ── Action dispatcher ──

    def _handle_action(
        self,
        *,
        action: str,
        tool_call_id: str | None,
        url: str,
        act_type: str,
        ref: str,
        text: str,
        index: int,
    ) -> ToolMessage | str:
        """Dispatch action to the appropriate handler."""
        try:
            action = action.strip().lower()
            if action == "start":
                result = self._action_start()
            elif action == "stop":
                result = self._action_stop()
            elif action == "status":
                result = self._action_status()
            elif action == "open":
                result = self._action_open(url)
            elif action == "snapshot":
                result = self._action_snapshot()
            elif action == "screenshot":
                return self._action_screenshot(tool_call_id)
            elif action == "act":
                result = self._action_act(act_type, ref, text)
            elif action == "tabs":
                result = self._action_tabs()
            elif action == "focus":
                result = self._action_focus(index)
            elif action == "close_tab":
                result = self._action_close_tab()
            elif action == "back":
                result = self._action_back()
            elif action == "forward":
                result = self._action_forward()
            elif action == "reload":
                result = self._action_reload()
            elif action == "console":
                result = self._action_console()
            else:
                result = f"ERROR: Unknown action '{action}'"

        except ImportError:
            result = (
                "ERROR: playwright is not installed. "
                "Run: pip install playwright && python -m playwright install chromium"
            )
        except Exception as e:
            result = f"ERROR: {e}"

        if tool_call_id is not None:
            return ToolMessage(
                content=result,
                tool_call_id=tool_call_id,
                status="error" if result.startswith("ERROR") else "success",
            )
        return result

    # ── Actions ──

    def _require_browser(self) -> None:
        """Check that browser is started."""
        if self._browser is None or self._page is None:
            raise RuntimeError("Browser not started. Use action='start' first.")

    def _action_start(self) -> str:
        """Launch browser using locally detected Chromium-based browser."""
        if self._browser is not None:
            return "Browser is already running."

        exe_path, browser_name = _detect_browser()

        async def _start():
            from playwright.async_api import async_playwright

            self._playwright = await async_playwright().start()

            launch_kwargs = {"headless": self._headless}
            if exe_path:
                launch_kwargs["executable_path"] = exe_path

            self._browser = await self._playwright.chromium.launch(**launch_kwargs)
            context = await self._browser.new_context(
                viewport={"width": 1280, "height": 900},
                locale="zh-CN",
            )
            self._page = await context.new_page()

            # Capture console logs
            self._console_logs.clear()
            self._page.on(
                "console",
                lambda msg: self._console_logs.append(
                    f"[{msg.type}] {msg.text}"
                ),
            )

        self._run_async(_start())
        if exe_path:
            return f"Browser started ({browser_name}: {exe_path})"
        return "Browser started (Playwright built-in Chromium). Tip: install Chrome/Edge for better experience."


    def _action_stop(self) -> str:
        """Close browser and cleanup."""
        if self._browser is None:
            return "Browser is not running."

        async def _stop():
            try:
                await self._browser.close()
            except Exception:
                pass
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._browser = None
            self._page = None
            self._playwright = None
            self._console_logs.clear()
            self._dom_elements.clear()
            self._last_snapshot_mode = "a11y"

        self._run_async(_stop())
        return "Browser stopped."

    def _action_status(self) -> str:
        """Check browser status."""
        if self._browser is None:
            return "Browser is not running."
        page_url = self._run_async(self._async_get_url())
        return f"Browser is running. Current page: {page_url}"

    async def _async_get_url(self) -> str:
        if self._page:
            return self._page.url
        return "no page"

    def _action_open(self, url: str) -> str:
        """Navigate to URL."""
        if not url:
            return "ERROR: 'url' parameter is required for 'open' action."
        self._require_browser()

        async def _open():
            await self._page.goto(url, wait_until="domcontentloaded", timeout=15000)
            return self._page.url

        final_url = self._run_async(_open())
        return f"Navigated to: {final_url}"

    def _action_snapshot(self) -> str:
        """Get page snapshot: try aria_snapshot first, fallback to DOM extraction."""
        self._require_browser()

        async def _snapshot():
            # 1) Try aria_snapshot (Playwright >= 1.49)
            try:
                aria_text = await self._page.locator("body").aria_snapshot()
                if aria_text and aria_text.strip():
                    lines = aria_text.strip().split("\n")
                    if len(lines) >= 3:
                        # Parse aria snapshot and add ref IDs to interactive elements
                        result, elements = self._parse_aria_snapshot(aria_text)
                        self._last_snapshot_mode = "aria"
                        self._dom_elements = elements
                        url = self._page.url
                        header = f"Page: {url}\n({len(elements)} interactive elements)\n\n"
                        return header + result
            except Exception:
                pass

            # 2) Fallback: extract interactive elements from DOM via JavaScript
            js_extract = """
            () => {
                const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="textbox"], [role="combobox"], [onclick], [tabindex]';
                const selectorEls = new Set(document.querySelectorAll(selectors));

                // Also find elements with cursor:pointer that look clickable
                const allEls = document.querySelectorAll('div, span, li, label, p');
                for (const el of allEls) {
                    if (selectorEls.has(el)) continue;
                    const style = window.getComputedStyle(el);
                    if (style.cursor !== 'pointer') continue;
                    const text = (el.innerText || '').trim();
                    if (!text || text.length > 50) continue;
                    // Skip if a child is already in the set (avoid duplicates)
                    let hasChildInSet = false;
                    for (const child of el.querySelectorAll('*')) {
                        if (selectorEls.has(child)) { hasChildInSet = true; break; }
                    }
                    if (hasChildInSet) continue;
                    selectorEls.add(el);
                }

                const results = [];
                const skipTags = new Set(['SCRIPT', 'SVG', 'HEAD', 'META', 'STYLE', 'NOSCRIPT', 'LINK']);
                for (const el of selectorEls) {
                    if (skipTags.has(el.tagName)) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) continue;
                    if (el.offsetParent === null && el.tagName !== 'BODY') continue;

                    const tag = el.tagName.toLowerCase();
                    const role = el.getAttribute('role') || '';
                    const type = el.getAttribute('type') || '';
                    const text = (el.innerText || '').trim().substring(0, 80);
                    const placeholder = el.getAttribute('placeholder') || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    const href = el.getAttribute('href') || '';
                    const name = el.getAttribute('name') || '';
                    const id = el.id || '';
                    const value = el.value || '';
                    const className = el.className || '';

                    let css = tag;
                    if (id) {
                        css = '#' + CSS.escape(id);
                    } else if (name) {
                        css = tag + '[name="' + name.replace(/"/g, '\\\\"') + '"]';
                    } else if (ariaLabel) {
                        css = tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\\\"') + '"]';
                    } else if (type && tag === 'input') {
                        css = 'input[type="' + type + '"]';
                        if (placeholder) css += '[placeholder="' + placeholder.replace(/"/g, '\\\\"') + '"]';
                    }

                    results.push({
                        tag, role, type, text, placeholder, ariaLabel,
                        href, name, id, value, css,
                        className: typeof className === 'string' ? className.substring(0, 100) : ''
                    });
                }
                return results;
            }
            """
            elements = await self._page.evaluate(js_extract)
            if not elements:
                return "Page is empty or has no interactive elements. Use 'open' action to navigate to a URL first."

            self._last_snapshot_mode = "dom"
            self._dom_elements = elements

            lines = [f"Page: {self._page.url}", f"(DOM mode, {len(elements)} interactive elements)", ""]
            for idx, el in enumerate(elements, 1):
                tag = el.get("tag", "")
                role = el.get("role", "")
                text = el.get("text", "")
                placeholder = el.get("placeholder", "")
                aria = el.get("ariaLabel", "")
                href = el.get("href", "")
                el_type = el.get("type", "")
                value = el.get("value", "")

                parts = [f"[{idx}]", tag]
                if role:
                    parts.append(f"role={role}")
                if el_type:
                    parts.append(f"type={el_type}")
                label = aria or text or placeholder
                if label:
                    parts.append(f'"{label}"')
                if href and href != "#":
                    short_href = href[:60] + "..." if len(href) > 60 else href
                    parts.append(f"href={short_href}")
                if value:
                    parts.append(f"value={value[:40]}")

                lines.append(" ".join(parts))

            return "\n".join(lines)

        return self._run_async(_snapshot())

    # Interactive roles that get ref IDs in aria snapshot
    _INTERACTIVE_ROLES = frozenset({
        "link", "button", "textbox", "checkbox", "radio", "combobox",
        "menuitem", "tab", "switch", "slider", "spinbutton", "searchbox",
        "option", "menuitemcheckbox", "menuitemradio", "treeitem",
    })

    # Footer keywords to filter out
    _FOOTER_KEYWORDS = frozenset({
        "备案", "ICP", "许可证", "营业执照", "公网安备", "举报", "扫黄打非",
        "隐私政策", "用户协议", "联系我们", "关于我们", "加入我们",
        "广告合作", "帮助中心", "社区中心", "名人堂", "MCN管理",
        "品牌号", "高级弹幕", "壁纸站", "Investor Relations",
        "活动中心", "活动专题", "协议汇总", "侵权申诉",
        "公司名称", "公司地址", "经营许可", "药品信息",
        "市民朋友", "反诈劝阻", "网信算备", "不良信息",
        "儿童色情", "copyright", "©",
    })

    def _parse_aria_snapshot(self, aria_text: str) -> tuple[str, list[dict]]:
        """Parse aria_snapshot into a compact flat format for agent consumption.

        Output format:
        - Interactive elements: [ref] role "name" extra_info
        - Context text: standalone text not inside interactive elements
        - Footer content: filtered out

        Returns:
            (formatted_text, list_of_interactive_elements_with_info)
        """
        elements: list[dict] = []
        output_lines: list[str] = []
        ref_counter = 0

        lines = aria_text.split("\n")
        i = 0
        # Track depth of current interactive element to merge children
        in_interactive_depth = -1  # -1 means not inside interactive element
        interactive_extra: list[str] = []  # extra info to merge into interactive line
        interactive_line_idx = -1  # index in output_lines for the current interactive element

        while i < len(lines):
            line = lines[i]
            i += 1

            stripped = line.lstrip("- ").strip()
            if not stripped:
                continue

            # Calculate indentation depth
            indent_len = len(line) - len(line.lstrip())

            # If we were inside an interactive element and indentation decreased, flush
            if in_interactive_depth >= 0 and indent_len <= in_interactive_depth:
                self._flush_interactive_extra(output_lines, interactive_line_idx, interactive_extra)
                in_interactive_depth = -1
                interactive_extra = []

            # Check if this is an interactive element
            role, name = self._extract_role_name(stripped)

            if role and role in self._INTERACTIVE_ROLES:
                # Check footer filter
                if self._is_footer_content(name):
                    # Skip this element and its children
                    in_interactive_depth = indent_len
                    interactive_extra = []
                    interactive_line_idx = -1
                    continue

                ref_counter += 1
                elements.append({"role": role, "name": name, "ref": ref_counter})

                # Build compact line
                parts = [f"[{ref_counter}]", role]
                if name:
                    parts.append(f'"{name}"')

                output_lines.append(" ".join(parts))
                interactive_line_idx = len(output_lines) - 1
                in_interactive_depth = indent_len
                interactive_extra = []
                continue

            # Inside an interactive element — collect useful child info
            if in_interactive_depth >= 0 and indent_len > in_interactive_depth:
                # Extract /url lines
                if stripped.startswith("/url:"):
                    url = stripped[5:].strip()
                    interactive_extra.append(f"href={url}")
                # Extract value info
                elif stripped.startswith("value:"):
                    interactive_extra.append(stripped)
                # Skip img, paragraph, heading, listitem, list, separator, etc.
                # (structural nodes inside interactive elements)
                continue

            # Not inside interactive element — this is standalone content
            # Check footer
            if self._is_footer_content(stripped):
                continue

            # Extract text content for context
            if stripped.startswith("text:"):
                text_content = stripped[5:].strip()
                if text_content and len(text_content) > 1:
                    output_lines.append(f"  {text_content}")
            elif stripped.startswith(("heading ", "paragraph")):
                # Skip structural wrappers
                continue
            elif ":" not in stripped and len(stripped) > 1 and len(stripped) < 100:
                # Plain text node
                known_structural = {"list", "listitem", "banner", "navigation",
                                    "separator", "img", "emphasis", "paragraph"}
                if stripped.rstrip(":") not in known_structural and not stripped.startswith("img"):
                    output_lines.append(f"  {stripped}")

        # Flush last interactive element
        if in_interactive_depth >= 0:
            self._flush_interactive_extra(output_lines, interactive_line_idx, interactive_extra)

        return "\n".join(output_lines), elements

    def _flush_interactive_extra(self, output_lines: list[str], line_idx: int, extras: list[str]) -> None:
        """Merge extra info (href, value) into the interactive element line."""
        if line_idx >= 0 and line_idx < len(output_lines) and extras:
            output_lines[line_idx] += " " + " ".join(extras)

    def _extract_role_name(self, stripped: str) -> tuple[str, str]:
        """Extract role and name from an aria snapshot line."""
        role = ""
        name = ""
        if " " in stripped:
            first_space = stripped.index(" ")
            candidate_role = stripped[:first_space].rstrip(":")
            rest = stripped[first_space:].strip().rstrip(":")
            if candidate_role in self._INTERACTIVE_ROLES or candidate_role in self._ALL_ROLES:
                role = candidate_role
                if rest.startswith('"') and '"' in rest[1:]:
                    name = rest[1:rest.index('"', 1)]
                elif rest.startswith('"'):
                    name = rest.strip('"').rstrip(":")
        elif stripped.rstrip(":") in self._INTERACTIVE_ROLES or stripped.rstrip(":") in self._ALL_ROLES:
            role = stripped.rstrip(":")
        return role, name

    def _is_footer_content(self, text: str) -> bool:
        """Check if text looks like footer/legal content."""
        if not text:
            return False
        return any(kw in text for kw in self._FOOTER_KEYWORDS)

    # All known aria roles (for parsing, not just interactive)
    _ALL_ROLES = frozenset({
        "link", "button", "textbox", "checkbox", "radio", "combobox",
        "menuitem", "tab", "switch", "slider", "spinbutton", "searchbox",
        "option", "menuitemcheckbox", "menuitemradio", "treeitem",
        "heading", "img", "list", "listitem", "navigation", "banner",
        "separator", "toolbar", "dialog", "table", "row", "cell",
        "columnheader", "rowheader", "tree", "progressbar", "paragraph",
        "emphasis", "text",
    })

    def _action_act(self, act_type: str, ref: str, text: str) -> str:
        """Perform an interaction on an element by ref or by visible text."""
        if not act_type:
            return "ERROR: 'type' parameter is required for 'act' action."

        self._require_browser()
        act_type_lower = act_type.strip().lower()

        # Text-based click: no ref, use text to find element
        if not ref and text and act_type_lower == "click":
            async def _click_by_text():
                # Try exact text match first, then partial
                locator = self._page.get_by_text(text, exact=True)
                count = await locator.count()
                if count == 0:
                    locator = self._page.get_by_text(text)
                    count = await locator.count()
                if count == 0:
                    # Last resort: JS click by text content
                    clicked = await self._page.evaluate("""
                    (targetText) => {
                        const all = document.querySelectorAll('*');
                        for (const el of all) {
                            if (el.children.length > 1) continue;
                            const t = (el.textContent || '').trim();
                            if (t === targetText) {
                                el.click();
                                return true;
                            }
                        }
                        return false;
                    }
                    """, text)
                    if clicked:
                        return f"Clicked element with text \"{text}\" (via JS)"
                    return f"ERROR: No element found with text \"{text}\"."
                await locator.first.click(timeout=5000)
                return f"Clicked element with text \"{text}\""
            return self._run_async(_click_by_text())

        if not ref:
            return "ERROR: 'ref' parameter is required for 'act' action (or use text with type='click' for text-based click)."

        # Parse ref number
        ref_str = ref.strip().lstrip("e")
        try:
            ref_num = int(ref_str)
        except ValueError:
            return f"ERROR: Invalid ref '{ref}'. Must be a number (e.g. 12 or e12)."

        if ref_num < 1 or ref_num > len(self._dom_elements):
            return f"ERROR: Element ref {ref_num} out of range (1-{len(self._dom_elements)}). Run snapshot again."

        el_info = self._dom_elements[ref_num - 1]

        async def _act():

            if self._last_snapshot_mode == "dom":
                # DOM mode: use cached CSS selector
                css = el_info.get("css", "")
                tag = el_info.get("tag", "")
                label = el_info.get("ariaLabel") or el_info.get("text", "") or el_info.get("placeholder", "")
                desc = f'{tag} "{label}"' if label else tag

                if not css:
                    return f"ERROR: No CSS selector for element ref={ref_num}."

                locator = self._page.locator(css).first

            else:
                # Aria mode: use get_by_role with name
                role = el_info.get("role", "")
                name = el_info.get("name", "")
                desc = f'{role} "{name}"' if name else role

                locator = self._build_locator(role, name)
                if locator is None:
                    return f"ERROR: Cannot build locator for element ref={ref_num} role='{role}' name='{name}'."

            # Execute the action
            if act_type_lower == "click":
                await locator.click(timeout=5000)
                return f"Clicked [{ref_num}] {desc}"
            elif act_type_lower in ("type", "fill"):
                if not text:
                    return "ERROR: 'text' parameter is required for type/fill."
                await locator.fill(text, timeout=5000)
                return f"Filled [{ref_num}] {desc} with \"{text}\""
            elif act_type_lower == "press":
                if not text:
                    return "ERROR: 'text' parameter is required for press (key name)."
                await locator.press(text, timeout=5000)
                return f"Pressed '{text}' on [{ref_num}] {desc}"
            elif act_type_lower == "hover":
                await locator.hover(timeout=5000)
                return f"Hovered [{ref_num}] {desc}"
            elif act_type_lower == "select":
                if not text:
                    return "ERROR: 'text' parameter is required for select (option value)."
                await locator.select_option(text, timeout=5000)
                return f"Selected '{text}' on [{ref_num}] {desc}"
            else:
                return f"ERROR: Unknown act type '{act_type}'. Use: click/type/fill/press/hover/select"

        return self._run_async(_act())

    def _build_locator(self, role: str, name: str):
        """Build a Playwright locator from accessibility role and name.

        Args:
            role: ARIA role of the element.
            name: Accessible name of the element.

        Returns:
            A Playwright Locator, or None if cannot build.
        """
        if not self._page:
            return None

        # Map common a11y roles to Playwright's get_by_role
        role_map = {
            "button": "button",
            "link": "link",
            "textbox": "textbox",
            "checkbox": "checkbox",
            "radio": "radio",
            "combobox": "combobox",
            "heading": "heading",
            "img": "img",
            "list": "list",
            "listitem": "listitem",
            "menuitem": "menuitem",
            "tab": "tab",
            "tabpanel": "tabpanel",
            "dialog": "dialog",
            "navigation": "navigation",
            "search": "searchbox",
            "slider": "slider",
            "spinbutton": "spinbutton",
            "switch": "switch",
            "table": "table",
            "row": "row",
            "cell": "cell",
            "columnheader": "columnheader",
            "rowheader": "rowheader",
            "tree": "tree",
            "treeitem": "treeitem",
            "progressbar": "progressbar",
            "separator": "separator",
            "toolbar": "toolbar",
        }

        pw_role = role_map.get(role.lower())
        if pw_role:
            if name:
                return self._page.get_by_role(pw_role, name=name)
            return self._page.get_by_role(pw_role)

        # Fallback: try get_by_text for text-like elements
        if name:
            return self._page.get_by_text(name, exact=True)

        return None

    def _action_screenshot(self, tool_call_id: str | None) -> ToolMessage | str:
        """Capture page screenshot and return as base64 image (vision) or text hint."""
        if not self._vision:
            msg = "Screenshot is not available (model does not support vision). Use 'snapshot' action to get page structure as text."
            if tool_call_id is not None:
                return ToolMessage(content=msg, tool_call_id=tool_call_id, status="error")
            return msg

        self._require_browser()

        async def _screenshot():
            screenshot_bytes = await self._page.screenshot(full_page=False)
            return base64.b64encode(screenshot_bytes).decode("utf-8")

        b64 = self._run_async(_screenshot())

        # Return as multimodal content (image + text)
        content = [
            {"type": "text", "text": f"Screenshot of {self._page.url}"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            },
        ]

        if tool_call_id is not None:
            return ToolMessage(
                content=content,
                tool_call_id=tool_call_id,
                status="success",
            )
        return f"Screenshot captured ({len(b64)} bytes base64)"

    def _action_tabs(self) -> str:
        """List open tabs."""
        self._require_browser()

        async def _tabs():
            contexts = self._browser.contexts
            tabs = []
            for ctx in contexts:
                for i, page in enumerate(ctx.pages):
                    marker = " (active)" if page == self._page else ""
                    tabs.append(f"  [{i}] {page.url}{marker}")
            return "\n".join(tabs) if tabs else "No tabs open."

        return self._run_async(_tabs())

    def _action_focus(self, index: int) -> str:
        """Switch to a tab by index."""
        self._require_browser()

        async def _focus():
            contexts = self._browser.contexts
            pages = []
            for ctx in contexts:
                pages.extend(ctx.pages)
            if index < 0 or index >= len(pages):
                return f"ERROR: Tab index {index} out of range (0-{len(pages) - 1})."
            self._page = pages[index]
            await self._page.bring_to_front()
            return f"Switched to tab [{index}]: {self._page.url}"

        return self._run_async(_focus())

    def _action_close_tab(self) -> str:
        """Close current tab."""
        self._require_browser()

        async def _close_tab():
            url = self._page.url
            await self._page.close()
            # Switch to last remaining page
            contexts = self._browser.contexts
            for ctx in contexts:
                if ctx.pages:
                    self._page = ctx.pages[-1]
                    return f"Closed tab: {url}. Now on: {self._page.url}"
            self._page = None
            return f"Closed tab: {url}. No tabs remaining."

        return self._run_async(_close_tab())

    def _action_back(self) -> str:
        """Navigate back."""
        self._require_browser()

        async def _back():
            await self._page.go_back(timeout=10000)
            return f"Navigated back to: {self._page.url}"

        return self._run_async(_back())

    def _action_forward(self) -> str:
        """Navigate forward."""
        self._require_browser()

        async def _forward():
            await self._page.go_forward(timeout=10000)
            return f"Navigated forward to: {self._page.url}"

        return self._run_async(_forward())

    def _action_reload(self) -> str:
        """Reload current page."""
        self._require_browser()

        async def _reload():
            await self._page.reload(timeout=10000)
            return f"Reloaded: {self._page.url}"

        return self._run_async(_reload())

    def _action_console(self) -> str:
        """Read captured console logs."""
        if not self._console_logs:
            return "No console logs captured."
        logs = "\n".join(self._console_logs[-50:])  # Last 50 entries
        total = len(self._console_logs)
        if total > 50:
            return f"(Showing last 50 of {total} logs)\n{logs}"
        return logs


__all__ = ["BrowserMiddleware"]
