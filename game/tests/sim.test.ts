import { describe, expect, it } from 'vitest';
import { Btn, SIM } from '../src/sim/types';
import { createWorld, spawnFighter, step, World } from '../src/sim/world';
import { makeScriptAI } from '../src/sim/ai/script';
import { ROSTER } from '../src/data/characters';
import { ROOMS } from '../src/data/rooms';

function duel() {
  const w = createWorld(ROOMS.outpost, ROSTER, 7);
  w.useWaves = false;
  const p = spawnFighter(w, ROSTER.kael, 0, 5, 2);
  const e = spawnFighter(w, ROSTER.brute, 1, 6, 2);
  return { w, p, e };
}
/** 按脚本喂输入:每项 [按键掩码, 持续帧数] */
function run(w: World, id: number, script: Array<[number, number]>) {
  for (const [mask, n] of script) for (let i = 0; i < n; i++) step(w, new Map([[id, mask]]));
}
const tap = (b: number, wait = 10): Array<[number, number]> => [[b, 2], [0, wait]];

describe('combat sim', () => {
  it('轻拳三连击命中并累计连击数', () => {
    const { w, p, e } = duel();
    run(w, p.id, [...tap(Btn.LP, 7), ...tap(Btn.LP, 7), ...tap(Btn.LP, 12)]);
    expect(e.comboCount).toBe(3);
    expect(e.hp).toBeLessThan(e.def.stats.hp);
  });

  it('轻 → 重 取消,且重不能取消回轻', () => {
    const { w, p } = duel();
    run(w, p.id, [...tap(Btn.LP, 5), [Btn.HP, 2], [0, 3]]);
    expect(p.move?.id).toBe('hp1');
    run(w, p.id, [[0, 12], [Btn.LP, 2], [0, 2]]);
    expect(p.move?.id).toBe('hp1');
  });

  it('指令技 ↓→+LP 出冲锋斩', () => {
    const { w, p } = duel();
    run(w, p.id, [[Btn.DOWN, 3], [Btn.DOWN | Btn.RIGHT, 2], [Btn.RIGHT | Btn.LP, 2]]);
    expect(p.move?.id).toBe('rush');
  });

  it('挑空后可追打,浮空高度递减', () => {
    const { w, p, e } = duel();
    run(w, p.id, [[Btn.HK, 2], [0, 14]]);
    expect(e.state).toBe('launched');
    expect(e.juggle).toBe(1);
  });

  it('连击值达到上限后强制脱离', () => {
    const { w, p, e } = duel();
    e.hp = 99999;
    e.state = 'hitstun'; e.stun = 30; e.comboValue = SIM.COMBO_LIMIT - 1; e.comboCount = 5;
    run(w, p.id, [[Btn.LP, 2], [0, 6]]);
    expect(w.fighters.find(f => f.id === e.id)!.invuln).toBeGreaterThan(60);
    expect(e.state).toBe('launched');
  });

  it('同样的种子与输入得到完全相同的结果', () => {
    const sim = () => {
      const w = createWorld(ROOMS.outpost, ROSTER, 42);
      w.defaultEnemyAI = makeScriptAI(0.6);
      const p = spawnFighter(w, ROSTER.kael, 0, 4, 2);
      for (let i = 0; i < 1500; i++) {
        const m = (i % 40 < 20 ? Btn.RIGHT : 0) | (i % 9 < 2 ? Btn.LP : 0) | (i % 50 === 0 ? Btn.HK : 0);
        step(w, new Map([[p.id, m]]));
      }
      return JSON.stringify(w.fighters.map(f => [f.id, f.x, f.y, f.z, f.hp, f.state]));
    };
    expect(sim()).toBe(sim());
  });

  it('脚本 AI 敌人能打到站桩玩家,波次会推进', () => {
    const w = createWorld(ROOMS.outpost, ROSTER, 3);
    w.defaultEnemyAI = makeScriptAI(0.8);
    const p = spawnFighter(w, ROSTER.kael, 0, 4, 2);
    for (let i = 0; i < 1200; i++) step(w);
    expect(w.wave).toBeGreaterThan(0);
    expect(p.hp).toBeLessThan(p.def.stats.hp);
  });
});
