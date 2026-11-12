import { describe, expect, it } from 'vitest';
import { HEROES, ROSTER } from '../src/data/characters';
import { enemies as ch1 } from '../src/data/enemies/ch1';
import { enemies as ch2 } from '../src/data/enemies/ch2';
import { enemies as ch3 } from '../src/data/enemies/ch3';
import { enemies as ch4 } from '../src/data/enemies/ch4';
import { enemies as ch5 } from '../src/data/enemies/ch5';

const chapters = [ch1, ch2, ch3, ch4, ch5];
const all = chapters.flat();
const bossHp = [[700, 800], [800, 950], [950, 1100], [1100, 1250], [1300, 1450]];

describe('enemies', () => {
  it('id 全局唯一且不与可选角色及基础敌人冲突', () => {
    const ids = all.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const taken = new Set([...HEROES.map(h => h.id), 'husk', 'brute', 'skeleton']);
    for (const id of ids) expect(taken.has(id), id).toBe(false);
  });

  it('引用的招式 id 都存在', () => {
    for (const c of all) {
      const refs: string[] = [
        ...Object.values(c.normals), ...Object.values(c.airNormals),
        ...c.commands.map(x => x.move), ...c.skills,
      ].filter((x): x is string => !!x);
      for (const m of Object.values(c.moves)) {
        if (m.chain) refs.push(...Object.values(m.chain) as string[]);
        if (m.summon) expect(all.some(e => e.id === m.summon) || ROSTER[m.summon], `${c.id} summon`).toBeTruthy();
      }
      for (const r of refs) expect(c.moves[r], `${c.id}.${r}`).toBeDefined();
    }
  });

  it('每章恰好一个 boss', () => {
    for (const ch of chapters) expect(ch.filter(c => c.role === 'boss').length).toBe(1);
    for (const c of all) expect(['enemy', 'boss']).toContain(c.role);
  });

  it('Boss 的 hp、scale、weight、bulk 在范围内', () => {
    chapters.forEach((ch, i) => {
      const b = ch.find(c => c.role === 'boss')!;
      expect(b.stats.hp).toBeGreaterThanOrEqual(700);
      expect(b.stats.hp).toBeLessThanOrEqual(1400);
      expect(b.stats.hp).toBeGreaterThanOrEqual(bossHp[i][0]);
      expect(b.stats.hp).toBeLessThanOrEqual(bossHp[i][1]);
      expect(b.look.scale).toBeGreaterThanOrEqual(1.3);
      expect(b.look.scale).toBeLessThanOrEqual(1.7);
      expect(b.look.bulk).toBeGreaterThanOrEqual(1.3);
      expect(b.look.bulk).toBeLessThanOrEqual(1.8);
      expect(b.stats.weight).toBeGreaterThanOrEqual(1.5);
      expect(b.stats.weight).toBeLessThanOrEqual(2.2);
    });
  });
});
