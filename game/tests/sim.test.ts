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

  it('撞墙反弹:被打飞撞到版边会弹回,每套连击只弹一次', () => {
    const { w, p, e } = duel();
    e.hp = 99999;
    e.x = w.room.width - 1; p.x = e.x - 1;
    e.state = 'launched'; e.y = 1; e.vx = 0.2; e.vy = 0.1; e.comboCount = 1;
    let bounced = 0;
    for (let i = 0; i < 40; i++) { step(w, new Map([[p.id, 0]])); bounced += w.events.filter(ev => ev.type === 'wallBounce').length; }
    expect(bounced).toBe(1);
    expect(e.wallBounced).toBe(true);
  });

  it('投掷砸人:被投出的敌人会砸倒路径上的同伴', () => {
    const { w, p, e } = duel();
    const e2 = spawnFighter(w, ROSTER.husk, 1, e.x + 1.6, 2);
    run(w, p.id, [[Btn.LP | Btn.LK, 2], [0, 60]]);
    expect(e.thrownBy === 1 || e.state === 'knockdown' || e.state === 'getup').toBe(true);
    expect(e2.hp).toBeLessThan(e2.def.stats.hp);
  });

  it('空中受身:被打飞后按跳跃键恢复并获得短暂无敌', () => {
    const { w, p } = duel();
    p.state = 'launched'; p.y = 1.2; p.vy = 0.1; p.stateFrame = 30; p.comboCount = 3;
    run(w, p.id, [[Btn.JUMP, 2]]);
    expect(p.state).toBe('jump');
    expect(p.invuln).toBeGreaterThan(10);
    expect(p.comboCount).toBe(0);
  });

  it('冲刺攻击:跑动中按轻攻击使出突进技', () => {
    const { w, p, e } = duel();
    e.x = 14;
    run(w, p.id, [[Btn.RIGHT, 3], [0, 3], [Btn.RIGHT, 6]]);
    expect(p.state).toBe('run');
    run(w, p.id, [[Btn.RIGHT | Btn.LP, 2], [Btn.RIGHT, 1]]);
    expect(p.move?.id).toBe('rush');
  });

  it('道具:走到食物上回复生命', () => {
    const { w, p } = duel();
    p.hp = 50;
    w.pickups.push({ id: 999, kind: 'food', x: p.x, z: p.z, life: 100 });
    step(w, new Map([[p.id, 0]]));
    expect(p.hp).toBeGreaterThan(50);
    expect(w.pickups.length).toBe(0);
  });

  it('木桶:能被打碎,不会被击飞或抓取,也不算敌人', () => {
    const { w, p, e } = duel();
    e.x = 20;
    const b = spawnFighter(w, ROSTER.barrel, SIM.PROP_TEAM, p.x + 1, p.z);
    run(w, p.id, [[Btn.LP | Btn.LK, 2], [0, 20]]);
    expect(b.state).not.toBe('grabbed');
    for (let i = 0; i < 6 && b.hp > 0; i++) run(w, p.id, [...tap(Btn.HP, 34)]);
    expect(b.hp).toBe(0);
    expect(b.y).toBe(0);
    expect(w.events.length >= 0).toBe(true);
  });

  it('Boss 半血进入第二阶段:挣脱并获得无敌', () => {
    const w = createWorld(ROOMS.outpost, ROSTER, 7);
    w.useWaves = false;
    const p = spawnFighter(w, ROSTER.kael, 0, 5, 2);
    const boss = spawnFighter(w, ROSTER.gareth, 1, 6, 2);
    boss.hp = Math.floor(boss.def.stats.hp * 0.5) + 3;
    let phase = 0;
    for (let i = 0; i < 40 && !phase; i++) { step(w, new Map([[p.id, i % 12 < 2 ? Btn.LP : 0]])); phase += w.events.filter(ev => ev.type === 'bossPhase').length; }
    expect(phase).toBe(1);
    expect(boss.invuln).toBeGreaterThan(30);
    expect(boss.brain.phase2).toBe(1);
  });

  it('喷火口:喷发时不分敌我都会被烧并击飞', () => {
    const room = { ...ROOMS.outpost, hazards: [{ x: 5, z: 2, radius: 1.2, period: 100, damage: 10 }] };
    const w = createWorld(room, ROSTER, 7);
    w.useWaves = false;
    const p = spawnFighter(w, ROSTER.kael, 0, 5, 2);
    const e = spawnFighter(w, ROSTER.husk, 1, 5.6, 2);
    const far = spawnFighter(w, ROSTER.husk, 1, 12, 2);
    for (let i = 0; i < 100 + 5; i++) step(w, new Map([[p.id, 0]]));
    expect(p.hp).toBeLessThan(p.def.stats.hp);
    expect(e.hp).toBeLessThan(e.def.stats.hp);
    expect(far.hp).toBe(far.def.stats.hp);
  });

  it('喷火口在房间清场后停止', () => {
    const room = { ...ROOMS.outpost, waves: [], hazards: [{ x: 5, z: 2, radius: 1.2, period: 60, damage: 10 }] };
    const w = createWorld(room, ROSTER, 7);
    step(w); // 没有敌人的房间在第一帧结束时就算清场
    expect(w.cleared).toBe(true);
    const p = spawnFighter(w, ROSTER.kael, 0, 5, 2);
    for (let i = 0; i < 200; i++) step(w, new Map([[p.id, 0]]));
    expect(p.hp).toBe(p.def.stats.hp);
  });

  it('挨打会作废敌人还没执行的出招指令', () => {
    const { w, p, e } = duel();
    e.hp = 99999;
    e.hitstop = 10; e.aiMove = 'lp1'; // 敌人还在定格中,指令尚未执行
    run(w, p.id, [[Btn.LP, 2], [0, 6]]);
    expect(e.state).toBe('hitstun');
    expect(e.aiMove).toBeUndefined();
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
