#!/usr/bin/env bash
#
# mini8 Linux 一键启动脚本
# 放到项目根目录，直接运行 ./start.sh 即可
#

set -e

# 项目根目录（脚本所在目录）
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
FRONTEND_DIST="$FRONTEND_DIR/dist"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[mini8]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[mini8]${NC} $1"
}

log_error() {
    echo -e "${RED}[mini8]${NC} $1"
}

# 检查依赖命令
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "缺少依赖: $1，请先安装。"
        exit 1
    fi
}

log_info "项目目录: $ROOT_DIR"

# 1. 检查 Python 和 Node.js
check_command python3
check_command npm

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
log_info "Python 版本: $PYTHON_VERSION"

# 2. 准备后端虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    log_info "创建 Python 虚拟环境..."
    python3 -m venv "$VENV_DIR"
fi

PYPI_MIRROR="https://pypi.tuna.tsinghua.edu.cn/simple"
TRUSTED_HOST="pypi.tuna.tsinghua.edu.cn"

log_info "安装/更新 Python 依赖..."
"$VENV_DIR/bin/pip" install --upgrade pip -i "$PYPI_MIRROR" --trusted-host "$TRUSTED_HOST"
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt" -i "$PYPI_MIRROR" --trusted-host "$TRUSTED_HOST"

# 3. 准备前端依赖并构建
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log_info "安装前端依赖..."
    (cd "$FRONTEND_DIR" && npm install)
fi

# 如果 dist 不存在，或者前端源码比 dist 新，则重新构建
if [ ! -d "$FRONTEND_DIST" ] || [ -n "$(find "$FRONTEND_DIR/src" "$FRONTEND_DIR/index.html" "$FRONTEND_DIR/package.json" -newer "$FRONTEND_DIST" 2>/dev/null)" ]; then
    log_info "构建前端..."
    (cd "$FRONTEND_DIR" && npm run build)
else
    log_info "前端 dist 已是最新，跳过构建。"
fi

# 4. 设置环境变量
export CAMPHOR_FRONTEND_DIST="$FRONTEND_DIST"

# 默认数据目录与项目根目录同级（可移植）
export CAMPHOR_DATA_DIR="${CAMPHOR_DATA_DIR:-$ROOT_DIR/data}"
mkdir -p "$CAMPHOR_DATA_DIR"

# 5. 查找空闲端口（从 2048 开始）
find_free_port() {
    local port=2048
    while [ "$port" -le 9000 ]; do
        if ! (echo > /dev/tcp/127.0.0.1/$port) 2>/dev/null; then
            echo "$port"
            return
        fi
        port=$((port + 1))
    done
    log_error "未找到可用端口"
    exit 1
}

PORT=$(find_free_port)
HOST="127.0.0.1"
URL="http://$HOST:$PORT"

log_info "服务将启动于 $URL"
log_info "数据目录: $CAMPHOR_DATA_DIR"

# 6. 尝试打开浏览器（后台执行，不阻塞）
(
    sleep 2
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL" &> /dev/null || true
    elif command -v python3 &> /dev/null; then
        python3 -c "import webbrowser; webbrowser.open('$URL')" &> /dev/null || true
    fi
) &

# 7. 启动后端服务
log_info "启动 uvicorn 服务..."
cd "$BACKEND_DIR"
exec "$VENV_DIR/bin/python" -m uvicorn app.main:app --host "$HOST" --port "$PORT"
