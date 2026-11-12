// 平衡性试玩:让「连打新手」机器人操控每个主角去打战役房间,统计通关率与剩余血量。
// 机器人比真人弱(不会闪避、不会针对破绽),所以这里的数字是「下限」:
// 机器人都能过的房间,真人一定能过;机器人过不了的后期房间属于正常难度。
// 运行:npx vitest run tests/balance.test.ts
import { describe, expect, it } from 'vitest';
import { HEROES, ROSTER } from '../src/data/characters';
import { CAMPAIGN_ROOMS, CHAPTERS } from '../src/data/chapters';
import { makeScriptAI } from '../src/sim/ai/script';
import { makeMasher } from '../src/sim/ai/masher';
import { enemyAggression } from '../src/data/chapters';
import { createWorld, spawnFighter, step } from '../src/sim/world';
import { CharacterDef, RoomDef } from '../src/sim/types';

/** 让机器人打一个房间,返回是否清场、剩余血量比例、用时(秒) */
function playRoom(hero: CharacterDef, room: RoomDef, seed: number, aggression: number) {
  const w = createWorld(room, ROSTER, seed);
  w.defaultEnemyAI = makeScriptAI(aggression);
  w.summonAI = makeScriptAI(0.8);
  const p = spawnFighter(w, hero, 0, 3, room.depth / 2, makeMasher());
  const LIMIT = 60 * 240; // 最多 4 分钟
  let f = 0;
  for (; f < LIMIT && !w.cleared && p.state !== 'dead'; f++) step(w);
  return { cleared: w.cleared, hp: Math.max(0, p.hp) / hero.stats.hp, secs: f / 60 };
}

describe('平衡性试玩报告', () => {
  it('第一章起点房间所有主角都能通过;并打印各章统计', () => {
    const lines: string[] = [];
    let ch1StartFails = 0;
    CHAPTERS.forEach((ch, ci) => {
      for (const kind of ['battle', 'elite', 'boss'] as const) {
        const nodes = ch.nodes.filter(n => n.kind === kind);
        let clears = 0, total = 0, hpSum = 0, secSum = 0;
        const failed = new Set<string>();
        for (const n of nodes) for (const h of HEROES) {
          const r = playRoom(h, CAMPAIGN_ROOMS[n.room], 100 + total, enemyAggression(ci));
          total++; secSum += r.secs;
          if (r.cleared) { clears++; hpSum += r.hp; } else {
            failed.add(h.id);
            if (ci === 0 && n.col === 0) ch1StartFails++;
          }
        }
        lines.push(`${ch.id} ${kind.padEnd(6)} 通关 ${String(clears).padStart(3)}/${String(total).padEnd(3)} 通关者平均剩余血 ${clears ? Math.round((hpSum / clears) * 100) : 0}% 平均用时 ${Math.round(secSum / total)}s 失败:${[...failed].join(',') || '无'}`);
      }
    });
    console.log('\n' + lines.join('\n'));
    expect(ch1StartFails).toBe(0);
  }, 600000);
});
