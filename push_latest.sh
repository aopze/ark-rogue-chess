#!/usr/bin/env bash
# 方舟战棋 → GitHub Pages 一键更新（将最新单文件推到 aopze/ark-rogue-chess 的 main 分支）
# 前置：_publish/index.html 已是最新（即 demo_latest.html 的干净单文件版）
set -e
DEMO="/d/HuaweiMoveData/Users/huze/Desktop/游戏demo"
GH="$DEMO/_ghpages"
cp "$DEMO/_publish/index.html" "$GH/index.html"
cd "$GH"
git add -A
if git diff --cached --quiet; then
  echo "无变化，跳过提交。"
else
  git commit -q -m "更新 方舟战棋 $(date +%Y%m%d-%H%M)"
  git push -q
  echo "已推送 -> https://aopze.github.io/ark-rogue-chess/"
fi
