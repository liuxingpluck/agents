// 界面层(HUD):血条、能量条、连击数、敌人/Boss 血条、伤害数字、提示横幅。
// 通过按 id 查找页面上已有的 HTML 元素来改文字和宽度,不涉及游戏逻辑。
import { Fighter } from '../sim/types';
import { World } from '../sim/world';

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
  }

  /** 每帧刷新:玩家血/能量条、连击数、被打敌人血条、Boss 血条、波数。 */
  update(w: World, player: Fighter, dt: number) {
    $('p-hp').style.width = `${Math.max(0, (player.hp / player.def.stats.hp) * 100)}%`;
    $('p-en').style.width = `${(player.energy / player.def.stats.energyMax) * 100}%`;
    for (const e of w.events) {
      if (e.type === 'hit' && e.attacker === player.id) {
        this.lastCombo = e.combo; this.comboTimer = 1.6;
        if (w.fighters.find(f => f.id === e.victim)?.def.role !== 'prop') { this.targetId = e.victim; this.targetTimer = 3; }
        const el = $('combo');
        // 先移除再重新添加 pop,强制重播连击数的弹跳动画
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      }
      if (e.type === 'comboBreak') this.flash('连击上限!');
      if (e.type === 'bossPhase') this.flash('狂暴');
      if (e.type === 'pickup' && e.id === player.id) this.toast(e.kind === 'food' ? '生命恢复' : '能量恢复');
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
  /** 显示 / 隐藏「GO →」前进提示 */
  go(show: boolean) { $('go').classList.toggle('show', show); }

  hideBanner() { $('banner').classList.remove('show'); }
}
