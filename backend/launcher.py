"""
CamphorEOS 打包启动入口。

生产环境下（PyInstaller 打包后）：
1. 检测 exe 所在目录
2. 数据目录指向 exe 同级目录（避免写入临时解压目录）
3. 前端静态文件从打包的临时目录读取
4. 单进程启动 uvicorn 并自动打开浏览器
"""

import asyncio
import os
import socket
import sys
import webbrowser
from pathlib import Path

import uvicorn


def _get_exe_dir() -> Path:
    """获取 exe 所在目录（打包后）或项目根目录（开发模式）。"""
    if hasattr(sys, "_MEIPASS"):
        # PyInstaller 模式：sys.executable 指向 exe 本身
        return Path(sys.executable).parent
    # 开发模式：launcher.py 位于 backend/ 下
    return Path(__file__).resolve().parent.parent


def _log(msg: str) -> None:
    """打印日志到控制台。"""
    print(msg)


def _setup_data_dir() -> Path:
    """设置并返回数据目录，同时注入环境变量。"""
    exe_dir = _get_exe_dir()
    data_dir = exe_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["CAMPHOR_DATA_DIR"] = str(data_dir)
    return data_dir


def _setup_frontend_dist() -> None:
    """检测并配置前端静态文件目录环境变量。"""
    if hasattr(sys, "_MEIPASS"):
        # 打包后前端 dist 位于临时解压目录
        frontend_dist = Path(sys._MEIPASS) / "frontend" / "dist"
    else:
        frontend_dist = _get_exe_dir() / "frontend" / "dist"

    if frontend_dist.exists():
        os.environ["CAMPHOR_FRONTEND_DIST"] = str(frontend_dist)


# Chrome / Chromium 不安全端口黑名单（浏览器会直接拒绝连接这些端口）
# 参考: https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/net/base/port_util.cc
_UNSAFE_PORTS = frozenset({
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53,
    77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117,
    119, 123, 135, 139, 143, 179, 389, 465, 512, 513, 514, 515, 526,
    530, 531, 532, 540, 556, 563, 587, 601, 636, 993, 995,
    2049, 3659, 4045,
    *range(6000, 6064),
    *range(6665, 6670),
})


def _find_free_port(start_port: int = 8000, max_port: int = 9000) -> int:
    """在 start_port ~ max_port 范围内寻找第一个空闲且浏览器安全的端口。"""
    for port in range(start_port, max_port + 1):
        if port in _UNSAFE_PORTS:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            result = s.connect_ex(("127.0.0.1", port))
            if result != 0:
                return port
    raise RuntimeError(f"在 {start_port}~{max_port} 范围内未找到可用端口")


def main() -> None:
    """主入口：配置环境并启动 uvicorn 服务器。"""
    _setup_data_dir()
    _setup_frontend_dist()

    # 直接导入 app 实例，确保 PyInstaller 能正确分析依赖
    from app.main import app as fastapi_app

    port = _find_free_port(2048)
    host = "127.0.0.1"
    url = f"http://{host}:{port}"

    _log(f"[CamphorEOS] 服务将启动于 {url}")

    config = uvicorn.Config(
        fastapi_app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )
    server = uvicorn.Server(config)

    # 异步启动服务器并在就绪后打开浏览器
    async def _serve_and_open():
        # 先打开浏览器，uvicorn 启动很快，用户切过去时服务已就绪
        webbrowser.open(url)
        await server.serve()

    asyncio.run(_serve_and_open())


if __name__ == "__main__":
    main()
