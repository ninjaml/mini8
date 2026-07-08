# -*- mode: python ; coding: utf-8 -*-
r"""
CamphorEOS PyInstaller spec 文件。

用法（在 PowerShell 中）：
    cd E:\乔伊来了\mini8os\camphorOS-opensource
    # 先确保前端已构建
    cd frontend && npm run build && cd ..
    # 再打包
    backend\.venv\Scripts\python.exe -m PyInstaller CamphorEOS.spec --clean

输出：
    dist_package/mini8.exe
"""

import sys
from pathlib import Path

# ── 项目根目录 ──
# PyInstaller 执行 spec 文件时会注入 SPECPATH（spec 文件所在目录）
ROOT = Path(SPECPATH)
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"

# ── 把 vendor 加入 sys.path，使 PyInstaller 能分析 vendor 中的包 ──
VENDOR_DIR = BACKEND / "vendor"
if str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))

# 同样把 backend 加入路径，方便 import app
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from PyInstaller.utils.hooks import collect_all

# ── 收集 app 包的所有子模块 + 数据文件（包括 prompt_templates、skill_templates 等） ──
app_datas, app_binaries, app_hiddenimports = collect_all("app")

# ── 收集 vendor 中的 deepagents_webapi ──
# 如果 collect_all 失败，至少 hiddenimports 会包含我们显式列出的
try:
    vendor_datas, vendor_binaries, vendor_hiddenimports = collect_all("deepagents_webapi")
except Exception:
    vendor_datas, vendor_binaries, vendor_hiddenimports = [], [], []

# ── 显式补充的 hidden imports（防止动态导入漏掉） ──
manual_hiddenimports = [
    # app 子包（万一 collect_all 没扫到）
    "app.main",
    "app.api",
    "app.api.auth",
    "app.api.config_export",
    "app.api.resource_keys",
    "app.api.runtime_bridge",
    "app.api.workspaces",
    "app.api.workspace_agents",
    "app.api.work_items",
    "app.api.work_knowledge",
    "app.core.config",
    "app.core.database",
    "app.models",
    "app.models.agent_work",
    "app.models.resource_key",
    "app.models.workspace",
    "app.models.workspace_agent",
    "app.models.work_history",
    "app.models.work_item",
    "app.models.work_knowledge",
    "app.repositories",
    "app.repositories.resource_key",
    "app.repositories.workspace",
    "app.repositories.workspace_agent",
    "app.repositories.work_history",
    "app.repositories.work_item",
    "app.repositories.work_knowledge",
    "app.schemas",
    "app.schemas.auth",
    "app.schemas.resource_key",
    "app.schemas.workspace",
    "app.schemas.workspace_agent",
    "app.schemas.work_history",
    "app.schemas.work_item",
    "app.schemas.work_knowledge",
    "app.services",
    "app.services.auth",
    "app.services.dashboard",
    "app.services.history_storage",
    "app.services.obsidian_local_rest",
    "app.services.runtime_cleanup",
    # deepagents_webapi（vendor）
    "deepagents_webapi",
    "deepagents_webapi.api",
    "deepagents_webapi.api.routes",
    "deepagents_webapi.api.routes.agents",
    "deepagents_webapi.api.routes.chat",
    "deepagents_webapi.api.routes.env",
    "deepagents_webapi.api.routes.sessions",
    "deepagents_webapi.session",
    "deepagents_webapi.session.session_manager",
    # 其他可能被动态导入的依赖
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "sqlalchemy.ext.asyncio",
]

# ── 合并所有 hiddenimports ──
all_hiddenimports = list(set(app_hiddenimports + vendor_hiddenimports + manual_hiddenimports))

# ── 合并所有数据文件 ──
# datas 格式: [(source_path, dest_dir_in_bundle), ...]
all_datas = [
    (str(FRONTEND_DIST), "frontend/dist"),
    (str(ROOT / "frontend" / "public" / "logo.png"), "frontend/dist"),
]
all_datas.extend(app_datas)
all_datas.extend(vendor_datas)

# ── 合并所有二进制文件 ──
all_binaries = []
all_binaries.extend(app_binaries)
all_binaries.extend(vendor_binaries)

# ── Analysis ──
a = Analysis(
    [str(BACKEND / "launcher.py")],
    pathex=[str(BACKEND)],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# ── EXE ──
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="mini8",
    icon=str(ROOT / "frontend" / "public" / "logo.ico"),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    # ── 这里控制是否有控制台窗口 ──
    # True = 有黑窗口，便于调试看日志；False = 纯后台运行
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
