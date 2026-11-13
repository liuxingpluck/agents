// 连招手感回归测试:每个主角用接近真人的节奏连按,必须能连成一套。
// 防止以后改招式数据或输入规则时,把「按得上、接得住」的手感改坏。
import { describe, expect, it } from 'vitest';
import { Btn } from '../src/sim/types';
import { HEROES, ROSTER } from '../src/data/characters';
import { chainIds, HERO_TUNING } from '../src/data/tuning';
import { ROOMS } from '../src/data/rooms';
import { createWorld, spawnFighter, step } from '../src/sim/world';

/**
 * 让角色按顺序点按一串键(每个键按 2 帧,间隔 gap 帧),返回最高连击数与用过的招式。
 */
function mash(heroId: string, seq: number[], gap: number) {
  const w = createWorld(ROOMS.outpost, ROSTER, 7);
  w.useWaves = false;
  const p = spawnFighter(w, ROSTER[heroId], 0, 5, 2);
  const e = spawnFighter(w, ROSTER.husk, 1, 6, 2);
  e.hp = 99999; p.energy = 100;
  let max = 0;
  const used: string[] = [];
  const tick = (m: number) => {
    step(w, new Map([[p.id, m]]));
    max = Math.max(max, e.comboCount);
    if (p.move && used[used.length - 1] !== p.move.id) used.push(p.move.id);
  };
  for (const b of seq) { tick(b); tick(b); for (let i = 0; i < gap - 2; i++) tick(0); }
  for (let i = 0; i < 50; i++) tick(0);
  return { max, used };
}

describe('连招手感', () => {
  for (const h of HEROES) {
    const t = HERO_TUNING[h.id];
    const J = Array(t.j).fill(Btn.LP), K = Array(t.k).fill(Btn.HP);
    it(`${h.name}:轻攻击连打 ${t.j} 下后接重攻击,快按慢按都能连上`, () => {
      for (const gap of [9, 13]) {
        const r = mash(h.id, [...J, Btn.HP], gap);
        expect(r.max, `间隔 ${gap} 帧:${r.used.join('>')}`).toBeGreaterThanOrEqual(t.j + 1);
      }
    });
    it(`${h.name}:轻攻击 ${t.j} 段、重攻击 ${t.k} 段,各自都能打满`, () => {
      expect(chainIds(h, h.normals.LP, 'LP').length).toBe(t.j);
      expect(chainIds(h, h.normals.HP, 'HP').length).toBe(t.k);
      const r = mash(h.id, [...J, ...K], 13);
      expect(r.max, r.used.join('>')).toBeGreaterThanOrEqual(t.j + t.k - 1);
    });
    it(`${h.name}:「轻…轻 → 重」之后能取消出特殊技`, () => {
      const r = mash(h.id, [...J, Btn.HP, Btn.S1], 13);
      expect(r.used, r.used.join('>')).toContain(h.skills[0]);
    });
  }
});
