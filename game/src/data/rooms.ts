// 房间(关卡)数据:每个房间有尺寸、场景主题和各波敌人名单。
import { RoomDef } from '../sim/types';

/** 所有内置房间。waves 里每个数组是一波,写的是敌人 id。 */
export const ROOMS: Record<string, RoomDef> = {
  outpost: {
    id: 'outpost', name: '灰雪边境 · 弃置哨站', width: 30, depth: 4.5, theme: 'ashsnow',
    waves: [
      ['husk', 'husk'],
      ['husk', 'husk', 'husk'],
      ['husk', 'brute', 'husk'],
      ['brute', 'husk', 'husk', 'brute'],
    ],
  },
};
