#!/usr/bin/env bash
# 方舟战棋 -> GitHub Pages 一键更新
#
# 架构：index.html = Mini App 外壳(wrapper, 永不改) / game.html = 游戏本体(只改它)
# 本脚本只更新 game.html，并自动确保 index.html 是外壳（自愈）。
# 桌面等价入口：发布游戏.bat
set -e
PY="C:/Users/Admin/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
exec "$PY" "C:/Users/Admin/Desktop/publish_game.py" "$@"
