#!/usr/bin/env bash
# 一键跑完所有浏览器测试:先构建,再启动本地预览服务器,依次运行各测试脚本。
# 用法(在 game/ 目录下):npm run e2e:all
set -u
npx vite build >/dev/null 2>&1 || { echo "构建失败"; exit 1; }
pkill -f "vite preview --port 4173" 2>/dev/null
npx vite preview --port 4173 >/dev/null 2>&1 &
PID=$!
sleep 2
mkdir -p test-results
FAIL=0
run() { # $1 名称,其余为命令
  local name=$1; shift
  if "$@" >/tmp/e2e-$name.log 2>&1; then echo "通过  $name"; else echo "失败  $name"; tail -3 /tmp/e2e-$name.log; FAIL=1; fi
}
run 冒烟 node tests/e2e/smoke.mjs
run 四键操作 node tests/e2e/controls.mjs
run 战役流程 node tests/e2e/campaign.mjs
run 全流程速通 node tests/e2e/fullrun.mjs
run 回放 node tests/e2e/replay.mjs
run 练习场 node tests/e2e/practice.mjs
run 触屏与设置 node tests/e2e/touch.mjs
run 编辑器 node tests/e2e/editor.mjs http://localhost:4173/editor.html
run 训练页 node tests/e2e/train.mjs http://localhost:4173/train.html test-results 25
kill $PID 2>/dev/null
exit $FAIL
