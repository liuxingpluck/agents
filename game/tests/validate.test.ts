// 编辑器校验规则测试:内置英雄必须全部通过,各种坏数据必须被发现。
import { describe, expect, it } from 'vitest';
import { HEROES, ROSTER } from '../src/data/characters';
import { ROOMS } from '../src/data/rooms';
import { ChapterDef, CharacterDef, ContentPack, RoomDef } from '../src/sim/types';
import {
  BUDGET_CAP, characterBudget, validateChapter, validateCharacter, validatePack, validateRoom,
} from '../src/editor/validate';
import { emptyPack } from '../src/data/custom';

const clone = <T,>(x: T): T => structuredClone(x);
const kael = (): CharacterDef => ({ ...clone(HEROES[0]), id: 'my_kael' });
const builtinChars = Object.keys(ROSTER);
const builtinRooms = Object.keys(ROOMS);

describe('validateCharacter', () => {
  it('内置英雄全部通过', () => {
    for (const h of HEROES) {
      const others = builtinChars.filter(i => i !== h.id);
      expect(validateCharacter(h, others), h.id).toEqual([]);
    }
  });

  it('内置敌人通过(敌人规则更宽松)', () => {
    for (const id of ['husk', 'brute']) expect(validateCharacter(ROSTER[id], builtinChars.filter(i => i !== id)), id).toEqual([]);
  });

  it('改名后的复制品通过', () => {
    expect(validateCharacter(kael(), builtinChars)).toEqual([]);
  });

  it('缺少必填字段 / 非对象', () => {
    expect(validateCharacter(null)).not.toEqual([]);
    const d = kael(); d.name = ''; (d as unknown as Record<string, unknown>).stats = undefined;
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('名称');
    expect(e).toContain('stats');
  });

  it('id 冲突与格式', () => {
    const d = kael(); d.id = 'husk';
    expect(validateCharacter(d, builtinChars).join()).toContain('重复');
    d.id = 'Bad Id';
    expect(validateCharacter(d).join()).toContain('id');
  });

  it('属性超出范围(含容差)', () => {
    const d = kael(); d.stats.hp = 380; // 320*1.2=384,仍在容差内
    expect(validateCharacter(d).join()).not.toContain('生命');
    d.stats.hp = 500;
    expect(validateCharacter(d).join()).toContain('生命');
    d.stats.hp = 220; d.stats.speed = 0.2;
    expect(validateCharacter(d).join()).toContain('移速');
  });

  it('招式数值越界', () => {
    const d = kael(); d.moves.lp1.damage = 40; d.moves.lp1.startup = 30;
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('伤害');
    expect(e).toContain('起手帧');
  });

  it('引用的招式不存在', () => {
    const d = kael();
    d.normals.LP = 'nope';
    d.commands[0].move = 'ghost';
    d.skills.push('phantom');
    d.moves.lp1.chain = { LP: 'missing' };
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('nope');
    expect(e).toContain('ghost');
    expect(e).toContain('phantom');
    expect(e).toContain('missing');
  });

  it('枚举非法', () => {
    const d = kael();
    (d.moves.lp1 as { anim: string }).anim = 'moonwalk';
    (d.look as { weapon: string }).weapon = 'laser';
    (d.commands[0] as { motion: string }).motion = 'XX';
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('moonwalk');
    expect(e).toContain('laser');
    expect(e).toContain('XX');
  });

  it('技能超过 8 个', () => {
    const d = kael();
    d.skills = ['wave', 'whirl', 'quake', 'oath', 'wave', 'whirl', 'quake', 'oath', 'wave'];
    expect(validateCharacter(d).join()).toContain('最多 8');
  });

  it('平衡预算超限', () => {
    const d = kael();
    expect(characterBudget(d)).toBeLessThan(BUDGET_CAP);
    d.stats.hp = 320;
    for (const m of Object.values(d.moves)) m.damage = 24; // 数值本身在区间外也会报,这里只关心预算那一条
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('平衡预算');
  });

  it('英雄结构要求:缺抓取、缺挑空', () => {
    const d = kael();
    delete d.moves.grab;
    for (const m of Object.values(d.moves)) delete m.launch;
    const e = validateCharacter(d).join('\n');
    expect(e).toContain('抓取');
    expect(e).toContain('挑空');
  });
});

