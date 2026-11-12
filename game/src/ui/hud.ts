import { Fighter } from '../sim/types';
import { World } from '../sim/world';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private comboTimer = 0;
  private lastCombo = 0;
  private targetId = -1;
  private targetTimer = 0;

  setPlayer(f: Fighter) {
    $('p-name').textContent = `${f.def.name} · ${f.def.title}`;
  }

  update(w: World, player: Fighter, dt: number) {
    $('p-hp').style.width = `${Math.max(0, (player.hp / player.def.stats.hp) * 100)}%`;
    $('p-en').style.width = `${(player.energy / player.def.stats.energyMax) * 100}%`;
    for (const e of w.events) {
      if (e.type === 'hit' && e.attacker === player.id) {
        this.lastCombo = e.combo; this.comboTimer = 1.6;
        this.targetId = e.victim; this.targetTimer = 3;
        const el = $('combo');
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      }
      if (e.type === 'comboBreak') this.flash('连击上限!');
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

  flash(text: string) {
    const el = $('flash');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  banner(title: string, sub: string) {
    $('banner-title').textContent = title;
    $('banner-sub').innerHTML = sub;
    $('banner').classList.add('show');
  }
  /** 显示 / 隐藏「GO →」前进提示 */
  go(show: boolean) { $('go').classList.toggle('show', show); }

  hideBanner() { $('banner').classList.remove('show'); }
}
