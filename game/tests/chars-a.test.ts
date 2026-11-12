import { describe, expect, it } from 'vitest';
import { Btn, CharacterDef } from '../src/sim/types';
import { createWorld, spawnFighter, step, World } from '../src/sim/world';
import { ROSTER } from '../src/data/characters';
import { ROOMS } from '../src/data/rooms';
import { brynn } from '../src/data/chars/brynn';
import { sera } from '../src/data/chars/sera';
import { ilex } from '../src/data/chars/ilex';

const chars: CharacterDef[] = [brynn, sera, ilex];
const SKILL_KEYS = [Btn.S1, Btn.S2, Btn.S3, Btn.S4];

function duel(def: CharacterDef) {
  const roster = { ...ROSTER, [def.id]: def };
  const w = createWorld(ROOMS.outpost, roster, 7);
  w.useWaves = false;
  const p = spawnFighter(w, def, 0, 5, 2);
  const e = spawnFighter(w, ROSTER.brute, 1, 6, 2);
  e.hp = 999999;
  return { w, p, e };
}
function run(w: World, id: number, script: Array<[number, number]>) {
  for (const [mask, n] of script) for (let i = 0; i < n; i++) step(w, new Map([[id, mask]]));
}
const tap = (b: number, wait = 10): Array<[number, number]> => [[b, 2], [0, wait]];

describe.each(chars)('角色数据 $id', (def) => {
  it('引用的招式 id 全部存在', () => {
    const ids = new Set(Object.keys(def.moves));
    const refs: string[] = [
      ...Object.values(def.normals), ...Object.values(def.airNormals),
      ...def.commands.map(c => c.move), ...def.skills,
    ].filter((x): x is string => !!x);
    for (const m of Object.values(def.moves)) refs.push(...Object.values(m.chain ?? {}) as string[]);
    for (const r of refs) expect(ids.has(r), `${def.id}: 缺少招式 ${r}`).toBe(true);
    expect(def.commands.length).toBeGreaterThanOrEqual(3);
    expect(Object.values(def.moves).some(m => (m.launch ?? 0) >= 0.3)).toBe(true);
    expect(Object.values(def.moves).some(m => m.knockdown)).toBe(true);
  });

  it('有抓取,技能 4 个且第 4 个为奥义', () => {
    expect(def.moves.grab?.grab).toBeTruthy();
    expect(def.skills).toHaveLength(4);
    expect(def.moves[def.skills[3]].tier).toBe(4);
    for (let i = 0; i < 3; i++) expect(def.moves[def.skills[i]].tier).toBe(3);
  });

  it('LP 连段对木桩命中至少 2 下', () => {
    const { w, p, e } = duel(def);
    run(w, p.id, [...tap(Btn.LP, 7), ...tap(Btn.LP, 7), ...tap(Btn.LP, 12)]);
    expect(e.comboCount).toBeGreaterThanOrEqual(2);
  });

  it('4 个技能能量充足时都能出手', () => {
    for (let i = 0; i < 4; i++) {
      const { w, p } = duel(def);
      p.energy = 100;
      run(w, p.id, [[SKILL_KEYS[i], 2]]);
      expect(p.move?.id).toBe(def.skills[i]);
    }
  });
});
