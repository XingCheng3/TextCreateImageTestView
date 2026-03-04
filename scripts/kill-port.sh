#!/bin/bash
# 关闭指定端口的进程 (Linux/Mac)

PORT=${1:-3001}

echo "正在查找占用端口 $PORT 的进程..."

# 查找占用端口的进程
PID=$(lsof -ti:$PORT)

if [ -z "$PID" ]; then
    echo "✓ 端口 $PORT 未被占用"
else
    echo "找到进程 PID: $PID"
    kill -9 $PID
    echo "✓ 进程已终止"
fi

