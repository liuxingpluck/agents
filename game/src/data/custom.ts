// 自制内容包的本地存取。存放在 localStorage,键名带版本号以便将来迁移。
import { ContentPack } from '../sim/types';

/** localStorage 键名 */
export const PACK_KEY = 'ashen-abyss.pack.v1';

/** 创建一个空内容包 */
export function emptyPack(): ContentPack {
  return { format: 'ashen-abyss-pack', version: 1, characters: [], rooms: [], chapters: [] };
}

/**
 * 从 localStorage 读取内容包。
 * 只做结构性检查(格式标记 + 三个数组);草稿状态的内容允许暂时不满足数值规则,
 * 完整校验由 validatePack 在导出 / 游戏加载时进行。读取失败或格式不对一律返回空包。
 */
export function loadPack(): ContentPack {
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (!raw) return emptyPack();
    const p = JSON.parse(raw) as Partial<ContentPack> | null;
    if (!p || p.format !== 'ashen-abyss-pack' || p.version !== 1) return emptyPack();
    if (!Array.isArray(p.characters) || !Array.isArray(p.rooms) || !Array.isArray(p.chapters)) return emptyPack();
    return { format: 'ashen-abyss-pack', version: 1, characters: p.characters, rooms: p.rooms, chapters: p.chapters };
  } catch {
    return emptyPack(); // JSON 损坏、无痕模式禁用存储等
  }
}

/** 把内容包写入 localStorage;失败(配额 / 禁用)时静默忽略,返回是否成功 */
export function savePack(pack: ContentPack): boolean {
  try {
    localStorage.setItem(PACK_KEY, JSON.stringify(pack));
    return true;
  } catch {
    return false;
  }
}
