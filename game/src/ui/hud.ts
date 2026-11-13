// 界面层(HUD):血条、能量条、连击数、敌人/Boss 血条、伤害数字、提示横幅。
// 通过按 id 查找页面上已有的 HTML 元素来改文字和宽度,不涉及游戏逻辑。
import { Fighter } from '../sim/types';
import { World } from '../sim/world';
import { findArt } from '../render/art';

/** 按 id 取页面元素的简写(取不到会直接报错,因为这些元素是写死在页面里的)。 */
const $ = (id: string) => document.getElementById(id)!;

/** 屏幕上的所有战斗信息显示。 */
export class Hud {
  // comboTimer:连击数还要显示多久;lastCombo:最近一次连击数
  private comboTimer = 0;
  private lastCombo = 0;
  // 最近打中的敌人 id 与「还要显示多久」,用来显示敌人血条
  private targetId = -1;
  private targetTimer = 0;

  /** 设置玩家名字(显示在左上角血条旁)。 */
  setPlayer(f: Fighter) {
    $('p-name').textContent = `${f.def.name} · ${f.def.title}`;
    this.setPlayer2(null);
  }

  /** 显示 / 隐藏 2P 的状态栏(双人合作) */
  setPlayer2(f: Fighter | null) {
    $('player2').style.display = f ? 'block' : 'none';
    if (f) $('p2-name').textContent = `2P ${f.def.name}`;
  }

  /** 每帧刷新:玩家血/能量条、连击数、被打敌人血条、Boss 血条、波数。 */
  /** @param ally 双人合作时的另一名玩家:他的命中也计入连击显示 */
  update(w: World, player: Fighter, dt: number, ally?: Fighter | null) {
    if (ally) {
      $('p2-hp').style.width = `${Math.max(0, (ally.hp / ally.def.stats.hp) * 100)}%`;
      $('p2-en').style.width = `${(ally.energy / ally.def.stats.energyMax) * 100}%`;
    }
    $('p-hp').style.width = `${Math.max(0, (player.hp / player.def.stats.hp) * 100)}%`;
    $('p-en').style.width = `${(player.energy / player.def.stats.energyMax) * 100}%`;
    $('p-gd').style.width = `${Math.max(0, player.guard)}%`;
    for (const e of w.events) {
      if (e.type === 'hit' && (e.attacker === player.id || e.attacker === ally?.id)) {
        this.lastCombo = e.combo; this.comboTimer = 1.6;
        if (w.fighters.find(f => f.id === e.victim)?.def.role !== 'prop') { this.targetId = e.victim; this.targetTimer = 3; }
        const el = $('combo');
        // 先移除再重新添加 pop,强制重播连击数的弹跳动画
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      }
      if (e.type === 'comboBreak') this.flash('连击上限!');
      if (e.type === 'parry' && (e.victim === player.id || e.victim === ally?.id)) this.toast('完美格挡!');
      if (e.type === 'guardBreak') this.toast(e.id === player.id || e.id === ally?.id ? '被破防!' : '破防!');
      if (e.type === 'super') this.cutIn(w.fighters.find(f => f.id === e.id));
      // 连击数到 5 / 10 / 15… 时给一句喝彩
      if (e.type === 'hit' && (e.attacker === player.id || e.attacker === ally?.id) && e.combo >= 5 && e.combo % 5 === 0) {
        this.toast(`${e.combo} 连击 · ${['不错', '精彩', '华丽', '势不可挡', '登峰造极'][Math.min(4, e.combo / 5 - 1)]}!`);
      }
      if (e.type === 'bossPhase') this.flash('狂暴');
      if (e.type === 'pickup' && (e.id === player.id || e.id === ally?.id)) this.toast(e.kind === 'food' ? '生命恢复' : '能量恢复');
    }
    this.comboTimer -= dt; this.targetTimer -= dt;
    const combo = $('combo');
    combo.style.opacity = this.comboTimer > 0 && this.lastCombo >= 2 ? '1' : '0';
    $('combo-n').textContent = String(this.lastCombo);

    const t = w.fighters.find(f => f.id === this.targetId);
    const box = $('enemy');
    if (t && this.targetTimer > 0) {
      box.style.opacity = '1';
      $('e-name').textContent = t.def.name;
      $('e-hp').style.width = `${Math.max(0, (t.hp / t.def.stats.hp) * 100)}%`;
    } else box.style.opacity = '0';

    // Boss 血条:场上有存活的 Boss 时显示在屏幕下方
    const boss = w.fighters.find(f => f.def.role === 'boss' && f.team !== player.team && f.hp > 0);
    const bossEl = $('boss');
    if (boss) {
      bossEl.classList.add('show');
      $('boss-name').textContent = `${boss.def.name}${boss.def.title ? ' · ' + boss.def.title : ''}`;
      $('boss-hp').style.width = `${(boss.hp / boss.def.stats.hp) * 100}%`;
    } else bossEl.classList.remove('show');

    $('wave').textContent = w.cleared ? '' : `第 ${Math.min(w.wave, w.room.waves.length)} / ${w.room.waves.length} 波`;
  }

  /**
   * 在屏幕坐标 (x, y) 处飘出一个伤害数字。
   * @param big    重击 / 高伤害:字更大
   * @param toHero 是否打在玩家身上(用红色)
   */
  damageNumber(x: number, y: number, value: number, big: boolean, toHero: boolean) {
    const el = document.createElement('div');
    el.className = `dmg${big ? ' big' : ''}${toHero ? ' hero' : ''}`;
    el.textContent = String(value);
    el.style.left = `${x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${y}px`;
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  /** 在屏幕中央闪出一句短提示(如「连击上限!」)。 */
  /**
   * 奥义特写:角色头像从屏幕一侧滑入,停留片刻后退出。没有头像图的角色只显示招式名。
   */
  cutIn(f: Fighter | undefined) {
    if (!f) return;
    const el = $('cutin');
    const url = findArt(`portraits/${f.def.id}`);
    const name = f.move?.name ?? '';
    el.innerHTML = (url ? `<img src="${url}" alt="">` : '') + `<b>${name}</b>`;
    el.classList.toggle('foe', f.team !== 0);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /** 屏幕下方的小提示(拾取道具等),不打断战斗 */
  toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  flash(text: string) {
    const el = $('flash');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /** 显示大横幅(如关卡开始/胜利/失败),sub 可带 HTML。 */
  banner(title: string, sub: string) {
    $('banner-title').textContent = title;
    $('banner-sub').innerHTML = sub;
    $('banner').classList.add('show');
  }
  /**
   * 过关结算卡:大号评价字母 + 几行战绩。显示在屏幕上方,不挡操作。
   * @param rank 评价(S / A / B / C)
   * @param rows 战绩行:[名称, 数值]
   */
  result(rank: string, rows: Array<[string, string]>) {
    $('result').innerHTML = `<div class="rk rk-${rank}">${rank}</div><div class="rows"><h2>区域净化</h2>` +
      rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') + `</div>`;
    $('result').classList.add('show');
  }
  hideResult() { $('result').classList.remove('show'); }

  /** 显示 / 隐藏「GO →」前进提示 */
  go(show: boolean) { $('go').classList.toggle('show', show); }

  hideBanner() { $('banner').classList.remove('show'); }
}
