import { RoomDef } from '../sim/types';

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
