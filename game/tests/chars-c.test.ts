import { describe, expect, it } from 'vitest';
import { Btn, CharacterDef, SKILL_BTNS } from '../src/sim/types';
import { createWorld, spawnFighter, step, World } from '../src/sim/world';
import { ROSTER } from '../src/data/characters';
import { ROOMS } from '../src/data/rooms';
import { odran } from '../src/data/chars/odran';
import { li } from '../src/data/chars/li';
import { nola } from '../src/data/chars/nola';

function duel(def: CharacterDef) {
  const roster = { ...ROSTER, [def.id]: def };
  const w = createWorld(ROOMS.outpost, roster, 7);
  w.useWaves = false;
  const p = spawnFighter(w, def, 0, 5, 2);
  const e = spawnFighter(w, ROSTER.brute, 1, 6, 2);
  e.hp = 99999;
  return { w, p, e };
}
function run(w: World, id: number, script: Array<[number, number]>) {
  for (const [mask, n] of script) for (let i = 0; i < n; i++) step(w, new Map([[id, mask]]));
}

describe.each([odran, li, nola])('角色 $id', (def) => {
  it('引用的招式 id 全部存在', () => {
    const ids = new Set(Object.keys(def.moves));
    for (const id of Object.values(def.normals)) expect(ids.has(id!)).toBe(true);
    for (const id of Object.values(def.airNormals)) expect(ids.has(id!)).toBe(true);
    for (const c of def.commands) expect(ids.has(c.move)).toBe(true);
    for (const id of def.skills) expect(ids.has(id)).toBe(true);
    for (const m of Object.values(def.moves)) for (const t of Object.values(m.chain ?? {})) expect(ids.has(t)).toBe(true);
    expect(def.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('有抓取,4 个技能且第 4 个为奥义', () => {
    expect(def.moves.grab?.grab).toBeTruthy();
    expect(def.skills.length).toBe(4);
    expect(def.moves[def.skills[3]].tier).toBe(4);
  });

  it('轻拳连段命中至少 2 下', () => {
    const { w, p, e } = duel(def);
    for (let i = 0; i < 4; i++) run(w, p.id, [[Btn.LP, 2], [0, 7]]);
    expect(e.comboCount).toBeGreaterThanOrEqual(2);
  });

  it('4 个技能在能量充足时都能出手', () => {
    for (let i = 0; i < 4; i++) {
      const { w, p } = duel(def);
      p.energy = 100;
      run(w, p.id, [[Btn[SKILL_BTNS[i]], 2]]);
      expect(p.move?.id).toBe(def.skills[i]);
    }
  });
});
