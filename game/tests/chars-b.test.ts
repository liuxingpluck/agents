import { describe, expect, it } from 'vitest';
import { Btn, CharacterDef } from '../src/sim/types';
import { createWorld, spawnFighter, step, World } from '../src/sim/world';
import { ROSTER } from '../src/data/characters';
import { ROOMS } from '../src/data/rooms';
import { rook } from '../src/data/chars/rook';
import { vesper } from '../src/data/chars/vesper';
import { morgan, extras } from '../src/data/chars/morgan';

const roster: Record<string, CharacterDef> = { ...ROSTER };
for (const c of [rook, vesper, morgan, ...extras]) roster[c.id] = c;

function duel(id: string) {
  const w = createWorld(ROOMS.outpost, roster, 7);
  w.useWaves = false;
  const p = spawnFighter(w, roster[id], 0, 5, 2);
  const e = spawnFighter(w, ROSTER.brute, 1, 6, 2);
  e.hp = 999999;
  return { w, p, e };
}
function run(w: World, id: number, script: Array<[number, number]>) {
  for (const [mask, n] of script) for (let i = 0; i < n; i++) step(w, new Map([[id, mask]]));
}
const tap = (b: number, wait = 10): Array<[number, number]> => [[b, 2], [0, wait]];

for (const def of [rook, vesper, morgan]) {
  describe(def.id, () => {
    it('招式引用完整', () => {
      const ids = [
        ...Object.values(def.normals), ...Object.values(def.airNormals),
        ...def.commands.map(c => c.move), ...def.skills,
        ...Object.values(def.moves).flatMap(m => Object.values(m.chain ?? {})),
      ];
      for (const id of ids) expect(def.moves[id], `${def.id}.${id}`).toBeDefined();
    });

    it('有抓取,4 个技能,第 4 个是奥义', () => {
      expect(def.moves.grab?.grab).toBeDefined();
      expect(def.skills).toHaveLength(4);
      expect(def.moves[def.skills[3]].tier).toBe(4);
      expect(def.commands.length).toBeGreaterThanOrEqual(3);
    });

    it('LP 连段命中至少 2 下', () => {
      const { w, p, e } = duel(def.id);
      run(w, p.id, [...tap(Btn.LP, 7), ...tap(Btn.LP, 7), ...tap(Btn.LP, 7), ...tap(Btn.LP, 12)]);
      expect(e.comboCount).toBeGreaterThanOrEqual(2);
    });

    it('4 个技能能量充足时都能出手', () => {
      const keys = [Btn.S1, Btn.S2, Btn.S3, Btn.S4];
      keys.forEach((k, i) => {
        const { w, p } = duel(def.id);
        p.energy = 100;
        run(w, p.id, [[k, 2], [0, 2]]);
        expect(p.move?.id).toBe(def.skills[i]);
      });
    });
  });
}

describe('角色特有', () => {
  it('洛克 LP 四连、LK 三连', () => {
    expect(rook.moves.lp3.chain?.LP).toBe('lp4');
    expect(rook.moves.lk2.chain?.LK).toBe('lk3');
    expect(rook.moves.cgrab.grab).toBeDefined();
  });
  it('莫甘召唤骷髅', () => {
    const { w, p } = duel('morgan');
    p.energy = 100;
    run(w, p.id, [[Btn.S1, 2], [0, 25]]);
    expect(w.fighters.some(f => f.def.id === 'skeleton')).toBe(true);
  });
});
