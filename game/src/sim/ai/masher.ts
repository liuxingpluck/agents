// 「连打新手」机器人:模拟一个只会贴上去连按、能量够了就放技能的玩家。
// 用途:平衡性试玩的基准(tests/balance.test.ts)、以及以后的演示模式。
// 它只会两件「聪明事」(都是游戏教给玩家的基本应对):
//   看到带霸体的大招快打到自己时向后闪避;看到对手举盾格挡时改用抓投。
// 除此之外不走位、不抓破绽,所以它能过的关真人一定能过。
import { Btn } from '../types';
import { Controller } from '../world';
import { nearestFoe, steerAround } from './script';

/** 创建一个「连打新手」控制器(每个角色用独立一份) */
export function makeMasher(): Controller {
  return (w, self) => {
    const t = nearestFoe(w, self);
    if (!t) return 0;
    // dx/dz = 与对手的横向/纵深距离(带方向),adx = 横向距离绝对值
    const dx = t.x - self.x, dz = t.z - self.z, adx = Math.abs(dx);
    let out = 0;
    // 霸体大招即将出手(8 帧内)且够得着自己:向后闪避
    const tm = t.move;
    if (t.state === 'attack' && tm?.armor && !tm.projectile) {
      const left = tm.startup - t.moveFrame;
      if (left > 0 && left <= 8 && adx <= tm.hitbox.x1 + 0.8 && Math.abs(dz) <= tm.hitbox.z + 0.2 && w.frame % 4 < 2) {
        return Btn.DODGE | (dx > 0 ? Btn.LEFT : Btn.RIGHT);
      }
    }
    // 贴近到 1 米左右,并对齐纵深
    // 太远就走过去;够近了但背对对手就转身(按向对手的方向键)
    if (adx > 1.15) out |= dx > 0 ? Btn.RIGHT : Btn.LEFT;
    else if ((dx > 0) !== (self.facing === 1)) out |= dx > 0 ? Btn.RIGHT : Btn.LEFT;
    if (Math.abs(dz) > 0.3) out |= dz > 0 ? Btn.DOWN : Btn.UP;
    // 还没贴近就只走位,不出招
    if (adx > 1.6 || Math.abs(dz) > 0.5) return steerAround(w, self, out);
    // 对手举盾格挡:连打没用,改用抓投(抓投无视格挡)
    if (t.state === 'guard' && self.def.moves.grab && adx <= self.def.moves.grab.hitbox.x1 && w.frame % 8 < 3) return out | Btn.LP | Btn.LK;
    // 每 8 帧一个节拍,节拍前半段按下(形成「按下」边沿):轻 轻 轻 重,循环
    const beat = Math.floor(w.frame / 8), press = w.frame % 8 < 3;
    if (!press) return out;
    // d 是自己的角色定义,下面用它查技能和耗能
    const d = self.def;
    // 能量够就放技能(从贵的往便宜的试),每 4 拍最多一次
    if (beat % 4 === 3) {
      for (let i = Math.min(3, d.skills.length - 1); i >= 0; i--) {
        const m = d.moves[d.skills[i]];
        if (m && m.cost && self.energy >= m.cost) return out | [Btn.S1, Btn.S2, Btn.S3, Btn.S4][i];
      }
      return out | Btn.HP;
    }
    return out | Btn.LP;
  };
}