describe('validateRoom', () => {
  const ok: RoomDef = { id: 'my_room', name: '测试', width: 30, depth: 4.5, theme: 'ashsnow', waves: [['husk', 'husk'], ['brute']] };
  it('正常房间通过,内置房间通过', () => {
    expect(validateRoom(ok, builtinChars)).toEqual([]);
    expect(validateRoom(ROOMS.outpost, builtinChars)).toEqual([]);
  });
  it('未知敌人 / 空波 / 尺寸越界', () => {
    const r = clone(ok); r.waves = [['nobody'], []]; r.width = 5; r.depth = 20;
    const e = validateRoom(r, builtinChars).join('\n');
    expect(e).toContain('nobody');
    expect(e).toContain('没有敌人');
    expect(e).toContain('width');
    expect(e).toContain('depth');
  });
});

describe('validateChapter', () => {
  const rooms = ['outpost'];
  /** 三路各一个战斗节点,汇合到 boss */
  const good = (): ChapterDef => ({
    id: 'ch1', name: '第一章', intro: ['开场'], outro: ['结束'], start: ['a0', 'b0', 'c0'],
    nodes: [
      { id: 'a0', lane: 0, col: 0, room: 'outpost', kind: 'battle', next: ['boss'] },
      { id: 'b0', lane: 1, col: 0, room: 'outpost', kind: 'elite', next: ['boss', 'a0'] },
      { id: 'c0', lane: 2, col: 0, room: 'outpost', kind: 'rest', next: ['boss'] },
      { id: 'boss', lane: 1, col: 1, room: 'outpost', kind: 'boss', next: [] },
    ],
  });
  it('合法章节通过', () => { expect(validateChapter(good(), rooms)).toEqual([]); });
  it('next 引用不存在', () => {
    const c = good(); c.nodes[0].next = ['zzz'];
    expect(validateChapter(c, rooms).join()).toContain('zzz');
  });
  it('lane 越界', () => {
    const c = good(); (c.nodes[0] as { lane: number }).lane = 3;
    expect(validateChapter(c, rooms).join()).toContain('lane');
  });
  it('没有 boss / 多个 boss', () => {
    const c = good(); c.nodes[3].kind = 'battle';
    expect(validateChapter(c, rooms).join()).toContain('boss');
    const d = good(); d.nodes[0].kind = 'boss'; d.nodes[0].next = [];
    expect(validateChapter(d, rooms).join()).toContain('2 个');
  });
  it('不可达节点', () => {
    const c = good(); c.start = ['a0'];
    const e = validateChapter(c, rooms).join();
    expect(e).toContain('b0');
    expect(e).toContain('c0');
  });
  it('死路与成环', () => {
    const c = good(); c.nodes[2].next = [];
    expect(validateChapter(c, rooms).join()).toContain('死路');
    const d = good(); d.nodes[0].next = ['b0']; d.nodes[1].next = ['a0'];
    expect(validateChapter(d, rooms).join()).toContain('环');
  });
  it('房间不存在 / 起点不存在', () => {
    const c = good(); c.nodes[0].room = 'nowhere'; c.start.push('q');
    const e = validateChapter(c, rooms).join();
    expect(e).toContain('nowhere');
    expect(e).toContain('起点');
  });
});

describe('validatePack', () => {
  it('空包通过', () => { expect(validatePack(emptyPack(), builtinChars, builtinRooms)).toEqual([]); });
  it('完整包通过,冲突 id 报错', () => {
    const pack: ContentPack = emptyPack();
    pack.characters.push(kael());
    pack.rooms.push({ id: 'r1', name: 'R', width: 30, depth: 4.5, theme: 'x', waves: [['my_kael']] });
    expect(validatePack(pack, builtinChars, builtinRooms)).toEqual([]);
    pack.rooms.push({ ...pack.rooms[0], id: 'outpost' });
    expect(validatePack(pack, builtinChars, builtinRooms).join()).toContain('outpost');
  });
  it('格式错误', () => {
    expect(validatePack({ format: 'x' }, [], []).length).toBeGreaterThan(0);
    expect(validatePack('abc', [], [])).not.toEqual([]);
  });
});

describe('编辑器模板', () => {
  it('空白英雄模板通过校验', async () => {
    const { blankHero, blankRoom, blankChapter } = await import('../src/editor/templates');
    expect(validateCharacter(blankHero('my_hero'), builtinChars)).toEqual([]);
    expect(validateRoom(blankRoom('my_room'), builtinChars)).toEqual([]);
    expect(validateChapter(blankChapter('my_ch', 'outpost'), builtinRooms)).toEqual([]);
  });
});
