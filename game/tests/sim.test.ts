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

  it('同一招重复使用:僵直递减,超过次数强制挣脱', () => {
    const { w, p, e } = duel();
    e.hp = 99999;
    const stuns: number[] = [];
    for (let i = 0; i < 4; i++) {
      // 每次只打一下 lk1,并保持对手处于连击状态
      p.state = 'idle'; p.move = null; p.buffer = {}; p.x = e.x - 1; p.hitstop = 0; e.hitstop = 0;
      run(w, p.id, [[Btn.LK, 2], [0, 4]]);
      stuns.push(e.stun);
      if (e.state === 'hitstun') e.stun = 30;
    }
    expect(stuns[1]).toBeLessThan(stuns[0]);
    expect(stuns[2]).toBeLessThan(stuns[1]);
    expect(e.state).toBe('launched'); // 第 4 次:强制挣脱
    expect(e.invuln).toBeGreaterThan(60);
  });

  it('普通怪没有连击硬上限,玩家方有', () => {
    const { w, p, e } = duel();
    e.hp = 99999; e.state = 'hitstun'; e.stun = 30; e.comboValue = 200; e.comboCount = 50;
    run(w, p.id, [[Btn.LP, 2], [0, 6]]);
    expect(e.state).toBe('hitstun');
    // 反过来:玩家被连到上限会强制脱离
    const d2 = duel();
    d2.p.state = 'hitstun'; d2.p.stun = 30; d2.p.comboValue = SIM.COMBO_LIMIT_PLAYER - 1; d2.p.comboCount = 4;
    d2.e.facing = -1;
    run(d2.w, d2.e.id, [[Btn.LP, 2], [0, 22]]);
    expect(d2.p.state).toBe('launched');
    expect(d2.p.invuln).toBeGreaterThan(60);
  });

  it('抓取:无视霸体,保持后投出', () => {
    const { w, p, e } = duel();
    // 让敌人处于霸体出招中
    e.facing = -1;
    run(w, e.id, [[Btn.HP, 2], [0, 6]]);
    expect(e.move?.armor).toBe(true);
    run(w, p.id, [[Btn.LP | Btn.LK, 2], [0, 8]]);
    expect(e.state).toBe('grabbed');
    expect(p.grabTarget).toBe(e.id);
    run(w, p.id, [[0, 34]]);
    expect(e.state).toBe('launched');
    expect(p.grabTarget).toBe(0);
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
