#Requires -Version 5.1
<#
.SYNOPSIS
    mini8 Windows 一键启动脚本
.DESCRIPTION
    放到项目根目录，右键选择「使用 PowerShell 运行」或命令行执行 .\start.ps1
#>

$ErrorActionPreference = "Stop"

# 项目根目录
$ROOT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BACKEND_DIR = Join-Path $ROOT_DIR "backend"
$FRONTEND_DIR = Join-Path $ROOT_DIR "frontend"
$VENV_DIR = Join-Path $BACKEND_DIR ".venv"
$VENV_PYTHON = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_PIP = Join-Path $VENV_DIR "Scripts\pip.exe"
$FRONTEND_DIST = Join-Path $FRONTEND_DIR "dist"

function Write-Info($msg) { Write-Host "[mini8] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[mini8] $msg" -ForegroundColor Yellow }
function Write-ErrorLine($msg) { Write-Host "[mini8] $msg" -ForegroundColor Red }

Write-Info "项目目录: $ROOT_DIR"

# 1. 检查 Python 和 Node.js
function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "python")) {
    Write-ErrorLine "缺少 python，请先安装 Python 3.13+ 并添加到 PATH。"
    exit 1
}

if (-not (Test-Command "npm")) {
    Write-ErrorLine "缺少 npm，请先安装 Node.js 24+ 并添加到 PATH。"
    exit 1
}

$PYTHON_VERSION = (python --version 2>&1)
Write-Info "Python 版本: $PYTHON_VERSION"

# 2. 准备后端虚拟环境
if (-not (Test-Path $VENV_DIR)) {
    Write-Info "创建 Python 虚拟环境..."
    python -m venv "$VENV_DIR"
}

Write-Info "安装/更新 Python 依赖..."
& $VENV_PIP install --upgrade pip
& $VENV_PIP install -r (Join-Path $BACKEND_DIR "requirements.txt")

# 3. 准备前端依赖并构建
if (-not (Test-Path (Join-Path $FRONTEND_DIR "node_modules"))) {
    Write-Info "安装前端依赖..."
    Set-Location $FRONTEND_DIR
    npm install
    Set-Location $ROOT_DIR
}

# 判断是否需要重新构建前端
$needBuild = $false
if (-not (Test-Path $FRONTEND_DIST)) {
    $needBuild = $true
} else {
    $distTime = (Get-Item $FRONTEND_DIST).LastWriteTime
    $srcFiles = Get-ChildItem -Path (Join-Path $FRONTEND_DIR "src"), (Join-Path $FRONTEND_DIR "index.html"), (Join-Path $FRONTEND_DIR "package.json") -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $srcFiles) {
        if ($file.LastWriteTime -gt $distTime) {
            $needBuild = $true
            break
        }
    }
}

if ($needBuild) {
    Write-Info "构建前端..."
    Set-Location $FRONTEND_DIR
    npm run build
    Set-Location $ROOT_DIR
} else {
    Write-Info "前端 dist 已是最新，跳过构建。"
}

# 4. 设置环境变量
$env:CAMPHOR_FRONTEND_DIST = $FRONTEND_DIST
$env:CAMPHOR_DATA_DIR = if ($env:CAMPHOR_DATA_DIR) { $env:CAMPHOR_DATA_DIR } else { Join-Path $ROOT_DIR "data" }
New-Item -ItemType Directory -Path $env:CAMPHOR_DATA_DIR -Force | Out-Null

# 5. 查找空闲端口（从 2048 开始）
function Find-FreePort($startPort = 2048, $maxPort = 9000) {
    for ($port = $startPort; $port -le $maxPort; $port++) {
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
            $listener.Start()
            $listener.Stop()
            return $port
        } catch {
            if ($listener) { $listener.Stop() }
        }
    }
    throw "未找到可用端口"
}

$PORT = Find-FreePort
$HOST = "127.0.0.1"
$URL = "http://$HOST`:$PORT"

Write-Info "服务将启动于 $URL"
Write-Info "数据目录: $env:CAMPHOR_DATA_DIR"

# 6. 尝试打开浏览器
Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 2
    try {
        Start-Process $url
    } catch {
        try {
            $browser = [System.Diagnostics.Process]::new()
            $browser.StartInfo.FileName = "cmd.exe"
            $browser.StartInfo.Arguments = "/c start `"$url`""
            $browser.StartInfo.UseShellExecute = $false
            $browser.Start() | Out-Null
        } catch {
            # 忽略
        }
    }
} -ArgumentList $URL | Out-Null

# 7. 启动后端服务
Write-Info "启动 uvicorn 服务..."
Set-Location $BACKEND_DIR
& $VENV_PYTHON -m uvicorn app.main:app --host $HOST --port $PORT
