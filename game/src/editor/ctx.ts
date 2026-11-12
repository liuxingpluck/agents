// 编辑器各标签页共享的上下文:内容包、保存、已知 id 列表、预览。
import { CharacterDef, ContentPack, RoomDef } from '../sim/types';
import { HEROES, ROSTER } from '../data/characters';
import { ROOMS } from '../data/rooms';
import { Opt } from './ui';
import type { Preview } from './preview';

/** 内置角色 id(含敌人与召唤物) */
export const BUILTIN_CHAR_IDS = Object.keys(ROSTER);
/** 内置房间 id */
export const BUILTIN_ROOM_IDS = Object.keys(ROOMS);

export interface Ctx {
  /** 当前正在编辑的内容包(原地修改,各标签页都读它) */
  pack: ContentPack;
  /** 保存到 localStorage 并更新状态栏 */
  save(): void;
  /** 内置 + 自制 的完整角色表(模拟用) */
  roster(): Record<string, CharacterDef>;
  /** 所有房间(内置 + 自制) */
  rooms(): RoomDef[];
  /** 角色下拉选项:内置在前,自制在后 */
  charOptions(): Opt[];
  /** 房间下拉选项 */
  roomOptions(): Opt[];
  /** 可作为主角试玩的角色 id(英雄 + 自制的非敌人角色) */
  playableOptions(): Opt[];
  /** 重新渲染所有标签页(导入 / 清空后用) */
  refreshAll(): void;
  preview: Preview;
}

/** 角色显示名:「名字(id)」 */
export const charLabel = (c: CharacterDef): string => `${c.name || '未命名'}(${c.id})`;

/** 构造 Ctx 里与内容包相关的派生函数 */
export function derive(pack: ContentPack): Pick<Ctx, 'roster' | 'rooms' | 'charOptions' | 'roomOptions' | 'playableOptions'> {
  return {
    roster: () => {
      const r: Record<string, CharacterDef> = { ...ROSTER };
      for (const c of pack.characters) r[c.id] = c;
      return r;
    },
    rooms: () => [...Object.values(ROOMS), ...pack.rooms],
    charOptions: () => [
      ...Object.values(ROSTER).map((c): Opt => [c.id, `${charLabel(c)} · 内置`]),
      ...pack.characters.map((c): Opt => [c.id, `${charLabel(c)} · 自制`]),
    ],
    roomOptions: () => [
      ...Object.values(ROOMS).map((r): Opt => [r.id, `${r.name}(${r.id}) · 内置`]),
      ...pack.rooms.map((r): Opt => [r.id, `${r.name}(${r.id}) · 自制`]),
    ],
    playableOptions: () => [
      ...HEROES.map((c): Opt => [c.id, `${charLabel(c)} · 内置`]),
      ...pack.characters.filter(c => c.role !== 'enemy' && c.role !== 'boss').map((c): Opt => [c.id, `${charLabel(c)} · 自制`]),
    ],
  };
}
