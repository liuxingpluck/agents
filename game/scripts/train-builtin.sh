#!/usr/bin/env bash
# 离线训练全部 10 个内置模型(4 个进程并行)。用法(在 game/ 下):
#   bash scripts/train-builtin.sh [代数=250] [附加环境变量,如 "TRAIN_CONTINUE=1 TRAIN_LEAGUE=1"]
GENS=${1:-250}
EXTRA=${2:-}
mkdir -p public/models
for group in kael,rook,li brynn,vesper,nola sera,morgan ilex,odran; do
  env $EXTRA TRAIN_HEROES=$group TRAIN_GENS=$GENS npx vitest run tests/train-builtin.test.ts --disable-console-intercept 2>&1 | grep -a "第 " &
done
wait
ls public/models
