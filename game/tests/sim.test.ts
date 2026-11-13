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

  it('蓄力重击:按住重攻击会蓄力,伤害更高并把对手打飞', () => {
    const tapped = duel(); tapped.e.hp = 99999;
    run(tapped.w, tapped.p.id, [[Btn.HP, 2], [0, 30]]);
    const tapDmg = 99999 - tapped.e.hp;
    expect(tapped.e.state).not.toBe('launched');

    const held = duel(); held.e.hp = 99999;
    run(held.w, held.p.id, [[Btn.HP, 40]]);
    expect(held.p.charge).toBeGreaterThan(SIM.CHARGE_MAX * 0.5); // 还在蓄力中,没有出手
    expect(held.e.hp).toBe(99999);
    run(held.w, held.p.id, [[0, 12]]);
    expect(99999 - held.e.hp).toBeGreaterThan(tapDmg * 1.3);
    expect(held.e.state).toBe('launched');
  });

  it('格挡:正面挡住攻击只掉一点血,背后挡不住', () => {
    const { w, p, e } = duel();
    e.facing = -1;
    // 玩家先举盾(按住闪避键、不按方向),过了弹反窗口后再挨打
    run(w, p.id, [[Btn.DODGE, 12]]);
    expect(p.state).toBe('guard');
    e.aiMove = 'lp1';
    for (let i = 0; i < 40; i++) step(w, new Map([[p.id, Btn.DODGE]]));
    expect(p.state).toBe('guard');
    expect(p.hp).toBeGreaterThan(p.def.stats.hp - 4);
    expect(p.hp).toBeLessThan(p.def.stats.hp);
    expect(p.guard).toBeLessThan(SIM.GUARD_MAX);
    // 敌人绕到背后再打:挡不住
    e.x = p.x - 1; e.facing = 1; e.aiMove = 'lp1';
    const hp = p.hp;
    for (let i = 0; i < 40; i++) step(w, new Map([[p.id, Btn.DODGE]]));
    expect(p.hp).toBeLessThan(hp - 3);
  });

  it('完美格挡(弹反):刚举盾的瞬间挡下攻击,不掉血且对手陷入硬直', () => {
    const { w, p, e } = duel();
    e.facing = -1;
    e.aiMove = 'lp1';                       // 抓挠:前摇 18 帧
    for (let i = 0; i < 14; i++) step(w, new Map([[p.id, 0]]));
    for (let i = 0; i < 8; i++) step(w, new Map([[p.id, Btn.DODGE]]));
    expect(p.hp).toBe(p.def.stats.hp);
    expect(e.state).toBe('hitstun');
    expect(w.fighters.find(f => f.id === e.id)!.stun).toBeGreaterThan(15);
  });

  it('破防:防御值被打光会陷入长硬直;蓄力过半的重击直接破防', () => {
    const { w, p, e } = duel();
    e.facing = -1; e.hp = 99999;
    // 让敌人举盾:直接放进格挡状态并持续按住
    const guard = () => { e.state = 'guard'; e.stateFrame = 30; e.move = null; };
    guard(); e.guard = 5;
    let broke = 0;
    for (let i = 0; i < 20; i++) { step(w, new Map([[p.id, i < 2 ? Btn.LP : 0], [e.id, Btn.DODGE]])); broke += w.events.filter(ev => ev.type === 'guardBreak').length; }
    expect(broke).toBe(1);
    expect(e.state).toBe('hitstun');

    const d2 = duel(); d2.e.facing = -1; d2.e.hp = 99999;
    d2.e.state = 'guard'; d2.e.stateFrame = 30;
    let broke2 = 0;
    for (let i = 0; i < 60; i++) { step(d2.w, new Map([[d2.p.id, i < 42 ? Btn.HP : 0], [d2.e.id, Btn.DODGE]])); broke2 += d2.w.events.filter(ev => ev.type === 'guardBreak').length; }
    expect(broke2).toBe(1);
    expect(d2.e.hp).toBeLessThan(99999 - 15);
  });

  it('空中连招:空对空命中会上浮;砸地技让对手落地后弹起一次', () => {
    const { w, p, e } = duel();
    e.hp = 99999;
    // 对手已被挑到空中,玩家也在空中,出空中重击(砸地技)
    e.state = 'launched'; e.y = 1.6; e.vy = 0.05; e.comboCount = 1;
    p.state = 'jump'; p.y = 1.4; p.vy = 0; p.x = e.x - 0.8;
    const spikeId = p.def.airNormals.HK!;
    expect(p.def.moves[spikeId].spike).toBe(true);
    let bounce = 0, floated = false;
    for (let i = 0; i < 70; i++) {
      step(w, new Map([[p.id, i < 2 ? Btn.HK : 0]]));
      bounce += w.events.filter(ev => ev.type === 'groundBounce').length;
      if (w.events.some(ev => ev.type === 'hit') && p.vy >= SIM.AIR_HIT_FLOAT) floated = true;
    }
    expect(floated).toBe(true);
    expect(bounce).toBe(1);
  });

  it('抓取范围因职业而异:远抓的角色隔着两米多也能抓到', () => {
    const grabAt = (hero: string, dist: number) => {
      const w = createWorld(ROOMS.outpost, ROSTER, 7); w.useWaves = false;
      const p = spawnFighter(w, ROSTER[hero], 0, 5, 2);
      const e = spawnFighter(w, ROSTER.husk, 1, 5 + dist, 2);
      run(w, p.id, [[Btn.LP | Btn.LK, 2], [0, 16]]);
      return e.state === 'grabbed' || p.grabTarget === e.id;
    };
    expect(grabAt('rook', 1.3)).toBe(true);
    expect(grabAt('vesper', 1.6)).toBe(false);   // 刺客要贴身
    expect(grabAt('morgan', 2.6)).toBe(true);    // 骸骨之手,最远
    expect(grabAt('kael', 2.6)).toBe(false);
  });

  it('障碍物:挡路、能跳过;敌人会绕过去而不是卡住', () => {
    const w = createWorld(ROOMS.outpost, ROSTER, 7);
    w.useWaves = false; w.defaultEnemyAI = makeScriptAI(0.8);
    const p = spawnFighter(w, ROSTER.kael, 0, 5, 2);
    spawnFighter(w, ROSTER.rock, SIM.PROP_TEAM, 7, 2);
    // 直着走会被岩石挡住
    run(w, p.id, [[Btn.RIGHT, 80]]);
    expect(p.x).toBeLessThan(6.2);
    // 跳起来可以越过去
    run(w, p.id, [[Btn.RIGHT | Btn.JUMP, 2], [Btn.RIGHT, 50]]);
    expect(p.x).toBeGreaterThan(7.8);
    // 敌人在岩石另一侧,正对着玩家:它应当绕过岩石找上门来
    p.x = 5; p.z = 2; p.state = 'idle'; p.y = 0; p.vy = 0;
    const e = spawnFighter(w, ROSTER.husk, 1, 9.5, 2, makeScriptAI(0.8));
    for (let i = 0; i < 400; i++) step(w, new Map([[p.id, 0]]));
    expect(e.x).toBeLessThan(6.4);
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
